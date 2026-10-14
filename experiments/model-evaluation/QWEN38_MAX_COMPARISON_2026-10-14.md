# Qwen 3.8 Max vs Qwen 3.7 Flash: paired smoke test

Date: 2026-10-14  
New model: `qwen3.8-max`  
Reference run: `qwen3.7-flash-2026-07-15`

## Result

Qwen 3.8 Max reduced the measured portion and nutrient errors on the two food
images from Nutrition5k. It did not improve the two LeFood-Set portion estimates:
both models returned the same 150 g cooked-white-rice estimate for each image,
including labeling the bubur image as rice. Qwen 3.8 Max was slower in this run.
Five images are too few to establish a general performance difference.

## Method

Both runs used the same five locked images: three from Nutrition5k and two from
LeFood-Set. Sample IDs and image checksums match. The original image and the same
prompt were sent without reference labels, food names, weights, or nutrients.
The prompt SHA-256 was identical. Both runs used temperature 0, JSON output,
thinking disabled, and a 1,024-token output limit. Qwen 3.7's configured fallback
was not used; fallback was disabled for the Qwen 3.8 run. All five requests for
each model returned valid responses.

The endpoint route changed between runs (workspace-scoped Singapore endpoint for
the Qwen 3.7 run; Alibaba international compatible endpoint for Qwen 3.8). Treat
this as a useful paired smoke test, not a fully controlled model-only benchmark.
Alibaba's [visual understanding model list](https://www.alibabacloud.com/help/en/model-studio/vision-model)
includes Qwen 3.8 Max as an image-capable model.

## Numeric comparison

| Dataset / metric | Qwen 3.7 Flash | Qwen 3.8 Max | Change |
| --- | ---: | ---: | ---: |
| Nutrition5k mass MAE | 161.5 g | 66.5 g | 58.8% lower |
| Nutrition5k energy MAE | 79.31 kcal | 31.31 kcal | 60.5% lower |
| Nutrition5k protein MAE | 1.691 g | 0.191 g | 88.7% lower |
| Nutrition5k carbohydrate MAE | 19.122 g | 6.922 g | 63.8% lower |
| Nutrition5k fat MAE | 0.268 g | 0.168 g | 37.3% lower |
| LeFood-Set mass MAE | 113.5 g | 113.5 g | No change |

Nutrition5k MAEs are calculated on only two food images with numeric references;
numeric coverage is 2/3 because the third image is an empty plate, correctly
reported as non-food with null estimates. The source's 1 g empty-plate weight is
not a meaningful food portion. LeFood-Set has measured portion references but no
energy or macro references, so its nutrient MAEs are unavailable.

## Per-image observations

| Image | Reference | Qwen 3.7 | Qwen 3.8 Max |
| --- | --- | --- | --- |
| Nutrition5k `dish_1557861216` | Empty plate | Correctly says non-food; null estimates | Same |
| Nutrition5k `dish_1557937037` | Raspberries, 49 g | Raspberries, 80 g (+31 g) | Raspberries, 60 g (+11 g) |
| Nutrition5k `dish_1558031394` | Mixed melon and root vegetables, 318 g | 610 g (+292 g) | 440 g (+122 g) |
| LeFood `lefood-1` | Bubur, 343 g | Cooked white rice, 150 g (-193 g) | Same |
| LeFood `lefood-14` | Nasi, 184 g | Cooked white rice, 150 g (-34 g) | Same |

The Nutrition5k mixed-dish reference contains a deprecated label, so the
qualitative food-name comparison is not a clean recognition score. On these
examples, Qwen 3.8 moved the mass estimates closer to the references but still
substantially overestimated the mixed dish and did not fix bubur recognition.

## Operational comparison

- Successful responses: 5/5 for both models; no fallback used.
- Median client latency across the five samples: 2.74 s for Qwen 3.7 and 7.76 s
  for Qwen 3.8 Max (about 2.8x longer). This includes network time and is not GPU
  inference time.
- Reported usage: 4,159 total tokens for Qwen 3.7 and 4,310 for Qwen 3.8 Max
  (about 3.6% more). Token totals are not a monetary cost comparison.

### Token usage per inference

Each cell is **input + output = total**. API input counts include the image,
text prompt, and request framing; the retained usage does not separate image
tokens from text tokens. These are actual provider-reported counts for each
single-image request, not estimates of image-only token use.

| Image | Qwen 3.7 Flash | Qwen 3.8 Max |
| --- | ---: | ---: |
| Empty plate | 620 + 89 = 709 | 632 + 110 = 742 |
| Raspberries | 620 + 191 = 811 | 632 + 221 = 853 |
| Mixed dish | 620 + 292 = 912 | 632 + 316 = 948 |
| Bubur | 635 + 197 = 832 | 647 + 210 = 857 |
| Nasi | 672 + 223 = 895 | 684 + 226 = 910 |
| Total, five requests | 3,167 + 992 = 4,159 | 3,227 + 1,083 = 4,310 |
| Mean per request | 633.4 + 198.4 = 831.8 | 645.4 + 216.6 = 862.0 |

Relative to Qwen 3.7, Qwen 3.8 used 1.9% more input tokens, 9.2% more output
tokens, and 3.6% more total tokens on these five requests. Token rates for each
model and direction must be applied separately to calculate monetary cost.

## Interpretation and limits

Qwen 3.8 Max is promising for portion estimation on these two Nutrition5k food
photos, but there is no observed improvement on the Indonesian LeFood examples.
The small sample, different endpoint routes, uncertain training-data overlap,
and lack of LeFood nutrient labels prevent a broad quality or health-safety
claim. Keep nutrient calculations grounded in the approved catalog and rules;
do not use these raw VLM estimates as medical advice.

For reproducibility, local run artifacts are in the Git-ignored directories:

- `results/smoke-5-2026-10-14/`
- `results/qwen3.8-max-smoke-5-2026-10-14/`
