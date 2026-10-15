# Evaluasi smoke test VLM — 14 Oktober 2026

**API berhasil pada 5/5 gambar, tetapi estimasi porsi masih meleset besar.**
Ini evaluasi lima gambar dari 100 gambar yang sudah dikumpulkan, bukan hasil
evaluasi seluruh dataset atau bukti kelayakan rekomendasi kesehatan.

## Metode dan hasil operasional

- Model diminta dan dikembalikan provider: `qwen3.7-flash-2026-07-15`.
- Fallback dikonfigurasi: `qwen3.7-flash`; **tidak terpakai** pada run ini.
- Sampel: tiga Nutrition5k dan dua LeFood-Set, prefix manifest yang dialokasikan
  dengan `--total-limit 5`. Tidak dipilih ulang setelah hasil diketahui.
- Input provider hanya foto asli dan prompt tetap `food-estimation-v1.txt`;
  nama makanan, berat dan gizi referensi tidak dikirim ke model.
- JSON mode aktif, thinking nonaktif, temperature 0, batas output 1.024 token.
- Lima respons valid, satu percobaan per gambar; tidak ada retry/API error.
- Median waktu per gambar **2,74 detik**, rentang **2,43–4,10 detik**.
  Ini waktu dari sisi klien termasuk jaringan, bukan waktu GPU.
- Total pemakaian yang dilaporkan provider **4.159 token**:
  3.167 input + 992 output. Biaya uang tidak dihitung.

## Pemeriksaan per gambar

Kelima foto diperiksa secara visual bersama label sumber dan respons model.
Selisih bertanda di bawah = prediksi dikurangi referensi.

| Dataset / ID | Referensi | Model | Berat referensi | Prediksi berat | Selisih |
| --- | --- | --- | ---: | ---: | ---: |
| Nutrition5k / `dish_1557861216` | `plate only`; foto piring kosong | Bukan makanan; semua angka null | 1 g* | null | Tidak dinilai |
| Nutrition5k / `dish_1557937037` | Raspberries | Raspberries | 49 g | 80 g | +31 g |
| Nutrition5k / `dish_1558031394` | Cantaloupe, `deprecated`, potatoes, yam | Watermelon, melon, ubi dan kentang/root vegetable | 318 g | 610 g | +292 g |
| LeFood / `lefood-1` | Bubur | Cooked white rice | 343 g | 150 g | −193 g |
| LeFood / `lefood-14` | Nasi | Cooked white rice | 184 g | 150 g | −34 g |

\* Angka 1 g untuk `plate only` merupakan artefak referensi nonfood, bukan
berat makanan. Respons `is_food=false` sesuai foto. Referensi dan report asli
tetap dipertahankan; null tidak diganti nol. Kasus ini sebaiknya menjadi kasus
uji nonfood tersendiri dalam analisis lebih besar.

Raspberries dan nasi dikenali sesuai referensi; **bubur keliru dikenali sebagai
nasi**. Pada foto campuran, kelompok makanan secara umum sesuai yang terlihat,
tetapi nama sumber `deprecated` ambigu sehingga tidak layak dijadikan pasangan
label untuk F1 otomatis. Ini catatan manual, bukan pengukuran akurasi pengenalan.

Untuk dua foto makanan Nutrition5k, energi referensi → prediksi adalah
**25,97 → 32 kcal** dan **237,41 → 390 kcal**. LeFood tidak memiliki referensi
energi/makro sehingga angka gizi yang diberikan model tidak bisa dinilai benar.

## Metrik numerik per dataset

MAE adalah rata-rata selisih absolut terhadap referensi. Metrik diambil dari
report runner tanpa mengganti label atau menyaring respons yang salah.

| Metrik | Nutrition5k | LeFood-Set |
| --- | ---: | ---: |
| Gambar diproses | 3 | 2 |
| Pasangan berat numerik | 2 | 2 |
| Coverage berat pada report asli | 2/3 (66,7%) | 2/2 (100%) |
| MAE berat | **161,5 g** | **113,5 g** |
| Bias berat (prediksi − referensi) | +161,5 g | −113,5 g |
| MAE energi | **79,31 kcal** | Tidak tersedia |
| MAE protein | 1,691 g | Tidak tersedia |
| MAE karbohidrat | 19,122 g | Tidak tersedia |
| MAE lemak | 0,268 g | Tidak tersedia |

Coverage 2/3 Nutrition5k disebabkan piring kosong yang dijawab null secara benar,
bukan kegagalan API. Kedua foto makanan memiliki prediksi numerik. Seluruh
metrik gizi Nutrition5k di atas hanya dihitung pada dua pasangan tersebut;
seluruh metrik gizi LeFood tetap null karena referensinya tidak tersedia.

## Implikasi untuk Carin

Koneksi, respons terstruktur, penyimpanan hasil dan scorer berhasil berjalan
dengan API nyata. Fallback belum teruji secara live karena semua panggilan utama
berhasil; hasil ini tidak membuktikan akurasi fallback.

Pada sampel ini porsi menjadi kelemahan nyata: makanan campuran ditaksir 610 g
padahal 318 g, sementara bubur dan nasi sama-sama diberi 150 g. Pola dua angka
identik ini mengindikasikan kemungkinan asumsi porsi umum; lima foto belum cukup
untuk memastikan penyebab atau mengukur bias pada populasi makanan Indonesia.

Untuk alur produk, hasil ini mendukung konfirmasi jenis makanan dan porsi oleh
pengguna, lalu perhitungan gizi dari katalog yang bersumber. Prediksi gizi mentah
VLM belum cukup sebagai dasar keputusan kesehatan. Smoke test tidak menguji
profil pengguna, aturan kesehatan, atau layanan REST T32.

Evaluasi lebih besar perlu memakai prompt yang sama pada sisa gambar, melaporkan
hasil tiap dataset terpisah, dan memberi anotasi manual untuk kasus nonfood serta
label sumber ambigu. Kelima gambar ini tetap bagian evaluasi; perubahan prompt
sebaiknya memakai development set terpisah. Belum ada inferensi pada 95 gambar
lainnya dalam tugas smoke test ini.

## Artefak dan reproduksi

Hasil lokal di [results/smoke-5-2026-10-14/summary.json](results/smoke-5-2026-10-14/summary.json)
dan [summary.csv](results/smoke-5-2026-10-14/summary.csv). Folder run juga menyimpan
`run.json`, prediksi JSONL per dataset, respons API per gambar, dan report per
dataset. Hasil/API credentials tetap Git-ignored; laporan ini dapat di-version.

Perintah yang telah dijalankan dari root repository (exit 0):

```sh
python3 experiments/model-evaluation/scripts/run_evaluation.py --total-limit 5 \
  --run-dir experiments/model-evaluation/results/smoke-5-2026-10-14
```

Untuk melanjutkan pemeriksaan run yang sama tanpa mengulang panggilan, gunakan
perintah tersebut dengan tambahan `--resume`. Untuk inferensi baru, gunakan
folder baru; panggilan baru memakai kuota API.

Verifikasi kode: **30 unit tests lulus**. Pengujian unit memeriksa pipeline dan
scorer; angka evaluasi di atas berasal dari lima respons API nyata.
Perubahan tetap uncommitted pada branch `feat/t32-real-ai-service`.
