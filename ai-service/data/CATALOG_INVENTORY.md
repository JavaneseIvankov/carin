# Inventaris katalog makanan — 15 Oktober 2026

Status: **189 kandidat draft**, belum dipublikasikan atau dimuat ke service/DB.
Ketujuh kolom kini terisi, termasuk **155 estimasi baru**. Lihat
[NUTRIENT_COMPLETION.md](NUTRIENT_COMPLETION.md) untuk jenis, metode, sumber dan batasnya.
Ini kumpulan komposisi gizi, bukan dataset foto, label hasil deteksi, atau bukti
akurasi estimasi porsi. Evaluasi VLM tidak dijalankan sesuai permintaan.

## Cakupan dan sumber

| Kelompok sumber | Jumlah | Contoh cakupan |
| --- | ---: | --- |
| SMILING Indonesia 2013, di-host FAO | 32 | nasi/bubur, nasi goreng/uduk, tahu/tempe, ikan, ayam, soto, sayur |
| Bapanas TKPSI | 19 | beras mentah, kedelai, ikan segar, sayur, buah, umbi |
| USDA FNDDS — western | 55 | burger sapi/ayam/ikan/veggie, fries, pizza, pasta, lasagna, pastry |
| USDA FNDDS — mi dan Asia | 21 | mi matang/beras, lo mein, ramen bowl, sushi, kimchi |
| MEXT Jepang | 38 | udon, soba, chuka, mi instan, yakisoba, karaage, gyoza, kari |
| MFDS Korea | 24 | jajangmyeon, jjamppong, japchae, naengmyeon, ramyeon, tteokbokki, ramen Jepang |

Kelompok di atas mengikuti sumber/seleksi, bukan pembagian kewarganegaraan menu.
MEXT juga memuat satu namul Korea; MFDS memuat empat ramen dan satu udon gaya Jepang.

- **USDA ARS / FNDDS 2021–2023:** tabel resmi untuk survei konsumsi AS; kode makanan dan varian resep terjaga. [Unduhan resmi](https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/food-surveys-research-group/docs/fndds-download-databases). [Metadata dan U.S. Public Domain](https://agdatacommons.nal.usda.gov/articles/dataset/Food_and_Nutrient_Database_for_Dietary_Studies_FNDDS_/24660933). Data FDC termasuk FNDDS disebut CC0 oleh [USDA](https://fdc.nal.usda.gov/api-guide/). Tidak memakai API key.
- **MEXT:** 日本食品標準成分表（八訂）増補2023年, workbook revisi 27 Maret 2026; per 100 g bagian yang dapat dimakan. [Tabel resmi](https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html). [Izin penggunaan dan atribusi](https://www.mext.go.jp/a_menu/syokuhinseibun/index.htm): 日本食品標準成分表（八訂）増補2023年から引用.
- **MFDS K-FIND:** [portal resmi Korea](https://various.foodsafetykorea.go.kr/nutrient/). Yang diambil adalah halaman detail berkode makanan, region ZZ dan month AVG, basis 100g. Seluruh 24 halaman mencantumkan metode analisis; tanggal pembuatan data 2012–2022, tanggal acuan 2026-08-28. Tanggal acuan baru tidak berarti semuanya dianalisis ulang pada 2026. [Kebijakan hak cipta](https://www.mfds.go.kr/wpge/m_34/de010803l001.do) membedakan karya milik MFDS dan hak pihak lain; izin item spesifik masih perlu dikonfirmasi, tidak diasumsikan CC0.
- **SMILING Indonesia:** [XLSX resmi FAO](https://www.fao.org/fileadmin/templates/food_composition/documents/FCT_SMILING_PROJECT_ASIA/D3_5a_SMILING_FCT_Indonesia_070813_protected.xlsx). Tabel kompilasi, sebagian sumber historis; beberapa resep berlabel Nutrisurvey belum memiliki bibliografi lengkap. Free access tidak sama dengan izin redistribusi yang eksplisit.
- **Bapanas:** [TKPSI resmi](https://badanpangan.go.id/tabel-komposisi-pangan-segar-indonesia). Komoditas segar, bukan resep restoran; tanggal sampel dan faktor edible portion tidak tercantum pada halaman. Izin penggunaan ulang belum ditemukan.

## Satuan, definisi, dan batas penggunaan

Semua angka katalog adalah per 100 gram sesuai basis masing-masing sumber;
energi kcal, natrium mg, nutrien lain g. Nilai yang tidak tersedia pada sumber awal dilengkapi melalui ledger;
estimasi tidak diperlakukan sebagai hasil ukur.
`0` hanya dipertahankan jika sumber menuliskannya sebagai angka nol; bukan bukti
bahwa suatu komponen pasti tidak mengandung zat tersebut.

**Karbohidrat belum seragam antar-sumber:** SMILING/TKPSI memakai available
carbohydrate; MEXT memakai CHOAVL dalam massa; FNDDS dan MFDS memakai karbohidrat
yang dilaporkan sumber (total untuk FNDDS). Jangan menggunakan campuran ini sebagai
metrik karbohidrat yang definisinya identik sebelum policy harmonisasi disepakati.
Tujuh isian baru available carbohydrate dihitung dari total minus serat pada
bahan pembanding, dengan label estimasi dan input tercatat. Nilai awal tidak diubah.
Energi SMILING dihitung oleh tabel dari makro dan serat; energi sumber tambahan
disalin, bukan dihitung ulang agar cocok dengan rumus 4/4/9.

MEXT memberi sebagian angka dalam tanda kurung sebagai estimasi; angkanya tetap
dapat ditelusuri melalui `raw` dalam snapshot. `Tr`/nilai hilang tidak menjadi nol.
Tabel utama MEXT tidak menyediakan gula total. Nilai gula pelengkap dari tabel
komponen atau makanan pembanding diberi tanda estimasi.

Mi mentah/kering, mi matang tanpa kuah, dan hidangan lengkap berkuah memiliki ID
berbeda. Kari dan isian donburi MEXT tidak termasuk nasi; mi chuka rebus bukan
semangkuk ramen. Kuah yang ditinggalkan memiliki entri terpisah bila sumber
menyediakannya. Saus, minyak, topping, ketebalan pizza, dan resep restoran Indonesia
bisa berbeda dari rujukan AS/Jepang/Korea. Tidak ada klaim kesetaraan merek/menu,
halal, bebas alergen, atau anjuran porsi dari nama makanan.

Empat kandidat Korea dikeluarkan karena halaman detail memakai **100mL**:
jjamppong generik D403-172000000-0001, jjolmyeon D403-173000000-0001,
janchi guksu D403-169000000-0001, dan dakgangjeong D412-587000000-0001.
Tidak ada massa jenis terukur untuk mengubahnya menjadi per100g. Jjamppong
seafood/tiram dengan basis 100g tersedia sebagai entri tersendiri.
Tidak ada takaran saji yang ditambahkan: total berat produk/menu bukan otomatis
porsi rujukan atau porsi yang dianjurkan.

## Kelengkapan nutrien

Jumlah entri yang memiliki nilai; ini cakupan data, bukan akurasi prediksi.

| Nutrien | Ada nilai | Kosong | Estimasi tambahan |
| --- | ---: | ---: | ---: |
| energyKcal | 189 | 0 | 19 |
| carbohydrateG | 189 | 0 | 7 |
| proteinG | 189 | 0 | 0 |
| fatG | 189 | 0 | 0 |
| fiberG | 189 | 0 | 7 |
| sugarsG | 189 | 0 | 89 |
| sodiumMg | 189 | 0 | 33 |

## Berkas dan reproduksi

- `catalog.json`: nilai per100g, nama/alias/preparation, ID makanan dan sumber per nutrien.
- `nutrition-dataset.json`: sumber per baris, URL, itemRef, basis dan izin penggunaan.
- `import/selection.json`: seleksi eksplisit kode makanan, terjemahan nama dan label asli.
- `import/selected-source-rows.json`: sel sumber sebelum normalisasi, lokasi baris, metadata, SHA-256 berkas/halaman yang diunduh.
- `import/excluded-rows.json`: kandidat yang tidak aman dikonversi ke basis massa.
- `import/nutrient-completions.json`: ledger 173 pelengkap, label estimasi dan bukti sumber.
- `review-metadata.json`: seluruhnya draft; tidak ada approval otomatis.

Dari folder `ai-service`, bangun ulang tanpa jaringan dari snapshot terpilih:

```sh
rtk uv run python scripts/import_food_expansion.py
```

Untuk ekstraksi ulang dari sumber resmi (perlu jaringan, openpyxl, dan cache lokal):

```sh
rtk uv run --with openpyxl python scripts/import_food_expansion.py --extract --cache-dir /tmp/food-sources
```

Ekstraksi memeriksa label kode makanan, header kolom workbook, satuan dan basis
100g, lalu menyimpan snapshot baru. Cache di luar repo tidak ikut commit. SHA-256
merekam versi berkas yang benar-benar dibaca; bukan tanda tangan dari penerbit.
Perubahan snapshot perlu ditinjau ulang. Importer hanya berjalan pada bundle draft
dengan capability kosong, mempertahankan 51 ID Indonesia, dan tidak mengaktifkan
service/DB. Versi katalog `catalog-draft-0.4.0`, dataset
`nutrition-multicuisine-draft-0.3.0`; rule set kini berisi 35 definisi kebijakan draft nonaktif; lihat
[RULES_GUIDE.md](RULES_GUIDE.md).

## Daftar lengkap

Tanda `*` berarti estimasi tambahan; `†` berarti pelengkap rujukan kedua.
Jenis estimasi dan keterbatasannya tersedia dalam laporan pelengkapan. Kolom angka: per100g, E=kcal, C/P/F/serat/gula=g,
Na=mg. Sumber tepat tiap angka tersedia pada JSON dan metadata sumber.

### Indonesia — SMILING dan Bapanas

| ID | Makanan | E | C | P | F | Serat | Gula | Na |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| idn-mie-ayam | Mie ayam | 105.3 | 10.5 | 6.2 | 3.9 | 1.7 | 1.37* | 279† |
| idn-sop-daging-sapi | Sop daging sapi | 50.5 | 5.3 | 5.8 | 0.5 | 0.8 | 1.44* | 391† |
| idn-soto-daging-sapi | Soto daging sapi | 48.9 | 5.3 | 5.8 | 0.5 | 0 | 1.44* | 249* |
| idn-soto-ayam | Soto ayam | 106.8 | 8.7 | 7.4 | 4.6 | 0.5 | 2.37* | 249* |
| idn-mangga-gedong-gadung | Mangga gedong/gadung | 54.8 | 11.2 | 0.7 | 0.2 | 2.7 | 10.21* | 2* |
| idn-bubur-nasi | bubur nasi | 70.5 | 16 | 1.3 | 0.1 | 0.2 | 0.04* | 234* |
| idn-nasi-goreng | Nasi goreng | 178 | 24.6 | 2.6 | 7.4 | 1.3 | 0.47* | 361* |
| idn-nasi-tim | Nasi tim | 114 | 25.7 | 2.2 | 0.2 | 0.3 | 0.06* | 0† |
| idn-nasi-putih | Nasi putih | 173.9 | 39.8 | 3 | 0.3 | 0 | 0.07* | 1† |
| idn-nasi-uduk | Nasi uduk | 234.5 | 42 | 3.8 | 5.3 | 1.8 | 5.28* | 182* |
| idn-nasi-jagung-kering | nasi jagung | 373.7 | 82.7 | 5.5 | 0.1 | 10 | 0.71* | 35* |
| idn-kacang-tanah-tanpa-kulit | Kacang tanah tanpa kulit | 605 | 23.6 | 26.9 | 44.2 | 2.6 | 6.91* | 31† |
| idn-tempe-kedelai-murni | Tempe kedele murni | 219.2 | 13.5 | 20.8 | 8.8 | 1.4 | 3.28* | 9† |
| idn-tahu | Tahu | 89.3 | 0.8 | 10.9 | 4.7 | 0.1 | 0.27* | 2† |
| idn-tahu-goreng | Tahu goreng | 125.5 | 2.5 | 9.7 | 8.5 | 0.1 | 0.77* | 7† |
| idn-telur-ayam | Telur ayam | 149.6 | 0.7 | 12.4 | 10.8 | 0 | 0.36* | 142* |
| idn-ikan-mas-bumbu-kuning | ikan mas bumbu kuning | 223.1 | 2.9 | 16.7 | 15.7 | 1.7 | 1.12* | 351* |
| idn-ikan-mas-pepes | ikan mas pepes | 78.4 | 0 | 11.5 | 3.6 | 0 | 0* | 58* |
| idn-ikan-asin-asap | ikan asin/asap | 181.5 | 0 | 42 | 1.5 | 0 | 0* | 763* |
| idn-ikan-kembung-goreng-resep | ikan kembung goreng (resep) | 269.9 | 1.8 | 17.3 | 21.5 | 0 | 0.03* | 409* |
| idn-hati-ayam | Hati ayam | 260.9 | 1.6 | 27.4 | 16.1 | 0 | 0* | 1068† |
| idn-sayur-sop-ayam | sayur sop ayam | 72.8 | 3.4 | 5.9 | 3.8 | 0.7 | 0.93* | 249* |
| idn-daging-ayam | Daging ayam | 297.8 | 0 | 18.2 | 25 | 0 | 0* | 109† |
| idn-daging-ayam-goreng | Daging ayam goreng | 236.2 | 0.3 | 33.1 | 11.4 | 0 | 0* | 671* |
| idn-dendeng-sapi | Dendeng sapi | 301 | 0 | 55 | 9 | 0 | 0* | 1785* |
| idn-daging-sapi | Daging sapi | 201.2 | 0 | 18.8 | 14 | 0 | 0* | 105* |
| idn-ikan-teri | ikan teri | 70.2 | 4.1 | 10.3 | 1.4 | 0 | 0* | 554* |
| idn-ikan-pindang | ikan pindang | 331.4 | 1 | 21.1 | 27 | 0 | 0* | 379* |
| idn-bayam-rebus | Bayam rebus | 27.2 | 3.7 | 1.2 | 0.6 | 1.1 | 0.58* | 16† |
| idn-sayur-bayam | Sayur bayam | 17.8 | 1.9 | 1.5 | 0.2 | 1.2 | 0.3* | 262* |
| idn-tumis-bayam | Tumis bayam | 71.5 | 0.9 | 0.7 | 7.1 | 0.6 | 0.14* | 254* |
| idn-tumis-kangkung | Tumis Kangkung | 103.4 | 2 | 2.2 | 9.2 | 1.9 | 0.32* | 254* |
| tkpsi-beras-mentah | Beras | 351.01* | 76.29 | 9.24 | 0.19 | 3.59 | 0.11* | 34* |
| tkpsi-jagung-segar | Jagung Segar | 88.47* | 9.86 | 4.08 | 2.47 | 5.24 | 3.3* | 5* |
| tkpsi-kentang | Kentang | 74.16* | 15.51 | 2.05 | 0.02 | 1.87 | 0.73* | 7† |
| tkpsi-ubi-jalar | Ubi Jalar | 103.94* | 20.24 | 2.09 | 0.78 | 3.8 | 4.2* | 3* |
| tkpsi-talas | Talas | 113.39* | 19.64 | 4.91 | 0.17 | 6.83 | 0.3* | 6* |
| tkpsi-sagu | Sagu | 340.95* | 83.13 | 0.32 | 0.25 | 2.45 | 3.14* | 1* |
| tkpsi-ikan-lele | Ikan Lele | 154.23* | 0* | 16.17 | 9.95 | 0* | 0* | 98* |
| tkpsi-ikan-bandeng | Ikan Bandeng | 136.67* | 0* | 21.59 | 5.59 | 0* | 0* | 67† |
| tkpsi-ikan-mujair | Ikan Mujair | 76.99* | 0* | 18.46 | 0.35 | 0* | 0* | 51† |
| tkpsi-ikan-tongkol | Ikan Tongkol | 99.42* | 0* | 23.91 | 0.42 | 0* | 0* | 202* |
| tkpsi-ikan-kembung | Ikan Kembung | 126.26* | 0* | 22.16 | 4.18 | 0* | 0* | 214* |
| tkpsi-ikan-tuna | Ikan Tuna | 105.47* | 0* | 25.76 | 0.27 | 0* | 0* | 45* |
| tkpsi-tomat | Tomat | 18.1* | 2.54 | 0.97 | 0.02 | 1.94 | 1.72* | 10† |
| tkpsi-bayam-segar | Bayam | 29.29* | 1.72 | 2.11 | 0.55 | 4.51 | 0.2* | 16* |
| tkpsi-kangkung-segar | Kangkung | 19.33* | 1.03* | 2.19 | 0.25 | 2.1* | 0.12* | 65† |
| tkpsi-wortel | Wortel | 30.33* | 5.57 | 0.16 | 0.05 | 3.48 | 2.76* | 70† |
| tkpsi-kacang-kedelai | Kacang Kedelai | 346.78* | 9.2 | 33.22 | 13.26 | 28.88 | 2.24* | 210* |
| tkpsi-pisang | Pisang | 92.43* | 19.47 | 1.68 | 0.03 | 3.78 | 10.43* | 10* |
| tkpsi-pepaya | Pepaya | 39.02* | 7.5 | 0.97 | 0.02 | 2.48 | 5.42* | 4† |

### Western — USDA FNDDS

| ID | Makanan | E | C | P | F | Serat | Gula | Na |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fndds-27510531 | Burger sapi fast food, 1 patty kecil | 285 | 28.27 | 15.51 | 11.68 | 1 | 4.11 | 396 |
| fndds-27510601 | Burger sapi fast food, 1 patty sedang | 288 | 20.68 | 17.51 | 14.38 | 0.7 | 3 | 355 |
| fndds-27510605 | Burger sapi fast food, 1 patty besar | 289 | 17.12 | 18.43 | 15.63 | 0.6 | 2.49 | 351 |
| fndds-27510661 | Double burger sapi fast food, 2 patty kecil | 288 | 19.68 | 17.76 | 14.73 | 0.7 | 2.86 | 357 |
| fndds-27510160 | Cheeseburger fast food, 1 patty kecil | 299 | 23.96 | 16.42 | 14.78 | 0.8 | 3.86 | 510 |
| fndds-27510215 | Cheeseburger fast food, 1 patty sedang | 296 | 18.71 | 17.87 | 16.15 | 0.6 | 2.98 | 438 |
| fndds-27510371 | Double cheeseburger fast food, 2 patty kecil | 297 | 17.68 | 18.12 | 16.6 | 0.6 | 2.85 | 447 |
| fndds-27540146 | Burger ayam fillet goreng fast food | 281 | 27.48 | 12.17 | 13.46 | 1.7 | 3.07 | 571 |
| fndds-27540152 | Burger ayam fillet panggang fast food | 226 | 19.4 | 21.5 | 6.18 | 0.7 | 2.82 | 430 |
| fndds-27550000 | Burger ikan goreng fast food | 235 | 25.7 | 14.46 | 8.15 | 0.9 | 3.13 | 462 |
| fndds-41901010 | Burger sayuran dengan roti | 224 | 30.82 | 12.96 | 5.2 | 3.5 | 3.94 | 534 |
| fndds-41901020 | Burger sayuran dengan roti dan keju | 243 | 27.23 | 14 | 8.43 | 3 | 3.78 | 600 |
| fndds-27564060 | Hot dog sapi dengan roti putih | 296 | 23.73 | 10.85 | 17.37 | 0.8 | 3.92 | 681 |
| fndds-24198731 | Chicken nuggets fast food | 307 | 14.93 | 15.92 | 20.36 | 0.9 | 0.08 | 594 |
| fndds-71401030 | French fries fast food | 312 | 41.44 | 3.43 | 14.73 | 3.8 | 0.3 | 210 |
| fndds-71401031 | French fries restoran | 289 | 37.2 | 3.49 | 14.04 | 3.9 | 0.28 | 357 |
| fndds-71401010 | Kentang segar digoreng | 198 | 18.5 | 1.93 | 13.1 | 1.6 | 1.25 | 141 |
| fndds-71401020 | Kentang beku dipanggang | 158 | 25.55 | 2.75 | 5.48 | 2 | 0.37 | 324 |
| fndds-71401039 | French fries dengan keju, fast food atau restoran | 260 | 29.76 | 3.33 | 14.22 | 2.6 | 0.3 | 365 |
| fndds-71401050 | French fries dengan chili dan keju, fast food atau restoran | 221 | 24.87 | 4.66 | 11.42 | 2.7 | 0.59 | 363 |
| fndds-58106220 | Pizza keju restoran, thin crust | 266 | 33.33 | 11.39 | 9.69 | 2.3 | 3.58 | 540 |
| fndds-58106225 | Pizza keju restoran, medium crust | 266 | 33.33 | 11.39 | 9.69 | 2.3 | 3.58 | 540 |
| fndds-58106230 | Pizza keju restoran, thick crust | 271 | 33.17 | 10.81 | 10.54 | 2.2 | 3.34 | 540 |
| fndds-58106233 | Pizza keju stuffed crust | 274 | 30 | 12.23 | 11.63 | 1.7 | 2.9 | 615 |
| fndds-58106320 | Pizza keju dan sayuran restoran, thin crust | 234 | 29.86 | 9.96 | 8.37 | 2.2 | 3.63 | 465 |
| fndds-58106325 | Pizza keju dan sayuran restoran, medium crust | 242 | 30.71 | 10.31 | 8.69 | 2.2 | 3.62 | 484 |
| fndds-58106550 | Pizza pepperoni restoran, thin crust | 282 | 31.98 | 11.74 | 11.91 | 2.3 | 3.26 | 620 |
| fndds-58106555 | Pizza pepperoni restoran, medium crust | 282 | 31.98 | 11.74 | 11.91 | 2.3 | 3.26 | 620 |
| fndds-58106560 | Pizza pepperoni restoran, thick crust | 287 | 31.84 | 11.49 | 12.58 | 2.2 | 2.93 | 620 |
| fndds-58106620 | Pizza daging selain pepperoni restoran, thin crust | 280 | 30.62 | 11.5 | 12.35 | 2.3 | 3.32 | 570 |
| fndds-58106625 | Pizza daging selain pepperoni restoran, medium crust | 280 | 30.62 | 11.5 | 12.35 | 2.3 | 3.32 | 570 |
| fndds-58106720 | Pizza daging dan sayuran restoran, thin crust | 241 | 26.62 | 11.55 | 9.87 | 1.9 | 3.29 | 464 |
| fndds-58106725 | Pizza daging dan sayuran restoran, medium crust | 248 | 28.38 | 11.5 | 9.83 | 2 | 3.37 | 484 |
| fndds-58109015 | Pizza keju gandum utuh, thin crust | 267 | 28.62 | 11.77 | 12.38 | 3.5 | 3.59 | 543 |
| fndds-58109100 | Pizza keju gluten-free, thin crust | 264 | 26.53 | 8.73 | 13.62 | 2.5 | 3.2 | 485 |
| fndds-56130000 | Pasta matang tanpa saus | 157 | 30.68 | 5.76 | 0.92 | 1.8 | 0.56 | 232 |
| fndds-56132990 | Pasta gandum utuh matang tanpa saus | 148 | 29.89 | 5.95 | 1.7 | 3.9 | 0.75 | 235 |
| fndds-58146221 | Pasta saus tomat, restoran | 160 | 18.41 | 3.41 | 7.97 | 1.7 | 2.72 | 387 |
| fndds-58146321 | Pasta saus tomat dan daging, restoran | 178 | 17.74 | 5.43 | 9.25 | 1.5 | 2.26 | 383 |
| fndds-58146341 | Pasta saus tomat dan unggas, restoran | 171 | 17.74 | 5.59 | 8.47 | 1.5 | 2.26 | 382 |
| fndds-58146361 | Pasta saus tomat dan seafood, restoran | 166 | 17.98 | 5.16 | 7.97 | 1.5 | 2.26 | 393 |
| fndds-58146381 | Pasta saus krim, restoran | 204 | 15.56 | 3.72 | 13.95 | 0.9 | 0.67 | 577 |
| fndds-58146401 | Pasta saus krim dan daging, restoran | 213 | 15.41 | 5.67 | 14.1 | 0.9 | 0.59 | 562 |
| fndds-58146421 | Pasta saus krim dan unggas, restoran | 206 | 15.41 | 5.83 | 13.33 | 0.9 | 0.59 | 561 |
| fndds-58146441 | Pasta saus krim dan seafood, restoran | 202 | 15.66 | 5.4 | 12.82 | 0.9 | 0.59 | 572 |
| fndds-58145111 | Macaroni and cheese, restoran | 151 | 18.8 | 5.42 | 6.06 | 1.1 | 3.09 | 361 |
| fndds-58130014 | Lasagna daging, restoran | 185 | 11.36 | 10.83 | 10.69 | 1.5 | 3.15 | 466 |
| fndds-58130310 | Lasagna tanpa daging | 130 | 13.84 | 6.54 | 5.33 | 1.7 | 4.23 | 284 |
| fndds-51166000 | Croissant polos | 406 | 45.8 | 8.2 | 21 | 2.6 | 11.26 | 300 |
| fndds-51166200 | Croissant cokelat | 421 | 49.4 | 7.4 | 22.79 | 3.3 | 19.87 | 242 |
| fndds-53520100 | Donat tipe cake polos | 434 | 47.06 | 5.31 | 24.93 | 1.7 | 18.15 | 477 |
| fndds-53521110 | Donat tipe yeast | 421 | 47.93 | 6.14 | 22.7 | 2.1 | 22.75 | 316 |
| fndds-55100050 | Pancake polos, fast food atau restoran | 307 | 34.14 | 7.16 | 15.48 | 2.1 | 6.81 | 544 |
| fndds-55200100 | Waffle polos, fast food atau restoran | 428 | 38.92 | 8.16 | 26.36 | 2.4 | 7.77 | 620 |
| fndds-55300050 | French toast, fast food atau restoran | 310 | 35.71 | 9.84 | 14.3 | 1.3 | 10.08 | 357 |

### Mi dan makanan Asia — USDA FNDDS

| ID | Makanan | E | C | P | F | Serat | Gula | Na |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fndds-56112000 | Mi matang tanpa saus | 137 | 25.01 | 4.51 | 2.06 | 1.2 | 0.4 | 236 |
| fndds-56113000 | Mi gandum utuh matang tanpa saus | 148 | 29.91 | 5.96 | 1.7 | 3.9 | 0.75 | 210 |
| fndds-56117090 | Mi beras matang tanpa saus | 107 | 23.87 | 1.78 | 0.2 | 1 | 0.03 | 250 |
| fndds-58136120 | Lo mein tanpa daging | 121 | 20.16 | 4.77 | 2.35 | 1.3 | 2.63 | 430 |
| fndds-58136130 | Lo mein udang | 121 | 16.24 | 8.56 | 2.21 | 1 | 2.08 | 363 |
| fndds-58136150 | Lo mein sapi | 129 | 16.18 | 9.73 | 2.77 | 1 | 2.11 | 358 |
| fndds-58136160 | Lo mein ayam | 130 | 16.15 | 9.15 | 3.15 | 1 | 2.11 | 413 |
| fndds-58407034 | Ramen bowl, komposisi tidak dirinci (rujukan AS) | 127 | 13.95 | 7.13 | 4.57 | 0.9 | 0.42 | 333 |
| fndds-58407038 | Ramen bowl dengan sapi (rujukan AS) | 137 | 15.4 | 6.81 | 5.19 | 1 | 0.44 | 353 |
| fndds-58407042 | Ramen bowl dengan ayam (rujukan AS) | 126 | 15.4 | 7.04 | 3.86 | 1 | 0.44 | 354 |
| fndds-58407046 | Ramen bowl dengan ikan (rujukan AS) | 112 | 15.4 | 5.78 | 2.87 | 1 | 0.44 | 359 |
| fndds-58407052 | Ramen bowl vegetarian (rujukan AS) | 108 | 15.57 | 4.01 | 3.33 | 1.1 | 0.54 | 344 |
| fndds-58407056 | Ramen bowl dengan daging dan telur (rujukan AS) | 127 | 13.95 | 7.13 | 4.57 | 0.9 | 0.42 | 333 |
| fndds-58151180 | Sushi roll California (rujukan AS) | 94 | 18.39 | 2.92 | 0.67 | 1 | 2.13 | 428 |
| fndds-58151200 | Sushi roll salmon (rujukan AS) | 103 | 15.3 | 6.88 | 1.28 | 0.7 | 0.92 | 350 |
| fndds-58151220 | Sushi roll tuna (rujukan AS) | 97 | 15.3 | 7.4 | 0.26 | 0.7 | 0.92 | 342 |
| fndds-58151230 | Sushi roll sayuran (rujukan AS) | 93 | 17.65 | 1.8 | 1.47 | 1.4 | 1.21 | 361 |
| fndds-58151420 | Sushi topping salmon (rujukan AS) | 107 | 13.39 | 8.92 | 1.74 | 0.6 | 0.8 | 317 |
| fndds-58151440 | Sushi topping tuna (rujukan AS) | 100 | 13.39 | 9.66 | 0.29 | 0.6 | 0.8 | 306 |
| fndds-58151450 | Sushi topping telur (rujukan AS) | 119 | 10.25 | 7.32 | 5.23 | 0.4 | 0.69 | 338 |
| fndds-75502520 | Kimchi (rujukan AS) | 15 | 2.4 | 1.1 | 0.5 | 1.6 | 1.06 | 498 |

### Jepang dan menu lain — MEXT

| ID | Makanan | E | C | P | F | Serat | Gula | Na |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mext-01038 | Udon segar mentah | 249 | 50.1 | 6.1 | 0.6 | 3.6 | 2* | 1000 |
| mext-01039 | Udon segar direbus, tanpa kuah | 95 | 19.5 | 2.6 | 0.4 | 1.3 | 0.3* | 120 |
| mext-01041 | Udon kering, belum dimasak | 333 | 69.9 | 8.5 | 1.1 | 2.4 | 0.3* | 1700 |
| mext-01042 | Udon dari mi kering, direbus tanpa kuah | 117 | 24.2 | 3.1 | 0.5 | 0.7 | 0.1* | 210 |
| mext-01044 | Somen atau hiyamugi direbus, tanpa kuah | 114 | 23.3 | 3.5 | 0.4 | 0.9 | 0.4* | 85 |
| mext-01047 | Mi chuka mentah, bahan mi ramen | 249 | 47.6 | 8.6 | 1.2 | 5.4 | 1* | 410 |
| mext-01048 | Mi chuka direbus, tanpa kuah atau topping ramen | 133 | 25.2 | 4.9 | 0.6 | 2.8 | 0.1* | 70 |
| mext-01049 | Mi chuka dikukus, tanpa saus | 162 | 30.6 | 4.9 | 1.7 | 3.1 | 0.3* | 110 |
| mext-01188 | Mi chuka kukus ditumis | 211 | 35.9 | 5.2 | 4.9 | 3.6 | 0.4* | 130 |
| mext-01053 | Okinawa soba direbus, tanpa kuah | 132 | 24.8 | 5.2 | 0.8 | 1.5 | 0.1* | 170 |
| mext-01127 | Soba segar mentah | 271 | 51.3 | 9.8 | 1.9 | 6 | 0.4* | 1 |
| mext-01128 | Soba segar direbus, tanpa kuah | 130 | 24.5 | 4.8 | 1 | 2.9 | 0.2* | 2 |
| mext-01129 | Soba kering, belum dimasak | 344 | 65.9 | 14 | 2.3 | 3.7 | 0.5* | 850 |
| mext-01130 | Soba dari mi kering direbus, tanpa kuah | 113 | 21.5 | 4.8 | 0.7 | 1.5 | 0.1* | 50 |
| mext-01057 | Mi instan digoreng, kering beserta bumbu | 439 | 54.9 | 10.1 | 19.1 | 2.4 | 0.8* | 2200 |
| mext-01198 | Mi instan digoreng, dimasak beserta bumbu dan kuah | 100 | 12.2 | 2.3 | 4.4 | 0.5 | 0.1* | 430 |
| mext-01189 | Mi instan digoreng lalu direbus, tanpa bumbu | 189 | 26.1 | 3.9 | 7.7 | 2.6 | 0.4* | 150 |
| mext-01058 | Mi instan non-fried, kering beserta bumbu | 336 | 59.8 | 10.3 | 5.2 | 2.3 | 0.9* | 2700 |
| mext-01199 | Mi instan non-fried, dimasak beserta bumbu dan kuah | 93 | 15.8 | 3 | 0.8 | 0.6 | 0.3* | 430 |
| mext-01190 | Mi instan non-fried direbus, tanpa bumbu | 139 | 26.6 | 3.4 | 0.8 | 2.7 | 0.2* | 230 |
| mext-01201 | Mi cup shio goreng, siap makan beserta kuah | 92 | 3.5 | 2.5 | 4.2 | 1.3 | 0.3* | 520 |
| mext-01194 | Mi cup shio goreng, matang dengan kuah ditinggalkan | 175 | 22.7 | 3.8 | 7.7 | 2.2 | 0.5* | 440 |
| mext-01200 | Mi cup shoyu goreng, siap makan beserta kuah | 90 | 6 | 2.3 | 4.5 | 1.4 | 0.2* | 590 |
| mext-01192 | Mi cup shoyu goreng, matang dengan kuah ditinggalkan | 142 | 16.7 | 3 | 5.8 | 1.9 | 0.2* | 450 |
| mext-01060 | Yakisoba instan cup, kering beserta bumbu | 418 | 54.5 | 8.2 | 18.6 | 5.7 | 7.1* | 1500 |
| mext-01202 | Yakisoba instan cup, dimasak beserta bumbu | 222 | 13.5 | 5 | 11.3 | 3.3 | 1.7* | 910 |
| mext-18053 | Okonomiyaki siap saji | 136 | 12.9 | 5.2 | 6.5 | 2.6 | 2.8* | 310 |
| mext-18054 | Karaage ayam siap saji | 204 | 15.3 | 15.6 | 10.1 | 1.7 | 1.1* | 700 |
| mext-18040 | Kari ayam Jepang, saus dan isi tanpa nasi | 131 | 5.6 | 5.6 | 8.8 | 1.2 | 2.19* | 540 |
| mext-18001 | Kari sapi Jepang, saus dan isi tanpa nasi | 119 | 5.7 | 2.4 | 9 | 0.9 | 2.23* | 680 |
| mext-18018 | Korokke kentang siap saji | 226 | 23.2 | 5.3 | 12.6 | 2 | 1.56* | 280 |
| mext-18020 | Ebi fry siap saji | 236 | 20 | 15.9 | 11.6 | 1 | 0.32* | 340 |
| mext-18002 | Gyoza siap saji | 209 | 19.7 | 6.9 | 11.3 | 1.5 | 4.09* | 460 |
| mext-18012 | Shumai siap saji | 191 | 15.9 | 9.1 | 9.2 | 1.7 | 3.3* | 520 |
| mext-18030 | Isian oyakodon, tanpa nasi | 101 | 3 | 8.4 | 5.2 | 0.4 | 1.91* | 380 |
| mext-18031 | Isian gyumeshi atau gyudon, tanpa nasi | 122 | 4 | 4.1 | 9.4 | 1 | 1.59* | 400 |
| mext-10416 | Tempura udang vannamei | 194 | 6.5 | 20 | 10.3 | 0.9 | 0.4* | 140 |
| mext-18039 | Namul tauge (rujukan Jepang) | 70 | 2.5 | 3.1 | 4.5 | 2.7 | 1.16* | 510 |

### Korea dan ramen Jepang — MFDS

| ID | Makanan | E | C | P | F | Serat | Gula | Na |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mfds-d303-168000000-0001 | Jajangmyeon restoran | 123 | 20.56 | 3.04 | 3.13 | 3.3 | 1.2 | 368 |
| mfds-d303-168310000-0001 | Samseon jajangmyeon seafood restoran | 115 | 18.08 | 4.81 | 2.59 | 1.5 | 1.45 | 375 |
| mfds-d303-172310000-0001 | Samseon jjamppong seafood restoran | 74 | 11.3 | 4.4 | 1.2 | 0.9 | 0.12 | 299 |
| mfds-d303-144180000-0001 | Mul naengmyeon restoran | 66 | 13.12 | 1.99 | 0.63 | 0 | 2.52 | 347 |
| mfds-d303-144280000-0001 | Bibim naengmyeon restoran | 131 | 21.1 | 3.43 | 3.61 | 1.2 | 3.79 | 311 |
| mfds-d303-148140000-0001 | Ramyeon restoran | 84 | 14.44 | 1.76 | 2.18 | 0.8 | 0.11 | 306 |
| mfds-d303-148470000-0001 | Ramyeon keju restoran | 99 | 13.33 | 2.8 | 3.83 | 1.3 | 0.15 | 352 |
| mfds-d303-148050000-0001 | Ramyeon kimchi restoran | 85 | 13.26 | 2.12 | 2.6 | 1.3 | 0.18 | 389 |
| mfds-d303-174500000-0001 | Kalguksu seafood restoran | 70 | 13.77 | 2.53 | 0.51 | 5 | 0.42 | 262 |
| mfds-d110-492000000-0001 | Japchae rumahan | 146 | 24.26 | 4.71 | 3.3 | 3.7 | 0.73 | 360 |
| mfds-d110-467000000-0001 | Tteokbokki rumahan | 144 | 25.96 | 3.51 | 2.96 | 1 | 4.4 | 391 |
| mfds-d310-467330000-0001 | Tteokbokki keju restoran | 164 | 29.31 | 5.54 | 2.69 | 0.8 | 5.76 | 397 |
| mfds-d301-018000000-0002 | Bibimbap restoran | 142 | 22.5 | 4.47 | 3.81 | 1.4 | 3.04 | 317 |
| mfds-d101-007000000-0001 | Gimbap rumahan | 140 | 19.98 | 4.84 | 4.55 | 1.4 | 0 | 307 |
| mfds-d306-266000000-0001 | Kimchi jjigae restoran | 61 | 2.98 | 3.77 | 3.75 | 2.1 | 0.76 | 491 |
| mfds-d106-275000000-0001 | Doenjang jjigae rumahan | 46 | 4.44 | 3.38 | 1.63 | 1.6 | 0 | 318 |
| mfds-d303-151000000-0001 | Manduguk restoran | 62 | 6.83 | 3.06 | 2.49 | 4.6 | 0.44 | 338 |
| mfds-d303-146000000-0001 | Tteok manduguk restoran | 89 | 15.82 | 2.87 | 1.62 | 1.2 | 0.02 | 283 |
| mfds-d303-147110000-0001 | Tonkotsu ramen restoran (rujukan Korea) | 98 | 5.87 | 4.14 | 6.42 | 0.9 | 0.77 | 377 |
| mfds-d303-147210000-0001 | Miso ramen restoran (rujukan Korea) | 89 | 11.36 | 4.57 | 2.77 | 1.1 | 1.1 | 388 |
| mfds-d303-147330000-0001 | Shoyu ramen restoran (rujukan Korea) | 72 | 9.12 | 3.65 | 2.36 | 0.7 | 0.84 | 420 |
| mfds-d303-147340000-0001 | Shio ramen restoran (rujukan Korea) | 84 | 11.54 | 4.68 | 2.13 | 1.2 | 0.93 | 292 |
| mfds-d303-164400000-0001 | Udon kuah gaya Jepang restoran (rujukan Korea) | 60 | 10.6 | 1.91 | 1.13 | 2.9 | 0.35 | 341 |
| mfds-d303-172040000-0001 | Jjamppong tiram restoran | 76 | 12.85 | 3.65 | 1.07 | 1 | 0.19 | 296 |
