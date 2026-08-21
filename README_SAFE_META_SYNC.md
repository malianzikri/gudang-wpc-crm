# Gudang WPC CRM — Safe Meta Sync Patch

Patch ini membuat dashboard Performa Iklan lebih aman untuk Marketing API yang masih sensitif / Limited Access.

## Perubahan utama

- Refresh browser **tidak** memanggil Meta Ads Insights.
- Tombol `Refresh` CRM **tidak** memanggil Meta Ads Insights.
- Update status/revenue lead **tidak** memanggil Meta Ads Insights.
- Pilih tanggal / `Terapkan Cache` hanya membaca Supabase cache.
- Hanya tombol `Sync Performa Meta` yang memanggil Meta Ads Insights.
- Ada cooldown **15 menit di server**, jadi klik berulang tidak membuat request Meta berulang.
- Data Meta terakhir yang berhasil disimpan di Supabase.
- Jika Meta mengembalikan `API access blocked`/error lain, dashboard tetap menampilkan cache terakhir.
- WhatsApp webhook dan Meta CAPI tidak diubah.

## File yang diganti/ditambah

1. `src/app/page.tsx` — replace
2. `src/app/api/meta/performance/route.ts` — replace
3. `supabase/meta_performance_cache.sql` — file SQL baru

## Cara pasang

### 1. Jalankan SQL terlebih dahulu di Supabase

Supabase → SQL Editor → New Query

Copy isi:
`supabase/meta_performance_cache.sql`

Run sampai sukses.

### 2. Copy patch ke project

Copy folder `src` dari patch ke root project dan replace file yang sama.

Jangan hapus file lain.

### 3. Commit / push lalu tunggu Vercel deploy

Tidak ada Environment Variable baru.

## Cara pakai setelah deploy

- Buka/refresh CRM: aman, tidak hit Meta Insights.
- `Refresh`: hanya refresh lead + cache.
- `Terapkan Cache`: tampilkan cache untuk periode yang dipilih.
- `Sync Performa Meta`: request Meta maksimal 1 kali per 15 menit untuk periode yang sama.
- `Sync Nama Iklan`: tetap merupakan tindakan Meta terpisah; gunakan hanya saat diperlukan.

Catatan: cooldown dihitung per rentang tanggal, misalnya cache `15/08–21/08` berbeda dengan cache `Hari ini`.
