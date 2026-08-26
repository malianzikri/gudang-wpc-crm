-- Gudang WPC CRM - FINAL production hardening / schema reconciliation
-- Safe to run on the existing production database.
-- It does NOT delete lead/message data.
--
-- Attribution contract:
--   leads.source            = FIRST TOUCH / acquisition source (sticky)
--   leads.last_touch_source = latest/manual marketing touch
--   source_id / ctwa_clid   = known Meta click attribution and MAY coexist
--                             with source = 'WhatsApp Organic'

begin;

create extension if not exists pgcrypto;

-- Expand the lead table to every field used by the final source code.
alter table public.leads
  add column if not exists campaign_id text,
  add column if not exists campaign_name text,
  add column if not exists adset_id text,
  add column if not exists adset_name text,
  add column if not exists ad_name text,
  add column if not exists creative_id text,
  add column if not exists meta_enriched_at timestamptz,
  add column if not exists ctwa_clid text,
  add column if not exists capi_lead_sent_at timestamptz,
  add column if not exists capi_purchase_sent_at timestamptz,
  add column if not exists capi_last_error text,
  add column if not exists closing_trigger text,
  add column if not exists last_touch_source text,
  add column if not exists last_touch_at timestamptz,
  add column if not exists manual_campaign text,
  add column if not exists source_confidence text,
  add column if not exists suppress_capi boolean not null default false,
  add column if not exists is_historical boolean not null default false,
  add column if not exists historical_imported_at timestamptz;

-- Make the DB constraint match the exact shared funnel used by UI/API.
alter table public.leads drop constraint if exists leads_status_check;

update public.leads
set status = 'Tanya Kebutuhan'
where status in ('Tanya Aja', 'Kebutuhan');

update public.leads
set status = 'Estimasi Dikirim'
where status = 'Quotation Dikirim';

update public.leads
set status = 'Survey Ditawarkan'
where status = 'Survey';

alter table public.leads
  add constraint leads_status_check check (
    status in (
      'Chat Builder',
      'Tanya Kebutuhan',
      'Estimasi Dikirim',
      'Foto Area Diterima',
      'Qualified',
      'Survey Ditawarkan',
      'Survey Terjadwal',
      'Quotation Final',
      'Hot',
      'Closing',
      'Tidak Layak'
    )
  );

-- Normalize short-lived touch labels from intermediate builds.
update public.leads
set last_touch_source = 'WhatsApp Broadcast'
where last_touch_source in ('WA Broadcast', 'Reaktivasi Broadcast');

-- Old intermediate builds sometimes wrote Broadcast into `source`.
-- Broadcast is a touch/trigger, not a first-touch acquisition source.
update public.leads
set
  source = case
    when is_historical = true then 'Legacy / Belum Teratribusi'
    else 'WhatsApp Organic'
  end,
  last_touch_source = 'WhatsApp Broadcast',
  last_touch_at = coalesce(last_touch_at, last_seen_at, first_seen_at),
  source_confidence = 'repaired_broadcast_as_touch'
where source in ('WA Broadcast', 'Reaktivasi Broadcast', 'WhatsApp Broadcast');

-- Normalize old Organic labels to the canonical first-touch label.
update public.leads
set source = 'WhatsApp Organic'
where source in ('Organic', 'WhatsApp');

-- Recover CTWA IDs from raw webhook payloads already stored in messages.
update public.leads l
set ctwa_clid = src.ctwa_clid
from (
  select distinct on (lead_id)
    lead_id,
    raw_payload->'referral'->>'ctwa_clid' as ctwa_clid
  from public.messages
  where raw_payload->'referral'->>'ctwa_clid' is not null
    and raw_payload->'referral'->>'ctwa_clid' <> ''
  order by lead_id, coalesce(message_timestamp, created_at) asc, created_at asc
) src
where l.id = src.lead_id
  and (l.ctwa_clid is null or l.ctwa_clid = '');

-- Repair ONLY provable first-touch misclassification from an old build.
-- Having source_id alone is NOT enough to call a lead first-touch Meta,
-- because an Organic lead may legitimately click a Meta ad later.
with first_inbound as (
  select distinct on (m.lead_id)
    m.lead_id,
    coalesce(m.message_timestamp, m.created_at) as occurred_at,
    m.raw_payload->'referral'->>'source_id' as meta_source_id
  from public.messages m
  where m.direction = 'inbound'
  order by
    m.lead_id,
    coalesce(m.message_timestamp, m.created_at) asc,
    m.created_at asc
)
update public.leads l
set
  source = 'Meta Ads',
  last_touch_source = case
    when l.last_touch_source is null
      or btrim(l.last_touch_source) = ''
      or l.last_touch_source in ('WhatsApp Organic', 'Organic')
      then 'Meta Ads'
    else l.last_touch_source
  end,
  last_touch_at = coalesce(l.last_touch_at, f.occurred_at),
  source_confidence = 'repaired_first_message_meta'
from first_inbound f
where l.id = f.lead_id
  and l.is_historical = false
  and f.meta_source_id is not null
  and f.meta_source_id <> ''
  and abs(extract(epoch from (f.occurred_at - l.first_seen_at))) <= 300
  and l.source is distinct from 'Meta Ads';

-- If an explicit Meta referral is known but touch was never initialized,
-- current touch should be Meta while FIRST TOUCH remains unchanged.
with latest_meta_touch as (
  select distinct on (m.lead_id)
    m.lead_id,
    coalesce(m.message_timestamp, m.created_at) as occurred_at
  from public.messages m
  where
    nullif(m.raw_payload->'referral'->>'source_id', '') is not null
    or nullif(m.raw_payload->'referral'->>'ctwa_clid', '') is not null
  order by
    m.lead_id,
    coalesce(m.message_timestamp, m.created_at) desc,
    m.created_at desc
)
update public.leads l
set
  last_touch_source = 'Meta Ads',
  last_touch_at = coalesce(l.last_touch_at, mt.occurred_at)
from latest_meta_touch mt
where l.id = mt.lead_id
  and (l.last_touch_source is null or btrim(l.last_touch_source) = '');

-- Initialize remaining touch/source confidence fields without modifying
-- first-touch acquisition.
update public.leads
set
  last_touch_source = coalesce(
    nullif(last_touch_source, ''),
    source,
    'WhatsApp Organic'
  ),
  last_touch_at = coalesce(last_touch_at, last_seen_at, first_seen_at),
  source_confidence = coalesce(
    source_confidence,
    case
      when source = 'Meta Ads' then 'existing_meta'
      when source ilike '%Organic%' then 'existing_organic'
      when source ilike '%Legacy%' or source ilike '%Belum Teratribusi%'
        then 'historical_unknown'
      else 'existing_other'
    end
  )
where last_touch_source is null
   or btrim(last_touch_source) = ''
   or last_touch_at is null
   or source_confidence is null;

-- Historical rows must not emit retroactive CAPI merely because an old
-- ctwa_clid happened to exist in imported/raw history.
-- Only a NEW live webhook explicitly marks `historical_live_ctwa` and
-- re-enables CAPI.
update public.leads
set suppress_capi = true
where is_historical = true
  and source_confidence is distinct from 'historical_live_ctwa';

create index if not exists leads_status_idx
  on public.leads(status);
create index if not exists leads_last_seen_idx
  on public.leads(last_seen_at desc);
create index if not exists leads_first_seen_idx
  on public.leads(first_seen_at desc);
create index if not exists leads_source_idx
  on public.leads(source);
create index if not exists leads_source_id_idx
  on public.leads(source_id);
create index if not exists leads_campaign_id_idx
  on public.leads(campaign_id);
create index if not exists leads_adset_id_idx
  on public.leads(adset_id);
create index if not exists leads_ctwa_clid_idx
  on public.leads(ctwa_clid);
create index if not exists leads_last_touch_source_idx
  on public.leads(last_touch_source);
create index if not exists leads_manual_campaign_idx
  on public.leads(manual_campaign);
create index if not exists leads_historical_idx
  on public.leads(is_historical, first_seen_at desc);
create index if not exists leads_closed_at_idx
  on public.leads(closed_at desc);

create table if not exists public.meta_conversion_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_name text not null,
  event_id text not null unique,
  status text not null check (status in ('sent','failed','skipped')),
  http_status integer,
  response jsonb,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists meta_conversion_events_lead_idx
  on public.meta_conversion_events(lead_id, created_at desc);

create table if not exists public.meta_performance_cache (
  cache_key text primary key,
  since_date date not null,
  until_date date not null,
  ad_account_id text,
  insight_rows jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.meta_performance_cache
  add column if not exists ad_account_id text,
  add column if not exists insight_rows jsonb not null default '[]'::jsonb,
  add column if not exists synced_at timestamptz not null default now(),
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists meta_performance_cache_synced_at_idx
  on public.meta_performance_cache(synced_at desc);
create index if not exists meta_performance_cache_updated_at_idx
  on public.meta_performance_cache(updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

-- No anon/authenticated policies are created. Server routes use service-role,
-- while direct browser access remains blocked by RLS.
alter table public.leads enable row level security;
alter table public.messages enable row level security;
alter table public.lead_status_events enable row level security;
alter table public.meta_conversion_events enable row level security;
alter table public.meta_performance_cache enable row level security;

commit;
