# Onboarding Pengguna — Design

## Goal

Memberi semua akun Carin satu pengenalan saat pertama kali membuka versi aplikasi yang memiliki onboarding, lalu mengarahkan pengguna ke pencatatan makanan tanpa mewajibkan profil kesehatan.

## Context and decisions

- Branch kerja: `feat/onboarding`, dibuat dari `dev` pada commit `acb1f52`.
- Auth saat ini meminta pengguna memverifikasi email lalu masuk secara manual. Verifikasi tidak membuat sesi otomatis.
- Setelah login, akun terverifikasi saat ini masuk ke tab app. Profil kesehatan sudah tersedia di `app/(onboarding)/health-profile.tsx`, dapat dilewati, dan datanya juga dapat diedit dari Profil atau Dashboard.
- Dashboard sudah menyediakan analisis foto dan catatan manual. Ringkasan konsumsi menghitung hari yang dipilih; hasil analisis foto baru menjadi konsumsi setelah dikonfirmasi.
- Onboarding berlaku untuk akun lama maupun baru dan status selesai harus sama lintas perangkat.
- Profil kesehatan tetap opsional. Tidak ada fitur produk yang dikunci sampai profil atau makanan dicatat.

## Chosen approach

Simpan status completion sebagai data server milik akun. Tambahkan nullable `onboarding_completed_at` pada record user dan daftarkan sebagai field server-only di Better Auth (`input: false`, `returned: false`), serta endpoint App API untuk membaca dan menyelesaikan onboarding. Nilai `NULL` berarti akun belum menyelesaikannya. Migrasi tidak mengisi nilai untuk akun lama, sehingga semua akun yang sudah ada mendapat onboarding satu kali setelah rilis.

Status server menjadi sumber kebenaran lintas perangkat. Endpoint completion bersifat idempotent: pemanggilan ulang mempertahankan timestamp pertama dan tidak membuat record/efek ganda. Field tidak dapat diisi dari request auth pengguna dan tidak perlu dikirim dalam auth session.

Pilihan lokal per perangkat ditolak karena onboarding akan muncul lagi saat akun yang sama dipakai di perangkat lain. Menyimpulkan completion dari health profile juga tidak memadai: profil bisa sudah ada sebelum onboarding, atau pengguna dapat melewatinya.

## User journey

1. Setelah sesi terverifikasi tersedia, app memeriksa status onboarding akun. Ini berlaku untuk login baru dan pemulihan sesi yang sudah tersimpan.
2. Jika status belum selesai, tampilkan Welcome Carousel dalam Bahasa Indonesia. Tiga panel menjelaskan pendekatan Carin yang suportif, perbedaan analisis foto sebelum makan dan pencatatan manual setelah makan, serta penggunaan profil kesehatan yang opsional.
3. `Lanjut` membuka langkah Profil Kesehatan. `Lewati pengantar` juga membuka langkah profil; tombol ini tidak melewati seluruh onboarding.
4. Langkah profil menggunakan form dan data tersimpan yang sudah ada. Tombol `Simpan profil` menyimpan perubahan profil lalu menyelesaikan onboarding. Tombol `Isi nanti` menyelesaikan onboarding tanpa menulis atau mengosongkan data profil. Jika ada perubahan draft yang belum tersimpan, minta konfirmasi sebelum membuang draft.
5. Setelah completion berhasil, buka Dashboard atau rute terlindungi yang semula diminta pengguna. Jika alur auth membawa deep link `next`, simpan dan validasi tujuan dengan aturan yang sama seperti `resolvePostSignInDestination`, lalu buka setelah onboarding.
6. Dashboard menampilkan aktivasi makanan melalui aksi yang sudah ada: `Analisis sebelum makan` dan `Catat yang sudah dimakan`. Pada ringkasan kosong, gunakan copy harian seperti “Belum ada catatan konsumsi hari ini”, bukan klaim “pertama kali” yang tidak didukung data seumur akun.

## API and persistence

Tambahkan operasi authenticated pada `specs/contracts/app-api.openapi.yaml`:

- `GET /api/v1/onboarding` mengembalikan `completedAt` sebagai timestamp atau `null`.
- `POST /api/v1/onboarding/complete` tidak memerlukan body dan mengembalikan timestamp completion yang tersimpan. Operasi ini idempotent.

Implementasi menyimpan timestamp pada user record di PostgreSQL melalui migrasi additive. Akun yang sudah ada tetap `NULL`; penghapusan akun menghapus status bersama akun. Kedua operasi memakai session ownership dari request dan mengikuti contract validation serta generated mobile types.

## Routing and failure behavior

- Tambahkan gate onboarding setelah auth session dipastikan terverifikasi. Semua route terlindungi melewati pemeriksaan agar login dari deep link tidak melewati onboarding.
- Route `welcome` dan langkah profil boleh dirender saat status belum selesai. Route lain dialihkan ke onboarding, sambil mempertahankan tujuan deep link tervalidasi.
- Jika pembacaan status gagal, app fail-open ke Dashboard agar onboarding tidak mengunci akses. App memeriksa ulang pada sesi authenticated berikutnya.
- Jika penyimpanan completion gagal setelah save/skip, tampilkan error dengan aksi retry dan izinkan pengguna tetap membuka Dashboard. Status server tetap belum selesai, sehingga onboarding dicoba kembali pada sesi authenticated berikutnya.
- Jika penyimpanan profil gagal, pertahankan error dan draft seperti perilaku form sekarang. Pengguna masih dapat memilih `Isi nanti`; pilihan tersebut tidak menyimpan draft profil.
- Completion tidak boleh menyiratkan persetujuan AI. Persetujuan AI tetap diminta sebelum penggunaan AI pertama sesuai keputusan MVP.

## Visual and accessibility direction

Ikuti `DESIGN.md`, `specs/06-ui-design-system.md`, dan panduan semua halaman: permukaan hangat Carin, ilustrasi maskot kontekstual, copy non-judgmental, kontrol taktil, hierarki teks jelas, target sentuh minimal 44 dp, serta layout yang tetap terbaca pada lebar 320 dp dan 390 dp. Carousel menyediakan indikator halaman, tombol kembali/lanjut, label aksesibilitas, dan state fokus yang terbaca. Aksi `Isi nanti` tetap mudah ditemukan pada form yang panjang.

## Non-goals

- Mengubah verifikasi email, auto-login, registrasi, atau kebijakan session.
- Mewajibkan profil kesehatan, data konsumsi, izin kamera, atau consent AI selama onboarding.
- Menambahkan target kalori, streak, skor kesehatan, diagnosis, atau klaim klinis.
- Membuat tutorial terpisah untuk semua fitur atau mencatat analitik onboarding baru.

## Acceptance criteria

1. Akun lama dan baru dengan `completedAt: null` melihat onboarding setelah sesi authenticated; akun yang sudah selesai tidak melihatnya lagi di perangkat lain.
2. Akun belum terverifikasi tidak dapat masuk ke onboarding sebagai pengguna authenticated.
3. `Lewati pengantar` tetap membuka langkah profil; `Isi nanti` tidak mengubah profil dan menyelesaikan onboarding.
4. Save profil mempertahankan validasi dan error behavior yang ada, lalu menyelesaikan onboarding setelah update berhasil.
5. Completion request berulang aman dan mempertahankan timestamp pertama.
6. Kegagalan membaca/menulis state tidak mengunci Dashboard; onboarding yang belum tercatat dicoba lagi pada sesi berikutnya.
7. Deep link terlindungi yang tertunda auth dibuka setelah onboarding selesai; tujuan tidak tervalidasi ditolak.
8. Dashboard membedakan kondisi tanpa konsumsi hari ini dari kondisi setelah ada konsumsi. Analisis foto saja tidak menambah konsumsi sebelum konfirmasi.
9. Semua jalur utama dapat dipakai dengan target sentuh dan layout mobile sesuai panduan desain.

## Verification plan

- App API: contract tests untuk GET, completion, ownership, sesi tidak valid, idempotency, dan response schema; PostgreSQL integration test untuk timestamp dan migrasi.
- Mobile: unit tests untuk keputusan gate, status pending/error/completed, validasi return route, dan aksi save/skip; integration/e2e untuk verifikasi → login → carousel → profil save/skip → Dashboard serta deep link.
- Jalankan validator OpenAPI dari `specs/05-verification-and-deployment.md`, `pnpm run contracts:check`, API typecheck/lint/tests, dan mobile typecheck/lint/tests dari direktori paket masing-masing.
- Uji manual Android dan web; catat bila iOS tidak tersedia. Cek lebar 320 dp dan 390 dp, aksesibilitas kontrol carousel, restart app, perpindahan akun/perangkat, serta status completion setelah offline sementara.
