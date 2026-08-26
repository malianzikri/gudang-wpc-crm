-- CRM Sales Action V3 - safe additive patch
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in (
  'Chat Builder','Tanya Kebutuhan','Foto Area Diterima','Qualified','Estimasi Dikirim',
  'Survey Ditawarkan','Survey Terjadwal','Quotation Final','Hot','Closing',
  'Pending','No Response','Lost','Tidak Layak'
));

alter table public.leads add column if not exists product_interest text;
alter table public.leads add column if not exists intent text;
alter table public.leads add column if not exists project_size text;
alter table public.leads add column if not exists project_location text;
alter table public.leads add column if not exists estimated_value numeric(14,2) not null default 0;
alter table public.leads add column if not exists next_follow_up_at timestamptz;
alter table public.leads add column if not exists follow_up_reason text;
alter table public.leads add column if not exists pending_reason text;
alter table public.leads add column if not exists lost_reason text;
alter table public.leads add column if not exists lead_score integer not null default 0;

create index if not exists leads_next_follow_up_idx on public.leads(next_follow_up_at);
create index if not exists leads_product_interest_idx on public.leads(product_interest);
create index if not exists leads_intent_idx on public.leads(intent);

-- sensible score backfill, without overwriting scores already set manually
update public.leads set lead_score = case status
  when 'Chat Builder' then 5
  when 'Tanya Kebutuhan' then 20
  when 'Foto Area Diterima' then 45
  when 'Qualified' then 60
  when 'Estimasi Dikirim' then 70
  when 'Survey Ditawarkan' then 75
  when 'Survey Terjadwal' then 80
  when 'Quotation Final' then 85
  when 'Hot' then 95
  when 'Closing' then 100
  when 'Pending' then 50
  when 'No Response' then 10
  else 0 end
where lead_score = 0;
