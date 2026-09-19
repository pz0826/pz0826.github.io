"""Adapt the saved room demo for homepage use, preserving entity and node IDs.

Uses the LEGO environment and the development repository's query-color and
bounding-sphere functions. Cached demo results are replayed; no LLM is called.
Output is a research/display asset bundle, not a final compressed Web scene.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image
from sklearn.decomposition import PCA
from threadpoolctl import threadpool_limits
import torch

from lego.scene_graph.artifacts import save_clustering_artifacts, load_clustering_artifacts
from lego.levels import checkpoint_scene_levels
from inspect_room_models import render


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024**2), b""):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--featured-keyframes", type=int, nargs="*", default=[],
                        help="Visually reviewed saved query keyframes to feature in the homepage")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    for folder in ("ckpts", "clustering", "web", "previews", "source"):
        (args.output / folder).mkdir()
    dev_repo = args.source.parents[2]
    sys.path.insert(0, str(dev_repo / "examples"))
    from utils_graph_search import (
        compute_cluster_bounding_spheres, build_scene_graph,
        get_search_result_colors, SearchChainResult,
    )

    trajectory_path = args.source / "camera_paths/COR-demo.json"
    trajectory = json.loads(trajectory_path.read_text())
    old_tree = {int(k): v for k, v in json.loads((args.source / "clustering/cluster_tree.json").read_text()).items()}
    labels = np.load(args.source / "clustering/label_matrix.npz")["label_matrix"]
    checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=True, mmap=True)
    splats = checkpoint["splats"]
    count, feature_levels, _ = splats["hiera_feat"].shape
    assert labels.shape[0] == count
    assert old_tree[0]["level"] == -1
    assert all(bool(torch.isfinite(v).all()) for v in splats.values())
    tree = {node: {"scene_level": info["level"] + 1, "children": info["children"]}
            for node, info in old_tree.items()}
    artifacts = save_clustering_artifacts(args.output / "clustering", labels, tree)
    reloaded = load_clustering_artifacts(args.output / "clustering")
    assert np.array_equal(reloaded.label_matrix, labels)
    assert reloaded.cluster_tree == tree
    normalized = {"step": checkpoint["step"], "splats": splats,
                  "level_schema_version": 2, "scene_levels": list(range(1, feature_levels + 1))}
    checkpoint_scene_levels(normalized, feature_levels)
    torch.save(normalized, args.output / "ckpts/room-demo.pt")
    for name in ("cluster_features_CLIP.npz", "cluster_features.npz"):
        shutil.copy2(args.source / "clustering" / name, args.output / "clustering" / name)
    shutil.copy2(trajectory_path, args.output / "source/COR-demo.json")
    shutil.copy2(args.source / "clustering/cluster_tree.json", args.output / "source/legacy_cluster_tree.json")
    print(f"Normalized {count} splats and {len(tree)-1} nodes; IDs unchanged", flush=True)

    means = splats["means"].numpy()
    old_levels = {node: info["level"] for node, info in old_tree.items() if node != 0}
    infos = compute_cluster_bounding_spheres(means, labels, list(old_levels), old_levels)
    assert set(infos) == set(old_levels)
    adjacency, ids = build_scene_graph(infos, distance_threshold=0.2)
    id_index = {node: index for index, node in enumerate(ids)}
    np.savez_compressed(args.output / "clustering/legacy_adjacency.npz",
                        node_ids=np.asarray(ids, np.int32), adjacency=adjacency,
                        distance_threshold=np.float32(0.2))
    parents = {}
    for node, info in tree.items():
        for child in info["children"]:
            assert child not in parents
            parents[child] = node
    nodes = [{"id": node, "scene_level": tree[node]["scene_level"],
              "parent_id": parents[node], "children": tree[node]["children"],
              "center": infos[node].center.tolist(), "radius": float(infos[node].radius),
              "bounds_min": means[infos[node].gs_indices].min(0).tolist(),
              "bounds_max": means[infos[node].gs_indices].max(0).tolist(),
              "entity_count": len(infos[node].gs_indices)} for node in ids]
    (args.output / "web/nodes.json").write_text(json.dumps({"root_id": 0,
        "root_children": tree[0]["children"], "nodes": nodes}, separators=(",", ":")))
    clip = np.load(args.source / "clustering/cluster_features_CLIP.npz")
    assert set(map(int, clip["cluster_ids"])) == set(ids)
    features = clip["cluster_features"]
    features = features / np.maximum(np.linalg.norm(features, axis=1, keepdims=True), 1e-12)
    with threadpool_limits(limits=4):
        sim = features @ features.T
    np.fill_diagonal(sim, -np.inf)
    similar = []
    for i, node in enumerate(clip["cluster_ids"]):
        nearest = np.argsort(sim[i])[-5:][::-1]
        similar.append({"node_id": int(node), "neighbors": [{"node_id": int(clip["cluster_ids"][j]),
                        "cosine": float(sim[i, j])} for j in nearest]})
    (args.output / "web/semantic_neighbors.json").write_text(json.dumps({
        "method": "CLIP cosine top-5; computed affinities, not verified object names", "items": similar},
        separators=(",", ":")))
    queries = []
    gpu = {key: value.cuda() for key, value in splats.items() if key != "hiera_feat"}
    gpu_labels = torch.tensor(labels, device="cuda")
    original_rgb = (gpu["sh0"].squeeze(1) * 0.28209479177387814 + 0.5).clamp(0, 1)
    for index, camera in enumerate(trajectory["keyframes"]):
        query = camera["query"]
        if not query["text"]:
            continue
        assert query["status"] == "Ready" and query["results"]
        results = [SearchChainResult(chain=[(int(node), float(score)) for node, score in r["chain"]],
                    total_score=float(r["total_score"]), final_cluster_id=int(r["final_cluster_id"]))
                   for r in query["results"]]
        for result in results:
            assert result.chain[-1][0] == result.final_cluster_id
            for node, _ in result.chain:
                assert node in infos and len(infos[node].gs_indices) > 0
            for (left, _), (right, _) in zip(result.chain, result.chain[1:]):
                assert adjacency[id_index[left], id_index[right]] or left == right
        colors = get_search_result_colors(results, gpu_labels, old_levels, count,
                                          device="cuda", original_colors=original_rgb)
        preview = f"previews/query-{index:02d}.png"
        Image.fromarray(render(gpu, camera, colors, None)).save(args.output / preview)
        query_record = {"id": f"room-query-{index:02d}", "text": query["text"],
            "source_keyframe_index": index, "source_query_level": query["level"],
            "source_query_level_note": "UI query level; not the level of all result nodes",
            "terms": query["chain"], "cached_results": query["results"],
            "primary_chain": [{"node_id": node, "scene_level": tree[node]["scene_level"],
                               "score": score} for node, score in results[0].chain],
            "camera": {key: camera[key] for key in ("position", "wxyz", "fov_rad", "aspect")},
            "preview": preview, "featured": index in args.featured_keyframes,
            "validation": "cached IDs, nonempty memberships and legacy adjacency checked; visually review preview"}
        queries.append(query_record)
        print(f"Replayed query {index}: {query['text']}", flush=True)
    (args.output / "web/queries.json").write_text(json.dumps({"schema_version": 1,
        "result_policy": {"mode": "all cached candidates; ascending-score paint, highest overwrites",
                          "background_rgb_factor": 0.8, "red_alpha_min": 0.2, "red_alpha_max": 0.9,
                          "score_normalization": "min-max within each query, matching legacy viewer"},
        "queries": queries}, indent=2))
    del gpu_labels, original_rgb
    pca_records = []
    for level in range(1, feature_levels + 1):
        with threadpool_limits(limits=4):
            pca = PCA(n_components=3, random_state=42).fit(splats["hiera_feat"][:, level-1].numpy())
            rgb = pca.transform(splats["hiera_feat"][:, level-1].numpy())
        low, high = rgb.min(0), rgb.max(0)
        rgb = np.clip((rgb - low) / (high - low + 1e-8), 0, 1)
        relative = f"web/pca-level-{level}.rgb8"
        np.rint(rgb * 255).astype(np.uint8).tofile(args.output / relative)
        pca_records.append({"scene_level": level, "file": relative,
            "mean": pca.mean_.tolist(), "components": pca.components_.tolist(),
            "min": low.tolist(), "max": high.tolist(),
            "explained_variance": pca.explained_variance_ratio_.tolist()})
    (args.output / "web/pca.json").write_text(json.dumps(pca_records, indent=2))
    for level in range(1, labels.shape[1] + 1):
        labels[:, level-1].astype("<i4").tofile(args.output / f"web/labels-level-{level}.i32")
    camera = trajectory["keyframes"][0]
    rgb = render(gpu, camera, torch.cat([gpu["sh0"], gpu["shN"]], dim=1), 3, 1600, 900)
    Image.fromarray(rgb).save(args.output / "previews/room-poster.webp", quality=90)
    fig, axes = plt.subplots(4, 3, figsize=(18, 15), facecolor="#111111")
    for ax in axes.flat:
        ax.axis("off")
    for ax, query in zip(axes.flat, queries):
        ax.imshow(Image.open(args.output / query["preview"]))
        ax.set_title(f"{query['id']} | {' > '.join(query['terms'])}", color="white", fontsize=9)
    fig.tight_layout()
    fig.savefig(args.output / "previews/query-contact-sheet.png", dpi=110, facecolor=fig.get_facecolor())
    plt.close(fig)
    source_files = [args.checkpoint, trajectory_path, args.source / "clustering/label_matrix.npz",
                    args.source / "clustering/cluster_tree.json", args.source / "clustering/cluster_features_CLIP.npz",
                    dev_repo / "examples/utils_graph_search.py", dev_repo / "examples/lego_viewer/app.py",
                    Path(__file__).resolve(), Path(__file__).with_name("inspect_room_models.py").resolve()]
    manifest = {"schema_version": 1, "scene_id": "mipnerf360-room-legacy-demo",
        "num_gaussians": count, "feature_levels": list(range(1, feature_levels + 1)),
        "cluster_levels": list(artifacts.scene_levels), "num_nodes": len(ids), "num_queries": len(queries),
        "checkpoint": "ckpts/room-demo.pt", "poster": "previews/room-poster.webp",
        "entity_order": "unchanged from source checkpoint; all RGB8 and i32 files share this order",
        "level_mapping": "tree level + 1; root -1 -> 0; labels column 0 -> public level 1; node IDs unchanged",
        "graph": {"kind": "legacy bounding-sphere proximity, not release typed COR graph",
                  "path": "clustering/legacy_adjacency.npz", "distance_threshold": 0.2},
        "cameras": {"convention": "OpenCV c2w, quaternion wxyz, fov_rad is vertical", "initial": camera},
        "source_files": [{"path": str(path), "sha256": digest(path)} for path in source_files],
        "artifacts": [{"path": str(path.relative_to(args.output)), "bytes": path.stat().st_size,
                       "sha256": digest(path)} for path in sorted(args.output.rglob("*")) if path.is_file()]}
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Prepared {args.output}", flush=True)


if __name__ == "__main__":
    main()
