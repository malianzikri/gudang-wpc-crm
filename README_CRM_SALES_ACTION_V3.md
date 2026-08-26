# CRM Sales Action V3

Upgrade ini bersifat additive dan menjaga alur Meta CAPI / WhatsApp yang sudah ada.

## Yang ditambahkan
- Status: Pending, No Response, Lost.
- Label UI `Tanya Kebutuhan` ditampilkan sebagai **Tanya Aja** dan `Estimasi Dikirim` sebagai **Estimasi Harga** tanpa merusak data lama.
- Sales Action per lead: produk, intent, ukuran proyek, lokasi proyek, next follow-up, alasan follow-up, lead score.
- Panel **Butuh Tindakan Hari Ini**.
- Badge **OVERDUE** untuk follow-up yang lewat jadwal.
- Next Action otomatis berdasarkan status.
- SQL patch aman dan idempotent: `supabase/crm_sales_action_v3_patch.sql`.

## Urutan deploy
1. Backup database Supabase.
2. Buka SQL Editor Supabase dan jalankan `supabase/crm_sales_action_v3_patch.sql` SATU KALI.
3. Deploy source code versi ini ke Vercel.
4. Hard refresh browser.
5. Tes satu lead dummy / lead internal: ubah Product, Intent, Next Follow Up, Status lalu klik Simpan.
6. Pastikan Source / First Touch tidak berubah saat Touch/Trigger diubah.
7. Pastikan status Closing + Revenue tetap memicu Purchase CAPI seperti versi sebelumnya.

## Catatan keamanan data
- Tidak ada penghapusan lead atau histori.
- First-touch attribution tetap sticky.
- Trigger CAPI existing dipertahankan; patch tidak mengubah kredensial atau endpoint Meta.
- Field baru nullable/default sehingga data lama tetap valid.
