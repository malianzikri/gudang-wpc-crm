# CRM Attribution V3

Patch ini memisahkan **sumber pertama / first touch** dari **touch/trigger terbaru** supaya lead lama hasil iklan tidak salah terbaca sebagai WhatsApp Organic ketika mereka chat lagi setelah follow-up/broadcast.

## Kenapa patch ini perlu

Dari data yang diberikan:

- CRM aktif setelah sebagian lead lama sudah pernah masuk melalui iklan/broadcast.
- File historical memiliki **145 nomor unik**.
- Export CRM 18–24 Agustus memiliki **80 nomor**.
- Ada **10 nomor yang overlap** antara CRM dan historical.
- Dari 10 overlap itu: **8 memiliki riwayat Meta Ads**, 1 memang Organic, dan 1 adalah Broadcast/legacy.

Contoh: nomor Lotus ada di historical sebagai Meta Ads D2 New, sehingga tidak boleh terus dianggap Organic ketika chat ulang.

## Model data V3

### `source`
Sumber acquisition / first touch. Sticky dan tidak diubah hanya karena customer chat lagi.

Nilai utama:
- `Meta Ads`
- `WhatsApp Organic`
- `Legacy / Belum Teratribusi`
- `Walk-in`
- `Referral`

### `last_touch_source`
Touch/trigger marketing yang membantu reaktivasi:
- WhatsApp Organic
- Meta Ads
- WhatsApp Broadcast
- Follow-up Personal
- Survey
- Walk-in
- Referral

Broadcast tidak lagi dianggap acquisition source jika asal awal customer tidak diketahui.

### Historical
Lead lama ditandai:
- `is_historical = true`
- `historical_imported_at`
- `suppress_capi = true` untuk historical-only tanpa CTWA live

Jika kemudian customer datang lagi dari klik CTWA baru yang valid, webhook dapat membuka kembali eligibility CAPI.

## Urutan deployment

### 1. Jalankan schema patch

Jalankan di Supabase SQL Editor:

`supabase/crm_attribution_v3_patch.sql`

Patch ini aman untuk database yang sudah berjalan karena hanya menambah kolom/index dan mengisi default touch untuk data existing.

### 2. Deploy source app V3

Deploy folder/source ini seperti versi sebelumnya.

Perubahan UI utama:
- `First Touch` dipisahkan dari `Touch / Trigger`.
- Card `Belum Teratribusi` ditambahkan.
- Card `Reaktivasi Broadcast` dihitung dari marketing touch.
- Filter source tidak lagi menganggap Broadcast sebagai acquisition source.
- Historical/pre-CRM diberi label di tabel.
- Campaign manual ditampilkan jika nama Meta tidak tersedia.

### 3. Jalankan historical backfill SEKALI

Setelah app V3 live, jalankan:

`supabase/crm_historical_backfill_2026_08.sql`

Backfill ini idempotent (aman di-run ulang), match berdasarkan `wa_id`, dan:
- tidak membuat duplikat untuk nomor yang sudah ada,
- memundurkan `first_seen_at` ke tanggal historical sebenarnya,
- memperbaiki false Organic menjadi Meta Ads jika historical membuktikan Meta,
- menandai Broadcast-only historical sebagai `Legacy / Belum Teratribusi` + touch `WhatsApp Broadcast`,
- mempertahankan aktivitas live terbaru,
- hanya menaikkan status bila historical lebih maju,
- tidak memicu CAPI historical lama.

### 4. Refresh CRM

Setelah backfill, refresh dashboard dan cek:
- Meta Ads / Organic / Belum Teratribusi,
- Reaktivasi Broadcast,
- historical label,
- Yuni harus beratribusi Meta D2 dengan revenue total Rp10.500.000.

## Revenue historical yang dimasukkan

Hanya nominal yang eksplisit dari data/user yang dimasukkan:
- Yuni: Rp10.500.000
- Djomazon: Rp1.400.000
- Dede: Rp375.000

Closing historical lain yang tidak memiliki nominal eksplisit tetap `revenue = 0` sampai diisi manual. Ini sengaja agar sistem tidak menebak omzet.

## File audit

- `historical_backfill_preview.csv` — 145 unique historical rows hasil normalisasi yang akan di-upsert.
- `historical_overlap_report.csv` — 10 nomor yang ditemukan overlap antara export CRM sekarang dan historical.
