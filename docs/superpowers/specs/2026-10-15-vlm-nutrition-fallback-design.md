# Fallback Gizi VLM per Komponen

## Tujuan

Mengisi estimasi gizi untuk komponen foto yang tidak dapat dipadankan dengan
katalog, tanpa mengganti data katalog yang sudah tersedia dan tanpa mencampur
estimasi satu foto penuh dengan angka per komponen.

## Keputusan desain

- Jalur foto tetap menjalankan pengenalan komponen dan pemadanan katalog seperti
  sekarang.
- Jika ada komponen tanpa match katalog, AI Service menjalankan permintaan VLM
  kedua yang hanya meminta estimasi untuk komponen tersebut. Permintaan membawa
  ID komponen, nama yang dikenali, serta estimasi porsi jika tersedia. Jawaban
  membawa estimasi nutrisi untuk porsi yang tampak pada foto, per ID komponen.
- Komponen dengan match katalog selalu memakai nilai dan provenance katalog.
  Hasil VLM tidak mengganti nilai katalog, tidak menghasilkan nilai per 100 g,
  dan tidak mengestimasi seluruh foto dalam satu angka. Estimasi per komponen
  untuk makanan tanpa match ikut dijumlahkan ke total hasil dan coverage.
- Nutrisi hasil VLM memakai source dengan kind `model_estimate`, dirujuk melalui
  `nutrientSourceIds`. UI menandainya sebagai estimasi visual VLM. Versi katalog,
  dataset, snapshot, dan coverage tetap mengikuti kontrak yang sama.
- Nutrisi yang tidak disediakan model tetap `null`. Kegagalan atau jawaban
  malformed dari permintaan estimasi menambahkan limitation dan tidak
  menggagalkan hasil pengenalan foto.
- `supportStatus` tetap merefleksikan pemadanan katalog: `unrecognized` jika
  tidak ada komponen yang match dan `partial` bila ada campuran. Estimasi VLM
  tidak mengubah status makanan menjadi catalog-matched. Total per nutrient
  menjadi `null` hanya jika tidak ada komponen yang memiliki nilai untuk nutrient
  tersebut.
- Estimasi visual tidak digunakan untuk health rules, attention, diagnosis,
  atau personalisasi kesehatan. Recalculation/manual input tetap memakai
  perhitungan katalog.
- Foto tanpa makanan tidak menjalankan estimasi nutrisi. Foto tanpa katalog
  match dapat tetap mengembalikan angka estimasi per komponen, tetapi statusnya
  tetap `unrecognized` atau `partial` sesuai kontrak match/coverage.

## Kontrak dan validasi

Perluasan source kind `model_estimate` menjadi penanda provenance wire-level.
AI Service memvalidasi hasil estimasi terhadap ID yang diminta, finite/nonnegative
values, serta batas schema. Carin API memvalidasi rujukan source, kecocokan
provenance request/response, dan coverage; snapshot menyimpan hasil komponen dan
source yang sama. Tidak ada nutrient dari source model yang boleh muncul tanpa
rujukan source.

Kontrak naik menjadi 2.0.0 karena semantik total/coverage untuk hasil foto
`unrecognized` berubah. Kontrak A1V1 untuk evaluasi model tetap khusus berisi
estimasi total satu foto; endpoint itu tidak digunakan sebagai fallback produksi.

## Perubahan aplikasi

Detail hasil analisis menunjukkan label estimasi visual pada zat gizi yang
berasal dari VLM, memisahkannya dari gizi katalog. Source dan limitation tetap
terlihat. Riwayat membaca snapshot yang sama sehingga label dan provenance
bertahan setelah analisis disimpan.

## Verifikasi

- Uji service untuk komponen catalog matched, unmatched, hasil model parsial,
  missing portion, foto non-food, respons model invalid, timeout/provider error,
  dan campuran catalog + VLM tanpa double counting.
- Contract checks AI/App API, validasi adapter, dan uji snapshot/presentation.
- Live test analisis foto di Android melalui agent-device untuk memastikan
  angka, label sumber, dan limitation terlihat di app.

Estimasi VLM adalah perkiraan visual, bukan sumber nutrisi terverifikasi dan
tidak boleh ditampilkan sebagai angka katalog atau dipakai untuk arahan klinis.
