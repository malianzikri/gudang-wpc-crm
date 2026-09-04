-- CRM Sales Queue + Meta Custom Audience V4
-- Safe additive patch. Run once in Supabase SQL Editor before deploying this app version.

alter table public.leads add column if not exists reactivated_at timestamptz;
alter table public.leads add column if not exists reactivated_from_status text;
create index if not exists leads_reactivated_at_idx on public.leads(reactivated_at desc);

create table if not exists public.meta_audience_exports (
  id uuid primary key default gen_random_uuid(),
  audience_key text not null,
  export_mode text not null check (export_mode in ('full','add','remove')),
  row_count integer not null default 0,
  lead_ids jsonb not null default '[]'::jsonb,
  downloaded_at timestamptz not null default now(),
  uploaded_at timestamptz
);
create index if not exists meta_audience_exports_key_idx
  on public.meta_audience_exports(audience_key, downloaded_at desc);
create index if not exists meta_audience_exports_uploaded_idx
  on public.meta_audience_exports(uploaded_at desc);

create table if not exists public.meta_audience_members (
  audience_key text not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  synced_at timestamptz not null default now(),
  primary key (audience_key, lead_id)
);
create index if not exists meta_audience_members_lead_idx
  on public.meta_audience_members(lead_id);

alter table public.meta_audience_exports enable row level security;
alter table public.meta_audience_members enable row level security;
