# Ateeqq food-analysis: LeFood-Set smoke runner

Updated: 2026-10-14. Branch: `feat/t32-real-ai-service`.

`scripts/run_hf_food_analysis.py` tests `Ateeqq/food-analysis` using the explicitly requested
HF provider. It runs on the first five locked LeFood-Set images by default. It
does not download model weights or use the local GPU.

## Current verification and blocker

- Latest retry after the user changed `HF_TOKEN`: the previous 403 was replaced
  by HTTP 400, with the explicit message `Model not supported by provider
  hf-inference`. The first selected image was attempted through the SDK; no
  successful prediction was returned, and the remaining four images were not
  processed. A second diagnostic call confirmed the same rejection. Artifacts:
  `results/hf-food-analysis-token-retry-2026-10-14/`. There is no live MAE.
- Earlier follow-up after the user first configured `HF_TOKEN`: token loading succeeded, but
  the provider mapping remained empty. A direct `InferenceClient` attempt on
  `lefood-1` returned HTTP 403: the token lacks permission to call Inference
  Providers on behalf of the account. No valid model output was returned. Token
  permission and model hosting are separate blockers; changing permission does
  not prove this model is hosted. Diagnostic artifacts are in
  `results/hf-food-analysis-token-preflight-2026-10-14/` and
  `results/hf-food-analysis-sdk-probe-2026-10-14/`.
- Dry-run verified five original image files against manifest checksums: Bubur
  (`lefood-1`), Nasi (`lefood-14`), Tim (`lefood-150`), Telur orak arik
  (`lefood-159`), and Kroket Daging (`lefood-162`). No network calls in dry-run.
- Public Hub provider preflight returned an empty provider mapping for model
  revision `62063148670d92d7a2df04e75b7c73b0b35caf77`. The
  [model page](https://huggingface.co/Ateeqq/food-analysis) also states it is not
  deployed by any Inference Provider. A model on the Hub is not automatically
  available through `hf-inference`.
- Before those follow-ups, no exported, experiment-file, or cached HF token was available.
- The initial live-path command stopped with exit 2 and recorded both blockers. **Zero
  image inference calls were made; there are no live predictions or MAE.** A token
  alone will not make this unserved model available.
- Nine HF offline tests passed. Mock responses demonstrate runner behavior,
  not the model's recognition or portion accuracy.
- The complete experiment suite passed: 42 tests, using
  `uv run --with huggingface-hub==1.33.0 python -m unittest discover -s experiments/model-evaluation/tests -p 'test_*.py' -v` from the repository root.

The model card describes a Qwen3-VL-2B LoRA adapter and demonstrates loading a
base model plus the adapter locally. This runner preserves the requested hosted
provider and checks current serving availability each time.

## Run from the repository root

```sh
cd /home/neva/Lomba/JOINTS-UGM/carin
uv run experiments/model-evaluation/scripts/run_hf_food_analysis.py --limit 5 --dry-run
```

For a live attempt, set `HF_TOKEN` in the ignored
`experiments/model-evaluation/.env`, or use an exported/cached Hugging Face token.
The placeholder `HF_TOKEN_ANDA` must be replaced with an actual token locally.
The token needs permission to make Inference Providers calls.
The initialization follows the [InferenceClient API](https://huggingface.co/docs/huggingface_hub/package_reference/inference_client):

```python
client = InferenceClient(provider="hf-inference", token=hf_token, timeout=120)
```

```sh
uv run experiments/model-evaluation/scripts/run_hf_food_analysis.py --limit 5
```

The PEP 723 script installs the tested SDK version `huggingface-hub==1.33.0`
through `uv`. `--env-file` selects a different local credentials file.
`--run-dir` selects a fresh output folder; existing folders are not overwritten.
Default output folders are timestamped under the ignored `results/` directory.
There is no alternate-provider fallback. Exit codes: 0 for dry-run/completed,
1 for failed/missing inference responses, 2 for setup/provider/token blockers.

An explicit `--probe-unlisted` makes at most one image attempt when the Hub has
no live provider mapping, for diagnosing permission/router behavior. Unprocessed
samples remain missing; it cannot manufacture deployment or a successful benchmark.

## Output and scoring

The fixed `prompts/food-analysis-hf-v1.txt` uses the model-card JSON structure:
`dish_name`, `food_type`, `cooking_method`, `nutritional_summary`, and
`portion_size`. It explicitly asks for edible grams for each portion entry and
nutrients for the whole pictured meal. Numeric fields are estimates, not measured
ground truth. Numeric-only quantities cannot independently prove correct units.

Only image bytes and this fixed prompt go to the provider. Reference food names,
weights, dataset identity, and sample IDs stay local. After each attempted image,
the runner checkpoints predictions and retains redacted raw responses. It rejects
truncated/non-JSON output, negative/nonfinite values, booleans, and unit strings.
Unknown component mass makes the total mass null; a known subtotal is not scored
as a complete total.

`report.json` uses the existing scorer for **portion MAE and coverage**. LeFood
has no calorie/macro references, so nutrient MAE remains null. Source names and
predicted dish names are retained for manual recognition review, without claiming
an automatic F1 score. This native-schema prompt differs from the Qwen baseline;
the result is not a controlled comparison against that baseline.

Observed local artifacts:

- `results/hf-food-analysis-dry-2026-10-14/`: verified five-image plan.
- `results/hf-food-analysis-preflight-2026-10-14/`: blocked provider/token status.

## Sourced nutrition direction

For the production service, retain the existing specification's pipeline:
VLM label/portion proposal → match a versioned food/preparation entry → compute
each nutrient as `mass_g / 100 * nutrient_per_100g` → apply supported rules.
For multiple components, sum known nutrient contributions and report coverage;
unknown quantities must not become zero or a complete total.

Candidate source roles suggested by the user:

- TKPI/Panganku for Indonesian foods. The [supplied site](https://www.panganku.org/)
  returned HTTP 403 during this check; its item count/export/API were not verified.
- [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) for supported generic
  foods/ingredients. Search and details APIs require a data.gov key. Match raw vs
  cooked and preparation explicitly; retain the food ID, units, and source version.
- [Open Food Facts](https://openfoodfacts.github.io/openfoodfacts-server/api/) for
  identified packaged products. Match the product/barcode and normalize the
  reported nutrient basis and units before calculation.

These are integration candidates, not installed or approved T31 artifacts. This
smoke runner does not implement source ingestion, catalog matching, production
nutrient calculation, or clinical validation. Sourced arithmetic prevents invented
nutrient coefficients but cannot correct wrong food matches or wrong portion sizes.

## Test the runner offline

```sh
uv run --with huggingface-hub==1.33.0 python -m unittest discover \
  -s experiments/model-evaluation/tests -p test_hf_food_analysis.py -v
```

Runner, prompts, tests, and documentation are versioned on the requested branch.
Dataset/reference files remain local and ignored.
