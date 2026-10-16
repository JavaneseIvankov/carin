# Draft aturan gizi dan kondisi — 15 Oktober 2026

**35 definisi kebijakan, 13 kategori, 14 sitasi pedoman.** Versi
`rules-unpublished-0.3.0`. Seluruh aturan `enabled=false` dan
`executionStatus=draft_not_executable`. Ini artifact review yang diminta;
**belum merupakan rule engine yang menilai foto atau memberi saran personal**.
Runtime masih `unconfigured`, tidak ada aktivasi database atau publikasi.

## Cakupan

| Kategori | Jumlah aturan |
| --- | ---: |
| Gizi umum (bukan diagnosis) | 7 |
| Hipertensi | 3 |
| Diabetes tipe 2 | 3 |
| Prediabetes | 2 |
| Dislipidemia / kolesterol tinggi | 2 |
| Berat badan berlebih / obesitas | 2 |
| Gout / asam urat | 3 |
| Penyakit ginjal kronis | 3 |
| GERD / refluks | 2 |
| Konstipasi | 2 |
| Anemia defisiensi besi | 2 |
| Alergi makanan | 2 |
| Penyakit kardiovaskular | 2 |

`general_nutrition` adalah kelompok edukasi, bukan diagnosis. Semua condition
records memakai `personalizationSupported=false` serta usia dukungan `null`.
Body kandidat membatasi rancangan MVP usia 18–50 sesuai spec produk; ini bukan
klaim bahwa pedoman medis hanya berlaku pada kelompok tersebut.

## Bentuk dan cara membaca aturan

Setiap aturan mengikuti `rule.schema.json`: ID/version stabil, conditionId,
requiredProfileFields, requiredNutrients, scope, reason, adjustments,
criticalMissingFields, conflictSet, citationSourceIds, limitations dan ruleBody.
`ruleBody` diperiksa tambahan dengan `nutrition-policy-body.schema.json`.

- **nutrient_context:** informasi gram/kcal atau kontribusi acuan umum; bukan
  vonis makanan aman/tidak aman atau target diet pasien.
- **qualitative_education / qualitative_caution:** pesan bersumber dengan
  prasyarat bahan, cara saji, atau pemicu yang benar-benar dikonfirmasi.
- **coverage_guard:** menahan penilaian karena data/definisi belum mencukupi;
  menghasilkan `insufficient_information` dalam rancangan evaluator nanti.
- **behavior_context:** konteks perilaku seperti waktu makan/berbaring;
  tidak menebak kebiasaan atau gejala dari foto.

`requiredProfileFields` hanya memakai field dari ProfileContext yang sekarang.
Input lain ditempatkan di `requiredContextFields`, **bukan field request baru**.
Setiap field memiliki satu predicate: `is_true` (false tidak memicu perhatian),
`non_empty`, `nonnegative_number` atau `positive_number`.
`allRequiredContextMustBePresent=true`. Pemetaan tipe/waktu, sumber konfirmasi,
validitas rencana klinisi dan konversi unit perlu ditetapkan saat executor serta
kontrak konteks dirancang. Semua rule tetap disabled sampai saat itu.

Contoh input yang belum tersedia: rencana natrium/karbohidrat individual,
riwayat konsumsi lengkap, label bahan, konfirmasi pemicu GERD, stadium ginjal,
status dialisis, zat besi, purin, lemak jenuh/trans, kalium dan fosfor.
Ketiadaan input bukan nol, false, diagnosis negatif, atau izin mengarang nilai.
Saran obat/insulin, diagnosis dari hasil laboratorium, prediksi risiko klinis,
sertifikasi alergen dan konsumsi otomatis dari foto dilarang pada semua body.

## Angka dan definisi yang sengaja dibatasi

- WHO/Kemenkes natrium 2000 mg adalah **acuan umum dewasa per hari**, bukan batas
  satu piring. Persentase acuan = natrium komponen / 2000 × 100 hanya konteks.
- WHO serat 25 g/hari dipakai sebagai konteks populasi umum. Satu makanan tidak
  membuktikan kekurangan serat sehari penuh.
- WHO batas gula bebas <10% energi **tidak diterapkan ke sugarsG**. Katalog saat
  ini mempunyai gula total atau estimasi parsial/proxy, bukan gula bebas.
- Pilihan DASH 1500/2300 mg tidak otomatis dipilih menjadi target pasien.
- Tidak ada batas karbohidrat universal per makan untuk diabetes atau konversi
  protein menjadi purin/zat besi. Lemak total tidak menggantikan lemak jenuh.
- GERD tiga jam hanya konteks gejala saat malam/berbaring dengan waktu yang
  tersedia; tidak berlaku sebagai larangan makan universal.

## Kualitas data, konflik dan keluaran

Setiap body mewajibkan review sumber/katalog/aturan. Estimasi nutrien, makanan
ambigu atau critical gap menahan kesimpulan personal yang bergantung padanya.
Ketidakpastian porsi tetap terlihat. Jadi 189 makanan yang numeriknya terisi
bukan 189 makanan yang otomatis memenuhi prasyarat semua aturan.

Konflik antar-ID disimpan dua arah dan divalidasi. Contohnya pemilihan sumber besi
vs jeroan pada gout; saran cairan vs rencana ginjal; alternatif protein vs rencana
protein ginjal; serta variasi pangan vs alergen yang sudah terkonfirmasi.
Konflik menahan **penyesuaian yang bertentangan**, mempertahankan fakta relevan,
dan tidak menganggap semua pasien ginjal dilarang buah/sayur. Executor berikutnya
perlu menyelesaikan konflik pada level adjustment, bukan menghapus seluruh fakta.

Semua `positiveSuitabilityAllowed=false`: tidak ada all-clear karena aturan
lain tidak terpicu. Data nutrition `complete` dan status perhatian adalah dua
hal berbeda. Bila ada perhatian yang valid sekaligus critical gap, overall tetap
`insufficient_information` sebagaimana spec. Output nanti mencantumkan rule ID,
condition ID, component IDs, citation source IDs dan keterbatasan. Qwen hanya
boleh merumuskan hasil tersebut, atau gunakan template tanpa panggilan model.

## Status manifest dan review

Manifest berisi definisi 13 kategori yang **semuanya unsupported**, persis sama
dengan `rules.json`, sehingga equality dan bentuk kontrak tetap terjaga. Daftar
makanan foto/nutrien didukung tetap kosong; publicationStatus unpublished.
Validator sekarang membedakan daftar definisi unsupported dari klaim dukungan:
unpublished menolak `personalizationSupported=true`, bukan sekadar nama kondisi.
Endpoint runtime tidak otomatis membaca manifest draft ini.

Semua 35 approval aturan dan 14 approval sumber pedoman masih draft/null.
Tidak ada approval atas nama dokter/reviewer. Metadata lisensi menyatakan hanya
sitasi serta rangkuman kebijakan mandiri; izin penggunaan/reproduksi sumber
belum disahkan. Angka pedoman tidak otomatis mengesahkan implementasi.

## Verifikasi dan langkah setelah review

- Artifact validator dan kontrak lolos.
- 78 tes lulus, termasuk label draft, data estimasi, critical missing, field
  profil di luar kontrak, denominator salah, predicate hilang, serta konflik
  tidak simetris. Ini tes konsistensi artifact, bukan uji klinis/akurasi model.
- Build ulang katalog offline mempertahankan 35 aturan dan versi sumber
  kesehatan secara byte-identical; sumber nutrition dan health_rule memiliki
  pemilik versi masing-masing.
- Nutrisi 189 makanan tidak diubah oleh penambahan policy ini.

Sebelum aktivasi: review profesional dan sumber, selesaikan data yang diperlukan,
definisikan executor/predicate semantics dan penanganan konflik yang diuji,
koordinasikan field konteks bila kontrak perlu diperluas, lalu isi approval nyata.
Evaluasi foto/porsi tetap pekerjaan terpisah dan belum dijalankan.

## Daftar aturan

| ID | Kategori | Jenis | Data tambahan yang masih diperlukan | Sumber |
| --- | --- | --- | --- | --- |
| rule.general-sodium-context | Gizi umum (bukan diagnosis) | nutrient_context | Review provenance katalog dan porsi | guideline-who-diet, guideline-kemkes-ggl |
| rule.general-fiber-context | Gizi umum (bukan diagnosis) | nutrient_context | Review provenance katalog dan porsi | guideline-who-diet |
| rule.general-free-sugar-definition | Gizi umum (bukan diagnosis) | coverage_guard | freeSugarsG, plannedDailyEnergyKcal | guideline-who-diet |
| rule.general-fat-quality | Gizi umum (bukan diagnosis) | coverage_guard | saturatedFatG, transFatG, confirmedOilAndCookingMethod | guideline-who-diet |
| rule.general-food-variety | Gizi umum (bukan diagnosis) | qualitative_education | confirmedFoodGroups, individualDietRestrictions | guideline-who-diet |
| rule.general-energy-context | Gizi umum (bukan diagnosis) | nutrient_context | Review provenance katalog dan porsi | guideline-who-diet |
| rule.general-macro-literacy | Gizi umum (bukan diagnosis) | nutrient_context | Review provenance katalog dan porsi | guideline-who-diet |
| rule.hypertension-sodium-context | Hipertensi | nutrient_context | clinicianSodiumPlanMgDay | guideline-dash, guideline-who-diet |
| rule.hypertension-condiment-choice | Hipertensi | qualitative_caution | confirmedHighSodiumCondiments, individualDietRestrictions | guideline-who-diet, guideline-dash |
| rule.hypertension-potassium-salt-guard | Hipertensi | coverage_guard | kidneyRiskAssessment, confirmedSaltSubstituteIngredients, clinicianPotassiumAdvice | guideline-who-diet, guideline-ckd |
| rule.diabetes-carbohydrate-context | Diabetes tipe 2 | nutrient_context | carbohydrateDefinitionReviewed | guideline-diabetes |
| rule.diabetes-sugar-only-guard | Diabetes tipe 2 | coverage_guard | individualCarbohydratePlan, medicationMealTimingPlan | guideline-diabetes |
| rule.diabetes-plate-options | Diabetes tipe 2 | qualitative_education | confirmedFoodGroups, individualDietRestrictions | guideline-diabetes |
| rule.prediabetes-carbohydrate-context | Prediabetes | nutrient_context | Review provenance katalog dan porsi | guideline-prediabetes, guideline-diabetes |
| rule.prediabetes-food-pattern | Prediabetes | qualitative_education | confirmedFoodGroups, individualDietRestrictions | guideline-prediabetes |
| rule.lipids-saturated-fat-guard | Dislipidemia / kolesterol tinggi | coverage_guard | saturatedFatG, transFatG, clinicianLipidDietPlan | guideline-lipids |
| rule.lipids-preparation-choice | Dislipidemia / kolesterol tinggi | qualitative_education | confirmedDeepFrying, confirmedAlternativePreparation, individualDietRestrictions | guideline-lipids, guideline-who-diet |
| rule.weight-energy-plan-guard | Berat badan berlebih / obesitas | coverage_guard | clinicianEnergyPlanKcalDay, completeConfirmedDailyConsumption | guideline-weight |
| rule.weight-portion-options | Berat badan berlebih / obesitas | qualitative_education | individualDietRestrictions, medicationMealTimingPlan | guideline-weight |
| rule.gout-confirmed-organ-meat | Gout / asam urat | qualitative_caution | confirmedOrganMeat, individualDietRestrictions | guideline-gout |
| rule.gout-purine-guard | Gout / asam urat | coverage_guard | purinesMg, confirmedRecipe | guideline-gout |
| rule.gout-drink-context | Gout / asam urat | qualitative_caution | confirmedAlcoholOrSweetenedDrink, individualDietRestrictions | guideline-gout |
| rule.ckd-sodium-plan-guard | Penyakit ginjal kronis | coverage_guard | ckdStage, dialysisStatus, clinicianSodiumPlanMgDay | guideline-ckd |
| rule.ckd-protein-plan-guard | Penyakit ginjal kronis | coverage_guard | ckdStage, dialysisStatus, clinicianProteinPlan | guideline-ckd |
| rule.ckd-minerals-fluid-guard | Penyakit ginjal kronis | coverage_guard | potassiumMg, phosphorusMg, ckdStage, dialysisStatus, clinicianFluidAndMineralPlan | guideline-ckd |
| rule.gerd-personal-trigger | GERD / refluks | qualitative_caution | userConfirmedRefluxTrigger, confirmedIngredients | guideline-gerd |
| rule.gerd-bedtime-context | GERD / refluks | behavior_context | userReportedNighttimeReflux, plannedMealTime, plannedLyingDownTime | guideline-gerd |
| rule.constipation-fiber-context | Konstipasi | nutrient_context | individualDietRestrictions | guideline-constipation, guideline-who-diet |
| rule.constipation-fluid-context | Konstipasi | behavior_context | clinicianFluidAndMineralPlan, individualDietRestrictions | guideline-constipation, guideline-ckd |
| rule.anemia-iron-guard | Anemia defisiensi besi | coverage_guard | ironMg, clinicianConfirmedIronDeficiency | guideline-iron |
| rule.anemia-food-pairing | Anemia defisiensi besi | qualitative_education | confirmedIronFoodSource, confirmedVitaminCFoodSource, individualDietRestrictions | guideline-iron |
| rule.allergy-confirmed-ingredient | Alergi makanan | qualitative_caution | verifiedIngredientAllergenMatch, ingredientLabelOrProviderEvidence | guideline-allergy |
| rule.allergy-photo-uncertainty | Alergi makanan | coverage_guard | ingredientLabelOrProviderEvidence, crossContactEvidence | guideline-allergy |
| rule.heart-sodium-context | Penyakit kardiovaskular | nutrient_context | clinicianCardiovascularDietPlan | guideline-heart, guideline-who-diet |
| rule.heart-fat-type-guard | Penyakit kardiovaskular | coverage_guard | saturatedFatG, transFatG, clinicianCardiovascularDietPlan | guideline-heart, guideline-lipids |

## Sumber yang dibaca

- **guideline-allergy: [FDA — Food Allergies](https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies)** — Ingredient labels, allergen avoidance and cross-contact. A photo or missing ingredient tag cannot establish allergen absence. US labeling categories are not adopted as Indonesian legal requirements. Accessed 2026-10-15.
- **guideline-ckd: [NIDDK — Healthy Eating for Adults with Chronic Kidney Disease](https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/healthy-eating-adults-chronic-kidney-disease)** — Calories, liquids, phosphorus, potassium, protein and sodium; requirements vary with kidney function/treatment. Avoid automatic potassium-based salt substitutes. Accessed 2026-10-15.
- **guideline-constipation: [NIDDK — Eating, Diet, and Nutrition for Constipation](https://www.niddk.nih.gov/health-information/digestive-diseases/constipation/eating-diet-nutrition)** — Fiber and individualized fluid intake; increase fiber gradually. No automatic daily liquid prescription. Accessed 2026-10-15.
- **guideline-dash: [NHLBI — DASH Eating Plan](https://www.nhlbi.nih.gov/health/dash-eating-plan)** — DASH eating pattern and daily sodium variants 2300 and 1500 mg; examples for a 2000 kcal plan. Neither variant is automatically selected as a patient prescription. Accessed 2026-10-15.
- **guideline-diabetes: [NIDDK — Healthy Living with Diabetes](https://www.niddk.nih.gov/health-information/diabetes/overview/healthy-living-with-diabetes)** — Healthy foods and drinks; carb counting; plate method; individualized meal amounts/timing and the role of medicines. No universal meal carbohydrate cutoff extracted. Accessed 2026-10-15.
- **guideline-gerd: [NIDDK — Eating, Diet, and Nutrition for GER and GERD](https://www.niddk.nih.gov/health-information/digestive-diseases/acid-reflux-ger-gerd-adults/eating-diet-nutrition)** — Individual food triggers; eating at least three hours before lying down for nighttime/lying-down symptoms. No blanket prohibition for everyone with GERD. Accessed 2026-10-15.
- **guideline-gout: [NIAMS — Gout: Diagnosis, Treatment, and Steps to Take](https://www.niams.nih.gov/health-topics/gout/diagnosis-treatment-and-steps-to-take)** — Living with gout: dietary changes, purine-rich animal foods, sweetened drinks and alcohol. General education; no purine composition table or universal daily purine prescription. Accessed 2026-10-15.
- **guideline-heart: [NHLBI — Coronary Heart Disease Treatment](https://www.nhlbi.nih.gov/health/coronary-heart-disease/treatment)** — Heart-healthy dietary pattern limiting saturated fats and sodium; no medication or disease risk prediction rules extracted. Accessed 2026-10-15.
- **guideline-iron: [NIH ODS — Iron: Consumer Fact Sheet](https://ods.od.nih.gov/factsheets/iron-consumer/)** — Iron food sources, vitamin C and absorption; iron-deficiency anemia differs from other causes of anemia. No supplement dose extracted. Accessed 2026-10-15.
- **guideline-kemkes-ggl: [Kemenkes RI — konsumsi gula, garam dan lemak](https://kemkes.go.id/id/cegah-meningkatnya-diabetes-jangan-berlebihan-konsumsi-gula-garam-lemak)** — Daily GGL communication: sodium 2000 mg/day; salt 5 g/day. Used for general sodium context only; total sugars are not equated with free sugars. Accessed 2026-10-15.
- **guideline-lipids: [NHLBI — Blood Cholesterol Treatment](https://www.nhlbi.nih.gov/health/blood-cholesterol/treatment)** — Heart-healthy eating; limit saturated fats. Total fat is not substituted for saturated fat and no meal predicts LDL changes. Accessed 2026-10-15.
- **guideline-prediabetes: [NIDDK — Your Game Plan to Prevent Type 2 Diabetes](https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-type-2-diabetes/game-plan)** — Healthy eating and individualized prevention plan; no diagnosis inferred from a food photo or a stored glucose reading. Accessed 2026-10-15.
- **guideline-weight: [NIDDK — Eating and Physical Activity to Lose or Maintain Weight](https://www.niddk.nih.gov/health-information/weight-management/adult-overweight-obesity/eating-physical-activity)** — Healthy eating plans and individualized energy needs; no fixed deficit, fasting schedule or automatic BMI diagnosis extracted. Accessed 2026-10-15.
- **guideline-who-diet: [WHO Healthy diet (26 January 2026)](https://www.who.int/news-room/fact-sheets/detail/healthy-diet)** — WHO guidance: Carbohydrates; Sugars; Fats; Protein; Salt/sodium and potassium. Adult population references, not per-meal prescriptions. Accessed 2026-10-15.
