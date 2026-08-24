-- CRM Funnel V2 - SAFE PRE-DEPLOY MIGRATION
-- Run this while the OLD CRM is still live.
-- This migration is backward-compatible: it allows both old and new status labels.

begin;

-- IMPORTANT: drop the old constraint BEFORE allowing new labels.
alter table public.leads
  drop constraint if exists leads_status_check;

-- Compatibility constraint: old app can still write legacy labels while the
-- new app can write the V2 labels. Existing data is NOT renamed yet.
alter table public.leads
  add constraint leads_status_check check (
    status in (
      'Chat Builder',
      'Tanya Aja',
      'Quotation Dikirim',
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

-- Historical/pre-CRM attribution support.
alter table public.leads
  add column if not exists closing_trigger text,
  add column if not exists is_historical boolean not null default false,
  add column if not exists historical_imported_at timestamptz;

create index if not exists leads_first_seen_idx on public.leads(first_seen_at desc);
create index if not exists leads_source_idx on public.leads(source);
create index if not exists leads_closed_at_idx on public.leads(closed_at desc);

commit;
