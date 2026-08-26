-- Gudang WPC CRM - FINAL read-only post-deploy checks.
-- No customer names, phone numbers, or message content is returned.

-- 1) Status distribution. Every status must be a final funnel label.
select status, count(*) as total
from public.leads
group by status
order by status;

-- 2) Touch must be initialized.
select count(*) as leads_without_touch
from public.leads
where last_touch_source is null or btrim(last_touch_source) = '';

-- 3) Broadcast must never remain in FIRST TOUCH source. Expected: 0.
select count(*) as broadcast_in_first_touch_source
from public.leads
where source in ('WA Broadcast', 'Reaktivasi Broadcast', 'WhatsApp Broadcast');

-- 4) Only a PROVABLE first-message Meta referral is a first-touch mismatch.
-- Expected: 0.
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
select count(*) as provable_first_touch_meta_mismatch
from public.leads l
join first_inbound f on f.lead_id = l.id
where l.is_historical = false
  and f.meta_source_id is not null
  and f.meta_source_id <> ''
  and abs(extract(epoch from (f.occurred_at - l.first_seen_at))) <= 300
  and l.source is distinct from 'Meta Ads';

-- 5) INFORMATIONAL, not an error:
-- Organic first-touch leads that later received a Meta touch are valid.
select count(*) as organic_first_touch_with_later_meta_touch
from public.leads
where source = 'WhatsApp Organic'
  and (
    source_id is not null
    or ctwa_clid is not null
    or last_touch_source = 'Meta Ads'
  );

-- 6) Historical rows are CAPI-off unless a live webhook explicitly
-- reactivated them. Expected: 0.
select count(*) as historical_capi_safety_mismatch
from public.leads
where is_historical = true
  and suppress_capi = false
  and source_confidence is distinct from 'historical_live_ctwa';

-- 7) Duplicate WhatsApp message IDs should be impossible because of unique key.
-- Expected: 0.
select count(*) as duplicate_wa_message_id_groups
from (
  select wa_message_id
  from public.messages
  group by wa_message_id
  having count(*) > 1
) x;

-- 8) Required server tables exist.
select
  to_regclass('public.leads') is not null as leads_ok,
  to_regclass('public.messages') is not null as messages_ok,
  to_regclass('public.lead_status_events') is not null as status_events_ok,
  to_regclass('public.meta_conversion_events') is not null as capi_events_ok,
  to_regclass('public.meta_performance_cache') is not null as performance_cache_ok;
