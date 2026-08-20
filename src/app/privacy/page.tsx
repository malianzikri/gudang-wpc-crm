export const metadata = {
  title: "Kebijakan Privasi | Gudang WPC CRM",
  description: "Kebijakan privasi Gudang WPC CRM untuk layanan WhatsApp dan tracking lead."
};

export default function PrivacyPage() {
  return (
    <main className="shell">
      <section className="card" style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Kebijakan Privasi</h1>
        <p className="sub" style={{ fontSize: 14 }}>
          Terakhir diperbarui: 20 Agustus 2026
        </p>

        <p>
          Gudang WPC CRM digunakan oleh Gudang WPC & PVC Palembang untuk membantu
          mengelola percakapan pelanggan, pencatatan lead, tindak lanjut penawaran,
          serta pengukuran hasil pemasaran melalui WhatsApp dan Meta.
        </p>

        <h2>Data yang kami proses</h2>
        <p>
          Sistem dapat memproses data yang diberikan pelanggan atau diterima melalui
          WhatsApp Business Platform, antara lain nama profil WhatsApp, nomor WhatsApp,
          isi pesan, waktu percakapan, status lead, catatan tindak lanjut, nilai transaksi,
          serta informasi rujukan iklan seperti ID iklan apabila percakapan berasal dari
          iklan Click-to-WhatsApp.
        </p>

        <h2>Tujuan penggunaan data</h2>
        <p>
          Data digunakan untuk memberikan layanan kepada pelanggan, menjawab pertanyaan,
          menghitung kebutuhan dan penawaran produk, melakukan tindak lanjut penjualan,
          mencatat status lead dan transaksi, menganalisis efektivitas pemasaran, serta
          meningkatkan kualitas pelayanan dan iklan.
        </p>

        <h2>Dasar dan pembatasan penggunaan</h2>
        <p>
          Data diproses hanya untuk kebutuhan operasional dan pemasaran internal bisnis.
          Kami tidak menjual data pribadi pelanggan kepada pengiklan atau pihak ketiga.
          Penggunaan data mengikuti ketentuan yang berlaku pada WhatsApp Business Platform,
          Meta, dan layanan infrastruktur yang kami gunakan.
        </p>

        <h2>Penyimpanan dan keamanan</h2>
        <p>
          Data CRM disimpan pada layanan cloud yang digunakan oleh bisnis dan aksesnya
          dibatasi untuk kebutuhan operasional. Kami menerapkan langkah teknis yang wajar
          untuk membatasi akses yang tidak sah, termasuk kredensial server dan kontrol akses.
        </p>

        <h2>Penyedia layanan</h2>
        <p>
          Untuk menjalankan layanan ini kami dapat menggunakan penyedia infrastruktur dan
          platform seperti Meta/WhatsApp Business Platform, Vercel, dan Supabase. Penyedia
          tersebut dapat memproses data sesuai fungsi layanan dan kebijakan masing-masing.
        </p>

        <h2>Retensi data</h2>
        <p>
          Data disimpan selama masih diperlukan untuk pelayanan pelanggan, pencatatan
          transaksi, evaluasi pemasaran, penyelesaian kewajiban bisnis, atau sampai ada
          permintaan penghapusan yang dapat kami proses.
        </p>

        <h2>Permintaan akses atau penghapusan data</h2>
        <p>
          Pelanggan dapat meminta informasi atau penghapusan data yang tersimpan di CRM.
          Petunjuk penghapusan tersedia pada halaman{" "}
          <a href="/data-deletion">Permintaan Penghapusan Data</a>.
        </p>

        <h2>Kontak</h2>
        <p>
          Untuk pertanyaan terkait privasi atau data pelanggan, hubungi Gudang WPC & PVC
          Palembang melalui WhatsApp bisnis: <strong>+62 851-1762-4402</strong>.
        </p>

        <h2>Perubahan kebijakan</h2>
        <p>
          Kebijakan ini dapat diperbarui apabila terdapat perubahan sistem, layanan,
          proses bisnis, atau ketentuan platform yang digunakan.
        </p>
      </section>
    </main>
  );
}
