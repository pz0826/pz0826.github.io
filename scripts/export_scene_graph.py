"""Export the existing legacy proximity graph as a compact bit matrix.
No graph is inferred from screen-space label distances.
"""
import argparse
import gzip
import json
from pathlib import Path
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=Path('/home/pyn/CODE/LEGO/outputs_homepage_legacy/mipnerf360/room/clustering/legacy_adjacency.npz'))
parser.add_argument('--output', type=Path, default=Path('public/scenes/room'))
args = parser.parse_args()
data = np.load(args.source)
packed = np.packbits(data['adjacency'].astype(bool), axis=1, bitorder='little')
(args.output / 'graph.bits.gz').write_bytes(gzip.compress(packed.tobytes(), mtime=0))
# Robust render anchors from actual memberships; legacy sphere centers can lie
# between disconnected occurrences of a feature and are poor visible endpoints.
raw = gzip.decompress((args.output / 'room.splat.gz').read_bytes())
xyz = np.frombuffer(raw, dtype='<f4').reshape(-1, 8)[:, :3]
centers = {}
for level in range(1, 6):
    labels = np.frombuffer(gzip.decompress((args.output / f'labels-level-{level}.i32.gz').read_bytes()), dtype='<i4')
    order = np.argsort(labels)
    ids, starts, counts = np.unique(labels[order], return_index=True, return_counts=True)
    for node, start, count in zip(ids, starts, counts):
        if node > 0:
            centers[int(node)] = np.median(xyz[order[start:start+count]], axis=0).round(5).tolist()
(args.output / 'graph.json').write_text(json.dumps({'kind': 'legacy bounding-sphere proximity', 'ids': data['node_ids'].tolist(), 'stride': packed.shape[1], 'file': 'graph.bits.gz', 'centers': [centers[int(id)] for id in data['node_ids']]}, separators=(',', ':')))
print('Graph bytes:', (args.output / 'graph.bits.gz').stat().st_size)

import hashlib
manifest_file = args.output / 'manifest.json'
manifest = json.loads(manifest_file.read_text())
for name in ['graph.json', 'graph.bits.gz']:
    content = (args.output / name).read_bytes()
    manifest['assets'][name] = {'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
manifest_file.write_text(json.dumps(manifest, indent=2) + '\n')
