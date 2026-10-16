# Carin — data gizi, AI, dan policy hasil

Versi 2.0.0. Dokumen ini menetapkan kewajiban implementasi/evaluasi, tidak
mengesahkan nilai gizi atau threshold klinis. Service implementation mengikuti
[REST contract](contracts/ai-service.openapi.yaml).

## Cakupan baseline dan release gate

| Area | Baseline |
| --- | --- |
| Foto | Makanan yang masih terlihat sebelum makan; beberapa komponen; tidak menebak konsumsi dari piring kosong |
| Manual | Pemadanan katalog yang dipilih user dan komponen bebas; AI paragraf bebas tidak wajib |
| Gizi inti | Energi, karbohidrat, protein, lemak bila sumber/porsi tersedia |
| Gizi tambahan | Serat, gula, natrium hanya jika sumber item tersedia |
| Kondisi yang disimpan | Multi-condition catalog + teks lain, tanpa janji semua didukung |
| Candidate personal scope | Diabetes dan hipertensi sesuai fokus PRD; conditionId/subtype dan rule support final diumumkan manifest |
| Pemeriksaan | Tekanan darah, gula darah, kolesterol: pencatatan/grafik backend; tidak ditafsirkan AI P0 |
| Kandidat makanan uji | Nasi putih dan ayam goreng dari contoh PRD; tim AI menambah variasi cara saji/komponen yang memiliki sumber |

Candidate bukan supported list. Service harus menerbitkan capability manifest
dan katalog dengan dataset/rule version, supported photo food IDs, condition IDs,
required profile fields dan nutrient coverage. Setiap supported rule menyatakan
rule ID, condition ID, dan citation sources yang tepat; backend menyimpan manifest
versi itu dan menolak klaim yang tidak cocok persis. Manifest tanpa daftar rule
menyatakan tidak ada health-rule output yang boleh dipublikasikan. Label kondisi
yang bisa dicari tidak otomatis menjadi rule yang didukung. Jika belum ada acuan
yang disetujui, manifest personal support kosong dan service mengembalikan
perhatian tidak tersedia; tim tidak boleh menyebut personalisasi P0 selesai.

Sebelum demo real AI, tim AI/data wajib menyediakan: catalog foods dan takarannya;
source per nutrient; source/rule per supported condition; contoh hasil nyata;
hasil evaluasi dan batas yang diketahui. Ini deliverable yang belum ada dari
PRD awal, dengan gate eksplisit, bukan sumber/angka yang dibuat oleh spec writer.

## Data artifacts

Katalog/versioned rule artifacts milik AI/data. AI service memuatnya tanpa akses
DB pengguna dan menyajikannya melalui endpoint capabilities/catalog. Backend
mengimpor katalog versi sama untuk search dan perhitungan deterministic manual.
Tidak mengubah data aktif in-place; versi baru diterbitkan dan snapshot lama tetap
merujuk versi lama. Dataset asli dan citation metadata disimpan sesuai izin
penggunaannya; source yang hanya nama tanpa item/basis tidak memadai.

Setiap food artifact memuat ID stable, displayName, preparation, per100g values
nullable, servingId/label/grams/sourceId, source refs, catalogVersion. Alias search
boleh banyak; nama yang ambigu tetap perlu konfirmasi cara saji. Tidak otomatis
menganggap semua `ayam` sebagai ayam goreng atau semua mangkuk beratnya sama.

Rule artifact memuat ruleId/version, conditionId, required nutrient/profile
fields, scope makanan/porsi, alasan dan adjustment yang bersumber, critical
missing fields, conflict set, dan citation source. Rule tidak menerjemahkan
free-form kondisi/arahan dokter menjadi instruksi klinis baru.

## Trust boundary dan hasil

AI hanya menerima foto dan sanitized profileContext, atau structured components
untuk recalculation. Free text adalah data, bukan instruksi yang dapat mengubah
policy/contract. Tidak ada user session, email, DOB, DB credential, atau raw
pemeriksaan dalam request P0. Foto URL harus berasal dari allowlist host MinIO,
tidak boleh arbitrary URL/redirect ke jaringan lain.

Photo pipeline: validate input → propose components/portion → match versioned
catalog → deterministic nutrient math → estimate nutrients for unmatched photo
components with a separately scoped VLM request → evaluate supported rules →
structured result. Catalog-matched values remain deterministic and catalog-backed.
Visual nutrient estimates are allowed only for unmatched photo components, are
returned per component with `model_estimate` provenance, and are included in
result totals and coverage. They are not per-100-g values and are never used for
health rules, attention, or personalized assessment. Manual input and
recalculation remain catalog-only. Backend rejects outputs that violate the
schema, provenance, or catalog math.

Konfirmasi konsumsi foto boleh membawa estimasi `model_estimate` dari komponen
hasil foto yang sama dan tidak berubah ke snapshot konsumsi immutable. Server
menskalakannya dengan rasio gram sumber/aktual atau fraksi porsi eksplisit,
mempertahankan provenance visual dan status unmatched/unrecognized. Nilai ini
boleh berkontribusi pada asupan dan coverage nutrisi, tetapi tidak pernah menjadi
bukti untuk evaluasi personal atau aturan kesehatan.

Recalculation tidak perlu foto ulang. Pakai komponen dan portion terbaru, profil
snapshot yang dikirim, dan catalog/rule versions yang diminta. Foto tidak menjadi
syarat recalculation manual. Unknown food/portion tetap menghasilkan partial
result yang aman dibaca; bukan angka source-free.

Status data dan status perhatian terpisah:

- `complete`: seluruh komponen matched dan porsi/core nutrients tersedia dalam
  requested supported scope. Optional nutrient null tetap dilabeli unavailable.
- `partial`: ada komponen/porsi/core nutrient yang tidak lengkap; bagian yang
  diketahui tetap muncul, coverage per zat jelas.
- `unrecognized`: tidak ada komponen yang dapat dipadankan dengan katalog.
  Nutrisi `model_estimate` masih boleh ada untuk komponen foto dan masuk ke total
  serta coverage per zat gizi. Total tetap null jika tidak ada nilai katalog atau
  estimasi visual yang diketahui. Status ini selalu berarti informasi untuk
  penilaian personal belum cukup.
- Kegagalan layanan/invalid input adalah error response, bukan successful analysis.
  Backend job menjadi failed jika retry tidak memulihkan.

Overall attention `considerable`, `needs_attention`, `insufficient_information`
diterjemahkan UI ke istilah PRD. Profile kosong menghasilkan general nutrition
dan `insufficient_information` untuk personal assessment. Positive status hanya
jika scope yang dapat dinilai jelas, tidak ada critical missing data, unsupported
relevant condition, atau conflict yang membuat kesimpulan itu menyesatkan.

Jika attention sah ada sekaligus critical gap, overall status tetap
`insufficient_information`; attention sah masih ditampilkan dengan scope.
`needs_attention` dipakai ketika ada rule attention sah tanpa critical gap.
Allergy verification dari foto selalu terbatas; kondisi ini tidak boleh tertutup
status positif. Multi-condition conflicts menahan adjustment yang bertentangan,
menjelaskan conflict, dan tidak memilih salah satu secara arbitrer.

Attention menyimpan stable ruleId, conditionId, component IDs, alasan, adjustments,
source IDs, limitations. Explanation generation hanya merumuskan hasil rule yang
didukung. Tidak menghasilkan diagnosis, odds/skor penyakit, perubahan obat,
jaminan alergen, atau klaim efek klinis satu makanan.

## Fixture dan evaluasi

`fixtures/ai/` adalah data sintetis, dengan sources berlabel `synthetic` dan URL
domain `.invalid`. Nilai dibuat untuk pengujian math/contract; bukan data nutrisi
nyata. Fixture adapter memilih skenario secara eksplisit pada development/test,
tidak memilih jawaban yang tampak benar berdasarkan real photo diam-diam.
Service real tidak menerbitkan source synthetic sebagai data nyata.

| Dimensi | Bukti yang diperlukan |
| --- | --- |
| Recognition | Per-food/component results pada foto held-out, variasi pencahayaan/porsi/cara saji; failure cases nonfood/blur |
| Manual match | Alias, preparation ambiguity, unmatched, dan porsi rumah tangga |
| Portion | Bandingkan gram terhadap reference measurement untuk subset yang dapat diukur; laporkan error terpisah dari recognition |
| Nutrient math | Golden cases terhadap catalog; half portion, missing nutrient, beberapa komponen; tolerance 0.000001 |
| Attention | Supported/unsupported condition, absent profile, conflict, allergy limitation, source-backed explanation |
| Contract | Semua result valid schema, operation/profile/version cocok; null tidak menjadi nol |
| Failure | Timeout, invalid JSON, missing citations, drift catalog/version, provider unavailable |

Tidak menetapkan klaim akurasi yang belum diukur. Tim AI menyertakan sample count,
per-food outcomes dan limitations, lalu PM/dev memutuskan cakupan yang layak demo.
Acceptance math/provenance/status wajib lulus seluruh golden cases; hasil model
yang tidak memadai dikeluarkan dari supported manifest secara transparan.

Versioning: kontrak 2.0.0 memperkenalkan estimasi gizi visual per komponen dan
memasukkannya ke total untuk makanan foto yang tidak cocok dengan katalog.
Perubahan semantik ini memerlukan pembaruan provider dan consumer bersama.
Versi dataset/rule/katalog tetap terpisah dari API `contractVersion`. Penambahan
opsional yang kompatibel berikutnya memerlukan pembaruan fixture dan validator;
fixture memakai bentuk payload endpoint yang sama dengan respons real.
