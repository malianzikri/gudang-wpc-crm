# V3.1.1 Hotfix

Perbaikan:
- Status/revenue dapat disimpan walau kolom `estimated_value` belum tersedia di Supabase.
- Kartu Performa Iklan dibuat responsif agar Revenue Aktual dan ROAS tidak bertabrakan.
- Label filter cepat menampilkan nama manusia (`Tanya Aja`) bukan key internal (`ask`).

## Deploy
Tidak perlu menjalankan historical/backfill.
Replace source V3.1 dengan V3.1.1 lalu deploy ke Vercel.

## Opsional database
Kolom `estimated_value` tetap boleh ditambahkan nanti dengan:
`alter table public.leads add column if not exists estimated_value numeric(14,2) not null default 0;`
Hotfix ini tidak membutuhkannya untuk menyimpan status.
