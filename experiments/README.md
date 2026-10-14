# Carin Experiments

Direktori riset dan evaluasi model independen untuk Carin. Eksperimen di sini adalah held-out evaluation dan benchmark pendahuluan, bukan dependensi produksi runtime.

## Modul Eksperimen

- [**model-evaluation/**](model-evaluation/README.md): Pipeline evaluasi offline & online terhadap dataset Nutrition5k dan LeFood-Set.
  - [**docs/**](model-evaluation/docs/): Laporan eksperimen komparatif, smoke test, dan catatan handoff.
  - [**scripts/**](model-evaluation/scripts/): Script downloader, runner pipeline, dan kalkulasi skor.
  - [**tests/**](model-evaluation/tests/): Suite unit test untuk validasi offline pipeline runner dan scorer.
  - [**manifests/**](model-evaluation/manifests/): Kunci subset dataset (JSONL) dan audit integritas.
  - [**prompts/**](model-evaluation/prompts/): Prompt terstandarisasi untuk VLM.
