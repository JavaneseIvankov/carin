# OmniFood8K local RTX 3050 smoke test

Date: 2026-10-14
Branch: `feat/t32-real-ai-service`

## Result

OmniFood8K ran locally on the RTX 3050 Laptop GPU (4 GB VRAM) for five locked
images: three Nutrition5k and two LeFood-Set. FP32 inference and INT8 weight-only
inference both completed without a system-RAM or GPU-memory kill. The runtime
fits this GPU, but these five predictions are far too inaccurate to recommend
this checkpoint for the current application.

The Nutrition5k mean absolute calorie error was **1,277.9 kcal** in FP32 and
**1,274.1 kcal** in INT8. Mean mass error was **190.4 g** and **189.2 g**,
respectively. On the empty-plate Nutrition5k image, the FP32 model still
predicted about **454 kcal and 83 g**. LeFood has measured mass labels only;
its two-image mass MAE was **186.0 g** in FP32 and **184.1 g** in INT8. Five
images are only a smoke test, but this result is a clear warning against using
the checkpoint as-is.

| Metric | FP32 MAE | INT8-linear MAE | Numeric coverage |
| --- | ---: | ---: | ---: |
| Nutrition5k energy | 1,277.9 kcal | 1,274.1 kcal | 3/3 |
| Nutrition5k mass | 190.4 g | 189.2 g | 3/3 |
| Nutrition5k fat | 25.35 g | 25.20 g | 3/3 |
| Nutrition5k carbohydrate | 12.25 g | 12.19 g | 3/3 |
| Nutrition5k protein | 7.96 g | 7.91 g | 3/3 |
| LeFood-Set mass | 186.0 g | 184.1 g | 2/2 |

LeFood-Set has no measured calorie or macro references, so no nutrient MAE is
reported for it. MAE is calculated only on this locked subset, not the full
50-image manifests.

## Runtime and memory

| Mode | Mean end-to-end latency | Mean nutrition-model latency | Peak nutrition VRAM | Peak depth-model VRAM |
| --- | ---: | ---: | ---: | ---: |
| FP32 | 0.433 s/image | 0.144 s/image | 1,229 MiB | 1,020 MiB |
| INT8 weight-only Linear layers | 0.440 s/image | 0.152 s/image | 848 MiB | 1,020 MiB |

End-to-end latency includes Depth Anything V2 Large, which runs separately
from the nutrition model. The tested INT8 mode quantizes `Linear` layers in
OmniFood's Swin and ConvNeXt backbones only; convolutions, fusion heads, the
adapter and Depth Anything are not INT8. It reduced the nutrition model's
allocated VRAM by about **31%**, but was about **2% slower end-to-end** on this
GPU. The separate depth stage remains the VRAM high-water mark. FP32 fits within
the 4 GB card, so forced FP16 is unnecessary for this setup.

## Test setup

- Device: NVIDIA GeForce RTX 3050 Laptop GPU, 4,096 MiB VRAM.
- Runtime: PyTorch 2.10.0+cu130; input size 384×384 for OmniFood and 518 for
  Depth Anything V2 Large.
- The official OmniFood test path applies `DepthAdapterV4` and sends the
  generated RGB-depth composite to ConvNeXt. The local runner mirrors that
  path; the project README points to Depth Anything V2 for predicted depth
  generation. See the [official test and data code](https://github.com/yudongjian/OmniFood8K-food/blob/main/test.py),
  [dataset loader](https://github.com/yudongjian/OmniFood8K-food/blob/main/mydataset.py),
  and [depth-generation example](https://github.com/yudongjian/OmniFood8K-food/blob/main/run.py).
- The official OmniFood checkpoint was converted to local safetensors while
  excluding optimizer state: 1,160,700,936 bytes in FP32 and 582,388,800 bytes
  in FP16. Depth Anything V2 Large FP16 weights are 670,674,850 bytes.
- The initial forced-FP16 experiment produced non-finite predictions and was
  excluded from the scored result. The official model path uses FP32; the
  scored comparison is therefore FP32 versus INT8 weight-only Linear layers.
- The final run used the same five IDs from the earlier evaluation subset:
  `dish_1557861216`, `dish_1557937037`, `dish_1558031394`, `lefood-1`, and
  `lefood-14`.

## RAM and disk note

The kernel's OOM record from the earlier interruption names `soffice.bin` as
the killed process, at about 12.4 GB resident memory. That identifies the OOM
victim, not necessarily the only process contributing to memory pressure; the
OmniFood inference runner had not started at that time. The later model
preparation and smoke runs completed without OOM. After the FP32 checkpoint
was prepared, the filesystem had about 9.4 GB free. Disk capacity was not the
cause of the earlier kill.

## Artifacts

- `run_omnifood.py`: local inference and scoring runner.
- `prepare_omnifood.py`: resumable range extraction, tensor conversion and
  source preparation.
- `results/omnifood-3050-mobile-2026-10-14/summary.json`: full metrics,
  per-image predictions, per-stage timings and VRAM measurements.
- `results/omnifood-3050-mobile-2026-10-14/fp32-nutrition5k-score.json` and
  `.../int8-linear-nutrition5k-score.json`: Nutrition5k scores.
- `results/omnifood-3050-mobile-2026-10-14/fp32-lefood-set-score.json` and
  `.../int8-linear-lefood-set-score.json`: LeFood-Set scores.

Model weights, source cache, virtual environment, images and result files are
local-only and ignored by Git. The report and runner files are under
`experiments/model-evaluation/` on the requested branch.
