# Gudang WPC CRM — Final Reviewed Build

CRM internal untuk tracking:

**WhatsApp → kebutuhan → estimasi → survey → quotation final → closing**

Versi ini adalah hasil audit ulang dari full project. Patch-patch lama sudah disatukan dan file legacy/duplikat sudah dibuang agar repository production tidak membingungkan.

## Funnel final

1. Chat Builder
2. Tanya Kebutuhan
3. Estimasi Dikirim
4. Foto Area Diterima
5. Qualified
6. Survey Ditawarkan
7. Survey Terjadwal
8. Quotation Final
9. Hot
10. Closing
11. Tidak Layak

UI, API, dan database memakai definisi status yang sama dari `src/lib/lead-pipeline.ts`.

## Attribution: First Touch vs Touch / Trigger

Konsep ini penting:

- `source` = **FIRST TOUCH / sumber akuisisi pertama** dan bersifat sticky.
- `last_touch_source` = **Touch / Trigger terbaru**.

Contoh:

1. Customer pertama kali chat sendiri → `source = WhatsApp Organic`.
2. Customer kemudian dihubungi lewat broadcast → `last_touch_source = WhatsApp Broadcast`.
3. First Touch tetap Organic.

Contoh lain:

1. Customer pertama kali Organic.
2. Beberapa hari kemudian customer klik iklan Meta.
3. `source` tetap `WhatsApp Organic`.
4. `last_touch_source` menjadi `Meta Ads`.
5. `source_id` / `ctwa_clid` boleh tersimpan karena ada Meta touch.
6. Lead tetap dapat mengirim CAPI bila ada live `ctwa_clid`.

**Jangan menganggap adanya Ad ID otomatis berarti First Touch harus Meta Ads.**

## Touch / Trigger yang didukung

- WhatsApp Organic
- Meta Ads
- WhatsApp Broadcast
- Follow-up Personal
- Survey
- Walk-in
- Referral

Label legacy `WA Broadcast` dan `Reaktivasi Broadcast` otomatis dinormalisasi menjadi `WhatsApp Broadcast`.

## Meta CAPI

CAPI hanya dikirim jika:

- ada `ctwa_clid`,
- `suppress_capi = false`,
- status sudah mencapai `Estimasi Dikirim` atau tahap setelahnya untuk `LeadSubmitted`,
- atau status `Closing` + revenue > 0 untuk `Purchase`,
- event belum pernah berhasil dikirim sebelumnya.

Historical/backfill tanpa live CTWA tetap CAPI-off. Jika historical lead kemudian benar-benar klik iklan dan webhook menerima live `ctwa_clid`, eligibility CAPI dapat aktif kembali.

## Meta Ads Performance

Dashboard performance memakai mode aman:

- Refresh browser **tidak** memanggil Meta Insights.
- Tombol Refresh CRM **tidak** memanggil Meta Insights.
- Hanya `Sync Performa Meta` yang memanggil Meta Insights.
- Cooldown server 15 menit berlaku global.
- Request gagal juga masuk cooldown agar user tidak dapat spam retry.
- Cache terakhir tetap dipakai jika Meta sedang membatasi API.

`Sync Nama Iklan` hanya memperkaya maksimal beberapa lead yang memiliki Ad ID tetapi nama Campaign/Ad Set/Ad belum lengkap. Aksi ini memakai cooldown global 15 menit yang sama dengan Performance Sync, sehingga tombol berulang tidak membanjiri Marketing API.

## Custom Audience Export

Dashboard dapat export:

- All Leads
- High Intent
- Closing

High Intent menggunakan definisi funnel bersama, dan sengaja **tidak memasukkan Closing** karena Closing punya audience sendiri.

Export mengikuti filter tanggal dashboard dan tidak memanggil Meta API.

## Security

- Semua query database dari aplikasi berjalan server-side menggunakan Supabase service role.
- RLS aktif dan tidak dibuat policy anon/authenticated untuk tabel CRM.
- Dashboard/API internal dilindungi Basic Auth.
- Di production, jika `DASHBOARD_USER` atau `DASHBOARD_PASSWORD` tidak ada, middleware **fail closed** dengan status 503 agar data customer tidak terbuka.
- Webhook WhatsApp memverifikasi `x-hub-signature-256`.
- Duplicate webhook dicek lewat `wa_message_id` sebelum Marketing API dipanggil.
- Token/secret tidak disimpan dalam source.

## Environment Variables

Gunakan `.env.example`.

Wajib production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DASHBOARD_USER`
- `DASHBOARD_PASSWORD`
- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- `META_MARKETING_ACCESS_TOKEN`
- `META_GRAPH_VERSION`
- `META_DATASET_ID`
- `META_CAPI_ACCESS_TOKEN`
- `WHATSAPP_WABA_ID`

Jangan commit nilai token/key asli.

---

# Deploy ke production database yang SUDAH ADA

## 1. Jalankan SQL rekonsiliasi

Supabase → SQL Editor → jalankan:

`supabase/production_hardening.sql`

SQL tersebut:

- tidak menghapus leads/messages,
- menyamakan kolom final,
- menyamakan status constraint,
- normalisasi touch legacy,
- memperbaiki First Touch Meta **hanya jika dapat dibuktikan dari pesan pertama**,
- tidak mengubah Organic menjadi Meta hanya karena ada Ad ID,
- mengamankan historical CAPI,
- mengaktifkan RLS,
- menyiapkan cache Meta performance.

Tidak perlu menjalankan file patch lama satu per satu.

## 2. Deploy source

Replace repository production dengan project ini, lalu push ke branch yang terhubung ke Vercel.

## 3. Test read-only database

Setelah deploy, jalankan:

`supabase/post_deploy_checks.sql`

Check yang bertanda mismatch seharusnya `0`.

`organic_first_touch_with_later_meta_touch` adalah **informasi**, bukan error. Nilai > 0 valid karena memang memungkinkan customer Organic kemudian klik Meta Ads.

## 4. Smoke test aplikasi

Lakukan berurutan:

1. Buka CRM.
2. Lead Organic → ubah Touch / Trigger ke `WhatsApp Broadcast` → Simpan → Refresh.
3. First Touch harus tetap `WhatsApp Organic`, Touch tetap `WhatsApp Broadcast`.
4. Ubah status ke `Estimasi Dikirim` → Simpan → Refresh.
5. Tidak boleh ada `Invalid status`.
6. Untuk lead yang benar-benar dari Meta dan punya `ctwa_clid`, CAPI dapat berjalan sesuai aturan.
7. Refresh browser beberapa kali → tidak boleh men-trigger Meta Insights.
8. Klik `Sync Performa Meta` satu kali → setelah itu cooldown 15 menit.
9. Export Custom Audience dan pastikan CSV terdownload.

---

# Fresh install

Untuk database kosong gunakan:

`supabase/schema.sql`

Setelah itu isi environment variables dan deploy source.

---

# File database final

- `supabase/schema.sql` — fresh install.
- `supabase/production_hardening.sql` — database production existing.
- `supabase/post_deploy_checks.sql` — validasi read-only setelah deploy.

Tidak ada historical customer CSV di bundle final.
