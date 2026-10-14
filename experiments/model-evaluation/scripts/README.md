# Model Evaluation Scripts

Daftar script pipeline evaluasi, runner, dan downloader dataset:

| Script | Deskripsi | Perintah Contoh |
| --- | --- | --- |
| `download_datasets.py` | Download & verifikasi subset Nutrition5k dan LeFood-Set. | `python3 experiments/model-evaluation/scripts/download_datasets.py` |
| `run_evaluation.py` | Runner evaluasi model visi berbasis OpenAI-compatible API (Alibaba). | `python3 experiments/model-evaluation/scripts/run_evaluation.py --dry-run` |
| `evaluate_predictions.py` | Menghitung metrik akurasi numerik (MAE, bias, coverage) dari file prediksi. | `python3 experiments/model-evaluation/scripts/evaluate_predictions.py --manifest ... --predictions ...` |
| `run_hf_food_analysis.py` | Runner uji model Hugging Face inference API (`Ateeqq/food-analysis`). | `uv run experiments/model-evaluation/scripts/run_hf_food_analysis.py --limit 5 --dry-run` |
| `prepare_omnifood.py` | Ekstraksi bobot safetensors & persiapan model lokal OmniFood8K. | `python3 experiments/model-evaluation/scripts/prepare_omnifood.py` |
| `run_omnifood.py` | Runner inferensi lokal OmniFood8K pada GPU RTX 3050 Laptop. | `python3 experiments/model-evaluation/scripts/run_omnifood.py` |
