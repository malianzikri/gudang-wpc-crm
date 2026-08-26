# Audit Final — Gudang WPC CRM

Tanggal audit: 25 Agustus 2026

## Status

Project full telah direkonsiliasi menjadi satu build final. Patch lama tidak perlu ditumpuk lagi.

## Pemeriksaan yang lolos

- TypeScript static audit: **PASS**
- Internal alias imports (`@/...`): **20 diperiksa, 0 missing**
- Duplicate API routes: **0**
- Hard-coded secret/token scan: **0**
- Historical customer CSV di bundle: **0**
- Duplicate legacy routes (`/api/page.tsx`, `/api/leads/leads`): **sudah tidak ada**
- Source/First Touch runtime: existing lead tidak lagi dipaksa Meta hanya karena ada Ad ID
- Touch/Trigger: disimpan terpisah lewat `last_touch_source`
- Status funnel: UI/API memakai definisi bersama
- Meta Performance: GET cache-only; POST manual sync; cooldown global
- Sync Nama Iklan: max 5 per run + cooldown global
- Historical CAPI: suppressed sampai ada live CTWA reactivation
- Middleware production: fail closed bila Basic Auth env tidak ada
- RLS: aktif untuk tabel CRM; server memakai service role
- Custom Audience: High Intent memakai definisi funnel bersama dan Closing terpisah

## Catatan attribution final

- `source` = FIRST TOUCH / sumber akuisisi pertama.
- `last_touch_source` = touch/trigger terbaru.
- Ad ID / `ctwa_clid` boleh ada pada lead first-touch Organic jika customer kemudian klik Meta Ads.
- Ad ID saja tidak boleh dipakai untuk mengubah First Touch menjadi Meta.
- Repair First Touch Meta pada SQL hanya dilakukan jika pesan inbound pertama benar-benar mempunyai referral Meta dan waktunya sesuai dengan `first_seen_at`.

## Database production existing

Jalankan hanya:

1. `supabase/production_hardening.sql`
2. deploy source
3. `supabase/post_deploy_checks.sql`

Jangan menjalankan ulang historical backfill hanya untuk deploy build ini.

## Batasan audit environment

Dependency install dari registry mengalami timeout di environment audit, sehingga `npm run build` dengan dependency real tidak dapat dijalankan di sini.

Sebagai pengganti, source melewati:
- TypeScript static compile dengan declaration stubs,
- import resolution audit internal,
- route duplication audit,
- secret scan,
- manual review alur webhook / save / CAPI / Meta cache / SQL.

Vercel production build tetap menjadi validasi build real terakhir setelah source dipush.
