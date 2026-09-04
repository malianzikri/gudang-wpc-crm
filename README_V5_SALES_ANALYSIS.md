# Gudang WPC CRM V5 — Sales Analysis + Status History

Patch ini melanjutkan V4 Sales Queue + Meta Custom Audience. Tidak mengubah alur attribution, CAPI, Meta performance, atau segment audience yang sudah ada.

## Yang ditambah

1. **Riwayat Status per lead** di `Detail Sales`
   - Menampilkan `status lama → status baru`, waktu perubahan, durasi di tahap sebelumnya, dan revenue bila ada.
   - Status saat ini menampilkan sudah berapa lama berada di tahap tersebut.

2. **Analisa Sales**
   - Jumlah perpindahan status.
   - Drop-off ke `No Response`, `Lost`, atau `Tidak Layak`.
   - Lead yang aktif kembali dari `No Response/Pending`.
   - Jumlah perpindahan ke `Closing`.
   - Rata-rata waktu dari histori status pertama sampai Closing.
   - Perpindahan status terbanyak dan persentase dari perpindahan keluar tahap tersebut.
   - Drop-off terbesar.
   - Rata-rata waktu antar tahap.
   - Snapshot alasan Pending dan Lost saat ini.

3. **Database trigger status history**
   - Perubahan status dicatat di PostgreSQL/Supabase, bukan hanya dari tombol CRM.
   - Update status dari CRM, API, atau edit database tetap tercatat.
   - Lead lama yang belum punya histori sama sekali mendapat satu starting snapshot tanpa menghapus histori lama.

## Cara update dari V4

Karena V5 memindahkan pencatatan status dari API ke database trigger, urutan paling aman adalah:

1. Backup/source lama bila perlu.
2. Replace source project dengan isi ZIP V5 lalu deploy ke Vercel.
3. Setelah deployment V5 sukses, jalankan sekali:
   `supabase/crm_sales_analysis_v5_patch.sql`
   di Supabase SQL Editor.
4. Refresh CRM.
5. Ubah satu lead test dari satu status ke status lain, klik `Detail Sales`, dan pastikan transisinya muncul sekali di `Riwayat Status`.

## Catatan periode Analisa Sales

Analisa Sales mengikuti **tanggal ketika status berubah** (`lead_status_events.created_at`). Jadi pilihan `Filter: Lead Masuk` atau `Filter: Aktivitas Terakhir` tidak mengubah definisi analisa sales. Tombol periode Hari Ini/Kemarin/7 Hari/30 Hari tetap mengatur rentang Analisa Sales.

## Safety

- V4 Meta Custom Audience tetap ada.
- Sales Queue tetap ada.
- First-touch attribution tetap ada.
- CAPI logic tetap ada.
- Tidak ada perubahan environment variable.
