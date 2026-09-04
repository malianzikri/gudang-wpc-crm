# CRM V4 — Sales Queue + Meta Custom Audience

Patch ini bersifat additive dan mempertahankan alur CRM/CAPI/first-touch yang sudah ada.

## WAJIB SEBELUM DEPLOY
Jalankan sekali di Supabase SQL Editor:

`supabase/crm_sales_audience_v4_patch.sql`

Baru setelah SQL sukses, deploy source code versi ini ke Vercel.

## Yang ditambah

### Sales Queue lintas periode
Tombol cepat sekarang tidak bergantung pada periode Lead Masuk:
- FU Hari Ini
- Overdue
- Balas Lagi
- Hot
- Estimasi
- Qualified
- Tanya Aja
- Builder
- Pending
- No Response
- Belum Ada FU

### Reactivated / Balas Lagi
Jika lead berstatus `No Response` atau `Pending` mengirim pesan WhatsApp inbound baru, webhook menyimpan:
- `reactivated_at`
- `reactivated_from_status`

Status tidak otomatis diubah. Sales tetap menentukan status yang benar. Saat lead dipindahkan dari No Response/Pending ke status aktif lain, flag reactivated dibersihkan.

### Detail Sales
Field yang sebelumnya sudah tersedia di database sekarang dipakai di UI:
- estimated_value
- pending_reason
- lost_reason
- notes

### Meta Custom Audience
Segment tersedia:
- All Leads
- Qualified+
- Hot / Estimasi
- Closing
- No Response
- Produk WPC
- Produk PVC
- Wallboard / UV Marble

Mode export:
- `ADD`: anggota eligible yang belum ditandai sinkron
- `REMOVE`: anggota yang sebelumnya ditandai sinkron tetapi sekarang sudah tidak memenuhi segment
- `FULL`: seluruh anggota segment berdasarkan kondisi CRM saat ini

Setelah CSV didownload dan benar-benar selesai di-upload ke Meta, klik `Tandai sudah di-upload Meta`. Baru setelah itu CRM memperbarui snapshot sinkronisasi.

## Catatan penting
- Export CSV tidak memanggil Meta API.
- Audience dihitung dari kondisi/status CRM terkini, bukan rentang tanggal dashboard.
- Nomor Indonesia dinormalisasi ke format country code `62...`.
- First-touch acquisition `source` tidak diubah oleh fitur audience atau reactivation.
- File legacy `src/app/api/page.tsx` dan `src/app/api/leads/leads/route.ts` dihapus karena tidak digunakan dashboard aktif.
