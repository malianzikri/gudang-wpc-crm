create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  wa_id text unique not null,
  phone text,
  name text,
  status text not null default 'Chat Builder' check (status in ('Chat Builder','Tanya Kebutuhan','Estimasi Dikirim','Foto Area Diterima','Qualified','Survey Ditawarkan','Survey Terjadwal','Quotation Final','Hot','Closing','Tidak Layak')),
  source text not null default 'WhatsApp Organic',
  source_type text,
  source_id text,
  source_url text,
  ad_headline text,
  ad_body text,
  ad_media_type text,
  first_message text,
  last_message text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revenue numeric(14,2) not null default 0,
  closed_at timestamptz,
  closing_trigger text,
  last_touch_source text,
  last_touch_at timestamptz,
  manual_campaign text,
  source_confidence text,
  suppress_capi boolean not null default false,
  is_historical boolean not null default false,
  historical_imported_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_last_seen_idx on public.leads(last_seen_at desc);
create index if not exists leads_source_id_idx on public.leads(source_id);

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
create index if not exists messages_lead_idx on public.messages(lead_id, created_at desc);

create table if not exists public.lead_status_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  old_status text,
  new_status text not null,
  revenue numeric(14,2),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads for each row execute function public.set_updated_at();

alter table public.leads enable row level security;
alter table public.messages enable row level security;
alter table public.lead_status_events enable row level security;
