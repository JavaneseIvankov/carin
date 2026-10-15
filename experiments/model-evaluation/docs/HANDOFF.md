# Dataset and Alibaba evaluation pipeline handoff

Updated: 2026-10-14. Dataset prepared: 2026-10-13.
Branch: `feat/t32-real-ai-service`.

## Task / scope

Prepared **50 images per dataset**, in separate local experiment folders, and
an Alibaba Cloud vision evaluation pipeline ready for user-supplied credentials.
The attached
T32/C32 issue is context: it assigns held-out evaluation to C33. This change
prepares evaluation data/tools and does not claim implementation of T32 REST
endpoints or approval of T31 food/rule artifacts.

## Changes and affected files

All changes are under `experiments/model-evaluation/`:

- `download_datasets.py`: bounded per-image downloads, deterministic seed 32,
  balanced selection, original-source label parsing, integrity checks and resume.
- `evaluate_predictions.py`: per-dataset numerical MAE/bias with explicit
  reference/prediction coverage and missing/failed response counts.
- `run_evaluation.py`: Alibaba OpenAI-compatible API adapter, blinded base64
  image requests, strict nullable response validation, bounded retries,
  atomic checkpoints, dry-run, resume and per-dataset reports/CSV summary.
  Primary: `qwen3.7-flash-2026-07-15`; user-selected fallback: `qwen3.7-flash`.
  Failed primary calls/invalid outputs can route to fallback; shared-key auth
  errors stop. Model/route attribution and final-model subset scores are explicit.
- `prompts/food-estimation-v1.txt`: fixed versioned food/portion/nutrient task.
- `.env.example`: key/region endpoint/model configuration; ignored local `.env`
  now has user-supplied credentials and was used for the live smoke test.
- `test_evaluation.py`, `test_runner.py`: 30 tool/runner tests; values and
  provider responses in tests remain synthetic and temporary.
- `manifests/`: locked 50-row subsets, source identifiers, real labels, SHA-256,
  LeFood source audit and dataset verification report.
- `README.md`, `.gitignore`: setup, commands, licenses, scoring limits and local
  binary/cache exclusions.

Local image totals: Nutrition5k **20,893,685 bytes**; LeFood-Set **2,309,616 bytes**.
Entire experiment directory is approximately 26 MiB, including original metadata.
Nutrition5k has 17 single-ingredient, 16 two-to-four-ingredient and 17
five-or-more-ingredient samples. LeFood selection covers 34 source food names.

## Verification

Working directory for all commands:
`/home/neva/Lomba/JOINTS-UGM/carin`.

1. `python3 experiments/model-evaluation/download_datasets.py`:
   passed; 50 PNGs from Nutrition5k official depth-test IDs (RGB only), plus 50
   LeFood before-meal JPEGs. Rerun passed without changing either manifest hash.
2. `python3 -m unittest discover -s experiments/model-evaluation -p 'test_*.py' -v`:
   **30 tests passed**. Covers source field parsing, pre-meal weights, unavailable
   source images, unknown nutrient values, deterministic sampling, corruption and
   scoring/failure coverage; blinded payloads, HTTP/auth/rate-limit/timeouts,
   malformed/truncated JSON, nonfood/null handling, credential redaction,
   dry-run, configuration-bound resume, explicit retries and mocked full scoring;
   fallback on unavailable snapshots/invalid JSON, primary response preservation,
   valid-null/auth cases without fallback, both-route failure, changed fallback
   invalidating resume, known text-only model rejection, and exact total sample
   allocation across datasets with boundary validation.
3. `uv run --with PyYAML --with jsonschema --with openapi-spec-validator python specs/validate-contracts.py`:
   **PASS**: two OpenAPI documents, 38 operations, 408 local references, five
   fixtures and three negative probes. This is schema/fixture verification, not
   a real-service provider test.
4. One-off local integrity audit using Python 3.14.7 and installed Pillow:
   all **100 images** passed `Image.verify()` and full decode; checksums/byte
   counts matched manifests; IDs and image hashes were unique per subset.
   All selected reference values matched their original CSV/XLSX source rows.
   All Nutrition5k IDs belonged to the official test set and none to train.
   Results are recorded in `manifests/dataset-verification.json`.
5. `python3 experiments/model-evaluation/run_evaluation.py --dry-run --run-dir experiments/model-evaluation/results/alibaba-ready-plan`:
   **PASS**: 50 Nutrition5k + 50 LeFood inputs validated; **zero API requests**.
   The dry-run saved configuration/subset metadata only, not predictions/scores.
6. `python3 experiments/model-evaluation/run_evaluation.py --help`: passed.
7. `git diff --check`: passed. Image/source caches, local `.env` and results are
   Git-ignored; `.env.example` remains visible for version control.
8. `python3 experiments/model-evaluation/run_evaluation.py --total-limit 5 --run-dir experiments/model-evaluation/results/smoke-5-2026-10-14`:
   **PASS (live)**: three Nutrition5k and two LeFood responses, all on
   `qwen3.7-flash-2026-07-15`, one attempt each, zero fallback/error responses.
   Added `--total-limit` so five means five overall rather than per dataset.
   All five images were also visually reviewed against source/model labels.
   See `SMOKE_TEST_2026-10-14.md` for numeric scores and interpretation.

## Additional local model experiment: OmniFood8K

On the same five locked images, OmniFood8K completed in FP32 and INT8
weight-only modes on the RTX 3050 Laptop GPU (4 GB). Peak allocated VRAM was
1,229 MiB for FP32 nutrition inference and 848 MiB for INT8 Linear layers;
Depth Anything V2 peaked at 1,020 MiB. Mean end-to-end latency was 0.433 and
0.440 seconds per image, respectively. The small INT8 memory reduction did not
make this run faster.

Accuracy was poor on this subset: Nutrition5k calorie MAE was 1,277.9 kcal and
mass MAE 190.4 g in FP32; LeFood mass MAE was 186.0 g. Do not use this
checkpoint as-is for app estimates. Only three Nutrition5k images have nutrient
labels in this smoke run, and LeFood only has mass labels. See
`OMNIFOOD_3050_SMOKE_TEST_2026-10-14.md` for full per-image output, limitations,
resource measurements and the earlier RAM-kill diagnosis.

## Source limitations / unverified work

- LeFood's original workbook has 678 data rows, but the public v1 listing only
  supplies before-meal images for 524 of them. **154 unavailable-image rows**
  were excluded before selection and listed in the source audit. Their pictures
  were not substituted. No byte-identical candidates were deduplicated in v1.
- LeFood nutrient references remain null; there are no measured calorie/macro
  labels. Numerical nutrient accuracy can only be scored on Nutrition5k here.
- Nutrition5k nutrient references derive from weighed ingredients plus nutrient
  databases. Hidden ingredients are not visible-component recognition labels.
- Live Alibaba/Qwen inference was run on **five of the 100 collected images**.
  Portion MAE: Nutrition5k 161.5 g (two numeric food predictions), LeFood 113.5 g
  (two). Nutrition5k energy MAE: 79.31 kcal. Full 100-image accuracy remains
  unmeasured. Fallback compatibility was not exercised by live requests.
- One Nutrition5k sample is an empty plate with source `plate only` and a 1 g
  mass artifact; correct nonfood output leaves numerical coverage at 2/3.
  A mixed-food sample has a `deprecated` ingredient name. Source references
  and raw reports were preserved; manual interpretation is documented separately.
- Recognition names are captured for later manual review; no F1 is fabricated
  from source ingredient lists that may include hidden ingredients.
- `qwen3.7-flash` is a dynamic alias and may point at the chosen primary snapshot.
  Fallback routing is not proof of an independent model/provider. Per-final-model
  scores cover different selected subsets; the overall score evaluates the policy.
- Reported latency is client wall time with network/retries, not cloud GPU time.
  Token usage covers retained final responses; prior failed/replaced attempts'
  usage and monetary charges remain unknown.
- Deployment, clinical policy review and end-to-end application integration were
  not run.
- T32 endpoints/provider tests and verified T5/T31 dependencies remain outside
  this dataset-preparation change. Do not mark that GitHub issue complete.

## Next step

The five-image smoke test is complete. Review its report before deciding to run
all 100 images in a fresh results directory. The runner saves validated
predictions, raw returned responses, latency/token metadata and separate dataset
reports automatically. `--resume` skips existing records; `--retry-errors` is
explicit. Use different images for prompt tuning and review visible components
before claiming recognition F1. Full commands are in the README.

## Worktree state

Changes are **uncommitted/unpushed**, ready for review on the requested branch.
Pre-existing untracked `.codegraph/` has been preserved. Binary images and raw
source caches are local only; downloader and locked manifests reproduce them.
