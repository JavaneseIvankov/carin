"""Run FP16 and INT8-linear OmniFood8K inference on the locked five-image split."""
import argparse
import json
import os
from pathlib import Path
import sys
import time

import cv2
import numpy as np
from PIL import Image
import torch
from safetensors.torch import load_file
from torchao.quantization import Int8WeightOnlyConfig, quantize_

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE/'data/omnifood'
sys.path.insert(0, str(ROOT/'source'))
from model.myswinb import SwinTransformer
from model.convnext1 import convnext_small
from model.dual_swin_convnext import FusionNet_3Branch_UNet_FFT
from modules.adapter import DepthAdapterV4
from modules.fusion import FeatureFusionNetwork222_Mask
from depth_anything_v2.dpt import DepthAnythingV2

DEVICE = 'cuda'
MODES = ('fp32', 'int8-linear')


def make_nutrition_model():
    models = {'net': SwinTransformer(), 'net2': convnext_small(pretrained=False, in_22k=False),
        'adapter': DepthAdapterV4(in_ch=3, base_ch=32), 'net_cat': FusionNet_3Branch_UNet_FFT()}
    for i in range(1, 6):
        models[f'pre_net{i}'] = FeatureFusionNetwork222_Mask(dropout=0.05 if i == 4 else 0.1)
    return models


def load_weights(model):
    weights = load_file(str(ROOT/'omnifood-fp32.safetensors'), device='cpu')
    for group, module in model.items():
        prefix = group+'.'
        state = {key[len(prefix):]: value for key, value in weights.items() if key.startswith(prefix)}
        result = module.load_state_dict(state, strict=True)
        assert not result.missing_keys and not result.unexpected_keys
    del weights
    return {name: module.to(DEVICE).eval() for name, module in model.items()}


def use_predicted_depth(rows, depth_model, results):
    results.mkdir(parents=True, exist_ok=True)
    cmap = __import__('matplotlib').colormaps.get_cmap('Spectral_r')
    def infer(image_path):
        image_bgr = cv2.imread(str(image_path))
        depth = depth_model.infer_image(image_bgr, input_size=518)
        norm = ((depth-depth.min()) / max(float(depth.max()-depth.min()), 1e-6)*255).astype(np.uint8)
        depth_bgr = (cmap(norm)[:,:,:3][:,:,::-1]*255).astype(np.uint8)
        separator = np.full((image_bgr.shape[0],50,3),255,dtype=np.uint8)
        rgbd = cv2.hconcat([image_bgr,separator,depth_bgr])
        out = results/f'{Path(image_path).stem}.rgbd.png'
        if not cv2.imwrite(str(out),rgbd):
            raise OSError(f'Could not save RGB-depth composite: {out}')
        return out
    first = HERE/rows[0]['image_path']
    _ = infer(first)  # one warm-up pass; excluded from timings
    timings=[]
    for row in rows:
        start=time.perf_counter()
        path=infer(HERE/row['image_path'])
        torch.cuda.synchronize()
        timings.append(time.perf_counter()-start)
        row['_depth_path']=str(path)
    return timings


@torch.inference_mode()
def infer_one(model, row):
    rgb = Image.open(HERE/row['image_path']).convert('RGB').resize((384,384),Image.Resampling.BILINEAR)
    dep = Image.open(row['_depth_path']).convert('RGB').resize((384,384),Image.Resampling.BILINEAR)
    dtype=next(model['net'].parameters()).dtype
    mean=torch.tensor([0.485,0.456,0.406],device=DEVICE,dtype=dtype)[None,:,None,None]
    std=torch.tensor([0.229,0.224,0.225],device=DEVICE,dtype=dtype)[None,:,None,None]
    x=torch.from_numpy(np.asarray(rgb).copy()).to(DEVICE,dtype=dtype).permute(2,0,1)[None]/255
    d=torch.from_numpy(np.asarray(dep).copy()).to(DEVICE,dtype=dtype).permute(2,0,1)[None]/255
    x=(x-mean)/std; d=(d-mean)/std
    a=model['net'](x); d=model['adapter'](d); b=model['net2'](d)
    fused=model['net_cat'](a[1:5],b)
    f=model['pre_net1'](*fused).squeeze()
    values=[float(f)]
    for i in range(2,6):
        values.append(float(model[f'pre_net{i}'](*fused).squeeze()))
    del x,d,a,b,fused
    return dict(zip(('energy_kcal','mass_g','fat_g','carbohydrate_g','protein_g'),values))


def run_mode(rows, mode, depth_seconds, output):
    model=load_weights(make_nutrition_model())
    if mode=='int8-linear':
        torch.backends.mha.set_fastpath_enabled(False)
        for name in ('net','net2'):
            quantize_(model[name],Int8WeightOnlyConfig(version=1))
    torch.cuda.synchronize()
    torch.cuda.reset_peak_memory_stats()
    _=infer_one(model,rows[0])  # warm-up; excluded from timings
    records=[]
    for row,depth_time in zip(rows,depth_seconds):
        torch.cuda.synchronize(); start=time.perf_counter()
        prediction=infer_one(model,row)
        torch.cuda.synchronize(); elapsed=time.perf_counter()-start
        notes=[]
        for key,value in list(prediction.items()):
            if not np.isfinite(value):
                prediction[key]=None
                notes.append(f'{key} raw estimate was non-finite; reported null')
            elif value<0:
                prediction[key]=None
                notes.append(f'{key} raw estimate {value:.3f} was negative; reported null')
        records.append({'sample_id':row['sample_id'],'status':'ok','prediction':prediction,
            'mode':mode,'model':'OmniFood8K-OmniFood8K-data-checkpoint','elapsed_seconds':elapsed,
            'depth_seconds':depth_time,'limitations':notes})
    report={'rows':records,'latency_seconds':[r['elapsed_seconds']+r['depth_seconds'] for r in records],
        'nutrition_latency_seconds':[r['elapsed_seconds'] for r in records],
        'peak_vram_mib':torch.cuda.max_memory_allocated()/1024**2}
    del model; torch.cuda.empty_cache()
    return report


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--run-dir',type=Path,default=HERE/'results/omnifood-3050-mobile-2026-10-14')
    args=parser.parse_args()
    torch.manual_seed(0); np.random.seed(0)
    torch.backends.cudnn.benchmark=False
    manifests=[json.loads(line) for path in (HERE/'manifests/nutrition5k-50.jsonl',HERE/'manifests/lefood-set-50.jsonl') for line in path.read_text().splitlines()]
    rows=[r for r in manifests if r['sample_id'] in {'dish_1557861216','dish_1557937037','dish_1558031394','lefood-1','lefood-14'}]
    assert len(rows)==5
    depth_path=ROOT/'depth-large-fp16.safetensors'
    from safetensors.torch import load_file
    import sys as _sys
    _sys.path.insert(0,str(ROOT/'source'))
    cfg={'encoder':'vitl','features':256,'out_channels':[256,512,1024,1024]}
    torch.set_default_dtype(torch.float16)
    try: depth=DepthAnythingV2(**cfg)
    finally: torch.set_default_dtype(torch.float32)
    depth.load_state_dict(load_file(str(depth_path),device='cpu'),strict=True)
    depth=depth.to(DEVICE).eval()
    torch.cuda.reset_peak_memory_stats()
    depth_seconds=use_predicted_depth(rows,depth,args.run_dir/'depth')
    depth_peak=torch.cuda.max_memory_allocated()/1024**2
    del depth; torch.cuda.empty_cache()
    results={mode:run_mode(rows,mode,depth_seconds,args.run_dir) for mode in MODES}
    for mode in MODES:
        results[mode]['depth_peak_vram_mib']=depth_peak
    # Score the locked images separately by dataset; LeFood has measured mass
    # labels only, while Nutrition5k has nutrient references.
    from evaluate_predictions import score
    args.run_dir.mkdir(parents=True,exist_ok=True)
    selected_by_dataset={}
    for row in rows:
        selected_by_dataset.setdefault(row['dataset'],[]).append(row)
    for mode in MODES:
        results[mode]['evaluation_scores']={}
        for dataset, references in selected_by_dataset.items():
            reference_ids={row['sample_id'] for row in references}
            predictions=[{'sample_id':r['sample_id'],'status':'ok','prediction':r['prediction']}
                for r in results[mode]['rows'] if r['sample_id'] in reference_ids]
            score_result=score(references,predictions)
            results[mode]['evaluation_scores'][dataset]=score_result
            (args.run_dir/f'{mode}-{dataset}-references.jsonl').write_text(
                ''.join(json.dumps(row)+'\n' for row in references))
            (args.run_dir/f'{mode}-{dataset}-predictions.jsonl').write_text(
                ''.join(json.dumps(row)+'\n' for row in predictions))
            (args.run_dir/f'{mode}-{dataset}-score.json').write_text(json.dumps(score_result,indent=2)+'\n')
        (args.run_dir/f'{mode}.json').write_text(json.dumps(results[mode],indent=2)+'\n')
    (args.run_dir/'summary.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps({mode:{'total_latency_s':results[mode]['latency_seconds'],
        'nutrition_latency_s':results[mode]['nutrition_latency_seconds'],
        'peak_vram_mib':results[mode]['peak_vram_mib'],'depth_peak_vram_mib':depth_peak,
        'scores':results[mode]['evaluation_scores']} for mode in MODES},indent=2))

if __name__=='__main__': main()
