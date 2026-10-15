# Benchmark zat gizi tambahan: SNAPMe, 15 Oktober 2026

Empat foto yang sama pada kedua model, A1V1 dengan schema tambahan: salad Caesar, telur/keju/tortilla, kopi susu, quinoa/sayur/sosis. Delapan panggilan target, tanpa fallback, temperature=0, thinking=false, max_tokens=1024, JSON Schema strict, endpoint historis Singapore. Foto asli; CPU client tanpa GPU lokal.
Sumber: [SNAPMe v1](https://agdatacommons.nal.usda.gov/articles/dataset/24856449), Chin et al., CC BY-SA 4.0. Referensi adalah jumlah baris ASA24 yang terhubung ke setiap foto; bukan hasil laboratorium atau ground truth porsi ditimbang. Empat foto berasal dari satu peserta/hari. Foto after diperiksa secara visual dan hampir kosong; sisa kecil tidak dikuantifikasi. Foto after, nama, porsi dan nilai referensi tidak dikirim ke VLM.
[Dokumentasi ASA24](https://epi.grants.cancer.gov/asa24/researcher/analysis.html) menjelaskan bahwa nilai natrium menggunakan asumsi resep/garam. Benchmark ini mengukur selisih terhadap recall tersebut, bukan membuktikan kemampuan mengukur natrium aktual dari foto. `ADD_SUGARS` berupa teaspoon equivalents, sehingga tidak disamakan dengan gram; yang diuji adalah gula total (`SUGR`).

Ada konflik anotasi salad: Bitesnap mencatat no dressing, sedangkan ASA24 memasukkan Caesar dressing. Referensi benchmark tetap ASA24 secara konsisten; resep aktual tidak terverifikasi. Konflik ini dicatat sebelum panggilan model.

## MAE terhadap referensi ASA24

MAE pada nilai valid ditampilkan bersama n/N. Unknown tetap null, tidak diubah menjadi nol. MAE antar-zat dengan satuan berbeda tidak dijumlahkan.

| Zat / satuan | Qwen3.7 Flash MAE (n/N) | Qwen3.8 Max MAE (n/N) |
| --- | ---: | ---: |
| mass_g | 134.618 (4/4) | 95.868 (4/4) |
| energy_kcal | 184.405 (4/4) | 129.890 (4/4) |
| protein_g | 9.895 (4/4) | 5.187 (4/4) |
| carbohydrate_g | 14.300 (4/4) | 7.552 (4/4) |
| fat_g | 9.712 (4/4) | 8.212 (4/4) |
| sodium_mg | 219.089 (4/4) | 254.089 (4/4) |
| total_sugars_g | 3.127 (4/4) | 0.721 (4/4) |
| fiber_g | 1.057 (4/4) | 0.932 (4/4) |
| saturated_fat_g | 3.980 (4/4) | 3.380 (4/4) |
| cholesterol_mg | 66.450 (4/4) | 42.700 (4/4) |
| potassium_mg | 75.791 (4/4) | 40.341 (4/4) |
| calcium_mg | 127.330 (4/4) | 97.330 (4/4) |

Referensi gula total hanya 1.385–4.187 g per foto. Hasil belum menguji minuman manis/dessert atau variasi gula tambahan.

### Sensitivitas terhadap konflik salad

Ini pemeriksaan tambahan atas konflik yang sudah diketahui sebelum inference. Skor utama empat foto tetap dilaporkan di atas. Mengeluarkan salad yang anotasi dressing-nya bertentangan mengubah urutan MAE natrium; satu sampel sangat memengaruhi kesimpulan.

| Model | MAE natrium, empat foto (mg) | MAE natrium, tiga foto tanpa salad (mg) |
| --- | ---: | ---: |
| qwen3.7-flash-2026-07-15 | 219.089 | 235.062 |
| qwen3.8-max | 254.089 | 148.395 |

## Waktu dan token

| Model | Valid / submitted | Mean s | Median s | Input tokens | Output tokens | Total tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| qwen3.7-flash-2026-07-15 | 4/4 | 3.564 | 3.479 | 6260 | 1284 | 7544 |
| qwen3.8-max | 4/4 | 7.070 | 7.154 | 6288 | 1356 | 7644 |

Latency adalah client wall time API + parsing/penyimpanan; upload HP, antrean VPS, DB dan polling belum diukur. Model dijalankan berurutan sehingga kondisi provider/jaringan dapat berbeda. Token termasuk seluruh raw respons yang tersimpan, termasuk respons invalid.

## Detail per foto

### Salad romaine, parmesan, croutons, Caesar dressing

| Zat | Referensi | Flash | Max |
| --- | ---: | ---: | ---: |
| calcium_mg | 292.116 | 180.000 | 100.000 |
| carbohydrate_g | 9.298 | 18.000 | 12.000 |
| cholesterol_mg | 36.112 | 15.000 | 15.000 |
| energy_kcal | 305.970 | 380.000 | 180.000 |
| fat_g | 25.734 | 24.000 | 12.000 |
| fiber_g | 1.964 | 3.000 | 3.000 |
| mass_g | 114.030 | 280.000 | 180.000 |
| potassium_mg | 238.073 | 350.000 | 250.000 |
| protein_g | 9.833 | 12.000 | 6.000 |
| saturated_fat_g | 7.168 | 6.000 | 3.000 |
| sodium_mg | 921.169 | 750.000 | 350.000 |
| total_sugars_g | 1.385 | 4.000 | 2.000 |
- qwen3.7-flash-2026-07-15: ok; components=[{'name': 'Romaine lettuce', 'mass_g': 160}, {'name': 'Croutons', 'mass_g': 40}, {'name': 'Caesar dressing', 'mass_g': 60}, {'name': 'Parmesan cheese', 'mass_g': 20}]; limitations=['Dressing composition and quantity are visually estimated, affecting fat and sodium accuracy.', 'Cheese and crouton masses are approximate based on visible distribution.', 'No label information available to verify specific ingredient brands or processing.'].
- qwen3.8-max: ok; components=[{'name': 'romaine lettuce', 'mass_g': 140.0}, {'name': 'croutons', 'mass_g': 20.0}, {'name': 'parmesan cheese', 'mass_g': 10.0}, {'name': 'caesar dressing', 'mass_g': 10.0}]; limitations=['Dressing amount and composition are estimated visually.', 'Crouton and cheese masses are approximate due to partial visibility.', 'Sodium and sugar content depend on specific dressing formulation.'].

### Telur orak-arik, cheddar, tortilla gandum

| Zat | Referensi | Flash | Max |
| --- | ---: | ---: | ---: |
| calcium_mg | 351.700 | 65.000 | 180.000 |
| carbohydrate_g | 23.503 | 28.000 | 22.000 |
| cholesterol_mg | 396.630 | 185.000 | 280.000 |
| energy_kcal | 383.260 | 285.000 | 310.000 |
| fat_g | 21.560 | 9.500 | 16.000 |
| fiber_g | 4.410 | 3.500 | 3.000 |
| mass_g | 182.000 | 135.000 | 145.000 |
| potassium_mg | 315.980 | 240.000 | 250.000 |
| protein_g | 22.813 | 14.500 | 18.000 |
| saturated_fat_g | 9.674 | 3.200 | 6.000 |
| sodium_mg | 815.290 | 380.000 | 420.000 |
| total_sugars_g | 3.124 | 1.500 | 2.000 |
- qwen3.7-flash-2026-07-15: ok; components=[{'name': 'Whole wheat tortilla', 'mass_g': 60.0}, {'name': 'Scrambled eggs', 'mass_g': 75.0}]; limitations=['Sodium and fat content are estimates as cooking oils or added salt are not visually quantifiable.', 'Egg mass is estimated based on volume displacement and typical density; actual water content varies.', 'Tortilla composition (exact flour blend/added fats) is assumed standard whole wheat.'].
- qwen3.8-max: ok; components=[{'name': 'whole wheat tortilla', 'mass_g': 60.0}, {'name': 'scrambled eggs', 'mass_g': 70.0}, {'name': 'melted cheese', 'mass_g': 15.0}]; limitations=['Masses and nutrients are visual estimates with inherent uncertainty.', 'Sodium and sugar content cannot be precisely determined from the image.', 'Cheese type and egg preparation method affect nutrient values.'].

### Kopi dengan susu 2%

| Zat | Referensi | Flash | Max |
| --- | ---: | ---: | ---: |
| calcium_mg | 43.800 | 120.000 | 60.000 |
| carbohydrate_g | 1.464 | 8.000 | 3.000 |
| cholesterol_mg | 2.440 | 5.000 | 5.000 |
| energy_kcal | 18.850 | 75.000 | 30.000 |
| fat_g | 0.676 | 2.500 | 1.000 |
| fiber_g | 0.000 | 0.000 | 0.000 |
| mass_g | 390.500 | 265.000 | 250.000 |
| potassium_mg | 219.100 | 220.000 | 150.000 |
| protein_g | 1.438 | 4.500 | 1.500 |
| saturated_fat_g | 0.391 | 1.200 | 0.600 |
| sodium_mg | 21.535 | 60.000 | 40.000 |
| total_sugars_g | 1.543 | 8.000 | 2.500 |
- qwen3.7-flash-2026-07-15: ok; components=[{'name': 'Coffee with milk', 'mass_g': 265.0}]; limitations=['Exact milk-to-coffee ratio is visually indistinguishable.', 'Added sugar content cannot be verified from appearance.', 'Volume estimated based on standard mug geometry and liquid level.'].
- qwen3.8-max: ok; components=[{'name': 'coffee with milk', 'mass_g': 250}]; limitations=['Milk-to-coffee ratio is visually estimated.', 'Added sugar or sweetener cannot be confirmed from the image.', 'Nutrient values are approximate and depend on exact ingredients.'].

### Quinoa, paprika, bawang, bayam, sosis ayam/kalkun

| Zat | Referensi | Flash | Max |
| --- | ---: | ---: | ---: |
| calcium_mg | 99.305 | 65.000 | 90.000 |
| carbohydrate_g | 37.535 | 75.000 | 62.000 |
| cholesterol_mg | 14.500 | 45.000 | 45.000 |
| energy_kcal | 270.820 | 780.000 | 580.000 |
| fat_g | 8.769 | 32.000 | 22.000 |
| fiber_g | 5.717 | 8.000 | 7.000 |
| mass_g | 280.000 | 480.000 | 420.000 |
| potassium_mg | 605.645 | 720.000 | 620.000 |
| protein_g | 11.960 | 38.000 | 24.000 |
| saturated_fat_g | 1.531 | 9.000 | 7.000 |
| sodium_mg | 718.570 | 950.000 | 750.000 |
| total_sugars_g | 4.187 | 6.000 | 4.000 |
- qwen3.7-flash-2026-07-15: ok; components=[{'name': 'Cooked quinoa', 'mass_g': 220}, {'name': 'Sausage (cooked, sliced)', 'mass_g': 140}, {'name': 'Spinach (cooked)', 'mass_g': 60}, {'name': 'Carrots (cooked, diced)', 'mass_g': 40}]; limitations=['Sodium content is highly variable based on sausage seasoning and cooking liquid not visible in photo.', 'Estimated mass assumes standard density for cooked grains and meat; oil absorption by spinach/quinoa is unquantifiable visually.', 'Container diameter estimated from visual proportions relative to the scale card.'].
- qwen3.8-max: ok; components=[{'name': 'cooked quinoa', 'mass_g': 280}, {'name': 'sausage slices', 'mass_g': 90}, {'name': 'spinach', 'mass_g': 35}, {'name': 'red bell pepper', 'mass_g': 15}]; limitations=['Sausage type and fat content unknown', 'Cooking oil amount not visible', 'Exact vegetable masses estimated visually'].

## Reproduksi

```sh
python3 experiments/model-evaluation/scripts/run_extended_nutrients.py --prepare-only
CUDA_VISIBLE_DEVICES='' python3 experiments/model-evaluation/scripts/run_extended_nutrients.py
# --resume melewati sukses/error yang sudah tercatat; tidak memperbaiki output/retry invalid JSON.
python3 experiments/model-evaluation/scripts/run_extended_nutrients.py --report-only
```

Manifest mengunci SHA foto before/after, sumber CSV dan nomor baris serta satuan kolom. study.json mengunci prompt, schema dan kontrol sebelum inference. Per model tersimpan request tersanitasi, raw response dan prediction; comparison.json menyimpan seluruh pasangan referensi/prediksi serta bias dan coverage.
Prompt/schema diperluas dari A1V1 sebelumnya untuk zat tambahan. Skor ini tidak dibandingkan langsung dengan benchmark Nutrition5k/LeFood atau dianggap ukuran akurasi makanan Indonesia. Sampel kecil dan sudah menjadi publik; overlap pretraining tidak diketahui. Tidak ada perubahan kontrak/default produksi. Kode/laporan belum di-commit.

## Verifikasi dan handoff

Audit offline (`control-audit.json`): 8 request aktual; setiap model 4/4 valid, satu attempt per foto. Model, prompt, schema, SHA gambar, temperature, thinking, max_tokens dan tidak adanya fallback telah diperiksa. Seluruh 12 MAE dihitung ulang langsung dari raw response dan source CSV; token dijumlah ulang. Tidak ada inference tambahan saat audit.
Unit test terkait: `python3 -m unittest discover -s experiments/model-evaluation/tests -p test_extended_nutrients.py -q`. Meliputi missing/null, satuan dan basis total, nilai negatif/boolean/string yang tidak valid, serta schema/nonfood.
Langkah berikutnya: dataset lebih beragam dan referensi resep/porsi lebih kuat, termasuk hidangan tinggi gula dan sumber natrium yang terdokumentasi. Worktree: perubahan eksperimen ini belum di-commit; raw data, credential dan hasil per-request tetap di folder lokal yang di-ignore.
