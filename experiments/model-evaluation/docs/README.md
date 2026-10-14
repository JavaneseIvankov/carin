# Model Evaluation Documents & Reports

Indeks seluruh laporan eksperimen, benchmark, smoke test, dan catatan teknis:

| Dokumen | Topik & Model | Tanggal | Ringkasan |
| --- | --- | --- | --- |
| [SMOKE_TEST_2026-10-14.md](SMOKE_TEST_2026-10-14.md) | Alibaba Qwen 3.7 Flash | 2026-10-14 | Live smoke test 5-sampel pertama pada Nutrition5k dan LeFood-Set. |
| [QWEN37_STAGED_ABLATION_2026-10-14.md](QWEN37_STAGED_ABLATION_2026-10-14.md) | Qwen 3.7 Flash A1–A6 | 2026-10-14 | Sembilan varian pada pilot paired 5 gambar; MAE, coverage, label, token, CV, dan grounding USDA. |
| [QWEN37_COMBO_CPU_PILOT_2026-10-14.md](QWEN37_COMBO_CPU_PILOT_2026-10-14.md) | Qwen A1V1 + A6V1 | 2026-10-14 | Uji gabungan dengan client CPU-only; ranking MAE massa, MAE ternormalisasi dan rata-rata latency semua varian. |
| [QWEN38_A1_PAIRED_2026-10-14.md](QWEN38_A1_PAIRED_2026-10-14.md) | Qwen 3.8 Max vs Flash A1V1/A1V2 | 2026-10-14 | Prompt identik; MAE, coverage format, perbandingan sampel sama dan rata-rata latency. |
| [A1V1_BENCHMARK25_2026-10-14.md](A1V1_BENCHMARK25_2026-10-14.md) | Flash vs Max A1V1 JSON Schema | 2026-10-14 | 25 gambar per model, prompt/schema identik, coverage penuh dan evaluasi massa/makro/latency/token. |
| [QWEN38_ENHANCED_SMOKE_2026-10-14.md](QWEN38_ENHANCED_SMOKE_2026-10-14.md) | Qwen 3.8 Max | 2026-10-14 | Hasil smoke test konfigurasi thinking dan prompt visual scale sebelumnya. |
| [QWEN38_MAX_COMPARISON_2026-10-14.md](QWEN38_MAX_COMPARISON_2026-10-14.md) | Qwen 3.8 Max vs 3.7 Flash | 2026-10-14 | Perbandingan paired smoke test 5-sampel; evaluasi MAE porsi & makronutrien. |
| [OMNIFOOD_3050_SMOKE_TEST_2026-10-14.md](OMNIFOOD_3050_SMOKE_TEST_2026-10-14.md) | OmniFood8K (FP32 / INT8) | 2026-10-14 | Uji inferensi model lokal di GPU RTX 3050 Laptop (4 GB VRAM) & profiling memori. |
| [HF_FOOD_ANALYSIS.md](HF_FOOD_ANALYSIS.md) | Ateeqq/food-analysis | 2026-10-14 | Uji hosted inference Hugging Face, status serving Hub, dan fallback blocker. |
| [HANDOFF.md](HANDOFF.md) | Pipeline Handoff | 2026-10-14 | Catatan handoff pipeline evaluasi, audit integritas data, dan batasan dataset. |
