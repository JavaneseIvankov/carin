# Carin — scope dan keputusan MVP

Versi 1.0.0 · 13 Oktober 2026 · status: baseline implementasi untuk review tim.

## Cara membaca paket ini

Sumber kebutuhan adalah `../../resources/Carin_Product_PRD.md` dan
`../../resources/Carin_Feature_PRD.md`, versi 1.1. Keputusan pengguna di dokumen ini
menggantikan bagian PRD yang bertentangan. Requirement dan acceptance criteria (AC)
dari PRD tetap berlaku sepanjang tidak diubah secara eksplisit di sini.

| Dokumen | Fungsi |
| --- | --- |
| [UX](01-ux-flows-and-screen-states.md) | Perjalanan pengguna, navigasi, field, dan keadaan layar |
| [Domain](02-domain-model-and-business-rules.md) | Data, lifecycle, perhitungan, dan invariants |
| [Arsitektur](03-system-architecture.md) | Komponen sistem, auth, persistence, dan job |
| [App API](contracts/app-api.openapi.yaml) | Kontrak resource API mobile–backend |
| [AI API](contracts/ai-service.openapi.yaml) | Kontrak internal backend–AI dan schema hasil bersama |
| [AI/data](04-ai-data-and-policy.md) | Cakupan, provenance, aturan hasil, dan evaluasi |
| [Verifikasi/deployment](05-verification-and-deployment.md) | Uji, fixture, environment, dan gate demo |

Schema OpenAPI menjadi sumber bentuk wire payload. Domain spec menjadi sumber
semantik dan aturan yang tidak dapat dinyatakan hanya dengan schema. Jika keduanya
berbeda, perbaiki paket dan naikkan versi sebelum implementasi mengasumsikan salah
satunya. Nama tabel dan lokasi modul adalah rancangan implementasi; nama field API
adalah kontrak bersama tim aplikasi dan AI.

## Keputusan yang sudah disepakati

| Area | Keputusan |
| --- | --- |
| Produk | MVP hackathon dengan backend dan autentikasi nyata |
| Mobile | Expo/React Native yang sudah ada; Android dan iOS menjadi sasaran kompatibilitas. Platform/perangkat acceptance demo dicatat pada release checklist ketika tersedia; belum dianggap kedua platform sudah diuji. |
| Akses jaringan | Online-required. Cache read dan draft lokal seperlunya; tidak ada antrean write offline. |
| Carin API | Backend aplikasi memakai Hono, Node.js, TypeScript; lokasi baru `carin-api/` ketika implementasi dimulai |
| Data | PostgreSQL dan Drizzle; backend adalah source of truth |
| Auth P0 | Better Auth: email/password, register, verifikasi email, login/logout, persistent session, forgot/reset password |
| Email | Resend untuk email verifikasi dan reset |
| Usia | Hanya usia 18–50 inklusif saat registrasi. Tanggal lahir dinyatakan pengguna; tidak ada pemeriksaan gov ID. |
| Profil | Satu profil diri sendiri per akun. Profil kesehatan bisa dilewati dan dilengkapi nanti. |
| Analisis umum | Tetap tersedia tanpa profil kesehatan; perhatian personal dibatasi berdasarkan dependensi data yang benar-benar dibutuhkan |
| AI | `ai-service/` menyajikan REST API internal, stateless, tanpa akses DB pengguna |
| Jalur AI | Mobile → backend → AI service. Mobile tidak memanggil AI secara langsung. |
| Job | Async dari sisi mobile; backend menyimpan job dan menjalankan worker; polling aktif dan resume setelah aplikasi dibuka kembali |
| Notifikasi | Tidak ada push notification P0 |
| Foto | Disimpan privat di MinIO untuk hasil/riwayat; aturan ownership dan penghapusan ada pada domain spec |
| Deployment | Backend dan PostgreSQL containerized, MinIO, environment dev/staging/prod terpisah |
| Consent | Terms & Conditions dan privacy consent wajib saat registrasi; consent pemrosesan AI terpisah sebelum pemakaian AI pertama |
| Akun | Hapus akun beserta data dan foto termasuk P0 |
| Navigasi | Opsi B: Beranda, Riwayat, Pemeriksaan, Profil; tombol tengah menawarkan dua aksi makanan |
| Fixture | Hanya untuk development/test. Schema identik dengan kontrak real; data contoh berlabel. |

## Perubahan terhadap PRD

- Auth yang sebelumnya P1/belum diputuskan menjadi P0, termasuk email verification
  dan reset password. Tidak menambahkan social login, MFA, atau akun keluarga.
- Usia 18–50 dikunci sebagai admission rule. Profil kesehatan opsional tidak
  berarti tanggal lahir dan consent registrasi opsional.
- Akun yang kemudian berusia 51 tidak otomatis dihapus/dikunci. Metode yang
  tidak mendukung usia terbaru membatasi personalisasi dan menjelaskan alasannya.
- Pencatatan konsumsi/profil/pemeriksaan memakai server persistence, bukan profil
  demo lokal. Data sintetis tetap dipakai untuk demonstrasi dan pengujian bersama.
- Terms, privacy notice, dan AI consent tersedia dalam aplikasi. Review compliance
  formal, ekspor, serta audit operasional lengkap dipending sesuai scope hackathon.
- Pencatatan pemeriksaan kolesterol tidak otomatis berarti kondisi terkait
  kolesterol sudah mendapat rekomendasi personal. Dukungan tersebut harus ada di
  capability manifest dan sumber aturan yang disetujui tim AI/data.

## Batas dan hasil yang wajib

Seluruh CAP-01 sampai CAP-10 dan F-01 sampai F-07 tetap P0. Dua jalur makanan
harus berdiri sendiri: foto sebelum makan dan catatan manual sesudah makan.
Foto/hasil analisis tidak menambah asupan sebelum konsumsi dikonfirmasi.

Ketiadaan data tidak menjadi nol/normal. Kondisi yang tidak didukung tetap
tersimpan. Sumber, satuan, porsi, ketidakpastian, dan cakupan hasil terlihat.
Hasil lama mempertahankan snapshot profil/acuan; tidak dianalisis ulang diam-diam.
Tidak ada diagnosis, skor risiko penyakit, triase, perubahan obat, atau jaminan
bebas alergen. Pemeriksaan adalah catatan hasil pengukuran di luar aplikasi.

## Default yang ditetapkan dalam spec

Default ini dapat direvisi sebelum implementasi tanpa pertanyaan tambahan:

Penamaan: `carin-app/` untuk aplikasi mobile, `carin-api/` untuk server API dan
worker aplikasi, serta `ai-service/` untuk REST service AI. Istilah backend dalam
penjelasan arsitektur menunjuk peran Carin API, bukan nama direktori terpisah.
Perubahan nama ini tidak mengubah HTTP routes, kontrak payload, atau env keys.

- Admission age memakai tanggal kalender Asia/Jakarta di server. DOB date-only
  bersifat tetap pada P0; koreksi salah DOB ditangani tim saat pengujian.
- Dashboard: konsumsi hari ini dan perhatian tujuh hari kalender terakhir,
  termasuk hari ini, berdasarkan timezone akun (default `Asia/Jakarta`).
- Pemeriksaan P0: tekanan darah mmHg; gula darah mg/dL; kolesterol total, LDL,
  HDL mg/dL. Konversi antar-unit dan interpretasi klinis tidak diperlukan P0.
- Foto: JPEG/PNG, maksimum 10 MiB sebelum normalisasi, hasil normalisasi maksimum
  1600 px sisi panjang, tanpa metadata EXIF; upload melalui backend.
- Session Better Auth dengan masa berlaku tujuh hari dan pembaruan sliding harian;
  tidak membuat pasangan JWT/refresh token tambahan.
- Antrean job durable di PostgreSQL, memakai worker dari image backend yang sama;
  tidak memerlukan Redis untuk P0.

## Status cakupan AI

PRD tidak menetapkan katalog makanan, database gizi, atau aturan kesehatan final.
Paket ini menetapkan bentuk kontrak dan gate yang harus dipenuhi tim AI/data.
Fixture sintetis bukan approval terhadap nilai gizi atau aturan klinisnya.
Implementasi aplikasi dan contract tests dapat berjalan; release real AI tetap
memerlukan manifest cakupan, sumber, dan evaluasi dalam spec AI/data.

Urutan implementasi: kontrak/domain → auth dan persistence → alur mobile dengan
fixture → katalog dan job worker → integrasi real AI → seluruh AC dan alur demo.
