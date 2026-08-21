# Patch Marketing API — Gudang WPC CRM

Menambahkan Campaign Name, Ad Set Name, Ad Name, Creative ID, backfill lead lama, dan auto-enrichment lead baru.

## Pasang
1. Supabase → SQL Editor → jalankan `supabase/marketing_api_patch.sql`.
2. Copy seluruh isi patch ke root project.
3. Pastikan Vercel punya `META_MARKETING_ACCESS_TOKEN`.
4. Tambahkan `META_GRAPH_VERSION=v25.0`.
5. Push GitHub → tunggu Vercel redeploy.

## Test
Buka:
`https://gudang-wpc-crm.vercel.app/api/meta/test-ad?ad_id=120250552250010128`

Jika sukses, response berisi `ad_name`, `adset_name`, dan `campaign_name`.

## Backfill lead lama
POST ke `/api/meta/backfill` (bisa via curl/Postman) untuk mengisi nama campaign/ad set/ad pada lead Meta Ads yang sudah ada.
