# Carin — UX, alur, dan keadaan layar

Versi 1.0.0. Bahasa pengguna: Bahasa Indonesia. Wireframe/navigation baseline
boleh disesuaikan setelah desain tim tersedia; perilaku PRD tetap dipertahankan.

## Navigasi dan routes

Bottom navigation mempunyai empat destinasi: Beranda, Riwayat, Pemeriksaan,
Profil. Tombol tengah `+` adalah aksi, bukan tab. Bottom sheet menawarkan:
`Analisis sebelum makan` dan `Catat yang sudah dimakan`, masing-masing dengan
penjelasan pendek. Tutup sheet dengan back Android, backdrop, atau tombol tutup.

| Route Expo yang direncanakan | Isi |
| --- | --- |
| `(auth)/sign-up` | Nama opsional, email, password, DOB, terms/privacy consent |
| `(auth)/verify-email` | Instruksi email, resend, buka email, kembali ke login |
| `(auth)/sign-in` | Email/password dan lupa password |
| `(auth)/forgot-password` | Minta email reset dengan respons generik |
| `(auth)/reset-password` | Password baru dari deep link token |
| `(onboarding)/health-profile` | Profil opsional; tombol `Isi nanti` jelas |
| `(tabs)/index` | Beranda/dashboard |
| `(tabs)/history` | Segmen Konsumsi dan Analisis; default Konsumsi |
| `(tabs)/exams` | Daftar dan filter jenis/konteks pemeriksaan |
| `(tabs)/profile` | Profil kesehatan, timezone, consent, legal, logout/hapus akun |
| `food/capture` | Kamera/galeri untuk makanan yang masih tersedia |
| `food/analysis/[id]` | Job/result, sumber, koreksi, konfirmasi konsumsi |
| `food/correction/[id]` | Edit komponen/porsi hasil yang dipilih |
| `consumptions/new` | Form manual, tanpa syarat foto |
| `consumptions/[id]` | Detail sumber input, porsi aktual, gizi, perhatian |
| `consumptions/[id]/edit` | Edit komponen/porsi/waktu |
| `exams/new`, `exams/[id]`, `exams/[id]/edit` | Form/detail/edit pemeriksaan |
| `legal/[document]` | Terms/privacy/penjelasan pemrosesan AI |

Routes adalah rancangan; API memakai ID domain, bukan path route mobile. Layar
auth/consent tetap dapat dibuka melalui deep link saat sesi tidak aktif. Navigasi
ke resource setelah login harus mengecek ownership dan kondisi sudah dihapus.

## Registrasi dan auth

Registrasi menerima nama tampilan opsional (default `Pengguna`), email, password,
tanggal lahir, dan checkbox terms/privacy yang tidak dipilih otomatis. Tampilkan
batas usia 18–50 sebelum submit. Server tetap memvalidasinya. Tidak meminta gov ID.
Versi legal aktif dibaca dari server; bila berubah selama form terbuka, minta
pengguna membaca/menyetujui versi terbaru sebelum mengulang submit.

Setelah registrasi, tampilkan layar verifikasi. Tidak ada akses data kesehatan
sebelum email verified. Resend mempunyai cooldown dan respons yang tidak
mengungkap apakah akun milik orang lain tersedia. Verifikasi lewat tautan HTTPS
membuka halaman hasil dengan tombol kembali ke aplikasi; tidak otomatis login.
Pengguna login setelah verifikasi, lalu onboarding profil opsional.

Reset memakai tautan HTTPS menuju halaman ringan milik backend dengan tombol
buka aplikasi. Aplikasi yang terpasang menerima token sekali pakai melalui scheme
environment lalu menampilkan form password baru. Jika aplikasi tidak tersedia,
halaman menjelaskan pemasangan/pembukaan aplikasi; tidak membuat portal web penuh.
Token kedaluwarsa/sudah dipakai menawarkan permintaan email baru. Sukses reset
mencabut sesi lama dan mengarahkan ke login. Tautan tidak menampilkan email,
password, atau session token. Lihat arsitektur untuk integrasi vendor.

## Profil dan dependensi fitur

Onboarding dan halaman profil menggunakan field yang sama. Pemeriksaan ditambah
lewat fitur pemeriksaan, tidak disalin ke field profil terpisah.

| Bagian | Field/state |
| --- | --- |
| Dasar | DOB read-only dari akun; tinggi cm, berat kg, informasi seks yang diperlukan acuan opsional |
| Diagnosis | Status `belum diisi`, `tidak ada diagnosis diketahui`, `belum pernah diperiksa`, `ada kondisi`; multi-select katalog + kondisi lain |
| Riwayat keluarga | Belum diisi/tidak tahu/tidak ada/ada; kondisi dan hubungan jika diketahui |
| Alergi/pantangan | Belum diisi/tidak diketahui/tidak ada/ada; daftar teks |
| Arahan tenaga kesehatan | Catatan pengguna; tidak diterjemahkan otomatis menjadi aturan |
| Kebiasaan | Aktivitas dan merokok opsional; manfaat pemakaiannya dijelaskan |

Diagnosis `ada kondisi` memerlukan minimal satu entri. Status yang menyatakan
tidak ada/tidak tahu tidak dapat sekaligus memuat daftar kondisi. Mengubah status
meminta konfirmasi sebelum mengosongkan daftar sebelumnya.

Profil kosong tidak menghalangi analisis gizi umum, catatan manual, atau pencatatan
pemeriksaan. Kartu personalisasi menampilkan `Lengkapi informasi kesehatan untuk
melihat pertimbangan sesuai profil` dan membuka field yang dibutuhkan. Setiap
fitur memakai dependency list dari capability/hasil, bukan satu persentase
kelengkapan yang mengunci semua fungsi. Data kosong berbeda dari kondisi normal.

## Foto dan hasil

Camera permission diminta ketika jalur kamera dipilih, bukan saat first-run.
Galeri memakai izin platform seperlunya. Bila ditolak permanen, tawarkan Settings,
sumber foto lain, atau catatan manual untuk makanan yang sudah dikonsumsi.

Foto terpilih diperlihatkan sebagai preview; tombol `Analisis makanan` mengunggah
dan membuat job. Tidak ada form konfirmasi nama makanan sebelum hasil pertama.
Makanan sudah habis diarahkan ke manual, bukan foto piring kosong/pengganti.

Job menampilkan `Mengunggah`, `Menunggu analisis`, `Menganalisis`, atau gagal.
Pengguna boleh meninggalkan layar. Riwayat Analisis memuat job aktif dan hasil
yang dapat dibuka kembali. Polling berhenti saat app background; saat resume,
ambil status server. Status tidak dibuat selesai hanya karena timer habis.

Hasil berurutan: makanan dan porsi → status perhatian beserta cakupan → estimasi
gizi → alasan/penyesuaian → keterbatasan dan sumber. Detail sumber dapat dibuka
tanpa menghilangkan label estimasi. Tampilkan gizi `belum tersedia` untuk null;
total parsial menampilkan jumlah komponen yang tercakup untuk zat terkait.

Status `Bisa dipertimbangkan` bukan jaminan aman. Alergi yang tidak terverifikasi
dan data kritis yang hilang selalu terlihat. Analisis tanpa profil kesehatan
tidak menampilkan perhatian personal seolah-olah profil telah lengkap.

## Koreksi dan konfirmasi konsumsi

Koreksi mendukung tambah/hapus komponen, memilih makanan/cara saji dari katalog,
dan mengubah porsi. Gram atau takaran katalog memiliki basis yang terlihat.
`Tidak tahu` tersedia. Teks bebas yang belum cocok tersimpan sebagai komponen
tanpa nilai gizi tebakan.

Ketika koreksi berjalan, label hasil lama tetap menyebut input lama. Form baru
tidak menempelkan angka lama pada nama/porsi baru. Kegagalan mempertahankan draft
dan menawarkan retry; hasil sebelumnya masih dapat dibaca dengan labelnya.

`Sudah dikonsumsi` membuka form porsi aktual per komponen serta waktu makan.
Waktu makan default sekarang, tetap terlihat dan dapat diubah. Submit disable
sementara, tetapi pencegahan duplikasi juga ada di server. Jika scan sudah pernah
dikonfirmasi, tampilkan `Buka catatan konsumsi`; membuat konsumsi baru harus aksi
yang jelas. Koreksi hasil scan tidak otomatis mengubah konsumsi yang telah ada.

## Pencatatan manual dan riwayat

Form manual tersedia langsung dari Beranda, Riwayat, dan tombol `+`. Nama minimal
satu komponen dan tanggal/waktu makan wajib. Porsi boleh tidak diketahui. Search
katalog menampilkan nama/cara saji/takaran yang harus cocok; `Makanan lain`
memungkinkan nama bebas. Satu komponen ditambah per langkah; pemahaman paragraf
oleh AI tidak disyaratkan.

Penyimpanan catatan tidak menunggu keberhasilan AI. Gizi dari katalog yang cocok
dapat dihitung server; perhatian personal memiliki state terpisah: menunggu,
tersedia, tidak cukup informasi, atau gagal. Jika belum ada consent AI, catatan
tetap tersimpan dan kartu menjelaskan bahwa personalisasi belum dilakukan.

Detail konsumsi menampilkan sumber manual/foto, waktu, takaran, komponen yang
belum lengkap, dan snapshot perhatian. Edit atau hapus memperbarui dashboard.
Hapus meminta konfirmasi dan menjelaskan bahwa catatan dikeluarkan dari ringkasan.
Riwayat memisahkan konsumsi dan analisis supaya hasil cek tidak dikira telah makan.

## Dashboard dan pemeriksaan

Dashboard menampilkan konsumsi hari ini, cakupan gizi per zat, perhatian tujuh
hari, pemeriksaan terakhir per jenis/konteks, dan langkah berikutnya. Jumlah
catatan makan berbeda dari jumlah komponen makanan. Tidak ada indikator target
kalori atau klaim cukup/kurang asupan pada P0.

Pemeriksaan mendukung tekanan darah, gula darah, kolesterol total/LDL/HDL.
Tanggal pengukuran wajib, waktu opsional, konteks gula bisa `tidak diketahui`.
Tidak membuat tanggal/waktu pengukuran dari waktu input. Preview sebelum save
meminta pengecekan nilai/unit/konteks tanpa otomatis menggantinya atau menyebut
angka abnormal memakai threshold yang belum disetujui. Grafik hanya menyatukan seri
sebanding; satu titik tidak menghasilkan klaim tren membaik/memburuk.

## Keadaan bersama dan aksesibilitas

- Read cache diberi `Data terakhir diperbarui …` dan indikator offline. Write
  memerlukan jaringan; draft tetap tersedia. Timeout tidak berarti server gagal
  menyimpan: retry memakai request key yang sama.
- Kesalahan field dekat field terkait; error layanan menawarkan tindakan yang
  bisa dikerjakan. Tidak menampilkan sukses sebelum server mengakui save.
- Logout/akun berganti menghapus session, cache pengguna, draft, dan preview foto.
- Hapus akun meminta autentikasi ulang dan konfirmasi; keberhasilan menjelaskan
  akses sudah dicabut dan penghapusan foto sedang diselesaikan server.
- Status memakai teks/ikon selain warna. Field angka menjelaskan satuan,
  mendukung decimal comma di UI, dan mengirim number normal pada API.
- Target sentuh minimal 44 pt/48 dp, label screen reader, dynamic text, safe-area,
  keyboard avoidance, serta back Android diuji. Grafik mempunyai ringkasan daftar.

Warna/font/ilustrasi adalah pekerjaan desain berikutnya. Wireframe memakai konten
Carin dan memprioritaskan perbedaan estimasi, data tercatat, dan data belum ada.
