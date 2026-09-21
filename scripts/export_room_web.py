"""Export ordered 2DGS geometry and semantic sidecars; never change research outputs.

Run with the lego conda Python. DC-only RGB is an explicit first-demo tradeoff;
quaternions are quantized by the standard .splat format. No decimation or sorting.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil

import numpy as np
import torch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/home/pyn/CODE/LEGO/outputs_homepage_legacy/mipnerf360/room'))
    parser.add_argument('--output', type=Path, default=Path('public/scenes/room'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    splats = torch.load(args.source / 'ckpts/room-demo.pt', map_location='cpu', weights_only=True, mmap=True)['splats']
    n = len(splats['means'])
    rows = np.zeros(n, dtype=[('position', '<f4', 3), ('scale', '<f4', 3), ('color', 'u1', 4), ('rotation', 'u1', 4)])
    rows['position'] = splats['means'].numpy()
    rows['scale'] = splats['scales'].exp().numpy()
    rows['scale'][:, 2] = 0  # Spark enable2DGS: local XY plane, as in gsplat rasterization_2dgs.
    rows['color'][:, :3] = np.clip((splats['sh0'].squeeze(1).numpy() * .28209479177387814 + .5) * 255, 0, 255).round().astype('u1')
    rows['color'][:, 3] = (splats['opacities'].sigmoid().numpy().reshape(-1) * 255).round().astype('u1')
    q = torch.nn.functional.normalize(splats['quats'], dim=-1).numpy()
    rows['rotation'] = np.clip(q * 128 + 128, 0, 255).round().astype('u1')
    assert rows.dtype.itemsize == 32
    (args.output / 'room.splat.gz').write_bytes(gzip.compress(rows.tobytes(), mtime=0))
    for name in ['nodes.json', 'queries.json', 'semantic_neighbors.json']:
        shutil.copyfile(args.source / 'web' / name, args.output / name)
    # Five UI levels; feature-only levels 6–8 remain available in the source bundle.
    for level in range(1, 6):
        for name in [f'labels-level-{level}.i32', f'pca-level-{level}.rgb8']:
            (args.output / (name + '.gz')).write_bytes(gzip.compress((args.source / 'web' / name).read_bytes(), mtime=0))
    # Remove only superseded, reproducible uncompressed exports from this exporter.
    for name in ['room.splat'] + [f'{kind}-level-{level}.{ext}' for level in range(1, 6) for kind, ext in [('labels', 'i32'), ('pca', 'rgb8')]]:
        (args.output / name).unlink(missing_ok=True)
    source_manifest = json.loads((args.source / 'manifest.json').read_text())
    manifest = {'schemaVersion': 1, 'count': n, 'levels': [1, 2, 3, 4, 5], 'geometry': 'room.splat.gz',
                'initialCamera': source_manifest['cameras']['initial'],
                'representation': '2DGS, zero local Z scale, original entity order, DC RGB, quantized wxyz',
                'sourceScene': source_manifest['scene_id'], 'assets': {}}
    for path in sorted(args.output.iterdir()):
        if path.name != 'manifest.json':
            manifest['assets'][path.name] = {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(f'Exported {n:,} ordered 2D Gaussians to {args.output}')


if __name__ == '__main__':
    main()
