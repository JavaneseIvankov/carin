# Carin — model evaluation experiment

Evaluation-only subsets: **50 Nutrition5k images + 50 LeFood-Set images**.
An additional [four-photo SNAPMe nutrient smoke test](docs/EXTENDED_NUTRIENTS_SNAPME_2026-10-15.md)
uses ASA24 dietary-record references for sodium, sugars, fiber and other nutrients;
these are not laboratory measurements or weighed-portion ground truth.
Dataset preparation and Alibaba evaluation scripts require Python 3.10+ and use
only its standard library. The optional HF runner installs a small SDK through
`uv`; see [HF food-analysis smoke test](docs/HF_FOOD_ANALYSIS.md). It downloads no model
weights or GPU runtime.

This preparation is on `feat/t32-real-ai-service`, as requested. The supplied
T32/C32 issue assigns held-out evaluation to C33. These experimental references
are not approved T31 food/rule artifacts and do not implement the internal REST
service or establish T32 acceptance. Production food values and attention still
follow `specs/04-ai-data-and-policy.md` and contract 1.0.0.

## Documentation and Reports

All experiment reports and operational notes are kept under [`docs/`](docs/):

| Document | Description |
| --- | --- |
| [docs/EXTENDED_NUTRIENTS_SNAPME_2026-10-15.md](docs/EXTENDED_NUTRIENTS_SNAPME_2026-10-15.md) | Four paired SNAPMe photos, seven additional nutrients, explicit ASA24 reference limitations |
| [docs/SMOKE_TEST_2026-10-14.md](docs/SMOKE_TEST_2026-10-14.md) | Initial Alibaba 5-sample live smoke test report (Qwen 3.7 Flash) |
| [docs/QWEN37_STAGED_ABLATION_2026-10-14.md](docs/QWEN37_STAGED_ABLATION_2026-10-14.md) | Nine A1–A6 variants on the paired five-image pilot, with fixed Qwen3.7 controls |
| [docs/QWEN37_COMBO_CPU_PILOT_2026-10-14.md](docs/QWEN37_COMBO_CPU_PILOT_2026-10-14.md) | A1V1 + A6V1 CPU-client pilot; pooled/normalized MAE rankings and mean latency |
| [docs/QWEN38_A1_PAIRED_2026-10-14.md](docs/QWEN38_A1_PAIRED_2026-10-14.md) | Qwen3.8 Max vs Flash using identical A1V1/A1V2 prompts; paired MAE and average latency |
| [docs/A1V1_BENCHMARK25_2026-10-14.md](docs/A1V1_BENCHMARK25_2026-10-14.md) | 25 images per model with shared A1V1 prompt v2 + strict JSON Schema; numeric coverage, full MAE, latency and tokens |
| [docs/QWEN38_MAX_COMPARISON_2026-10-14.md](docs/QWEN38_MAX_COMPARISON_2026-10-14.md) | Paired smoke test comparison of Qwen 3.8 Max vs Qwen 3.7 Flash |
| [docs/OMNIFOOD_3050_SMOKE_TEST_2026-10-14.md](docs/OMNIFOOD_3050_SMOKE_TEST_2026-10-14.md) | Local OmniFood8K (FP32 & INT8) evaluation on RTX 3050 Laptop GPU |
| [docs/HF_FOOD_ANALYSIS.md](docs/HF_FOOD_ANALYSIS.md) | Ateeqq/food-analysis hosted model preflight and smoke runner |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Experiment handoff notes, data integrity audit, and dataset limitations |

## Download and reproduce

Run from the **repository root**:

```sh
python3 experiments/model-evaluation/scripts/download_datasets.py
```

Defaults: 50 images **per dataset**, seed `32`, four download workers. Existing
manifests lock the sample IDs; reruns verify cached images and recover missing
files instead of selecting a new test set. A different seed requires a separate
output directory. The selected source images are saved byte-for-byte.

```sh
python3 experiments/model-evaluation/scripts/download_datasets.py \
  --count 50 --seed 32 --output /path/to/a/separate/experiment
```

Layout:

```text
experiments/model-evaluation/
  README.md                     # Main guide and navigation index
  .env.example                  # Environment variable template
  docs/                         # Experiment reports and operational notes
    HANDOFF.md
    HF_FOOD_ANALYSIS.md
    OMNIFOOD_3050_SMOKE_TEST_2026-10-14.md
    QWEN38_MAX_COMPARISON_2026-10-14.md
    SMOKE_TEST_2026-10-14.md
  scripts/                      # Pipeline, downloader, and runner scripts
    download_datasets.py
    evaluate_predictions.py
    prepare_omnifood.py
    run_evaluation.py
    run_hf_food_analysis.py
    run_omnifood.py
  tests/                        # Unit test suite
    test_evaluation.py
    test_hf_food_analysis.py
    test_runner.py
  manifests/
    nutrition5k-50.jsonl
    lefood-set-50.jsonl
    lefood-set-source-audit.json # excluded workbook rows and source checksum
    dataset-verification.json
  prompts/
    food-estimation-v1.txt
    food-analysis-hf-v1.txt
  data/                         # local, Git-ignored
    nutrition5k/
      images/                   # 50 RGB PNGs; no depth maps/videos
      source/                   # published nutrition CSVs and train/test IDs
    lefood-set/
      images/                   # 50 before-meal JPEGs
      source/                   # original XLSX and dataset metadata
    omnifood/                   # local checkpoints and sources
  results/                      # local, Git-ignored model outputs/reports
```

Each manifest row carries the image path, SHA-256, byte count, source identifiers,
reference values/units, dataset version, selection seed, license and limitations.
Do not pass the manifest's labels, weights, nutrients or food names into the model
prompt. Supply the image and a fixed task prompt; labels are for scoring only.
Do not use these selected images for training or prompt tuning. Prepare a
separate development set. No official Nutrition5k training IDs are sampled.

## Sources and what can be measured

| Source | Selection | Reference available |
| --- | --- | --- |
| [Nutrition5k](https://github.com/google-research-datasets/Nutrition5k) | Official **depth test IDs**, overhead **RGB only**; balanced across 1, 2–4, and 5+ listed ingredients | Total/ingredient mass; energy; protein; carbohydrate; fat |
| [LeFood-Set v1](https://data.mendeley.com/datasets/cchsk79jkt/1) | Balanced across food names; **before-meal** photos; unique SHA-256 | Source food name and **Weight Before Eaten (g)** from `data_original.xlsx` |

Nutrition5k nutrition is calculated from weighed ingredients and USDA database
values, not a laboratory nutrient assay of each plate. The published CSV layout
has six dish fields and seven fields per ingredient; the downloader uses the
actual source file layout rather than the differing README field listing.

LeFood-Set nutrient labels are **null**. It supports portion evaluation and
manual recognition review, not measured kcal/macronutrient accuracy. Do not
invent nutrient references by treating a generic TKPI lookup as measured dish
nutrition. The official dataset does not expose a train/test split; independence
from every model's pretraining corpus is not established.

The LeFood-Set workbook contains additional rows whose images are not published
in the v1 file listing. Only rows with an available before-meal image can enter
the candidate pool. Exclusions and duplicate-image rows are recorded in
`manifests/lefood-set-source-audit.json`; missing images are not replaced by
after-meal images or unrelated photos.

Boba was trained on Nutrition5k. Report Nutrition5k results as evaluation in its
training domain, separately from LeFood-Set's Indonesian food results. Neither
subset establishes correctness across all Indonesian dishes. Balanced sampling
is a pilot design; it does not estimate the real-world distribution of meals.

Both original datasets are licensed **CC BY 4.0**. Credit:

- Thames, Q. et al. (2021), *Nutrition5k: Towards Automatic Nutritional
  Understanding of Generic Food*, CVPR, pp. 8903–8911.
- Sari, Yuita Arum; Wani, Yudi Arimba; Nakazawa, Atsushi (2025), *LeFood-Set:
  Leftovers Food Dataset*, Mendeley Data, V1, DOI `10.17632/cchsk79jkt.1`.
- [License](https://creativecommons.org/licenses/by/4.0/).

Changes: selecting subsets and converting source labels into JSONL. Source
images are not resized/edited. Image/metadata downloads remain local; source
links and selection manifests are versioned for reproducibility.

## Alibaba Cloud evaluation pipeline

The runner uses Alibaba Model Studio's **OpenAI-compatible HTTP endpoint**,
original images encoded as base64, and configurable thinking/JSON mode. No SDK/package
installation is needed. Provider protocol references:
[image inputs](https://www.alibabacloud.com/help/en/model-studio/vision) and
[JSON output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output).

Pipeline: validate local images/checksums → call one photo at a time → validate
JSON/units → checkpoint predictions → score each dataset → save JSON/CSV reports.
Only the original image and fixed task prompt go to the provider. Dataset names,
sample IDs, reference food names/weights/nutrients and source URLs are excluded
from the request. The default fixed prompt is versioned in `prompts/`.

### Configure once

From the repository root:

```sh
cp experiments/model-evaluation/.env.example experiments/model-evaluation/.env
```

Edit the ignored `.env` and provide these values:

| Variable | Value |
| --- | --- |
| `DASHSCOPE_API_KEY` | Model Studio API key; never added to CLI arguments or output files |
| `VLM_BASE_URL` | The actual compatible-mode `/v1` base URL shown for your workspace/region |
| `VLM_MODEL` | Primary snapshot: `qwen3.7-flash-2026-07-15` |
| `VLM_FALLBACK_MODEL` | User-selected image fallback: `qwen3.7-flash`; blank disables fallback |
| `VLM_THINKING_BUDGET` | Optional positive reasoning-token budget; requires thinking enabled |
| `VLM_HIGH_RESOLUTION_IMAGES` | Optional high-resolution input policy; defaults to false |

The Singapore workspace URL in the example is a **placeholder**. Replace
`YOUR_WORKSPACE_ID` or use the exact endpoint from your console. API keys are
region-specific; the DashScope native `/api/v1` URL is not the compatible-mode
endpoint used by this runner. Prefer a dated model snapshot when your account
offers one; the provider-returned model name/fingerprint is recorded when present.

The primary and fallback use the same endpoint and credential. The
[Qwen3.7 documentation](https://www.alibabacloud.com/help/id/model-studio/qwen3-7-flash)
lists image input for the snapshot and its dynamic alias. The alias may map to
the same snapshot; it is not an independent provider. `deepseek-v4-flash-0731`
is [text-only on Alibaba](https://www.alibabacloud.com/help/id/model-studio/deepseek-v4-flash)
and is rejected as an image primary/fallback before any paid request.

Defaults: JSON mode enabled, thinking disabled, temperature 0, maximum 1,024
output tokens, 120-second request timeout, at most two retries on transient
network/429/500/502/503/504 errors. `.env.example` lists the override variables.
For vision models that do not support JSON mode, set `VLM_JSON_MODE=false`; the
response still must satisfy the same local JSON schema. Current Alibaba docs
support JSON with thinking for Qwen3.7/3.8; the runner allows that combination
for those families. For older/unknown models, disable JSON mode when enabling
thinking. `VLM_THINKING_BUDGET` limits reasoning length; `max_tokens` limits the
answer for Qwen. Reported completion tokens can include both reasoning and answer.
Changing generation settings requires a new run directory. `--prompt /path/to/file`
selects a different versioned prompt, and its content/hash become part of the run
identity. `VLM_HIGH_RESOLUTION_IMAGES=true` raises the provider's pixel cap; it
does not recover details absent from a low-resolution source photo.
Environment variables already exported by your shell take precedence over `.env`.
The env file is parsed as literal data; shell code/interpolation is not executed.

### Dry-run, smoke test, then full evaluation

Dry-run needs **no API key** and makes **zero network requests**. It checks all
100 selected image files, hashes and references, and writes a plan only:

```sh
python3 experiments/model-evaluation/scripts/run_evaluation.py --dry-run
```

Once configured, test **five images total** (three Nutrition5k and two LeFood,
five initial API calls) in a new directory:

```sh
python3 experiments/model-evaluation/scripts/run_evaluation.py --total-limit 5 \
  --run-dir experiments/model-evaluation/results/alibaba-smoke
```

`--total-limit N` allocates N samples across the selected datasets round-robin,
using manifest order. It must cover every selected dataset. `--limit N` instead
selects N images **per dataset**; the two options are mutually exclusive.
The completed live five-image run and manual review are recorded in
[docs/SMOKE_TEST_2026-10-14.md](docs/SMOKE_TEST_2026-10-14.md).

Then process **50 images per dataset**, score automatically, and retain both
datasets' reports separately:

```sh
python3 experiments/model-evaluation/scripts/run_evaluation.py \
  --run-dir experiments/model-evaluation/results/alibaba-baseline
```

`--dataset nutrition5k` or `--dataset lefood-set` runs just that dataset.
For a different credentials file, use `--env-file /path/to/local/.env`.
Live runs send public dataset photos to Alibaba and consume API quota; dry-run
does neither. Retry counts are recorded. Connectivity checks on the locked test
images should not be used to tune prompts against their labels/results.

### Resume

Progress is checkpointed atomically after each sample. Existing successes and
errors are skipped by default, so an ordinary resume does not repeat paid calls:

```sh
python3 experiments/model-evaluation/scripts/run_evaluation.py --resume \
  --run-dir experiments/model-evaluation/results/alibaba-baseline
```

To retry failed samples explicitly, add `--retry-errors`. A retry replaces that
sample's prediction instead of adding a duplicate. The final retained token usage
does not include costs for earlier failed/replaced attempts.

Resume must use the same model, endpoint, generation/timeout/retry settings,
prompt and selected manifests/limit (including `--total-limit` when used).
A dry-run directory cannot be resumed as
a live run. Use a fresh directory for a new model or configuration. An exclusive
`.running` marker prevents concurrent writes to one run; after a process crash,
remove it only after checking that the prior process has stopped.

### Outputs and failure semantics

```text
results/<run>/
  run.json                 # prompt, settings, subset hashes, local runtime; no key
  predictions/
    nutrition5k.jsonl
    lefood-set.jsonl
  responses/               # retained API JSON per sample AND primary/fallback route
  reports/
    nutrition5k.json
    lefood-set.json
  summary.json
  summary.csv              # per-dataset/metric MAE, signed error and coverage
```

Prediction rows record status, nullable total estimates, visible component
names/portion estimates, limitations, provider model/response IDs, token usage,
attempt count and elapsed client time. Responses returned before schema failure
are retained for debugging; HTTP error bodies and credentials are not logged.
The recorded `response_path` identifies a raw response for that particular
prediction; an HTTP/network error has no new raw response.

Malformed/truncated JSON, invalid/negative/nonfinite numbers and incompatible
nonfood outputs count as `error`, not successful unknown recognition. Errors
400/404 or exhausted transient errors on the primary can trigger the configured
fallback. Invalid/truncated primary JSON can also trigger it. A valid response
with uncertain/null estimates stays on the primary; labels/scores never select
the route. Errors 401/403 stop the batch without fallback because both models
share a credential/endpoint. With no fallback, or a fallback 400/404, the existing
configuration-error stop applies. Unprocessed samples remain missing in coverage.
If both routes fail transiently, the sample is an error and the batch continues.

Each row records `requested_model`, `provider_model` when returned, `model_route`,
`fallback_used` and `routing_attempts` with primary/fallback errors and request
counts. Total sample latency includes both routes. Raw primary and fallback
responses use different paths, so an invalid primary output remains inspectable.
JSON reports include routing counts and `per_final_model` scores; summary CSV
distinguishes `routing_policy` from `final_model_subset`. These final model
subsets have different difficulty/selection and are not a matched head-to-head
benchmark. Changing either model invalidates resume and requires a fresh run.

Exit codes: `0` finished with no missing/error responses (or successful dry-run),
`1` reports contain failed/missing responses, `2` local setup/configuration failed.
Reports show MAE/bias with numeric coverage, response failures and latency
median/p95 separately for successes/errors. Latency includes network/backoff;
the cloud model's VRAM and GPU inference time are not measured. Token totals
cover returned final responses only; monetary cost is not invented.

Raw model nutrient estimates are an **experimental benchmark**. They are not
approved production nutrient values or clinical attention. The T32 production
pipeline still requires deterministic calculation from sourced catalog/rules.
LeFood's absent nutrient references produce null nutrient scores even if a model
returns numbers. Recognition names are captured for later manual annotation;
the runner does not fabricate F1 from hidden ingredient labels.

## Record and score real model predictions

Save one JSON object per line under `results/<model>/<dataset>.jsonl`. The
following is **only a format example**, not a real model response or score:

```json
{"sample_id":"COPY_ID_FROM_MANIFEST","status":"ok","prediction":{"mass_g":150,"energy_kcal":200,"protein_g":5,"carbohydrate_g":30,"fat_g":7}}
```

If inference fails, record an error; do not convert errors to successful
`unrecognized` analysis, or fill absent values with zero:

```json
{"sample_id":"COPY_ID_FROM_MANIFEST","status":"error","error":"provider timeout"}
```

Use `null` for unknown estimates. IDs must be unique and belong to the selected
dataset. Units are grams and kcal. Record model revision, quantization, prompt,
image preprocessing, generation settings, device, elapsed time and peak memory
alongside the prediction files before comparing runs.

Run once **per model and per dataset**, from the repository root:

```sh
python3 experiments/model-evaluation/scripts/evaluate_predictions.py \
  --manifest experiments/model-evaluation/manifests/nutrition5k-50.jsonl \
  --predictions experiments/model-evaluation/results/boba/nutrition5k.jsonl \
  --output experiments/model-evaluation/results/boba/nutrition5k-report.json
```

For LeFood-Set, substitute the LeFood manifest and predictions. Reports include
MAE, mean signed error, available-reference count, numeric coverage, omitted
responses and explicit failures. Errors are calculated only where both a valid
prediction and a reference exist; coverage prevents dropped failures from being
hidden. With no valid prediction/reference, error is `null`, not zero.

Recognition requires a separately reviewed list of **visible** components and
synonym mapping; Nutrition5k includes hidden ingredients such as oil. The scorer
does not claim recognition F1 or clinical-policy correctness. Validate sourced
attention, contracts, and deterministic nutrient math through the separate
provider tests required by T32. No model inference/accuracy is claimed merely
because data integrity or script unit tests pass.

## Tool tests

From the repository root:

```sh
uv run --with huggingface-hub==1.33.0 python -m unittest discover \
  -s experiments/model-evaluation/tests -p 'test_*.py' -v
```

Tests cover the real CSV field layout, before/after weight selection, preserved
unknown nutrients, reproducible balanced sampling, duplicate-image handling,
corrupt cached images and scoring failures/coverage. Test values are synthetic
and never exported as real predictions or production artifacts.
Runner tests additionally cover blinded requests, HTTP/auth/rate-limit/timeout
handling, strict response validation, credential redaction, dry-run, resume,
explicit retries, changed-run rejection and a complete mocked scoring workflow.
HF runner tests additionally cover the required provider/client configuration,
unserved-model blocking, native JSON conversion, incomplete portions, truncated
output, and auth failures. They do not call a live inference provider.
