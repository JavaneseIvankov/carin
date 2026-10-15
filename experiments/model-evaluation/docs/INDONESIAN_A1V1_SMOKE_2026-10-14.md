# Benchmark A1V1 untuk tiga makanan Indonesia — 14 Oktober 2026

Benchmark berpasangan: kedua model menerima foto yang sama dengan prompt A1V1-schema-v2, JSON Schema strict, temperature=0, thinking=false, max_tokens=1024, endpoint Alibaba Singapore, dan tanpa fallback.
Sampel dipilih dari manifest LeFood-Set yang terkunci dan tidak termasuk 25 sampel benchmark sebelumnya: Ayam Bumbu Srundeng, Rendang ayam, dan Tempe bumbu bacem. Nama/GT tidak dikirim ke model.
LeFood-Set menyediakan ground truth massa, tetapi tidak menyediakan ground truth nutrisi. Karena itu MAE nutrisi tidak dihitung dan nilai nutrisi dari model tidak dianggap terverifikasi.

## Hasil

| Model | Mass MAE (g) | Pasangan valid | Mean latency (s) | Median latency (s) | Total tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| qwen3.7-flash-2026-07-15 | 53.33 (3/3) | 3/3 | 2.78 | 2.61 | 3532 |
| qwen3.8-max | 24.67 (3/3) | 3/3 | 5.32 | 5.25 | 3573 |

## Per sampel

| Model | Makanan (GT) | Prediksi komponen | GT massa (g) | Prediksi massa (g) | Error absolut (g) | Status | Latency (s) |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: |
| qwen3.7-flash-2026-07-15 | Ayam Bumbu Srundeng | Breaded fried chicken | 47.00 | 85.00 | 38.00 | ok | 2.45 |
| qwen3.7-flash-2026-07-15 | Rendang ayam | Cooked meat with sauce | 49.00 | 120.00 | 71.00 | ok | 3.28 |
| qwen3.7-flash-2026-07-15 | Tempe bumbu bacem | Oat bar with nuts | 34.00 | 85.00 | 51.00 | ok | 2.61 |
| qwen3.8-max | Ayam Bumbu Srundeng | breaded fried meat piece | 47.00 | 35.00 | 12.00 | ok | 5.68 |
| qwen3.8-max | Rendang ayam | cooked chicken piece with sauce | 49.00 | 110.00 | 61.00 | ok | 5.02 |
| qwen3.8-max | Tempe bumbu bacem | cereal bar | 34.00 | 35.00 | 1.00 | ok | 5.25 |

Hasil ditampilkan sesuai output model; tidak ada koreksi label atau berat setelah inference. `is_food`, geometri visual, limits, provider model, finish reason, token per respons, SHA gambar, serta payload kontrol tersimpan di JSONL/raw/details/request artifacts.
MAE dihitung hanya dari prediksi massa yang valid. Latency mencakup request API dan validasi/penyimpanan lokal, bukan waktu inference provider murni. Token adalah token yang dilaporkan provider.
Tiga foto ini terlalu sedikit untuk menyimpulkan model terbaik secara umum. Ini hanya smoke test makanan Indonesia dan tidak mengukur ketepatan kalori/makro.

## Detail output

Per-sampel `comparison.json` dan seluruh raw response, request, prediction, serta metadata ada di folder hasil benchmark.
