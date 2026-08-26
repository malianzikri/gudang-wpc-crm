create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  wa_id text unique not null,
  phone text,
  name text,
  status text not null default 'Chat Builder' check (
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
      'Pending',
      'No Response',
      'Lost',
      'Tidak Layak'
    )
  ),

  -- FIRST TOUCH / acquisition source. This field is sticky.
  source text not null default 'WhatsApp Organic',
  source_confidence text,

  -- First/known Meta click attribution attached to the lead.
  -- These fields MAY exist while source = 'WhatsApp Organic' when an
  -- Organic lead later clicks a Meta ad. Do not infer first touch from
  -- source_id alone.
  source_type text,
  source_id text,
  source_url text,
  ad_headline text,
  ad_body text,
  ad_media_type text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_name text,
  creative_id text,
  meta_enriched_at timestamptz,

  -- Current/recent touch is separated from first-touch attribution.
  last_touch_source text,
  last_touch_at timestamptz,
  manual_campaign text,
  closing_trigger text,

  first_message text,
  last_message text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  revenue numeric(14,2) not null default 0,
  closed_at timestamptz,

  -- Meta Business Messaging CAPI.
  ctwa_clid text,
  capi_lead_sent_at timestamptz,
  capi_purchase_sent_at timestamptz,
  capi_last_error text,
  suppress_capi boolean not null default false,

  -- Historical/backfill support.
  is_historical boolean not null default false,
  historical_imported_at timestamptz,

  product_interest text,
  intent text,
  project_size text,
  project_location text,
  estimated_value numeric(14,2) not null default 0,
  next_follow_up_at timestamptz,
  follow_up_reason text,
  pending_reason text,
  lost_reason text,
  lead_score integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_last_seen_idx on public.leads(last_seen_at desc);
create index if not exists leads_first_seen_idx on public.leads(first_seen_at desc);
create index if not exists leads_source_idx on public.leads(source);
create index if not exists leads_source_id_idx on public.leads(source_id);
create index if not exists leads_campaign_id_idx on public.leads(campaign_id);
create index if not exists leads_adset_id_idx on public.leads(adset_id);
create index if not exists leads_ctwa_clid_idx on public.leads(ctwa_clid);
create index if not exists leads_last_touch_source_idx on public.leads(last_touch_source);
create index if not exists leads_manual_campaign_idx on public.leads(manual_campaign);
create index if not exists leads_historical_idx on public.leads(is_historical, first_seen_at desc);
create index if not exists leads_closed_at_idx on public.leads(closed_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text unique not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  direction text not null default 'inbound' check (direction in ('inbound','outbound')),
  type text,
  body text,
  message_timestamp timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_lead_idx
  on public.messages(lead_id, created_at desc);

create table if not exists public.lead_status_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  old_status text,
  new_status text not null,
  revenue numeric(14,2),
  created_at timestamptz not null default now()
);

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

alter table public.leads enable row level security;
alter table public.messages enable row level security;
alter table public.lead_status_events enable row level security;
alter table public.meta_conversion_events enable row level security;
alter table public.meta_performance_cache enable row level security;
