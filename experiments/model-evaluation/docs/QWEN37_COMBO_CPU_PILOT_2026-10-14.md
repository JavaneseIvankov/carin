# A1V1 + A6V1: CPU-only client pilot — 2026-10-14

New combo: five original B0 images, same snapshot/endpoint, temp=0, thinking=false, JSON mode, max_tokens=1024, no fallback/retry.
Only stdlib code runs locally, with CUDA_VISIBLE_DEVICES empty. Qwen inference is hosted in Alibaba; this is not a local CPU VLM or a VPS/mobile end-to-end benchmark.

## Rankings

Lowest pooled mass MAE: A1V1 (72.500 g, four identical food pairs).
Lowest overall normalized MAE: A1V2 (30.802%, five equal-weight normalized metrics).
Raw grams and kcal are never added. Normalized MAE is an exploratory weighting choice, not MAPE or a clinical score; different weights can change rankings.
Only full numeric coverage is eligible. Empty plate is retained in response success/latency/tokens, excluded from numeric ranking using historical B0 nonfood status.

| Variant | Pooled mass MAE g | Energy MAE kcal | Protein MAE g | Carbs MAE g | Fat MAE g | Overall normalized MAE % | Mean client s | Median client s | Token/image | OK / 5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B0 | 137.500 | 79.310 | 1.691 | 19.122 | 0.268 | 63.262 | 2.965 | 2.744 | 831.800 | 5 |
| A1V1 | 72.500 | 34.310 | 0.221 | 7.822 | 0.518 | 42.614 | 4.222 | 3.794 | 921.600 | 4 |
| A1V2 | 74.250 | 22.810 | 0.321 | 5.072 | 0.318 | 30.802 | 4.405 | 4.322 | 959.800 | 4 |
| A2V1 | 120.000 | 81.810 | 1.841 | 15.322 | 0.418 | 67.788 | 4.087 | 3.489 | 944.600 | 5 |
| A2V2 | 153.750 | 119.310 | 1.291 | 29.372 | 0.368 | 78.782 | 3.900 | 3.830 | 1052.600 | 5 |
| A3V1 | 100.000 | 89.310 | 1.191 | 18.022 | 0.418 | 63.501 | 3.661 | 3.645 | 1326.600 | 5 |
| A3V2 | 135.000 | 68.310 | 0.941 | 14.172 | 0.468 | 61.173 | 3.520 | 3.641 | 833.400 | 5 |
| A4V1 | 132.500 | 76.810 | 1.341 | 14.122 | 0.368 | 60.899 | 3.472 | 3.474 | 937.200 | 5 |
| A4V2 | 112.500 | 99.310 | 1.591 | 25.622 | 0.268 | 67.470 | 3.316 | 3.358 | 940.200 | 5 |
| A6V1 | 118.250 | 72.280 | 2.515 | 16.478 | 0.197 | 62.290 | 3.449 | 3.310 | 660.200 | 5 |
| A1V1_A6V1 | 90.750 | 22.730 | 1.298 | 5.087 | 0.133 | 31.811 | 3.567 | 3.762 | 838.400 | 4 |

Mass targets mean: 223.5 g; nutrient normalization targets are the mean of the two Nutrition5k foods. LeFood nutrient GT is absent, not fabricated.

## Combo per sample

| Sample | Status | GT mass g | Predicted mass g | Label | Elapsed s |
| --- | --- | ---: | ---: | --- | ---: |
| dish_1557861216 | error | 1.000 | NA | NA | 3.762 |
| dish_1557937037 | ok | 49.000 | 35.000 | raw raspberries | 5.550 |
| dish_1558031394 | ok | 318.000 | 430.000 | raw watermelon, raw cantaloupe, baked potato, baked sweet potato | 4.216 |
| lefood-1 | ok | 343.000 | 170.000 | cooked white rice | 2.334 |
| lefood-14 | ok | 184.000 | 120.000 | cooked white rice | 1.974 |

## Implementation and timing

- Prompt requests container diameter + apparent volume before total weight, with food_name/weight_g per component; no VLM nutrient output.
- Parser requires geometry key order and total/component mass agreement; invalid outputs remain errors, no post-hoc repairs.
- Same frozen eight-food USDA catalog and exact aliases as A6; grams/100 × source nutrient coefficients on CPU. No alias additions after seeing results.
- Unknown matching or weight yields null nutrient totals. Nonfood requires null geometry and weight, empty components.
- Each request, raw response, geometry, source match, prediction and runtime is saved, alongside this comparison JSON.
- Mean CPU grounding for four valid samples: 0.301 ms. This is catalog arithmetic only, excludes upload/network/provider.
- Client elapsed time includes encoding/request logging, network/provider wait, parsing/grounding and response persistence; table mean includes failures too.
- Mobile upload, VPS network, worker queue, database/storage, polling delay and any explanation LLM call were not measured. Existing app spec uses async jobs and polling.
- A4 has separate GPU-based precomputed feature latency in the earlier report, which is not included in its historical client latency here.

## Failure and limitations

The combo empty-plate response correctly says is_food=false but reports container_diameter_cm=20, violating the prompt's nonfood-null schema. It remains one failure; raw response is retained, no retry/repair.
All variants including combo still mislabel the Bubur sample as rice. USDA arithmetic does not repair this semantic error.
A1V1 and A1V2 also have one historical empty-plate schema failure each; read rankings alongside response coverage, not accuracy alone.
Five images, four mass pairs and two nutrient pairs, one run per variant, already inspected dataset: exploratory, not independent validation. Historical latency is not a simultaneous paired timing benchmark.
Production FastAPI behavior is unchanged; this implements the experimental candidate, not its deployment or an approved production nutrition catalog.

## Reproduce

Run from the repository root; historical B0/ablation artifacts and the frozen catalog must exist locally.

```sh
CUDA_VISIBLE_DEVICES='' python3 experiments/model-evaluation/scripts/run_qwen37_ablation.py \
  --variants A1V1_A6V1 \
  --catalog experiments/model-evaluation/catalogs/usda-sr-legacy-ablation-v1.json \
  --run-dir experiments/model-evaluation/results/qwen37-combo-2026-10-14 --resume
python3 experiments/model-evaluation/scripts/compare_qwen37_variants.py
```

Resume skips both successes and recorded errors, without new inference. First run omits --resume; changed prompt/settings require a new output folder.

## Verification and handoff

Task: implement and evaluate the A1V1+A6V1 experimental CPU-client candidate, compare all historical variants, and report mean latency for mobile planning. The 5 new calls used the exact requested snapshot and historical regional endpoint, no retries/fallback; image and frozen catalog checksums match. No GPU libraries or local vision models are needed by the new runner/comparison.

All 56 offline experiment tests passed from the repository root using `uv run --with huggingface-hub==1.33.0 python -m unittest discover -s experiments/model-evaluation/tests -p 'test_*.py' -q`. Syntax checks passed for the modified runner and comparison script. Tests verify component mass consistency, nonfood/unknown handling, unit normalization, pooled sample weighting, and exclusion of incomplete coverage from rankings.

Changes: runner supports `A1V1_A6V1`, `compare_qwen37_variants.py` generates audited rankings, two geometry/grounding tests and three comparison tests were added, and navigation links were updated. Logs are in `results/qwen37-combo-2026-10-14/` (Git-ignored). Code, prompt and reports remain uncommitted on `feat/t32-real-ai-service`, alongside the earlier uncommitted ablation work; previous reorganization commit `2e5ba91` is preserved. Production FastAPI/defaults were not changed. Unverified: actual VPS deployment/load, mobile upload/polling end-to-end latency, larger independent accuracy set, and correction of Bubur/Nasi confusion.
