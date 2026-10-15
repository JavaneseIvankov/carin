# Model Evaluation Scripts

Daftar script pipeline evaluasi, runner, dan downloader dataset:

| Script | Deskripsi | Perintah Contoh |
| --- | --- | --- |
| `run_extended_nutrients.py` | Empat foto SNAPMe berpasangan, schema A1V1 diperluas; natrium, gula total, serat, lemak jenuh, kolesterol, kalium, kalsium terhadap referensi ASA24. | `python3 experiments/model-evaluation/scripts/run_extended_nutrients.py --report-only` |
| `download_datasets.py` | Download & verifikasi subset Nutrition5k dan LeFood-Set. | `python3 experiments/model-evaluation/scripts/download_datasets.py` |
| `run_evaluation.py` | Runner evaluasi model visi berbasis OpenAI-compatible API (Alibaba). | `python3 experiments/model-evaluation/scripts/run_evaluation.py --dry-run` |
| `run_qwen37_ablation.py` | Sembilan varian A1–A6 dengan endpoint dan sampel B0 historis; tidak memakai fallback. | Lihat [laporan dan reproduksi](../docs/QWEN37_STAGED_ABLATION_2026-10-14.md). |
| `compare_qwen37_variants.py` | Bandingkan B0, sembilan varian dan gabungan A1V1+A6V1; MAE massa pooled, skor ternormalisasi dan rata-rata latency. | `python3 experiments/model-evaluation/scripts/compare_qwen37_variants.py` |
| `run_qwen38_a1.py` | Uji A1V1/A1V2 dengan Qwen3.8 Max dan bandingkan dengan Flash memakai prompt/sampel yang sama. | `python3 experiments/model-evaluation/scripts/run_qwen38_a1.py --report-only` |
| `run_a1v1_benchmark25.py` | Benchmark 25 gambar per model dengan A1V1 prompt v2 dan JSON Schema strict; laporan MAE lengkap serta latency/token. | `python3 experiments/model-evaluation/scripts/run_a1v1_benchmark25.py --report-only` |
| `prepare_ablation_catalog.py` | Snapshot delapan makanan USDA SR Legacy dari CSV resmi, tanpa API key. | `python3 experiments/model-evaluation/scripts/prepare_ablation_catalog.py` |
| `prepare_ablation_cv.py` | CLIPSeg area ratio + DepthAnythingV2 relative depth, berurutan untuk membatasi memori. | Lihat [environment dan output CV](../docs/QWEN37_STAGED_ABLATION_2026-10-14.md). |
| `evaluate_predictions.py` | Menghitung metrik akurasi numerik (MAE, bias, coverage) dari file prediksi. | `python3 experiments/model-evaluation/scripts/evaluate_predictions.py --manifest ... --predictions ...` |
| `run_hf_food_analysis.py` | Runner uji model Hugging Face inference API (`Ateeqq/food-analysis`). | `uv run experiments/model-evaluation/scripts/run_hf_food_analysis.py --limit 5 --dry-run` |
| `prepare_omnifood.py` | Ekstraksi bobot safetensors & persiapan model lokal OmniFood8K. | `python3 experiments/model-evaluation/scripts/prepare_omnifood.py` |
| `run_omnifood.py` | Runner inferensi lokal OmniFood8K pada GPU RTX 3050 Laptop. | `python3 experiments/model-evaluation/scripts/run_omnifood.py` |
