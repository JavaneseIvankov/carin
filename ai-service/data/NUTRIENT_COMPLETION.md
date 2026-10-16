# Pelengkapan nutrien katalog — 15 Oktober 2026

Status: **draft untuk eksperimen**, bukan hasil pengukuran makanan pengguna.
Seluruh 189 makanan kini memiliki tujuh nilai numerik. Dari **173 isian baru**,
18 merupakan pelengkap dari rujukan makanan sejenis dan **155 berlabel estimasi**.
Kelengkapan kolom tidak membuktikan ketepatan angka atau kesiapan personalisasi.
Seluruh 1.150 nilai awal dan source ID-nya dipertahankan.

## Sebelum dan sesudah

| Nutrien | Ada nilai sebelum | Ada nilai sekarang | Pelengkap rujukan baru | Estimasi baru |
| --- | ---: | ---: | ---: | ---: |
| energyKcal | 170 | 189 | 0 | 19 |
| carbohydrateG | 182 | 189 | 0 | 7 |
| proteinG | 189 | 189 | 0 | 0 |
| fatG | 189 | 189 | 0 | 0 |
| fiberG | 182 | 189 | 0 | 7 |
| sugarsG | 100 | 189 | 0 | 89 |
| sodiumMg | 138 | 189 | 18 | 33 |

## Sumber dan metode

1. **Panganku:** halaman komposisi gizi per100g bagian dapat dimakan, dengan kode
   makanan yang dikirim melalui form `view`, misalnya AP001 nasi, CP061 tahu,
   CP077 tempe dan AP085 mie ayam. Menambah 18 nilai natrium dengan kecocokan
   nama/cara saji yang memadai sebagai rujukan kedua. Varietas, spesies, potongan
   atau resep yang lebih spesifik dari nama katalog tetap ditandai proxy.
   [Panganku](https://www.panganku.org/id-ID/semua_nutrisi).
2. **USDA SR Legacy 2018 dan FNDDS 2021–2023:** tabel resmi pemerintah AS, U.S.
   Public Domain/CC0. Bahan mentah cocok ke bahan mentah; hidangan ke pembanding
   yang cara sajinya mendekati. Identitas kode, deskripsi asli, record nutrien,
   derivation ID/data points bila tersedia, dan SHA-256 unduhan dipertahankan.
   [Unduhan resmi](https://fdc.nal.usda.gov/download-datasets/).
3. **MEXT:** tabel komponen karbohidrat resmi 2023 dengan koreksi 27 Maret 2026.
   Pada 29 makanan Jepang, gula diperkirakan dari penjumlahan komponen yang
   terkuantifikasi: glukosa, fruktosa, galaktosa, sukrosa, maltosa dan laktosa.
   Ini sesuai daftar enam gula pada definisi NLEA USDA; pati, trehalosa dan poliol
   tidak disertakan. `Tr` atau komponen tidak tersedia **tetap tercatat belum
   terkuantifikasi**, tidak dinyatakan pasti nol. Karena jumlahnya belum lengkap,
   hasil ini **estimasi jumlah parsial**, yang bisa lebih rendah dari gula total.
   Sebagian input MEXT sendiri merupakan estimasi penerbit, disimpan dengan
   tanda kurung aslinya. [Tabel MEXT](https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html),
   [definisi gula USDA](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/).
4. **Estimasi gula dari pembanding (60 isian):**
   `karbohidrat target × gula pembanding / karbohidrat total pembanding`.
   Angka memakai proporsi yang dapat ditelusuri, bukan tebakan LLM. Namun definisi
   available versus total carbohydrate, fermentasi, kematangan, saus dan gula
   tambahan bisa mengubah proporsi ini secara besar. Jika pembanding mempunyai
   karbohidrat dan gula eksplisit nol, hasil nol tetap **estimasi**, bukan klaim
   bebas gula. Tempe memakai kedelai sebagai pembanding dan sagu memakai tapioka;
   keduanya merupakan proxy yang lemah dan perlu diganti ketika sumber tepat ada.
5. **Karbohidrat/serat (7 + 7 isian):** rujukan bahan mentah USDA; approximate
   available carbohydrate dihitung `karbohidrat total − serat`. Spesies ikan
   lokal dan kelompok USDA tidak selalu sama. Ini penambahan berlabel estimasi,
   tidak mengubah karbohidrat dari sumber awal.
6. **Energi (19 isian):** `4 × available carbohydrate + 4 × protein + 9 × lemak
   + 2 × serat`. Memakai makro TKPSI yang sudah ada dan estimasi pelengkap bila
   dibutuhkan. Rumus faktor energi bukan hasil kalorimetri dan tidak memakai
   faktor spesifik makanan atau koreksi alkohol/poliol/asam organik.
   [FAO: faktor energi pangan](https://www.fao.org/4/Y5022E/y5022e04.htm).
7. **Natrium pembanding (33 isian):** transfer nilai per100g dengan label
   `proxy_estimate`. Natrium sangat dipengaruhi garam dan saus; jangan menjadikan
   nilai proxy sebagai dasar klaim rendah natrium atau aman bagi suatu kondisi.

## Batas kualitas yang perlu ditinjau

- Rujukan kedua bukan pengukuran pada sampel yang sama dengan SMILING/TKPSI.
  Bahkan nama yang sesuai tidak menjamin resep, varietas dan kadar air sama.
- Panganku FR007 hati ayam melaporkan natrium **1.068 mg/100g**; USDA 171060
  melaporkan **71 mg/100g**. Katalog menyimpan angka Panganku sesuai sumber
  lokalnya, tetapi selisih besar ini **belum diputuskan benar/salah** dan perlu
  pemeriksaan primer sebelum digunakan. Kedua bukti disimpan dalam snapshot.
- Angka sumber asli pun tidak semuanya hasil assay langsung: kompilasi historis,
  estimasi penerbit MEXT dan nol yang dilaporkan sumber tetap memiliki batasnya.
  Hitungan 155 adalah estimasi **tambahan**, bukan seluruh estimasi yang mungkin
  terkandung di tabel sumber awal.
- Definisi karbohidrat lintas sumber masih berbeda sebagaimana dicatat pada
  inventaris. Angka gula sekarang berarti gula total/pendekatannya, **bukan gula
  tambahan atau gula bebas**, dan tidak boleh dijumlahkan lagi ke karbohidrat.
- Izin penggunaan Panganku/SMILING/TKPSI serta item MFDS masih memerlukan review;
  tidak ada persetujuan reviewer, aktivasi DB/API, atau capability claim baru.
- Tidak ada estimasi dari foto atau evaluasi VLM dalam pekerjaan ini.

## Reproduksi dan pemeriksaan

`import/nutrient-completions.json` adalah ledger seluruh 173 isian:
foodId, nutrient, value, method, estimated, evidenceId, inputs, limitations dan
source lengkap. Source yang merupakan estimasi memiliki judul `ESTIMATED — ...`
agar tetap terlihat pada proyeksi kontrak tanpa mengubah API bersama.

Dari folder `ai-service`, bangun ulang seluruh kandidat secara offline:

```sh
rtk uv run python scripts/import_food_expansion.py
```

Untuk mengekstrak ulang ledger, unduh dua workbook/ZIP dari URL resmi di script
serta simpan halaman Panganku sesuai kode. Halaman Panganku diperoleh dari form
pencarian/detail (`POST /id-ID/view`, field `haha` berisi kode makanan); ini akses
baca, tidak mengirim data profil pengguna. Cache lokal tidak masuk repository.

```sh
rtk uv run --with openpyxl python scripts/prepare_nutrient_completions.py \
  --sr-zip /tmp/usda-sr.zip \
  --fndds-xlsx /tmp/fndds-nutrients.xlsx \
  --mext-carbs-xlsx /tmp/mext-carbs.xlsx \
  --panganku-cache-dir /tmp/nutrient-completion
rtk uv run python scripts/import_food_expansion.py
```

Importer menolak menimpa nutrien rujukan yang sudah terisi, sumber tanpa bukti,
estimasi tanpa label, sel duplikat, dan nilai tidak valid. Versi katalog sekarang
`catalog-draft-0.4.0`, dataset `nutrition-multicuisine-draft-0.3.0`.

Pemeriksaan: 68 tes layanan/importer/gate lulus; validasi artifact dan kontrak
lulus; seluruh 1.150 nilai awal/source ID tetap; build offline byte-identical;
tidak ada gula numerik melebihi karbohidrat katalog. Ini pemeriksaan pipeline,
bukan validasi angka terhadap makanan timbang/uji lab.

## Seluruh nilai tambahan

Tanda `estimasi` selalu membedakan pelengkap rujukan. Nutrien per100g: energi kcal,
natrium mg, lainnya g. Kode `evidenceId` merujuk snapshot, bukan ID makanan target.

| Makanan | Nutrien | Nilai | Jenis | Evidence ID |
| --- | --- | ---: | --- | --- |
| Ikan Lele | fiberG | 0 | estimasi: proxy_estimate | sr-175165 |
| Ikan Lele | carbohydrateG | 0 | estimasi: proxy_available_carbohydrate | sr-175165 |
| Ikan Bandeng | fiberG | 0 | estimasi: proxy_estimate | sr-173675 |
| Ikan Bandeng | carbohydrateG | 0 | estimasi: proxy_available_carbohydrate | sr-173675 |
| Ikan Mujair | fiberG | 0 | estimasi: proxy_estimate | sr-175176 |
| Ikan Mujair | carbohydrateG | 0 | estimasi: proxy_available_carbohydrate | sr-175176 |
| Ikan Tongkol | fiberG | 0 | estimasi: proxy_estimate | sr-175156 |
| Ikan Tongkol | carbohydrateG | 0 | estimasi: proxy_available_carbohydrate | sr-175156 |
| Ikan Kembung | fiberG | 0 | estimasi: proxy_estimate | sr-173672 |
| Ikan Kembung | carbohydrateG | 0 | estimasi: proxy_available_carbohydrate | sr-173672 |
| Ikan Tuna | fiberG | 0 | estimasi: proxy_estimate | sr-175159 |
| Ikan Tuna | carbohydrateG | 0 | estimasi: proxy_available_carbohydrate | sr-175159 |
| Kangkung | fiberG | 2.1 | estimasi: proxy_estimate | sr-169301 |
| Kangkung | carbohydrateG | 1.03 | estimasi: proxy_available_carbohydrate | sr-169301 |
| Mie ayam | sodiumMg | 279 | pelengkap rujukan | panganku-AP085 |
| Sop daging sapi | sodiumMg | 391 | pelengkap rujukan | panganku-FP069 |
| Soto daging sapi | sodiumMg | 249 | estimasi: proxy_estimate | fndds-75652010 |
| Soto ayam | sodiumMg | 249 | estimasi: proxy_estimate | fndds-28340660 |
| Mangga gedong/gadung | sodiumMg | 2 | estimasi: proxy_estimate | panganku-ER056 |
| bubur nasi | sodiumMg | 234 | estimasi: proxy_estimate | fndds-56205101 |
| Nasi goreng | sodiumMg | 361 | estimasi: proxy_estimate | fndds-58150310 |
| Nasi tim | sodiumMg | 0 | pelengkap rujukan | panganku-AP002 |
| Nasi putih | sodiumMg | 1 | pelengkap rujukan | panganku-AP001 |
| Nasi uduk | sodiumMg | 182 | estimasi: proxy_estimate | fndds-58161200 |
| nasi jagung | sodiumMg | 35 | estimasi: proxy_estimate | sr-170288 |
| Kacang tanah tanpa kulit | sodiumMg | 31 | pelengkap rujukan | panganku-CR032 |
| Tempe kedele murni | sodiumMg | 9 | pelengkap rujukan | panganku-CP077 |
| Tahu | sodiumMg | 2 | pelengkap rujukan | panganku-CP061 |
| Tahu goreng | sodiumMg | 7 | pelengkap rujukan | panganku-CP062 |
| Telur ayam | sodiumMg | 142 | estimasi: proxy_estimate | panganku-HR002 |
| ikan mas bumbu kuning | sodiumMg | 351 | estimasi: proxy_estimate | fndds-27150320 |
| ikan mas pepes | sodiumMg | 58 | estimasi: proxy_estimate | panganku-GP021 |
| ikan asin/asap | sodiumMg | 763 | estimasi: proxy_estimate | fndds-26100190 |
| ikan kembung goreng (resep) | sodiumMg | 409 | estimasi: proxy_estimate | fndds-26121140 |
| Hati ayam | sodiumMg | 1068 | pelengkap rujukan | panganku-FR007 |
| sayur sop ayam | sodiumMg | 249 | estimasi: proxy_estimate | fndds-28340660 |
| Daging ayam | sodiumMg | 109 | pelengkap rujukan | panganku-FR005 |
| Daging ayam goreng | sodiumMg | 671 | estimasi: proxy_estimate | fndds-24107070 |
| Dendeng sapi | sodiumMg | 1785 | estimasi: proxy_estimate | fndds-21602100 |
| Daging sapi | sodiumMg | 105 | estimasi: proxy_estimate | panganku-FR026 |
| ikan teri | sodiumMg | 554 | estimasi: proxy_estimate | panganku-GR068 |
| ikan pindang | sodiumMg | 379 | estimasi: proxy_estimate | fndds-26121180 |
| Bayam rebus | sodiumMg | 16 | pelengkap rujukan | panganku-DP002 |
| Sayur bayam | sodiumMg | 262 | estimasi: proxy_estimate | fndds-72125211 |
| Tumis bayam | sodiumMg | 254 | estimasi: proxy_estimate | fndds-72125217 |
| Tumis Kangkung | sodiumMg | 254 | estimasi: proxy_estimate | fndds-72125217 |
| Beras | sodiumMg | 34 | estimasi: proxy_estimate | panganku-AR003 |
| Jagung Segar | sodiumMg | 5 | estimasi: proxy_estimate | panganku-AR015 |
| Kentang | sodiumMg | 7 | pelengkap rujukan | panganku-BR013 |
| Ubi Jalar | sodiumMg | 3 | estimasi: proxy_estimate | panganku-BR028 |
| Talas | sodiumMg | 6 | estimasi: proxy_estimate | panganku-BR004 |
| Sagu | sodiumMg | 1 | estimasi: proxy_estimate | sr-169717 |
| Ikan Lele | sodiumMg | 98 | estimasi: proxy_estimate | sr-175165 |
| Ikan Bandeng | sodiumMg | 67 | pelengkap rujukan | panganku-GR007 |
| Ikan Mujair | sodiumMg | 51 | pelengkap rujukan | panganku-GR048 |
| Ikan Tongkol | sodiumMg | 202 | estimasi: proxy_estimate | panganku-GR070 |
| Ikan Kembung | sodiumMg | 214 | estimasi: proxy_estimate | panganku-GR050 |
| Ikan Tuna | sodiumMg | 45 | estimasi: proxy_estimate | sr-175159 |
| Tomat | sodiumMg | 10 | pelengkap rujukan | panganku-DR161 |
| Bayam | sodiumMg | 16 | estimasi: proxy_estimate | panganku-DR008 |
| Kangkung | sodiumMg | 65 | pelengkap rujukan | panganku-DR100 |
| Wortel | sodiumMg | 70 | pelengkap rujukan | panganku-DR166 |
| Kacang Kedelai | sodiumMg | 210 | estimasi: proxy_estimate | panganku-CR017 |
| Pisang | sodiumMg | 10 | estimasi: proxy_estimate | panganku-ER074 |
| Pepaya | sodiumMg | 4 | pelengkap rujukan | panganku-ER073 |
| Mie ayam | sugarsG | 1.37 | estimasi: proxy_sugar_fraction_estimate | fndds-58403040 |
| Sop daging sapi | sugarsG | 1.44 | estimasi: proxy_sugar_fraction_estimate | fndds-75652010 |
| Soto daging sapi | sugarsG | 1.44 | estimasi: proxy_sugar_fraction_estimate | fndds-75652010 |
| Soto ayam | sugarsG | 2.37 | estimasi: proxy_sugar_fraction_estimate | fndds-28340660 |
| Mangga gedong/gadung | sugarsG | 10.21 | estimasi: proxy_sugar_fraction_estimate | sr-169910 |
| bubur nasi | sugarsG | 0.04 | estimasi: proxy_sugar_fraction_estimate | fndds-56205101 |
| Nasi goreng | sugarsG | 0.47 | estimasi: proxy_sugar_fraction_estimate | fndds-58150310 |
| Nasi tim | sugarsG | 0.06 | estimasi: proxy_sugar_fraction_estimate | fndds-56205101 |
| Nasi putih | sugarsG | 0.07 | estimasi: proxy_sugar_fraction_estimate | fndds-56205008 |
| Nasi uduk | sugarsG | 5.28 | estimasi: proxy_sugar_fraction_estimate | fndds-58161200 |
| nasi jagung | sugarsG | 0.71 | estimasi: proxy_sugar_fraction_estimate | sr-170288 |
| Kacang tanah tanpa kulit | sugarsG | 6.91 | estimasi: proxy_sugar_fraction_estimate | sr-172430 |
| Tempe kedele murni | sugarsG | 3.28 | estimasi: proxy_sugar_fraction_estimate | sr-174270 |
| Tahu | sugarsG | 0.27 | estimasi: proxy_sugar_fraction_estimate | sr-172476 |
| Tahu goreng | sugarsG | 0.77 | estimasi: proxy_sugar_fraction_estimate | sr-172451 |
| Telur ayam | sugarsG | 0.36 | estimasi: proxy_sugar_fraction_estimate | sr-171287 |
| ikan mas bumbu kuning | sugarsG | 1.12 | estimasi: proxy_sugar_fraction_estimate | fndds-27150320 |
| ikan mas pepes | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | fndds-26100160 |
| ikan asin/asap | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | fndds-26100190 |
| ikan kembung goreng (resep) | sugarsG | 0.03 | estimasi: proxy_sugar_fraction_estimate | fndds-26121140 |
| Hati ayam | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | sr-171060 |
| sayur sop ayam | sugarsG | 0.93 | estimasi: proxy_sugar_fraction_estimate | fndds-28340660 |
| Daging ayam | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | sr-171447 |
| Daging ayam goreng | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | fndds-24107070 |
| Dendeng sapi | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | fndds-21602100 |
| Daging sapi | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | sr-171796 |
| ikan teri | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | fndds-26100190 |
| ikan pindang | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | fndds-26121180 |
| Bayam rebus | sugarsG | 0.58 | estimasi: proxy_sugar_fraction_estimate | fndds-72125211 |
| Sayur bayam | sugarsG | 0.3 | estimasi: proxy_sugar_fraction_estimate | fndds-72125211 |
| Tumis bayam | sugarsG | 0.14 | estimasi: proxy_sugar_fraction_estimate | fndds-72125217 |
| Tumis Kangkung | sugarsG | 0.32 | estimasi: proxy_sugar_fraction_estimate | fndds-72125217 |
| Beras | sugarsG | 0.11 | estimasi: proxy_sugar_fraction_estimate | sr-169756 |
| Jagung Segar | sugarsG | 3.3 | estimasi: proxy_sugar_fraction_estimate | sr-169998 |
| Kentang | sugarsG | 0.73 | estimasi: proxy_sugar_fraction_estimate | sr-170026 |
| Ubi Jalar | sugarsG | 4.2 | estimasi: proxy_sugar_fraction_estimate | sr-168482 |
| Talas | sugarsG | 0.3 | estimasi: proxy_sugar_fraction_estimate | sr-169308 |
| Sagu | sugarsG | 3.14 | estimasi: proxy_sugar_fraction_estimate | sr-169717 |
| Ikan Lele | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | sr-175165 |
| Ikan Bandeng | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | sr-175176 |
| Ikan Mujair | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | sr-175176 |
| Ikan Tongkol | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | sr-175159 |
| Ikan Kembung | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | sr-173672 |
| Ikan Tuna | sugarsG | 0 | estimasi: proxy_sugar_fraction_estimate | sr-175159 |
| Tomat | sugarsG | 1.72 | estimasi: proxy_sugar_fraction_estimate | sr-170457 |
| Bayam | sugarsG | 0.2 | estimasi: proxy_sugar_fraction_estimate | sr-168462 |
| Kangkung | sugarsG | 0.12 | estimasi: proxy_sugar_fraction_estimate | sr-168462 |
| Wortel | sugarsG | 2.76 | estimasi: proxy_sugar_fraction_estimate | sr-170393 |
| Kacang Kedelai | sugarsG | 2.24 | estimasi: proxy_sugar_fraction_estimate | sr-174270 |
| Pisang | sugarsG | 10.43 | estimasi: proxy_sugar_fraction_estimate | sr-173944 |
| Pepaya | sugarsG | 5.42 | estimasi: proxy_sugar_fraction_estimate | sr-169926 |
| Udon segar mentah | sugarsG | 2 | estimasi: partial_sugar_sum_estimate | mext-carbs-01038 |
| Udon segar direbus, tanpa kuah | sugarsG | 0.3 | estimasi: partial_sugar_sum_estimate | mext-carbs-01039 |
| Udon kering, belum dimasak | sugarsG | 0.3 | estimasi: partial_sugar_sum_estimate | mext-carbs-01041 |
| Udon dari mi kering, direbus tanpa kuah | sugarsG | 0.1 | estimasi: partial_sugar_sum_estimate | mext-carbs-01042 |
| Somen atau hiyamugi direbus, tanpa kuah | sugarsG | 0.4 | estimasi: partial_sugar_sum_estimate | mext-carbs-01044 |
| Mi chuka mentah, bahan mi ramen | sugarsG | 1 | estimasi: partial_sugar_sum_estimate | mext-carbs-01047 |
| Mi chuka direbus, tanpa kuah atau topping ramen | sugarsG | 0.1 | estimasi: partial_sugar_sum_estimate | mext-carbs-01048 |
| Mi chuka dikukus, tanpa saus | sugarsG | 0.3 | estimasi: partial_sugar_sum_estimate | mext-carbs-01049 |
| Mi chuka kukus ditumis | sugarsG | 0.4 | estimasi: partial_sugar_sum_estimate | mext-carbs-01188 |
| Okinawa soba direbus, tanpa kuah | sugarsG | 0.1 | estimasi: partial_sugar_sum_estimate | mext-carbs-01053 |
| Soba segar mentah | sugarsG | 0.4 | estimasi: partial_sugar_sum_estimate | mext-carbs-01127 |
| Soba segar direbus, tanpa kuah | sugarsG | 0.2 | estimasi: partial_sugar_sum_estimate | mext-carbs-01128 |
| Soba kering, belum dimasak | sugarsG | 0.5 | estimasi: partial_sugar_sum_estimate | mext-carbs-01129 |
| Soba dari mi kering direbus, tanpa kuah | sugarsG | 0.1 | estimasi: partial_sugar_sum_estimate | mext-carbs-01130 |
| Mi instan digoreng, kering beserta bumbu | sugarsG | 0.8 | estimasi: partial_sugar_sum_estimate | mext-carbs-01057 |
| Mi instan digoreng, dimasak beserta bumbu dan kuah | sugarsG | 0.1 | estimasi: partial_sugar_sum_estimate | mext-carbs-01198 |
| Mi instan digoreng lalu direbus, tanpa bumbu | sugarsG | 0.4 | estimasi: partial_sugar_sum_estimate | mext-carbs-01189 |
| Mi instan non-fried, kering beserta bumbu | sugarsG | 0.9 | estimasi: partial_sugar_sum_estimate | mext-carbs-01058 |
| Mi instan non-fried, dimasak beserta bumbu dan kuah | sugarsG | 0.3 | estimasi: partial_sugar_sum_estimate | mext-carbs-01199 |
| Mi instan non-fried direbus, tanpa bumbu | sugarsG | 0.2 | estimasi: partial_sugar_sum_estimate | mext-carbs-01190 |
| Mi cup shio goreng, siap makan beserta kuah | sugarsG | 0.3 | estimasi: partial_sugar_sum_estimate | mext-carbs-01201 |
| Mi cup shio goreng, matang dengan kuah ditinggalkan | sugarsG | 0.5 | estimasi: partial_sugar_sum_estimate | mext-carbs-01194 |
| Mi cup shoyu goreng, siap makan beserta kuah | sugarsG | 0.2 | estimasi: partial_sugar_sum_estimate | mext-carbs-01200 |
| Mi cup shoyu goreng, matang dengan kuah ditinggalkan | sugarsG | 0.2 | estimasi: partial_sugar_sum_estimate | mext-carbs-01192 |
| Yakisoba instan cup, kering beserta bumbu | sugarsG | 7.1 | estimasi: partial_sugar_sum_estimate | mext-carbs-01060 |
| Yakisoba instan cup, dimasak beserta bumbu | sugarsG | 1.7 | estimasi: partial_sugar_sum_estimate | mext-carbs-01202 |
| Okonomiyaki siap saji | sugarsG | 2.8 | estimasi: partial_sugar_sum_estimate | mext-carbs-18053 |
| Karaage ayam siap saji | sugarsG | 1.1 | estimasi: partial_sugar_sum_estimate | mext-carbs-18054 |
| Kari ayam Jepang, saus dan isi tanpa nasi | sugarsG | 2.19 | estimasi: proxy_sugar_fraction_estimate | fndds-27146150 |
| Kari sapi Jepang, saus dan isi tanpa nasi | sugarsG | 2.23 | estimasi: proxy_sugar_fraction_estimate | fndds-27116100 |
| Korokke kentang siap saji | sugarsG | 1.56 | estimasi: proxy_sugar_fraction_estimate | fndds-71405010 |
| Ebi fry siap saji | sugarsG | 0.32 | estimasi: proxy_sugar_fraction_estimate | fndds-26319140 |
| Gyoza siap saji | sugarsG | 4.09 | estimasi: proxy_sugar_fraction_estimate | fndds-58111110 |
| Shumai siap saji | sugarsG | 3.3 | estimasi: proxy_sugar_fraction_estimate | fndds-58112510 |
| Isian oyakodon, tanpa nasi | sugarsG | 1.91 | estimasi: proxy_sugar_fraction_estimate | fndds-32105210 |
| Isian gyumeshi atau gyudon, tanpa nasi | sugarsG | 1.59 | estimasi: proxy_sugar_fraction_estimate | fndds-27418410 |
| Tempura udang vannamei | sugarsG | 0.4 | estimasi: partial_sugar_sum_estimate | mext-carbs-10416 |
| Namul tauge (rujukan Jepang) | sugarsG | 1.16 | estimasi: proxy_sugar_fraction_estimate | fndds-75207021 |
| Beras | energyKcal | 351.01 | estimasi: energy_factor_estimate | energy-tkpsi-beras-mentah |
| Jagung Segar | energyKcal | 88.47 | estimasi: energy_factor_estimate | energy-tkpsi-jagung-segar |
| Kentang | energyKcal | 74.16 | estimasi: energy_factor_estimate | energy-tkpsi-kentang |
| Ubi Jalar | energyKcal | 103.94 | estimasi: energy_factor_estimate | energy-tkpsi-ubi-jalar |
| Talas | energyKcal | 113.39 | estimasi: energy_factor_estimate | energy-tkpsi-talas |
| Sagu | energyKcal | 340.95 | estimasi: energy_factor_estimate | energy-tkpsi-sagu |
| Ikan Lele | energyKcal | 154.23 | estimasi: energy_factor_estimate | energy-tkpsi-ikan-lele |
| Ikan Bandeng | energyKcal | 136.67 | estimasi: energy_factor_estimate | energy-tkpsi-ikan-bandeng |
| Ikan Mujair | energyKcal | 76.99 | estimasi: energy_factor_estimate | energy-tkpsi-ikan-mujair |
| Ikan Tongkol | energyKcal | 99.42 | estimasi: energy_factor_estimate | energy-tkpsi-ikan-tongkol |
| Ikan Kembung | energyKcal | 126.26 | estimasi: energy_factor_estimate | energy-tkpsi-ikan-kembung |
| Ikan Tuna | energyKcal | 105.47 | estimasi: energy_factor_estimate | energy-tkpsi-ikan-tuna |
| Tomat | energyKcal | 18.1 | estimasi: energy_factor_estimate | energy-tkpsi-tomat |
| Bayam | energyKcal | 29.29 | estimasi: energy_factor_estimate | energy-tkpsi-bayam-segar |
| Kangkung | energyKcal | 19.33 | estimasi: energy_factor_estimate | energy-tkpsi-kangkung-segar |
| Wortel | energyKcal | 30.33 | estimasi: energy_factor_estimate | energy-tkpsi-wortel |
| Kacang Kedelai | energyKcal | 346.78 | estimasi: energy_factor_estimate | energy-tkpsi-kacang-kedelai |
| Pisang | energyKcal | 92.43 | estimasi: energy_factor_estimate | energy-tkpsi-pisang |
| Pepaya | energyKcal | 39.02 | estimasi: energy_factor_estimate | energy-tkpsi-pepaya |
