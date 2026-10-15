# Qwen 3.8 thinking and visual-scale experiments; HF token retry

Date: 2026-10-14. Branch: `feat/t32-real-ai-service`.

## Outcome

Thinking with the original prompt improved portion MAE on this small paired set.
The longer visual/geometry prompt was worse overall, despite making the nasi
portion more accurate. Neither variant correctly identified the source-labeled
bubur. The new HF token cleared the earlier permission rejection, but the router
explicitly rejected `Ateeqq/food-analysis` as unsupported by `hf-inference`.

## Qwen experiment design

Baseline: existing `qwen3.8-max` five-image run. New runs each used the identical
five original image bytes, sample IDs, and checksums: three Nutrition5k images
and two LeFood images. The endpoint matched the Qwen 3.8 baseline. All ten new
requests succeeded with one attempt each and no fallback. Both variants correctly
returned non-food/null values for the empty-plate image.

Shared new settings: `enable_thinking=true`, `response_format=json_object`,
`thinking_budget=4096`, `temperature=0`, `max_tokens=1024`, timeout 180 s,
one maximum retry, and no fallback. Qwen's `max_tokens` caps the answer; the
thinking budget separately bounds reasoning. Baseline timeout/retry settings
were 120 s/two retries, but no run used a retry.

- **Thinking v1:** original `food-estimation-v1.txt`; original resolution policy.
- **Thinking visual-scale v2:** `food-estimation-v2-visual-scale.txt`; explicitly
  enabled `vl_high_resolution_images`. The new prompt considers rice texture,
  per-component occupied volume, perspective, hidden height, and avoiding double
  packing corrections. It asks for assumptions and retains the existing JSON
  schema. It does not impose unsourced fixed packing/density constants or ban
  particular rounded weights.
- V2 adds real acquisition metadata: the large placemat grid squares are 2 cm,
  as documented in the [LeFood paper, section 2.1](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0320426).
  This conditional scale input is distinct from the image-only baseline. Neither
  ground-truth food names nor reference weights/nutrients were sent to the API.

These five samples and earlier errors were already inspected when developing the
new prompt. This is an exploratory development comparison, not independent held-out
validation. V2 changes prompt, calibration context, and resolution policy together;
it does not isolate their individual effects. A single run per condition does not
measure inference variance or prove a root cause.

## Measured accuracy

| Metric | Qwen 3.8 baseline | Thinking v1 | Thinking visual-scale v2 |
| --- | ---: | ---: | ---: |
| Nutrition5k mass MAE | 66.5 g | 64.0 g | 144.0 g |
| Nutrition5k energy MAE | 31.31 kcal | 18.81 kcal | 75.31 kcal |
| Nutrition5k protein MAE | 0.191 g | 1.091 g | 1.991 g |
| Nutrition5k carbohydrate MAE | 6.922 g | 4.472 g | 17.172 g |
| Nutrition5k fat MAE | 0.168 g | 0.118 g | 0.168 g |
| LeFood mass MAE | 113.5 g | 69.5 g | 93.5 g |
| Four-food pooled mass MAE (descriptive only) | 90.0 g | 66.75 g | 118.75 g |

Nutrition5k numeric coverage is 2/3 in every run because the empty plate correctly
gets null estimates. Its mass/nutrient MAEs use only two food images. LeFood
portion coverage is 2/2; it has no energy/macro references, so those nutrient
MAEs remain unavailable. The pooled figure weights the four numeric food pairs
equally and is not a population-wide or dataset-balanced generalization claim.

Thinking v1 reduced LeFood portion MAE by 38.8% and the four-food pooled MAE by
25.8% relative to the Qwen 3.8 baseline. Its Nutrition5k energy MAE improved,
but protein MAE worsened. V2's pooled mass MAE was 31.9% worse than baseline.

## Per-image portion estimates

| Sample | Reference | Baseline | Thinking v1 | Thinking v2 |
| --- | ---: | ---: | ---: | ---: |
| `dish_1557861216` | Empty plate; source 1 g artifact | null | null | null |
| `dish_1557937037` | 49 g | 60 g | 70 g | 65 g |
| `dish_1558031394` | 318 g | 440 g | 425 g | 590 g |
| `lefood-1` (Bubur) | 343 g | 150 g | 220 g | 160 g |
| `lefood-14` (Nasi) | 184 g | 150 g | 200 g | 180 g |

Baseline called Bubur cooked white rice. Thinking v1 called it sticky/glutinous-looking
cooked rice; v2 called it soft steamed rice. Texture instructions did not resolve
this recognition error. V2 still inferred large dimensions for the mixed dish
without known scale, illustrating that plausible geometry assumptions can amplify
mass error. This observation does not establish a causal diagnosis.

## Tokens and latency

| Measurement, five images | Baseline | Thinking v1 | Thinking v2 |
| --- | ---: | ---: | ---: |
| Input tokens | 3,227 | 3,217 | 4,972 |
| Image tokens (included in input) | 1,577 | 1,577 | 1,577 |
| Input text tokens (included in input) | 1,650 | 1,640 | 3,395 |
| Completion tokens, including reasoning | 1,083 | 5,405 | 8,751 |
| Reasoning tokens (included in completion) | 0 | 4,027 | 7,035 |
| Total tokens | 4,310 | 8,622 | 13,723 |
| Mean total tokens per image | 862.0 | 1,724.4 | 2,744.6 |
| Median client latency | 7.76 s | 26.84 s | 49.09 s |

Reasoning tokens are already included in completion totals; do not count them
again. Provider-reported answer text and reasoning breakdowns can differ from
completion totals by a few framing tokens. These are token counts, not charges.
Latency includes network and provider time and is not GPU-only inference time.

| Sample | Baseline total | Thinking v1 total | Thinking v2 total |
| --- | ---: | ---: | ---: |
| Empty plate | 742 | 1,051 | 1,403 |
| Raspberries | 853 | 1,490 | 1,926 |
| Mixed dish | 948 | 2,442 | 3,793 |
| Bubur | 857 | 1,984 | 3,042 |
| Nasi | 910 | 1,655 | 3,559 |

Original resolutions are 640x480 for Nutrition5k, 676x492 for Bubur, and 705x517
for Nasi. High-resolution mode did not increase image tokens: every condition
used 302 for each Nutrition5k image, 317 for Bubur, and 354 for Nasi. This source
material was below the ordinary pixel cap. Merely raising that cap did not add
visual evidence.

Correction to the earlier token explanation: the normalized prediction rows kept
combined input counts, but raw API responses contain separate image/text details.
The previous Qwen 3.7 and Qwen 3.8 baseline runs also both used 1,577 image tokens;
their input difference was in reported text counts.

## Assessment of the supplied advice

The claimed root causes in the supplied Argon note are hypotheses, not established
by the five-image benchmark. Two 150 g estimates alone do not prove a default
serving-size mechanism, and the images cannot establish a universal void fraction.
No exact packing/density constants from the note were presented as validated data.

The claim that thinking and JSON cannot coexist is outdated for these model
families: current [Alibaba structured-output documentation](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)
lists Qwen3.7/3.8 support. Both new image runs successfully used thinking plus
JSON object mode. [API documentation](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions)
explains the separate thinking budget and high-resolution pixel policy.

Thinking v1 is the stronger portion-estimation candidate in this pilot. Further
work should use separate development photos, independent evaluation, supported
food/preparation confirmation, and measured or calibrated portion information.
Sourced TKPI/USDA/OFF arithmetic remains a separate production step; these runs
do not install a verified catalog or validate personalized health rules.

## HF retry outcome

The first token configuration returned 403 for missing inference permissions.
After the user changed the token, the runner's explicit `--probe-unlisted`
attempt returned HTTP 400. A diagnostic SDK call confirmed: `Model not supported
by provider hf-inference`. The Hub mapping remained empty. Token permission and
model serving availability are separate concerns. No successful HF inference or
MAE is reported, and no different model/provider was silently substituted.

## Artifacts, verification, and handoff

All run artifacts are local and Git-ignored under `results/`:

- `qwen3.8-max-smoke-5-2026-10-14/`: original Qwen 3.8 baseline.
- `qwen38-thinking-v1-5-2026-10-14/`: thinking with original prompt.
- `qwen38-thinking-visual-scale-v2-5-2026-10-14/`: thinking with new prompt/context.
- `qwen38-ablation-2026-10-14/comparison.json`: paired checksums, configuration,
  per-sample counts, raw token breakdowns, and metrics.
- `hf-food-analysis-token-retry-2026-10-14/`: failed HF retry and diagnostic.

Runner changes: `--prompt`, optional thinking budget/high-resolution settings,
JSON+thinking compatibility for Qwen3.7/3.8, and reasoning-token attribution.
HF runner adds a bounded explicit unlisted-model probe. Fixed prompts and tests
are versioned; keys stay in ignored `.env` files. All 42 experiment tests passed
from the repo root using the documented SDK version. Pairing checks confirmed
matching image hashes and successful primary responses with no retries/fallback.

Changes are versioned on the requested branch, with experiment code organized
into `scripts/`, `tests/`, and `docs/`. Production service defaults were
not changed. Next: evaluate the promising configuration on independent samples;
HF needs actual provider deployment before this model can be benchmarked there.
