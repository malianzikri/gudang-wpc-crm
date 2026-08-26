# CRM Gudang WPC — V3.1 UI Polish

Patch ini fokus pada UX operasional sales dan tidak membutuhkan SQL baru.

## Perubahan utama
- Tabel lead dibuat ringkas: Lead, Masuk, Aktivitas, Status, Score, Next Action, Next FU, Revenue, CAPI, Aksi.
- Detail Product, Intent, Ukuran, Lokasi, Touch, Campaign, pesan terakhir dan alasan FU dipindahkan ke `Detail Sales` yang bisa dibuka/tutup.
- Lead Score dihitung otomatis dari status + data kebutuhan saat lead disimpan.
- Kartu `Butuh Tindakan Hari Ini` bisa diklik sebagai filter cepat.
- Next Follow Up tampil sebagai `Hari ini`, `Besok`, atau `OVERDUE X jam`.
- Lead/nomor WA dibuat sticky di desktop agar tidak hilang saat scroll horizontal.
- Mobile menggunakan layout card untuk lead.
- Dashboard atas diringkas menjadi Total Lead, High Intent, Closing dan Revenue, dengan attribution strip di bawahnya.
- Performa Meta membedakan Closing/Revenue Cohort dengan Closing/Revenue Aktual.

## Deploy
1. Tidak perlu menjalankan SQL historical atau backfill apa pun.
2. Replace source project V3 dengan source V3.1 ini.
3. Deploy ke Vercel seperti biasa.
4. Tes satu lead pada setiap status: Chat Builder, Tanya Aja, Qualified, Estimasi Harga, Hot.
5. Klik `Detail Sales`, isi Product/Intent/Ukuran/Next FU lalu Simpan; cek score otomatis dan Next FU.

## Catatan build
Environment pembuatan patch tidak berhasil menyelesaikan `npm install` karena timeout jaringan, jadi `next build` tidak bisa dijalankan di sini. Perubahan dibuat hanya pada frontend `src/app/page.tsx` dan `src/app/globals.css`, tanpa perubahan schema/database/CAPI.
