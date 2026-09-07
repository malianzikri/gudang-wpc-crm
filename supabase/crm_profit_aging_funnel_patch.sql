-- Gudang WPC CRM
-- Profit/Margin + Stage Aging patch
-- Additive migration: does not delete existing leads/messages.

alter table public.leads
  add column if not exists cost_of_goods numeric(14,2) not null default 0;

-- Add nullable first so existing leads can be backfilled from real status history.
alter table public.leads
  add column if not exists status_changed_at timestamptz;

-- Backfill aging from the most recent status event that matches the current status.
update public.leads l
set status_changed_at = coalesce(
  (
    select max(e.created_at)
    from public.lead_status_events e
    where e.lead_id = l.id
      and e.new_status = l.status
  ),
  l.first_seen_at,
  l.created_at,
  now()
)
where l.status_changed_at is null;

alter table public.leads
  alter column status_changed_at set default now();

alter table public.leads
  alter column status_changed_at set not null;

create index if not exists leads_status_changed_at_idx
  on public.leads(status_changed_at asc);

-- Keep updated_at behavior, and additionally timestamp the moment a status changes.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if new.status is distinct from old.status then
    new.status_changed_at = now();
  end if;

  return new;
end;
$$;

-- Existing leads keep their backfilled status_changed_at.
-- Future status changes are maintained automatically by leads_set_updated_at.

select
  count(*) filter (where status_changed_at is null) as missing_status_changed_at,
  count(*) filter (where cost_of_goods < 0) as invalid_cost_of_goods
from public.leads;
