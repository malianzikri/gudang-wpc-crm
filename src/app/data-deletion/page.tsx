export const metadata = {
  title: "Penghapusan Data | Gudang WPC CRM",
  description: "Petunjuk permintaan penghapusan data Gudang WPC CRM."
};

export default function DataDeletionPage() {
  return (
    <main className="shell">
      <section className="card" style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Permintaan Penghapusan Data</h1>
        <p>
          Jika Anda pernah berkomunikasi dengan Gudang WPC & PVC Palembang melalui
          WhatsApp dan ingin meminta penghapusan data yang tersimpan di Gudang WPC CRM,
          Anda dapat mengajukan permintaan penghapusan.
        </p>

        <h2>Cara mengajukan permintaan</h2>
        <ol style={{ lineHeight: 1.7 }}>
          <li>
            Hubungi WhatsApp bisnis Gudang WPC & PVC Palembang di{" "}
            <strong>+62 851-1762-4402</strong>.
          </li>
          <li>
            Kirim pesan dengan format: <strong>PERMINTAAN HAPUS DATA</strong>.
          </li>
          <li>
            Gunakan nomor WhatsApp yang sama dengan nomor yang sebelumnya digunakan
            untuk berkomunikasi dengan bisnis agar kami dapat memverifikasi permintaan.
          </li>
          <li>
            Setelah identitas/nomor dapat diverifikasi, data yang tidak lagi wajib
            dipertahankan untuk kebutuhan hukum, transaksi, atau keamanan akan dihapus
            dari sistem CRM.
          </li>
        </ol>

        <h2>Data yang dapat dihapus</h2>
        <p>
          Permintaan dapat mencakup data seperti nama profil, nomor WhatsApp, isi pesan
          yang tersimpan pada CRM, status lead, catatan tindak lanjut, dan informasi
          pemasaran terkait lead tersebut, sepanjang tidak ada kewajiban untuk
          mempertahankannya.
        </p>

        <h2>Waktu pemrosesan</h2>
        <p>
          Kami akan memproses permintaan penghapusan yang valid dalam waktu yang wajar
          setelah verifikasi selesai.
        </p>

        <h2>Catatan</h2>
        <p>
          Penghapusan data pada Gudang WPC CRM tidak selalu menghapus data yang secara
          terpisah disimpan oleh WhatsApp, Meta, penyedia infrastruktur, atau platform lain.
          Pengelolaan data pada layanan tersebut mengikuti kebijakan dan mekanisme
          masing-masing penyedia.
        </p>

        <p>
          Kembali ke <a href="/privacy">Kebijakan Privasi</a>.
        </p>
      </section>
    </main>
  );
}
