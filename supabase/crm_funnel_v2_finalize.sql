-- CRM Funnel V2 - FINALIZE MIGRATION
-- Run ONLY AFTER the V2 app has been deployed and confirmed working.
-- Converts legacy labels and tightens the constraint to V2-only statuses.

begin;

-- Constraint currently allows both legacy and V2 labels, so these updates are safe.
update public.leads
set status = 'Tanya Kebutuhan'
where status = 'Tanya Aja';

update public.leads
set status = 'Estimasi Dikirim'
where status = 'Quotation Dikirim';

alter table public.leads
  drop constraint if exists leads_status_check;

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

commit;
