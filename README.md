# Gudang WPC CRM — WhatsApp Lead Tracking MVP

Flow: **Meta Ads / WhatsApp → webhook → lead → Qualified → Quotation → Hot → Closing → Revenue**.

## Yang sudah ada
- Webhook verification Meta WhatsApp.
- Pesan masuk otomatis disimpan ke Supabase.
- Referral Click-to-WhatsApp disimpan: `source_id` (Ad ID), `source_url`, `headline`, `body`, `media_type`.
- Dashboard lead + filter.
- Status workflow V2: Chat Builder, Tanya Kebutuhan, Estimasi Dikirim, Foto Area Diterima, Qualified, Survey Ditawarkan, Survey Terjadwal, Quotation Final, Hot, Closing, Tidak Layak.
- Revenue closing.
- Riwayat perubahan status.
- Basic Auth untuk dashboard.
- Validasi signature Meta bila `META_APP_SECRET` diisi.

## Setup 1 — Supabase
1. Buat project Supabase baru.
2. SQL Editor → jalankan `supabase/schema.sql`.
3. Project Settings → API → ambil Project URL dan service_role key.

## Setup 2 — GitHub + Vercel
Upload seluruh isi project ini ke repo GitHub baru lalu import ke Vercel.

Environment Variables wajib:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DASHBOARD_USER`
- `DASHBOARD_PASSWORD`
- `WHATSAPP_VERIFY_TOKEN`

Buat verification token random sendiri, contoh `wpc_webhook_2026_xxxxxxxxx`. Ini BUKAN access token Meta.

Setelah deploy cek:
`https://DOMAIN-VERCEL/api/health`

## Setup 3 — layar Meta yang sekarang
Callback URL:
`https://DOMAIN-VERCEL/api/webhooks/whatsapp`

Verification Token:
isi persis sama dengan `WHATSAPP_VERIFY_TOKEN` di Vercel.

Klik **Verifikasi dan simpan**.

Setelah terverifikasi, subscribe field **messages** dan pastikan app tersubscribe ke WABA.

## Penting
Dashboard Meta pada setup kamu memberi peringatan bahwa app yang belum diterbitkan hanya menerima webhook uji. Jadi setelah test webhook berhasil, selesaikan requirement Meta untuk mode produksi sebelum mengetes chat customer real.

## Phase 2
- Marketing API: Ad ID → Ad Name → Ad Set → Campaign.
- Funnel per creative/campaign.
- Spend + Cost per Qualified + Cost per Closing.
- Conversion API saat Closing/Purchase.
- Import 145 lead lama dari Excel/CSV.
- Reminder follow-up.

fixing
