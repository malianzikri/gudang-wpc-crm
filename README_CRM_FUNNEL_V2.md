# CRM Funnel V2 — Gudang WPC/PVC Palembang

Patch ini memperbaiki pembacaan funnel setelah ditemukan bahwa `Quotation Dikirim` sering sebenarnya baru estimasi awal, sementara closing lebih kuat setelah foto/survey.

## Fitur utama

- Funnel baru:
  - Chat Builder
  - Tanya Kebutuhan
  - Estimasi Dikirim
  - Foto Area Diterima
  - Qualified
  - Survey Ditawarkan
  - Survey Terjadwal
  - Quotation Final
  - Hot
  - Closing
  - Tidak Layak
- Dashboard atas menampilkan Total Lead, Meta Ads, Organic, Broadcast, High Intent, tahap Survey, Closing, Revenue.
- Tabel **Sumber & Status Lead** untuk melihat masing-masing sumber berhenti di tahap mana.
- Sorting klik pada header tabel lead: Lead, Sumber, Campaign, Pesan Terakhir, Masuk Lead, Aktivitas Terakhir, Status, Revenue.
- Default urutan lead = aktivitas terakhir terbaru.
- Filter sumber: Meta Ads, Organic, Broadcast, Walk-in, Referral.
- Performa Meta menambah metrik Estimasi dan Survey; `Quotation` sekarang berarti **Quotation Final**.
- Revenue Meta tetap berbasis acquisition cohort (`first_seen_at`). Dashboard juga menunjukkan closing yang benar-benar terjadi pada tanggal filter (`closed_at`) agar tidak misleading.
- Dukungan historical/pre-CRM: `is_historical`, `historical_imported_at`, dan `closing_trigger`.
- Lead historical yang tidak punya campaign ID masih dapat dicocokkan ke campaign Meta menggunakan `campaign_name` jika namanya sama.

## Urutan deploy WAJIB

### 1. Jalankan SQL lebih dulu

Supabase → SQL Editor → jalankan seluruh isi:

`supabase/crm_funnel_v2_patch.sql`

SQL ini mengubah data lama:

- `Tanya Aja` → `Tanya Kebutuhan`
- `Quotation Dikirim` → `Estimasi Dikirim`

Hal ini disengaja karena quotation lama pada workflow sebelumnya kebanyakan merupakan estimasi sebelum survey.

### 2. Deploy source code

Setelah SQL sukses, deploy project ini ke Vercel seperti biasa.

> Jangan deploy source code V2 sebelum SQL dijalankan, karena database lama masih membatasi pilihan status lama.

## Historical lead 13–20 Agustus

Data manual sebelum CRM aktif sebaiknya dimasukkan sebagai historical dengan:

- `first_seen_at` = tanggal pertama chat sebenarnya
- `source` = sumber acquisition pertama (contoh `Meta Ads`)
- `campaign_name` = campaign first-touch (contoh D2)
- `status` = status terbaru yang benar
- `revenue` = total nilai transaksi jika Closing
- `closed_at` = tanggal deal jika diketahui
- `is_historical` = `true`
- `historical_imported_at` = waktu import
- `closing_trigger` = misalnya `Survey`, `Broadcast`, atau `Follow-up`

Jangan mengubah `source` menjadi Broadcast hanya karena broadcast menjadi pemicu deal. `source` tetap first-touch; `closing_trigger` dipakai untuk pemicu closing.

Historical row tidak otomatis mengirim event Meta CAPI karena data lama umumnya tidak mempunyai CTWA ID. Ini mencegah event lama terkirim seolah-olah conversion baru.

## Safe migration for an already-running CRM

Because the production database already has `leads_status_check`, do **not** update rows to V2 status names before expanding/removing that constraint.

Use this zero-downtime order:

1. Run `supabase/crm_funnel_v2_patch_safe.sql` while the old CRM is still live. It temporarily permits both legacy and V2 status labels and adds the new attribution columns.
2. Deploy the V2 application.
3. Confirm the dashboard and lead status controls work.
4. Run `supabase/crm_funnel_v2_finalize.sql` to convert `Tanya Aja` → `Tanya Kebutuhan` and `Quotation Dikirim` → `Estimasi Dikirim`, then restrict the database to V2 statuses only.

The V2 API also normalizes the two legacy labels while the compatibility window is active, so old rows are shown in the new funnel correctly before the finalize step.
