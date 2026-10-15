"""Produce real segmentation-area and relative-depth features for the locked B0 images."""
import argparse
import gc
import hashlib
import json
from pathlib import Path
import sys
import time

import cv2
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F
from transformers import CLIPSegProcessor, CLIPSegForImageSegmentation
from huggingface_hub import HfApi
from safetensors.torch import load_file

from download_datasets import ROOT, save_bytes
from run_evaluation import json_bytes, validate_samples


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "results/qwen37-ablation-cv-2026-10-14")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(2)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    rows = [r for ds,n in (("nutrition5k",3),("lefood-set",2))
            for r in validate_samples(ROOT, ROOT / f"manifests/{ds}-50.jsonl", n)]
    repo = "CIDAS/clipseg-rd64-refined"
    revision = HfApi().model_info(repo).sha
    cache = ROOT / "data/cv-models"
    processor = CLIPSegProcessor.from_pretrained(repo, revision=revision, cache_dir=cache)
    model = CLIPSegForImageSegmentation.from_pretrained(repo, revision=revision, cache_dir=cache).to(device).eval()
    queries = ["food on the plate", "plate or bowl"]

    @torch.inference_mode()
    def masks(row):
        image = Image.open(ROOT / row["image_path"]).convert("RGB")
        inputs = processor(text=queries, images=[image,image], return_tensors="pt", padding=True).to(device)
        logits = model(**inputs).logits
        probability = torch.sigmoid(F.interpolate(logits[:,None].float(),
            size=(image.height,image.width), mode="bilinear", align_corners=False))[:,0].cpu().numpy()
        return np.asarray(image), probability[0] >= .5, probability[1] >= .5

    masks(rows[0])  # Warm-up excluded from per-sample timings.
    samples = {}; binary_masks = {}
    for row in rows:
        start = time.perf_counter()
        rgb, food, container = masks(row)
        if device == "cuda": torch.cuda.synchronize()
        seconds = time.perf_counter() - start
        union = food | container
        ratio = float(food.sum()/union.sum()) if union.any() else None
        samples[row["sample_id"]] = {"image_sha256":row["image_sha256"],
            "area_coverage_ratio":ratio,"food_pixels":int(food.sum()),"container_union_pixels":int(union.sum()),
            "segmentation_seconds":seconds}
        binary_masks[row["sample_id"]] = (food,container)
        Image.fromarray(food.astype(np.uint8)*255).save(args.output/f"{row['sample_id']}.food-mask.png")
        Image.fromarray(container.astype(np.uint8)*255).save(args.output/f"{row['sample_id']}.container-mask.png")
        overlay = rgb.astype(np.float32)
        overlay[container] = overlay[container]*.6 + np.array([30,100,240])*.4
        overlay[food] = overlay[food]*.6 + np.array([240,50,30])*.4
        Image.fromarray(overlay.astype(np.uint8)).save(args.output/f"{row['sample_id']}.overlay.png")
        print(row["sample_id"],"segmentation ratio",ratio,flush=True)
    del model,processor
    gc.collect()
    if device == "cuda": torch.cuda.empty_cache()

    source = ROOT / "data/omnifood/source"
    weights = ROOT / "data/omnifood/depth-large-fp16.safetensors"
    sys.path.insert(0,str(source))
    from depth_anything_v2.dpt import DepthAnythingV2
    torch.set_default_dtype(torch.float16)
    try:
        depth = DepthAnythingV2(encoder="vitl",features=256,out_channels=[256,512,1024,1024])
    finally:
        torch.set_default_dtype(torch.float32)
    state = load_file(str(weights),device="cpu")
    depth.load_state_dict(state,strict=True)
    del state
    depth = depth.to(device).eval()
    depth.infer_image(cv2.imread(str(ROOT/rows[0]["image_path"])),input_size=518)
    for row in rows:
        start = time.perf_counter()
        with torch.inference_mode():
            values = depth.infer_image(cv2.imread(str(ROOT/row["image_path"])),input_size=518)
        if device == "cuda": torch.cuda.synchronize()
        seconds = time.perf_counter()-start
        normalized = (values-values.min())/max(float(values.max()-values.min()),1e-8)
        food,container = binary_masks[row["sample_id"]]
        visible_container = container & ~food
        score = float(np.median(normalized[food])-np.median(normalized[visible_container])) if food.any() and visible_container.any() else None
        samples[row["sample_id"]].update(relative_depth_score=score,depth_seconds=seconds)
        np.save(args.output/f"{row['sample_id']}.relative-depth.npy",normalized)
        print(row["sample_id"],"relative depth contrast",score,flush=True)
    with weights.open("rb") as stream:
        weights_sha256 = hashlib.file_digest(stream, "sha256").hexdigest()
    metadata = {"segmentation":{"model":repo,"revision":revision,"queries":queries,"probability_threshold":.5,"precision":"float32"},
        "depth":{"model":"DepthAnythingV2 vitl", "weights_sha256":weights_sha256,"precision":"float16","input_size":518},
        "device":device,"warmup_excluded":True,"samples":samples,
        "definitions":{"area_coverage_ratio":"food mask pixels / union(food mask, container mask) pixels",
                       "relative_depth_score":"median image-minmax-normalized depth on food minus median on visible container; dimensionless, NOT metric height"},
        "limitations":["Predicted masks are not ground truth; threshold is fixed before inference.","Relative monocular depth cannot determine cm or grams.","Models run sequentially to limit GPU/RAM use."]}
    save_bytes(args.output/"features.json",json_bytes(metadata))
    print("Saved",args.output/"features.json",flush=True)


if __name__ == "__main__": main()
