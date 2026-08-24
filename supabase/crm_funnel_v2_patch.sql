-- CRM Funnel V2 patch
-- Run ONCE in Supabase SQL Editor before deploying the patched app.

begin;

-- Existing labels represented early estimates, not final quotations.
update public.leads
set status = 'Tanya Kebutuhan'
where status = 'Tanya Aja';

update public.leads
set status = 'Estimasi Dikirim'
where status = 'Quotation Dikirim';

alter table public.leads drop constraint if exists leads_status_check;

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

-- Historical/pre-CRM attribution support. `source` and campaign fields remain
-- the sticky first-touch acquisition source. `closing_trigger` records what
-- finally helped close the deal (Survey, Broadcast, Follow-up, etc.).
alter table public.leads
  add column if not exists closing_trigger text,
  add column if not exists is_historical boolean not null default false,
  add column if not exists historical_imported_at timestamptz;

create index if not exists leads_first_seen_idx on public.leads(first_seen_at desc);
create index if not exists leads_source_idx on public.leads(source);
create index if not exists leads_closed_at_idx on public.leads(closed_at desc);

commit;
