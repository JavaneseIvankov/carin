"""Extract inference-only FP16 weights from official PyTorch ZIP checkpoints.

HTTP ranges avoid downloading optimizer states. Pickle is read with an explicit
metadata-only allowlist; no upstream Python/pickle functions are executed.
Requires numpy and safetensors; downloaded sources/caches live under ignored data/.
"""
import argparse
import collections
from concurrent.futures import ThreadPoolExecutor
import io
import json
import math
from pathlib import Path
import pickle
import struct
import time
import urllib.request
import zipfile
import zlib

import numpy as np

OMNI_REV = 'a12dcc26d45a2a548f3a79ecde8f1e49c83470a3'
DEPTH_REV = 'a561b849ebae10a6f5ef49e26c83cbbcd36c71bf'
OMNI_URL = 'https://huggingface.co/dongjianjjjj/OmniFood8k/resolve/67f9279/ckpt_best.pth'
DEPTH_URL = 'https://huggingface.co/depth-anything/Depth-Anything-V2-Large/resolve/main/depth_anything_v2_vitl.pth'
MODULES = ('net', 'net2', 'adapter', 'net_cat', 'pre_net1', 'pre_net2', 'pre_net3', 'pre_net4', 'pre_net5')


class RemoteZip(io.RawIOBase):
    def __init__(self, url):
        self.url, self.pos, self.size = url, 0, None
        self.cache = []
        self.fetch(0, 1048576)

    def fetch(self, start, length):
        for a, data in self.cache:
            if a <= start and start + length <= a + len(data):
                return data[start-a:start-a+length]
        for attempt in range(3):
            try:
                req = urllib.request.Request(self.url + f'?download=true&offset={start}',
                    headers={'Range': f'bytes={start}-{start+length-1}'})
                with urllib.request.urlopen(req, timeout=120) as response:
                    content_range = response.headers.get('Content-Range', '')
                    if response.status != 206 or not content_range.startswith(f'bytes {start}-'):
                        raise ValueError('Server did not honor exact range request')
                    self.size = int(content_range.split('/')[-1])
                    data = response.read(length)
                if len(data) != min(length, self.size-start):
                    raise ValueError('Truncated remote range')
                if length <= 1048576:
                    self.cache.append((start, data))
                return data
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(1 + attempt)

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def tell(self):
        return self.pos

    def read(self, size=-1):
        size = self.size-self.pos if size < 0 else min(size, self.size-self.pos)
        data = self.fetch(self.pos, size) if size else b''
        self.pos += len(data)
        return data


class TensorMetadata:
    def __init__(self, storage, offset, shape, stride):
        self.storage, self.offset, self.shape, self.stride = storage, offset, shape, stride

    def __setstate__(self, state):
        pass


class MetadataUnpickler(pickle.Unpickler):
    def persistent_load(self, pid):
        assert pid[0] == 'storage'
        return pid

    def find_class(self, module, name):
        if (module, name) == ('collections', 'OrderedDict'):
            return collections.OrderedDict
        if module == 'torch' and name in ('FloatStorage', 'LongStorage', 'HalfStorage'):
            return name
        if module == 'torch._utils' and name in ('_rebuild_tensor', '_rebuild_tensor_v2'):
            return lambda storage, offset, shape, stride, *args: TensorMetadata(storage, offset, shape, stride)
        if module == 'torch._utils' and name == '_rebuild_parameter':
            return lambda data, *args: data
        raise ValueError(f'Unsupported checkpoint metadata type: {module}.{name}')


def extract(url, output, modules=None, float_output='F16'):
    output = Path(output)
    if output.exists():
        print('Cached', output, flush=True)
        return
    remote = RemoteZip(url)
    archive = zipfile.ZipFile(remote)
    metadata_name = next(x for x in archive.namelist() if x.endswith('/data.pkl'))
    metadata = MetadataUnpickler(io.BytesIO(archive.read(metadata_name))).load()
    prefix = metadata_name[:-len('data.pkl')]
    tensors = {f'{group}.{name}': value for group in modules for name, value in metadata[group].items()} if modules else dict(metadata)
    dtypes = {'FloatStorage': np.dtype('<f4'), 'LongStorage': np.dtype('<i8'), 'HalfStorage': np.dtype('<f2')}
    output_float_dtype = {'F16': np.dtype('<f2'), 'F32': np.dtype('<f4')}[float_output]
    entries, offset, header = {}, 0, {}
    for name, tensor in tensors.items():
        if not isinstance(tensor, TensorMetadata):
            raise ValueError(f'Unexpected non-tensor {name}')
        dtype = dtypes[tensor.storage[1]]
        info = archive.getinfo(prefix + 'data/' + tensor.storage[2])
        assert info.compress_type == zipfile.ZIP_STORED
        highest_element = tensor.offset + sum((dim - 1) * stride for dim, stride in zip(tensor.shape, tensor.stride))
        assert highest_element < info.file_size // dtype.itemsize, (name, tensor.shape, tensor.stride, info.file_size)
        # PyTorch pads each local member payload to a 64-byte boundary.
        payload = (info.header_offset + 30 + len(info.filename.encode()) + 4 + 63) // 64 * 64
        entries.setdefault((payload, info.file_size), []).append((name, tensor, dtype))
        out_dtype = np.dtype('<i8') if dtype.kind == 'i' else output_float_dtype
        size = math.prod(tensor.shape) * out_dtype.itemsize
        header[name] = {'dtype': 'I64' if dtype.kind == 'i' else float_output, 'shape': list(tensor.shape), 'data_offsets': [offset, offset+size]}
        offset += size
    # Validate alignment assumption against a real local ZIP header.
    first_payload, _ = next(iter(entries))
    first_info = archive.getinfo(prefix + 'data/' + next(iter(tensors.values())).storage[2])
    local = remote.fetch(first_info.header_offset, 30)
    n, e = struct.unpack('<HH', local[26:30])
    assert first_info.header_offset + 30 + n + e == first_payload
    encoded = json.dumps(header, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 8)
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix('.partial')
    # Sparse/random writes preserve named-tensor ordering while fetching ranges
    # in physical ZIP order; optimizer storage entries are never materialized.
    progress_path = output.with_suffix('.download-progress.json')
    progress = json.loads(progress_path.read_text()) if progress_path.exists() and temp.exists() else {}
    completed = set(progress.get('completed', [])) if progress.get('url') == url else set()
    with temp.open('r+b' if completed else 'wb+') as stream:
        stream.write(struct.pack('<Q', len(encoded)))
        stream.write(encoded)
        base = stream.tell()
        stream.truncate(base + offset)
        groups = []
        for entry in sorted(entries):
            if groups and entry[0] - (groups[-1][-1][0]+groups[-1][-1][1]) <= 65536 and entry[0]+entry[1]-groups[-1][0][0] <= 64*1024**2:
                groups[-1].append(entry)
            else:
                groups.append([entry])
        remaining = [(i, group) for i, group in enumerate(groups) if i not in completed]
        with ThreadPoolExecutor(max_workers=2) as pool:
            for batch in range(0, len(remaining), 2):
                pending = [(i, group, pool.submit(remote.fetch, group[0][0], group[-1][0]+group[-1][1]-group[0][0]))
                           for i, group in remaining[batch:batch+2]]
                for i, group, future in pending:
                    start = group[0][0]
                    block = future.result()
                    for payload, size in group:
                        for name, tensor, dtype in entries[(payload, size)]:
                            info = archive.getinfo(prefix + 'data/' + tensor.storage[2])
                            assert zlib.crc32(memoryview(block)[payload-start:payload-start+size]) == info.CRC
                            values = np.ndarray(tensor.shape, dtype=dtype, buffer=block,
                                offset=payload-start+tensor.offset*dtype.itemsize,
                                strides=tuple(stride*dtype.itemsize for stride in tensor.stride))
                            raw = values.astype('<i8' if dtype.kind == 'i' else output_float_dtype, copy=False).tobytes(order='C')
                            stream.seek(base + header[name]['data_offsets'][0])
                            stream.write(raw)
                    stream.flush()
                    completed.add(i)
                    progress_path.write_text(json.dumps({'url': url, 'completed': sorted(completed)}))
                    if i % 10 == 0 or len(completed) == len(groups):
                        print(f'{output.name}: {len(completed)}/{len(groups)} ranges', flush=True)
    from safetensors import safe_open
    with safe_open(temp, framework='numpy') as check:
        assert set(check.keys()) == set(tensors)
        for name in check.keys():
            assert list(check.get_slice(name).get_shape()) == header[name]['shape']
    temp.replace(output)
    progress_path.unlink(missing_ok=True)
    output.with_suffix('.provenance.json').write_text(json.dumps({'source_url': url, 'original_bytes': remote.size,
        'output_bytes': output.stat().st_size, 'tensor_count': len(tensors), 'float_conversion': f'checkpoint float storage to {float_output}',
        'optimizer_excluded': bool(modules)}, indent=2)+'\n')
    print('Saved', output, output.stat().st_size, flush=True)


def sources(root):
    files = ['model/__init__.py', 'model/myswinb.py', 'model/convnext1.py', 'model/dual_swin_convnext.py',
             'modules/__init__.py', 'modules/fusion.py', 'modules/adapter.py', 'test.py', 'run.py', 'utils/utils_data222.py']
    depth_files = ['depth_anything_v2/dpt.py', 'depth_anything_v2/util/blocks.py',
                   'depth_anything_v2/util/transform.py', 'depth_anything_v2/dinov2.py',
                   'depth_anything_v2/dinov2_layers/__init__.py', 'depth_anything_v2/dinov2_layers/attention.py',
                   'depth_anything_v2/dinov2_layers/block.py', 'depth_anything_v2/dinov2_layers/drop_path.py',
                   'depth_anything_v2/dinov2_layers/layer_scale.py', 'depth_anything_v2/dinov2_layers/mlp.py',
                   'depth_anything_v2/dinov2_layers/patch_embed.py', 'depth_anything_v2/dinov2_layers/swiglu_ffn.py']
    for repo, rev, names in [('yudongjian/OmniFood8K-food', OMNI_REV, files), ('DepthAnything/Depth-Anything-V2', DEPTH_REV, depth_files)]:
        for name in names:
            target = root/'source'/name
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                target.write_bytes(urllib.request.urlopen(f'https://raw.githubusercontent.com/{repo}/{rev}/{name}', timeout=30).read())
    # These imports are unused by the model classes used in official test.py.
    # Keep originals beside the locally adjusted copies for inspection.
    for name in ['model/myswinb.py', 'model/dual_swin_convnext.py', 'depth_anything_v2/dpt.py']:
        target = root/'source'/name
        original = target.with_suffix('.upstream.py')
        if not original.exists():
            original.write_bytes(target.read_bytes())
        lines = original.read_text().splitlines()
        if name == 'depth_anything_v2/dpt.py':
            text = '\n'.join(lines).replace('image = image.to(DEVICE)',
                'image = image.to(device=next(self.parameters()).device, dtype=next(self.parameters()).dtype)')
            target.write_text(text+'\n')
        else:
            target.write_text('\n'.join(line for line in lines if not line.startswith(('from modules.AFPN import', 'from pytorch_wavelets import', 'from transformers.models.swin')))+'\n')
    (root/'source/revisions.json').write_text(json.dumps({'omnifood': OMNI_REV, 'depth_anything_v2': DEPTH_REV,
        'changes': 'Removed unused imports; cast DepthAnything input to model device and dtype'}, indent=2)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent / 'data/omnifood')
    parser.add_argument('--depth-output', type=Path)
    args = parser.parse_args()
    sources(args.root)
    extract(OMNI_URL, args.root/'omnifood-fp16.safetensors', MODULES)
    extract(OMNI_URL, args.root/'omnifood-fp32.safetensors', MODULES, 'F32')
    extract(DEPTH_URL, args.depth_output or args.root/'depth-large-fp16.safetensors')
