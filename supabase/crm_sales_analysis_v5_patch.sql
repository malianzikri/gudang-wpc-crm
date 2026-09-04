-- Gudang WPC CRM V5 — Sales Analysis + Status History
-- IMPORTANT: deploy the V5 app code first, then run this SQL once.

begin;

create index if not exists lead_status_events_lead_created_idx
  on public.lead_status_events (lead_id, created_at asc);

create index if not exists lead_status_events_created_idx
  on public.lead_status_events (created_at desc);

-- Backfill only leads that do not have any history yet. This preserves
-- existing transition history and gives older untouched leads a starting point.
insert into public.lead_status_events (lead_id, old_status, new_status, revenue, created_at)
select
  l.id,
  null,
  l.status,
  coalesce(l.revenue, 0),
  coalesce(l.first_seen_at, now())
from public.leads l
where not exists (
  select 1
  from public.lead_status_events e
  where e.lead_id = l.id
);

create or replace function public.crm_log_lead_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is not null then
      insert into public.lead_status_events (
        lead_id, old_status, new_status, revenue, created_at
      ) values (
        new.id, null, new.status, coalesce(new.revenue, 0), coalesce(new.first_seen_at, now())
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_status_events (
      lead_id, old_status, new_status, revenue, created_at
    ) values (
      new.id, old.status, new.status, coalesce(new.revenue, 0), now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_lead_status_history on public.leads;
create trigger trg_crm_lead_status_history
after insert or update of status on public.leads
for each row
execute function public.crm_log_lead_status_change();

commit;
