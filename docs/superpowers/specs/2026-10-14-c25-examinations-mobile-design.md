# C25 — pemeriksaan mobile

## Tujuan

Membuat pengguna dapat mencatat, membaca, mengedit, dan menghapus tekanan darah,
gula darah, serta kolesterol lewat API terautentikasi. Nilai historis tetap
ditampilkan sebagai data, tanpa diagnosis, ambang abnormal, atau tren yang tidak
didukung jumlah titik.

## Desain

- Route tab menampilkan daftar pemeriksaan terbaru, filter jenis, ringkasan seri
  yang sebanding, dan aksi tambah. Empty, loading/stale, offline, dan error memakai
  pola shell yang sudah tersedia.
- Form satu route untuk create/edit memakai pilihan jenis; field berubah sesuai
  tipe. Angka menerima koma atau titik desimal. Unit tetap terlihat, tanggal
  wajib, waktu opsional dan tidak pernah diisi otomatis, konteks glukosa dapat
  `Tidak diketahui`, catatan opsional.
- Sebelum submit tampilkan konfirmasi nilai, unit, tanggal/waktu, dan konteks.
  Write online-only memakai repository; UI membuat dan menyimpan idempotency key
  per aksi hingga server mengakui hasil, lalu retry aksi yang sama memakai key
  yang sama. Update mengirim revision yang dibaca. Sukses hanya setelah respons API.
- Detail menunjukkan nilai, tipe, konteks, satuan, tanggal pengukuran dan waktu
  hanya jika tercatat; aksi edit/hapus. Hapus meminta konfirmasi dan query cache
  direfresh oleh `useAppWrite`.
- Grafik SVG ringan menghubungkan paling banyak data dalam satu seri API. Label
  teks dan ringkasan daftar dapat dibaca screen reader. Satu titik hanya
  ditampilkan sebagai satu hasil, bukan tren. Tekanan sistolik/diastolik
  divisualkan pada seri terpisah dengan tanggal historis yang sama. Semua titik
  pada tanggal kalender yang sama memakai koordinat x yang sama. Jika waktu
  pengukuran tidak dicatat, jangan hubungkan titik tersebut dengan titik lain
  pada tanggal yang sama; baris dan ringkasan aksesibel tetap menyebut waktu
  tidak dicatat.
- Gunakan `@react-native-community/datetimepicker` via `expo install` untuk
  pemilih tanggal native, dikunci ke timezone akun. Web memakai input date.
  Format tanggal pada timezone akun, bukan `toISOString`, supaya tidak bergeser.
  Waktu memakai field teks HH:mm yang kosong sampai pengguna memasukkan nilai;
  jangan menginisialisasi dengan jam saat ini atau tengah malam.
- Gunakan timezone akun dari `getMe`, bukan timezone perangkat. Jika data akun
  gagal dimuat, tampilkan pesan dan opsi coba lagi sebelum save.
- Daftar melakukan pagination cursor sampai habis, bukan mengasumsikan maksimal
  100 hasil.

## Struktur

- `carin-app/lib/exams/model.ts`: parsing angka lokal, label dan format data,
  proyeksi chart/summary yang murni.
- `carin-app/lib/exams/model.unit.test.ts`: koma desimal, batas input, label,
  urutan tanggal historis, satu titik, pemisahan seri.
- `carin-app/components/exams/ExaminationForm.tsx`: field berdasarkan union
  `ExaminationInput` dan preview.
- `carin-app/components/exams/ExaminationSeriesChart.tsx`: chart SVG + ringkasan
  yang dapat diakses.
- `carin-app/app/(tabs)/exams.tsx`: daftar/filter/series/create entry dan load-more.
- `carin-app/app/exams/new.tsx`, `[id].tsx`, `[id]/edit.tsx`: create, detail,
  edit routes.
- Unit/integration tests colocated di atas helper dan layar terkait.

## Acceptance

Mengikuti AC-EXAM-01..05, `specs/01-ux-flows-and-screen-states.md`, dan kontrak
generated `carin-app/lib/api/generated/app-api.ts`. Tidak ada local fake data.
Uji angka koma, date-only, waktu opsional, input backdated tetapi ordering
berdasarkan tanggal pengukuran, seri terpisah termasuk konteks unknown, grafik
satu titik, delete/invalidation, preview, loading/error, dan aksesibilitas.

## Batas

Tidak ada validasi rentang klinis atau konversi satuan. Uji interaksi date picker
dan keyboard membutuhkan emulator/device iOS/Android; web export bukan bukti QA native.
