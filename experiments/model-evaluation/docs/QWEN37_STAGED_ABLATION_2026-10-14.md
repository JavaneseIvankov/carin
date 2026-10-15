# Studi ablasi Qwen3.7 Flash — 14 Oktober 2026

Seluruh 9 varian yang diminta selesai dijalankan pada **pilot paired 5 gambar** yang sama dengan B0: 3 Nutrition5k + 2 LeFood-Set. B0 diambil dari hasil historis, tanpa inferensi ulang. Ada 45 panggilan varian, 43 respons lolos schema, 2 gagal schema; tidak ada retry atau fallback. Ini belum evaluasi seluruh subset 50+50 dan belum validasi independen.

A1V2 paling rendah Mass MAE di Nutrition5k (20 g vs B0 161,5 g), tetapi menambah kesalahan LeFood dan gagal schema untuk piring kosong. A2V1 paling rendah Mass MAE LeFood (98,5 g vs 113,5 g). Seluruh varian masih salah mengenali Bubur sebagai Nasi. Belum ada varian yang menjadi pemenang konsisten pada dua dataset.

## Kontrol dan desain

- Model tepat `qwen3.7-flash-2026-07-15`; endpoint Singapore workspace sama persis dengan `results/smoke-5-2026-10-14/run.json`, bukan endpoint `.env` yang berbeda.
- Semua request: `temperature=0`, `enable_thinking=false`, `response_format={"type":"json_object"}`, `max_tokens=1024`, non-streaming; tanpa fallback. Model yang dilaporkan provider cocok pada seluruh 45 raw response.
- B0 historis memang mengonfigurasi fallback, tetapi semua 5 respons B0 memakai primary snapshot, tanpa retry/fallback. Tidak ada penggunaan model lain atau thinking dalam studi ini.
- Foto dikirim byte-for-byte. ID dan checksum cocok dengan B0. Label, gram, kalori referensi dan identitas dataset tidak disuntikkan ke prompt; fitur A4 hanya keluaran model CV.
- Setiap kelompok berdiri sendiri terhadap B0; bukan gabungan A1+A2+A3+A4. V2 menambah instruksi/fitur hanya dalam kelompoknya. A3V2 menguji flag high-resolution sendiri, tidak sekaligus mempertahankan `min_pixels` V1.
- Satu observasi per gambar/varian, tanpa seed provider yang terkontrol. Temperatur 0 tidak menjamin determinisme. Dataset ini telah diperiksa pada pekerjaan sebelumnya; hasil bersifat eksplorasi. Jangan memilih prompt lalu mengklaim skor yang sama sebagai validasi independen.

| Varian | Perubahan terhadap B0 |
| --- | --- |
| A1V1 | JSON: diameter wadah + volume tampak sebelum berat; intermediate dikembalikan ke log. |
| A1V2 | A1V1 + packing factor + density sebelum berat; hasil kali fisika dicatat, tanpa mengganti berat VLM. |
| A2V1 | Instruksi tidak memakai serving default 100/150/200 g; turunkan berat dari volume visual. |
| A2V2 | A2V1 + asumsi density/packing sesuai permintaan + petunjuk tekstur Bubur/Nasi. |
| A3V1 | `min_pixels=786432` pada objek image input; prompt B0 tetap. |
| A3V2 | `vl_high_resolution_images=true` pada request; prompt B0 tetap. |
| A4V1 | Prompt B0 + area ratio dari CLIPSeg yang benar-benar dijalankan. |
| A4V2 | A4V1 + contrast relative depth dari DepthAnythingV2 yang benar-benar dijalankan. |
| A6V1 | VLM mengeluarkan nama + gram saja; alias ke katalog USDA, hitung gram/100 × nutrisi per 100 g. |

## Metrik utama

MAE berikut memakai pasangan numerik yang sama: **2 gambar makanan Nutrition5k** untuk setiap metrik, dan **2 gambar LeFood** untuk mass. Piring kosong memiliki artefak label 1 g; jawaban nonfood null tidak dipaksa menjadi angka. LeFood tidak mempunyai GT energi/makro: seluruh nutrient MAE LeFood adalah NA. “OK” berarti format respons valid, bukan prediksi benar.

| Variant | N5k mass MAE g | N5k energy MAE kcal | Protein MAE g | Carbs MAE g | Fat MAE g | LeFood mass MAE g | LeFood labels correct / 2 | Median API s | Total tokens | Image tokens | OK / 5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B0 | 161.500 | 79.310 | 1.691 | 19.122 | 0.268 | 113.500 | 1 | 2.744 | 4159 | 1577 | 5 |
| A1V1 | 39.000 | 34.310 | 0.221 | 7.822 | 0.518 | 106.000 | 1 | 3.794 | 4608 | 1577 | 4 |
| A1V2 | 20.000 | 22.810 | 0.321 | 5.072 | 0.318 | 128.500 | 1 | 4.322 | 4799 | 1577 | 4 |
| A2V1 | 141.500 | 81.810 | 1.841 | 15.322 | 0.418 | 98.500 | 1 | 3.489 | 4723 | 1577 | 5 |
| A2V2 | 194.000 | 119.310 | 1.291 | 29.372 | 0.368 | 113.500 | 1 | 3.830 | 5263 | 1577 | 5 |
| A3V1 | 86.500 | 89.310 | 1.191 | 18.022 | 0.418 | 113.500 | 1 | 3.645 | 6633 | 3898 | 5 |
| A3V2 | 156.500 | 68.310 | 0.941 | 14.172 | 0.468 | 113.500 | 1 | 3.641 | 4167 | 1577 | 5 |
| A4V1 | 151.500 | 76.810 | 1.341 | 14.122 | 0.368 | 113.500 | 1 | 3.474 | 4686 | 1577 | 5 |
| A4V2 | 111.500 | 99.310 | 1.591 | 25.622 | 0.268 | 113.500 | 1 | 3.358 | 4701 | 1577 | 5 |
| A6V1 | 123.000 | 72.280 | 2.515 | 16.478 | 0.197 | 113.500 | 1 | 3.310 | 3301 | 1577 | 5 |

Dua kegagalan A1 terjadi pada piring kosong: `is_food=false` benar, tetapi `prediction:null` melanggar schema yang meminta objek empat nutrient bernilai null. Respons tetap dihitung gagal, tidak diperbaiki diam-diam atau diulang. Token kedua respons gagal tetap masuk total. Coverage numerik semua varian adalah 2/3 Nutrition5k dan 2/2 LeFood; coverage respons A1 adalah 4/5, lainnya 5/5.

## Prediksi per sampel

Nilai gram; ERROR adalah gagal schema, NA adalah nonfood null.

| Varian | Piring kosong | Raspberries | Mixed fruit/tuber | Bubur | Nasi |
| --- | ---: | ---: | ---: | ---: | ---: |
| GT | 1 (artefak nonfood) | 49.000 | 318.000 | 343.000 | 184.000 |
| B0 | NA | 80.000 | 610.000 | 150.000 | 150.000 |
| A1V1 | ERROR | 65.000 | 380.000 | 140.000 | 175.000 |
| A1V2 | ERROR | 67.000 | 340.000 | 150.000 | 120.000 |
| A2V1 | NA | 105.000 | 545.000 | 180.000 | 150.000 |
| A2V2 | NA | 85.000 | 670.000 | 170.000 | 130.000 |
| A3V1 | NA | 100.000 | 440.000 | 150.000 | 150.000 |
| A3V2 | NA | 100.000 | 580.000 | 150.000 | 150.000 |
| A4V1 | NA | 80.000 | 590.000 | 150.000 | 150.000 |
| A4V2 | NA | 80.000 | 510.000 | 150.000 | 150.000 |
| A6V1 | NA | 45.000 | 560.000 | 150.000 | 150.000 |

## Label Bubur vs Nasi

Untuk `lefood-1`, semua varian mengeluarkan label yang dipetakan ke Nasi, padahal GT Bubur; `lefood-14` benar Nasi. Akurasi label 1/2 = 50% untuk setiap varian. Pemetaan lexical di runner mengenali porridge/congee/bubur/gruel sebelum rice/nasi, dan menandai nama ambigu sebagai unresolved. Ini hanya dua contoh dengan label dish, bukan F1 komponen makanan seluruh dataset. Nutrisi USDA untuk Bubur yang salah disebut nasi tetap merupakan **salah match secara semantik**, walaupun hitungannya deterministik.

## Audit geometry A1V2

Semua empat respons food menempatkan intermediate sebelum `weight_g`. Angka intermediate belum membuktikan penalaran fisika yang konsisten:

| Sampel | Diameter cm | Volume cm³ | Packing | Density g/cm³ | Hasil kali g | Berat VLM g |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dish_1557937037 | 18.000 | 450.000 | 0.150 | 1.000 | 67.500 | 67.000 |
| dish_1558031394 | 20.000 | 1500.000 | 0.650 | 1.000 | 975.000 | 340.000 |
| lefood-1 | 18.000 | 150.000 | 0.750 | 1.000 | 112.500 | 150.000 |
| lefood-14 | 15.000 | 120.000 | 0.700 | 1.000 | 84.000 | 120.000 |

Contoh mixed dish: intermediate menghasilkan 975 g, tetapi berat yang dilaporkan 340 g. Penurunan MAE A1V2 tidak dapat diklaim sebagai validasi volume/density. Diameter juga ditebak, bukan ukuran wadah terukur. Tidak dilakukan koreksi post-hoc agar skor membaik.

## Token dan resolusi

| Varian | Input token | Output token | Total token | Rata-rata total / gambar | Image token |
| --- | ---: | ---: | ---: | ---: | ---: |
| B0 | 3167 | 992 | 4159 | 831.8 | 1577 |
| A1V1 | 3342 | 1266 | 4608 | 921.6 | 1577 |
| A1V2 | 3462 | 1337 | 4799 | 959.8 | 1577 |
| A2V1 | 3517 | 1206 | 4723 | 944.6 | 1577 |
| A2V2 | 4057 | 1206 | 5263 | 1052.6 | 1577 |
| A3V1 | 5488 | 1145 | 6633 | 1326.6 | 3898 |
| A3V2 | 3167 | 1000 | 4167 | 833.4 | 1577 |
| A4V1 | 3457 | 1229 | 4686 | 937.2 | 1577 |
| A4V2 | 3649 | 1052 | 4701 | 940.2 | 1577 |
| A6V1 | 2567 | 734 | 3301 | 660.2 | 1577 |

Total varian baru: 42,881 token untuk 45 gambar-inferensi. B0 historis 4.159 token tidak dibelanjakan ulang. Ada satu probe endpoint terpisah sebelum studi yang tidak masuk tabel MAE/latency/token varian; responsnya tersimpan di `results/qwen37-ablation-endpoint-probe-2026-10-14/`. Angka tabel berasal dari raw API termasuk dua schema error, bukan estimasi biaya.

A3V1 benar-benar menghasilkan **1.088–1.112 input token/gambar**, sesuai target 1.000–1.200. Image token naik dari 1.577 ke 3.898 total, dan total token +59,5% terhadap B0. A3V2 tidak menaikkan image token pada gambar ini (tetap 1.577), sehingga beda MAE tidak membuktikan manfaat resolusi lebih tinggi; gambar asal kecil atau flag tidak menambah pemrosesan pada request ini. Tidak dilakukan resize/crop atau retry tuning. A6 paling hemat token (−20,6% terhadap B0), tetapi bukan paling rendah seluruh MAE.

## CV A4: sumber fitur dan kualitas

CLIPSeg `CIDAS/clipseg-rd64-refined`, revision `999e0328d9e10b484360c477313983f9afdd7050`, query `food on the plate` dan `plate or bowl`, threshold 0,5 tetap, float32. DepthAnythingV2 ViT-L memakai bobot FP16 yang telah tersedia; SHA-256 `5ba4cd83fe10915331ff21a32bf66fc75ef27f17378f5d2914b471815f3103ce`. Model dijalankan berurutan di RTX 3050 Laptop untuk membatasi RAM/VRAM; tidak memuat OmniFood VLM.

Area ratio = pixel mask makanan / union(mask makanan, mask wadah). Relative depth score = median depth min-max per gambar pada makanan dikurangi median pada wadah yang tampak; tanpa satuan, bukan cm, gram, atau ketinggian terkalibrasi. Mask tidak disetel memakai GT dan tidak diedit setelah skor diperiksa.

| Sampel | Area ratio | Relative depth score | Segmentasi s | Depth s |
| --- | ---: | ---: | ---: | ---: |
| dish_1557861216 | 0.704 | -0.110 | 0.118 | 0.323 |
| dish_1557937037 | 0.496 | -0.073 | 0.112 | 0.323 |
| dish_1558031394 | 0.675 | 0.022 | 0.123 | 0.311 |
| lefood-1 | 0.927 | -0.319 | 0.120 | 0.346 |
| lefood-14 | 0.919 | -0.277 | 0.110 | 0.357 |

Pemeriksaan overlay menunjukkan piring kosong salah diberi mask makanan seluas **70,4%**; mask Bubur juga menutupi hampir seluruh interior wadah. Fitur ini masih noisy. Depth negatif pada sebagian sampel tidak boleh dipakai sebagai tinggi atau massa negatif. A4 hasilnya adalah uji fitur CV yang bermasalah ini, bukan batas kemampuan segmentasi/depth yang ideal.

Median preprocessing lokal setelah warm-up: segmentasi 0.118 s; depth 0.323 s; median jumlah keduanya 0.440 s/gambar. Median API pada tabel tidak memasukkan preprocessing, download/load model, atau warm-up.

## Nutrition grounding A6

Katalog `usda-sr-legacy-ablation-v1` berisi delapan referensi SR Legacy, diambil dari [unduhan resmi USDA](https://fdc.nal.usda.gov/download-datasets/), arsip April 2018. API DEMO_KEY sempat mencapai batas kuota; persiapan akhir memakai CSV unduhan tanpa credential. Deskripsi sumber baked potato/apple disesuaikan dengan nama resmi CSV sebelum inferensi A6. Alias dibekukan sebelum melihat output A6; tidak ada penambahan alias berdasarkan hasil.

| Referensi | FDC ID | Kcal / 100 g | Protein g | Karbo g | Lemak g |
| --- | ---: | ---: | ---: | ---: | ---: |
| Raspberries, raw | 167755 | 52.000 | 1.200 | 11.940 | 0.650 |
| Watermelon, raw | 167765 | 30.000 | 0.610 | 7.550 | 0.150 |
| Melons, cantaloupe, raw | 169092 | 34.000 | 0.840 | 8.160 | 0.190 |
| Potatoes, baked, flesh and skin, without salt | 170093 | 93.000 | 2.500 | 21.150 | 0.130 |
| Potatoes, boiled, cooked without skin, flesh, without salt | 170440 | 86.000 | 1.710 | 20.010 | 0.100 |
| Sweet potato, cooked, baked in skin, flesh, without salt | 168483 | 90.000 | 2.010 | 20.710 | 0.150 |
| Rice, white, long-grain, regular, enriched, cooked | 168878 | 130.000 | 2.690 | 28.170 | 0.280 |
| Apples, raw, with skin (Includes foods for USDA's Food Distribution Program) | 171688 | 52.000 | 0.260 | 13.810 | 0.170 |

Semua komponen food pada run A6 mempunyai alias sumber, sehingga coverage nutrisi Nutrition5k tetap 2/3 (dua pasangan makanan), sama dengan B0; penurunan Energy MAE bukan hasil membuang contoh sulit. Komponen tidak cocok atau berat unknown akan membuat total nutrient null, bukan subtotal yang dianggap total atau angka nol. LeFood tetap tidak punya GT nutrient. TKPI belum diingest, dan katalog tidak menyediakan resep Bubur yang benar; long-grain rice juga belum tentu jenis nasi sebenarnya.

Grounding menghilangkan koefisien nutrisi yang ditebak VLM, tetapi nama/preparasi dan gram masih prediksi. Sebagai contoh raspberries 45 g menghasilkan 23,4 kcal dari 52 kcal/100 g; mixed dish diprediksi 560 g vs GT 318 g sehingga energi masih meleset. Referensi Nutrition5k sendiri diturunkan dari berat dan USDA, bukan assay lab; kesesuaian basis database perlu diingat saat menilai grounding.

## Kesimpulan terbatas dan pekerjaan berikutnya

A1V2 layak diuji pada development set terpisah karena perbaikan Nutrition5k, tetapi perlu schema nonfood yang konsisten dan audit hubungan volume-mass. A2V2 justru memperburuk Mass MAE; konstanta fisika yang dipaksakan bukan kalibrasi. A3V1 berhasil mencapai target token tetapi menambah biaya dan tidak memperbaiki energi. A4 memerlukan validasi mask sebelum fitur dipakai untuk produksi. A6 memberi arithmetic yang dapat diaudit, bukan jaminan MAE turun untuk semua macro. Perbaikan label Bubur/Nasi dan skala/ketebalan wadah yang terukur tetap diperlukan.

Tidak ada pengujian thinking, antar-model, V3, prompt lanjutan, atau gabungan pemenang pada dataset ini. Jangan memperlakukan empat pasangan massa atau dua pasangan nutrient sebagai bukti generalisasi Indonesia. Langkah berikutnya adalah review konfigurasi, lalu evaluasi lebih besar yang terpisah; tidak dijalankan otomatis dalam pilot ini.

## Artefak dan reproduksi

- `results/qwen37-staged-ablation-2026-10-14/`: `comparison.json`, `REPORT.md`, `study.json`, `control-audit.json`, dan folder sembilan varian.
- Setiap varian: request text/settings/checksum, raw provider JSON, intermediate/source matches, prediction JSONL, summary, report tiap dataset.
- `results/qwen37-ablation-cv-2026-10-14/`: features, mask, overlay, dan relative depth maps.
- `catalogs/usda-sr-legacy-ablation-v1.json`: koefisien per100g, alias, FDC ID, URL dan checksum arsip; tidak diambil dari GT Nutrition5k/LeFood.
- `prompts/qwen37-ablation/`: prompt tetap setiap varian. Hasil, gambar, model weights dan credential tetap lokal/ignored.

Perintah dari root repository (baseline historis harus tersedia):

```sh
python3 experiments/model-evaluation/scripts/prepare_ablation_catalog.py
# Sekali, menggunakan environment lokal yang memiliki torch, transformers, cv2 dan safetensors:
experiments/model-evaluation/.venv/bin/python experiments/model-evaluation/scripts/prepare_ablation_cv.py
python3 experiments/model-evaluation/scripts/run_qwen37_ablation.py \
  --cv-metadata experiments/model-evaluation/results/qwen37-ablation-cv-2026-10-14/features.json \
  --catalog experiments/model-evaluation/catalogs/usda-sr-legacy-ablation-v1.json --resume
uv run --with huggingface-hub==1.33.0 python -m unittest discover \
  -s experiments/model-evaluation/tests -p "test_*.py" -q
```

Resume melewati respons sukses maupun gagal yang sudah tersimpan, tanpa mengulang inferensi. Output persiapan CV baru memerlukan folder berbeda lewat `--output`; perubahan prompt/config/catalog harus memakai run folder baru. Pemeriksaan kontrol offline memverifikasi 45 request, model raw response, hash gambar, retry/fallback, dan menghitung ulang semua metrik; tidak membuat panggilan provider tambahan.

Verifikasi akhir: **51 tes offline lolos**, termasuk arithmetic per100g, coverage unmatched/unknown, penolakan schema nonfood yang salah, larangan nutrient dari VLM pada A6, dan pencatatan geometry tanpa koreksi berat. Ketiga script baru juga lolos pemeriksaan sintaks. Tes offline memakai nilai sintetis, bukan bukti akurasi model.

Reorganisasi dan tools sebelumnya sudah di-commit/push sebagai `2e5ba91` pada `feat/t32-real-ai-service`. Kode, katalog, prompt dan laporan studi ablasi ini masih terpisah dari commit tersebut.
