# Performance Dashboard Patch — Gudang WPC CRM

Patch ini menambahkan dashboard performa iklan yang menggabungkan:

Meta Ads spend + CRM lead funnel + closing revenue.

## Metrik

Per Campaign dan Per Ad:

- Spend
- Lead
- Qualified
- Quotation
- Hot
- Closing
- Revenue
- CPL
- Cost per Qualified
- Cost per Closing
- Qualified Rate
- Closing Rate
- ROAS

## Cara pasang

Copy folder `src` dari patch ini ke root project `gudang-wpc-crm`.

File yang ditimpa:
- `src/app/page.tsx`

File baru:
- `src/lib/meta-insights.ts`
- `src/app/api/meta/performance/route.ts`

Tidak ada SQL migration baru.

## Environment

Pastikan sudah ada:

META_MARKETING_ACCESS_TOKEN=<system user token ads_read>
META_GRAPH_VERSION=v26.0

Tidak perlu menambahkan Ad Account ID. Endpoint akan mendeteksi Ad Account dari salah satu Ad ID yang sudah tersimpan di CRM.

## Deploy

Commit → push → tunggu Vercel deploy.

## Test API

Buka:

https://gudang-wpc-crm.vercel.app/api/meta/performance

atau:

https://gudang-wpc-crm.vercel.app/api/meta/performance?since=2026-08-15&until=2026-08-21

Harus mengembalikan JSON dengan:
- summary
- campaigns
- ads

## Catatan periode lead

Lead CRM dihitung berdasarkan `first_seen_at` — artinya lead diatribusikan ke tanggal pertama kali lead tersebut masuk ke CRM.

Status funnel menggunakan prinsip “sudah mencapai minimal tahap ini”:
- Qualified mencakup Qualified + Quotation + Hot + Closing
- Quotation mencakup Quotation + Hot + Closing
- Hot mencakup Hot + Closing
- Closing = Closing

Ini membuat funnel tidak kehilangan lead yang sudah bergerak ke tahap lebih tinggi.

## Catatan reach

Jika melihat agregat Campaign, reach dijumlahkan dari level Ad dan dapat mengandung overlap antar Ad. Untuk keputusan biaya, gunakan Spend / Lead / Qualified / Closing / Revenue / ROAS sebagai KPI utama.
