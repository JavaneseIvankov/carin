# T13 — Onboarding, profil, pengaturan, dan legal mobile

## Tujuan

Pengguna dapat melewati profil kesehatan opsional, melengkapinya atau mengubahnya
kapan saja, mengatur timezone, dan memberikan atau mencabut persetujuan pemrosesan
AI. Data yang belum diketahui tetap dibedakan dari jawaban “tidak ada”, dan data
profil yang sudah tercatat tidak hilang tanpa konfirmasi.

## Keputusan UX dan domain

- Rute `/(onboarding)/health-profile` dipakai untuk onboarding dan edit profil.
  `Isi nanti` kembali ke aplikasi tanpa menyimpan atau mensyaratkan profil.
- Profil menampilkan tanggal lahir akun sebagai read-only, tinggi, berat, seks
  untuk acuan, pengetahuan diagnosis, riwayat keluarga, alergi/pantangan, catatan
  tenaga kesehatan, aktivitas, dan kebiasaan merokok.
- Diagnosis memakai katalog kondisi yang dicari dari Carin API. “Kondisi lain”
  ditambahkan melalui input teks khusus dan tetap `conditionId: null`; teks itu
  tidak dipadankan otomatis. Status personalisasi yang tidak mendukung kondisi
  tersimpan tetap terlihat.
- Mengubah diagnosis, riwayat keluarga, atau alergi dari `reported` ke status
  tanpa entri meminta konfirmasi. `unknown`, `not_provided`, `never_examined`, dan
  `none_known` memiliki label yang berbeda.
- Profil dikirim sebagai penggantian field penuh dengan `expectedVersion` dan
  `Idempotency-Key`. Pada 409, draft tetap di layar; pengguna memuat versi server
  terbaru lalu memilih untuk mengirim draft yang sama lagi.
- Missing-data action memakai field yang diberikan server, menampilkan label
  Bahasa Indonesia, dan membuka editor pada bagian yang diminta.
- Settings memakai `expectedRevision` untuk timezone dan versi terbaru registry
  legal untuk persetujuan AI. Dokumen Terms, Privacy, dan pemrosesan AI dapat
  dibaca penuh sebelum pengguna bertindak. Consent dapat diberikan dan dicabut.
- Nutrisi umum, pencatatan manual, dan pemeriksaan tidak bergantung pada profil
  ataupun consent. Tidak ada aturan klinis baru yang ditambahkan.

## Batas implementasi

Mobile memakai operasi OpenAPI yang sudah ada (`getProfile`, `updateProfile`,
`getMe`, `updateMe`, `getConditions`, `getLegalRegistry`, `setAiConsent`) melalui
repository ber-scope sesi. Perubahan katalog hanya mengaktifkan router katalog
yang sudah ada pada runtime API agar pencarian kondisi dapat dipakai di server
nyata; tidak mengubah payload atau skema.

## Verifikasi

Tes murni mengunci label/state dan konfirmasi saat daftar akan dibersihkan. Tes
integrasi repository memeriksa endpoint, query kondisi, revision, idempotency,
conflict, dan grant/revoke consent. Pemeriksaan TypeScript/lint dan tes mobile
diverifikasi dari `carin-app/`; tes API yang terdampak diverifikasi dari
`carin-api/`. Perangkat Android/iOS dicatat sebagai batas QA bila tidak tersedia.
