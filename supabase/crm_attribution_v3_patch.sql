-- CRM Attribution V3 - FIRST TOUCH + MARKETING TOUCH
-- Run this BEFORE deploying the V3 app and BEFORE historical backfill.
-- Safe for the already-running CRM: only adds nullable/defaulted columns + indexes.

begin;

alter table public.leads
  add column if not exists last_touch_source text,
  add column if not exists last_touch_at timestamptz,
  add column if not exists manual_campaign text,
  add column if not exists source_confidence text,
  add column if not exists suppress_capi boolean not null default false;

-- Existing live leads keep their current source as the initial marketing touch.
update public.leads
set
  last_touch_source = coalesce(last_touch_source, source),
  last_touch_at = coalesce(last_touch_at, last_seen_at),
  source_confidence = coalesce(
    source_confidence,
    case
      when source = 'Meta Ads' then 'live_meta_referral'
      when source ilike '%Organic%' then 'live_organic'
      else 'legacy_existing'
    end
  )
where last_touch_source is null
   or last_touch_at is null
   or source_confidence is null;

create index if not exists leads_last_touch_source_idx
  on public.leads(last_touch_source);
create index if not exists leads_manual_campaign_idx
  on public.leads(manual_campaign);
create index if not exists leads_historical_idx
  on public.leads(is_historical, first_seen_at desc);

commit;
