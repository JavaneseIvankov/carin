# Demo seed Carin: data lengkap dengan analisis AI real

Tanggal: 2026-10-16
Status: rancangan disetujui untuk ditinjau
Branch: `demo-prep`

## Tujuan

Siapkan akun Carin yang bisa langsung dipakai login untuk demo dengan data cukup
untuk memperlihatkan Beranda, Riwayat, hasil analisis, Pemeriksaan, dan Profil
kesehatan. Data analisis harus berasal dari service AI real menggunakan enam
foto yang disediakan pemilik repo. Seed tidak boleh memakai adapter fixture atau
menyamaratakan hasil sintetis sebagai hasil real.

Signup dan onboarding tetap berfungsi bagi akun baru. Akun demo yang telah
lengkap onboarding langsung masuk ke tab aplikasi saat login.

## Pilihan implementasi

1. **Seed eksplisit melalui API dan worker (dipilih).** Menggunakan akun yang
   sudah diverifikasi, sesi auth normal, endpoint milik pengguna, pipeline media,
   analysis job, worker, serta provider AI real. Ini memakai ownership dan
   lifecycle aplikasi yang sama dengan demo.
2. **Snapshot SQL langsung.** Lebih cepat, tetapi melewati validasi, ownership,
   media, consent, dan lifecycle job; tidak dipilih.
3. **Input manual lewat UI.** Memakai alur produk sepenuhnya, tetapi mahal untuk
   diulang dan hasil demo sulit dipulihkan secara konsisten; tidak dipilih.

## Arsitektur dan alur

Sediakan perintah seed yang dijalankan secara eksplisit dari `carin-api/`.
Perintah tidak dijalankan pada startup. Perintah memakai email/password akun demo
melalui konfigurasi environment lokal, membuat sesi dengan Better Auth, lalu
memanggil API dengan sesi tersebut. Kredensial tidak masuk source control.

Urutannya:

1. Validasi environment, akun terverifikasi, akses database/API, storage privat,
   worker, dan AI mode real. Tolak fixture mode dan hentikan proses jika provider
   AI tidak tersedia.
2. Pastikan profil kesehatan demo tersimpan dan onboarding akun tersebut selesai.
   Akun pengguna baru tidak diubah dan tetap diarahkan ke onboarding.
3. Upsert beberapa konsumsi manual dan pemeriksaan bertanggal di zona
   `Asia/Jakarta`, termasuk beberapa titik pada seri yang sama agar grafik punya
   konteks. Isi field profil yang relevan dengan nilai sintetis yang konsisten;
   status kondisi, riwayat keluarga, dan alergi memakai knowledge state eksplisit.
   Jangan membuat diagnosis, klasifikasi klinis, atau klaim membaik/memburuk.
4. Untuk setiap foto yang dipilih dari `carin-api/fixtures/demo/`, jalankan upload
   privat dan buat analysis job lewat API. Worker mengirim foto ke AI service real;
   seed menunggu sampai job selesai dan menyimpan referensi hasil dari flow normal.
5. Tambahkan konsumsi foto hanya lewat konfirmasi eksplisit yang menggunakan scan
   dan result tersimpan. Scan yang belum dikonfirmasi tetap hanya tampil sebagai
   analisis, tidak menambah asupan dashboard.

Seed mencatat kunci stabil per akun, asset hash, dan ID resource yang dibuat agar
bisa dilanjutkan tanpa menduplikasi data. Reset, jika disediakan, hanya menghapus
resource yang tercatat milik akun demo tersebut; ia tidak mengosongkan database,
MinIO, atau akun lain.

## AI real dan provenance

Hasil analisis dibuat oleh provider yang dikonfigurasi pada runtime dan disimpan
oleh worker; seed tidak menulis result JSON buatan sendiri. Tidak ada fallback ke
`carin-api/fixtures/ai/` atau `AI_MODE=fixture` bila provider gagal.

Saat rancangan ini ditulis, manifest katalog/rule real belum dipublikasikan dan
belum mendukung makanan dari foto. Live provider smoke yang sudah ada berhasil
memanggil model real, tetapi hasilnya `unrecognized`: model mengestimasi komponen
serta nutrisi sebagai `model_estimate`, tanpa nilai katalog tervalidasi dan tanpa
personal rule. Karena itu hasil tetap memakai provenance dan limitation asli
seperti estimasi VLM, katalog belum tersedia, aturan kesehatan belum tersedia,
dan alergen tidak dapat diverifikasi. Rancangan tidak menambahkan badge “demo”
dan tidak menghapus keterangan sumber/keterbatasan yang diperlukan.

Jika model atau worker gagal, job tetap gagal sesuai lifecycle normal dan seed
melaporkan kegagalan. Tidak ada angka gizi atau result sintetis pengganti.

## Isi data demo

- Beranda: beberapa catatan konsumsi di hari ini dan rentang tujuh hari, dengan
  campuran konsumsi manual serta foto yang sudah dikonfirmasi.
- Riwayat: beberapa analisis dari foto dan konsumsi yang benar-benar dibuat.
- Pemeriksaan: profil seri tekanan darah, glukosa dengan konteks yang benar, dan
  kolesterol terpisah per subtype; catat tanggal/waktu dan unit yang sesuai.
- Profil kesehatan: tinggi/berat, referensi yang diperlukan, status diagnosis,
  riwayat keluarga, alergi, aktivitas, kebiasaan merokok, dan catatan opsional.
  Semua nilai profil/pemeriksaan adalah nilai contoh sintetis untuk akun khusus,
  tidak berasal dari rekam kesehatan seseorang.
- Foto: gunakan enam file asli yang sudah ditempatkan pada fixture demo dan
  pertahankan nama/hash sumber untuk pemetaan yang stabil. Upload memakai pipeline
  normalisasi yang menghapus metadata EXIF.

## Keamanan, batasan, dan kegagalan

- Semua record tetap dimiliki user ID akun demo dan dibaca lewat sesi normal.
- Seed hanya menerima akun yang dinyatakan sebagai target konfigurasi; tidak
  membuat akun atau melonggarkan verifikasi email saat demo.
- Environment dan konfigurasi AI harus menyatakan mode real. Seed tidak boleh
  mengaktifkan fixture untuk menghasilkan tampilan lebih meyakinkan.
- Foto dan data akun diproses oleh konfigurasi AI yang benar-benar aktif; jangan
  mencatat password, cookie, payload kesehatan, atau foto ke log.
- Katalog/rule yang belum dipublikasikan membatasi hasil. Keberhasilan seed berarti
  job/provider nyata tersimpan, bukan klaim akurasi atau validasi gizi.
- Waktu konsumsi/pemeriksaan harus valid menurut timezone dan aturan masa depan.
  Data dashboard harus tetap masuk hari ini saat seed dijalankan.
- Rerun tidak membuat resource ganda; perubahan hash foto membuat item terkait
  dianalisis ulang secara eksplisit, bukan diam-diam mengganti result historis.

## Verifikasi rancangan

Implementasi perlu mencakup unit/integration coverage untuk validasi environment,
rerun idempotent, kepemilikan akun, asset hash, job selesai/gagal tanpa fallback,
reset scoped, dan kelengkapan profil/pemeriksaan/konsumsi. Pemeriksaan live perlu
merekam status job, provenance `dataMode=real`, dan limitations provider tanpa
mengklaim model akurat. UI acceptance perlu memastikan login demo langsung ke
Beranda sementara signup baru tetap diarahkan ke onboarding.
