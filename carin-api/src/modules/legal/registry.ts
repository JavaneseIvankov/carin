import type { components } from "../../contracts/generated/app-api.js";

type LegalRegistry = components["schemas"]["LegalRegistry"];

const effectiveAt = "2026-10-14T00:00:00.000Z";
const reviewNote =
  "> **DRAF — BELUM DISETUJUI UNTUK PUBLIKASI.** Naskah ini memerlukan pemeriksaan dan persetujuan pihak yang berkualifikasi sebelum digunakan sebagai dokumen final.";
const sourceNote =
  "\n\n---\n\nRujukan konteks: [Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi — JDIH Kemkomdigi](https://jdih.komdigi.go.id/produk_hukum/view/id/832/t/crc32/). Rujukan ini bukan pernyataan bahwa layanan telah memenuhi seluruh ketentuan hukum yang berlaku.";

export function getLegalRegistry(): LegalRegistry {
  return {
    terms: {
      version: "2026-10-14-draft.1",
      title: "Syarat dan Ketentuan Carin (Draf)",
      effectiveAt,
      contentMarkdown: `${reviewNote}

# Syarat dan Ketentuan Carin

## Tentang layanan
Carin adalah aplikasi untuk mencatat konsumsi makanan, melihat perkiraan informasi gizi dari data yang tersedia, menyimpan profil kesehatan yang Anda berikan, dan mencatat hasil pemeriksaan. Informasi aplikasi bersifat umum dan bukan diagnosis, pengganti tenaga kesehatan, atau instruksi untuk mengubah obat maupun perawatan.

## Akun dan penggunaan
Anda harus berusia 18–50 tahun saat mendaftar dan memberikan informasi akun yang benar. Jaga kerahasiaan akses akun dan beri tahu tim layanan melalui saluran bantuan yang nantinya ditetapkan jika Anda melihat penggunaan yang tidak Anda kenali. Jangan mengirim informasi yang bukan hak Anda untuk bagikan.

## Informasi dan keterbatasan
Hasil dapat tidak lengkap atau keliru, bergantung pada foto, porsi, kecocokan katalog, sumber data, dan informasi profil. Nilai yang tidak tersedia tidak berarti nol atau normal. Periksa rincian, satuan, sumber, cakupan, dan batas hasil. Jangan memakai hasil untuk mengambil keputusan medis darurat.

## Fitur pemrosesan AI
Persetujuan pemrosesan AI diminta secara terpisah. Persetujuan ini pilihan dan dapat ditarik melalui pengaturan consent ketika fitur tersedia. Tanpa persetujuan AI, pencatatan manual, profil, dan catatan pemeriksaan tetap dapat digunakan; fitur analisis foto dan evaluasi personal berbantuan AI tidak dijalankan.

## Perubahan dan penutupan akun
Ketentuan dapat diperbarui dengan versi baru yang ditampilkan di aplikasi. Bila versi wajib berubah, aplikasi akan meminta tindakan Anda sebelum melanjutkan penggunaan yang memerlukan persetujuan tersebut. Penghapusan akun dan akibatnya akan dijelaskan pada alur penghapusan sebelum fitur itu digunakan.

## Persetujuan
Dengan memilih setuju pada pendaftaran, Anda menyatakan telah membaca dan menyetujui versi Syarat dan Ketentuan serta Pemberitahuan Privasi yang tercatat oleh server. Persetujuan AI tidak termasuk dalam persetujuan wajib pendaftaran.${sourceNote}`,
    },
    privacy: {
      version: "2026-10-14-draft.1",
      title: "Pemberitahuan Privasi Carin (Draf)",
      effectiveAt,
      contentMarkdown: `${reviewNote}

# Pemberitahuan Privasi Carin

## Data yang dicatat
Untuk menyediakan fitur Carin, aplikasi dapat memproses nama, alamat email, tanggal lahir, zona waktu, pilihan dan riwayat consent, profil kesehatan yang Anda isi, catatan konsumsi, foto makanan yang Anda pilih, dan catatan hasil pemeriksaan yang Anda masukkan. Foto dapat mengandung informasi yang terlihat di dalam gambar; hindari menyertakan orang atau informasi lain yang tidak diperlukan.

## Penggunaan data
Data digunakan untuk membuat dan mengelola akun, menyimpan informasi yang Anda masukkan, menampilkan riwayat serta ringkasan, menghitung informasi gizi yang didukung data, dan menyediakan fitur yang Anda pilih. Jika consent AI aktif dan Anda meminta fitur terkait, foto makanan atau komponen makanan serta konteks profil yang diperlukan dapat dikirim dari Carin API ke layanan AI internal untuk menghasilkan keluaran terstruktur. Data akun seperti email dan tanggal lahir, serta catatan pemeriksaan, tidak termasuk dalam konteks permintaan AI P0 menurut rancangan produk.

## Pilihan Anda
Anda dapat menggunakan pencatatan manual, profil, dan catatan pemeriksaan tanpa consent AI. Anda dapat menarik consent AI; hal itu menghentikan pemrosesan AI baru dan menahan publikasi pekerjaan yang masih menunggu pemeriksaan consent. Riwayat yang sudah tersimpan tidak otomatis dihapus hanya karena consent AI ditarik.

## Penerima dan masa simpan
Rincian penyedia atau prosesor, lokasi pemrosesan, dasar dan masa simpan tiap kategori data, mekanisme permintaan hak, serta saluran kontak belum ditetapkan dalam paket spesifikasi ini. Bagian tersebut wajib ditelaah dan dilengkapi sebelum naskah disetujui atau dipublikasikan. Draft ini tidak menjanjikan periode retensi tertentu.

## Keamanan dan perubahan
Rancangan produk membatasi akses data berdasarkan akun dan menggunakan penyimpanan foto privat. Naskah final perlu menjelaskan pengamanan yang benar-benar diterapkan. Versi pemberitahuan yang berlaku ditampilkan melalui endpoint legal; perubahan versi akan dicatat ketika persetujuan diberikan.${sourceNote}`,
    },
    aiProcessing: {
      version: "2026-10-14-draft.1",
      title: "Pemberitahuan Pemrosesan AI Carin (Draf)",
      effectiveAt,
      contentMarkdown: `${reviewNote}

# Pemberitahuan Pemrosesan AI Carin

## Tujuan dan pilihan
Consent ini terpisah dari persetujuan Syarat dan Ketentuan serta Pemberitahuan Privasi. Anda boleh tidak memberikannya. Jika tidak ada consent AI yang aktif, profil, pencatatan makanan manual, dan pencatatan pemeriksaan tetap tersedia; analisis foto makanan dan evaluasi personal berbantuan AI tidak dimulai.

## Informasi yang digunakan
Saat Anda meminta fitur AI dan consent versi yang berlaku aktif, Carin API dapat meneruskan foto makanan atau komponen makanan terstruktur, porsi yang relevan, dan konteks profil yang diperlukan ke layanan AI internal. Email, tanggal lahir, sesi akun, dan catatan pemeriksaan P0 tidak dimasukkan dalam konteks permintaan AI menurut rancangan produk. Permintaan diproses untuk menghasilkan komponen makanan, perkiraan gizi yang memiliki data pendukung, atau evaluasi personal dalam cakupan yang tersedia.

## Batas hasil
Keluaran dapat tidak lengkap atau salah dan bergantung pada data foto, porsi, katalog, profil, dan cakupan aturan yang tersedia. Keluaran bukan diagnosis, bukan saran perubahan obat, bukan penilaian pemeriksaan laboratorium, dan tidak menjamin identifikasi alergen.

## Menarik consent
Anda dapat menarik consent melalui pengaturan consent ketika tersedia. Setelah penarikan tercatat, Carin menolak pekerjaan AI baru dan menahan publikasi pekerjaan yang belum selesai ketika worker memeriksa consent sebelum menerbitkan hasil. Pekerjaan yang sudah tersimpan dalam riwayat tidak otomatis dihapus. Memberi consent kembali tidak mengaktifkan ulang pekerjaan yang sebelumnya dibatalkan.

## Hal yang masih perlu ditetapkan
Identitas dan lokasi penyedia layanan AI, masa simpan input dan keluaran pada setiap komponen, mekanisme penghapusan, dan saluran untuk pertanyaan harus ditetapkan setelah penelaahan operasional dan compliance. Draft ini tidak membuat janji tentang penyedia, lokasi, atau jangka waktu tersebut.${sourceNote}`,
    },
  };
}
