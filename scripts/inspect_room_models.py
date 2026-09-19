"""Render the two room checkpoints at saved demo cameras without loading an LLM.

Run with the existing LEGO Python environment. Outputs are research comparisons,
not browser-renderer fidelity tests. No source artifacts are modified.
"""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation
from sklearn.decomposition import PCA
from threadpoolctl import threadpool_limits
import torch
import torch.nn.functional as F
from gsplat.rendering import rasterization_2dgs


def render(splats, camera, colors, sh_degree, width=960, height=540):
    c2w = np.eye(4, dtype=np.float32)
    c2w[:3, :3] = Rotation.from_quat(np.roll(camera["wxyz"], -1)).as_matrix()
    c2w[:3, 3] = camera["position"]
    focal = height / 2 / np.tan(camera["fov_rad"] / 2)
    k = np.array([[focal, 0, width / 2], [0, focal, height / 2], [0, 0, 1]], np.float32)
    with torch.inference_mode():
        result = rasterization_2dgs(
            means=splats["means"], quats=F.normalize(splats["quats"], dim=-1),
            scales=splats["scales"].exp(), opacities=splats["opacities"].sigmoid(),
            colors=colors, viewmats=torch.tensor(np.linalg.inv(c2w), device="cuda")[None],
            Ks=torch.tensor(k, device="cuda")[None], width=width, height=height,
            near_plane=0.01, far_plane=100, eps2d=0.3, sh_degree=sh_degree,
            render_mode="RGB", backgrounds=torch.zeros((1, 3), device="cuda"),
        )[0][0]
    return (result.clamp(0, 1).cpu().numpy() * 255).round().astype(np.uint8)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--legacy", type=Path, required=True)
    parser.add_argument("--release", type=Path, required=True)
    parser.add_argument("--trajectory", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    trajectory = json.loads(args.trajectory.read_text())
    cameras = {index: trajectory["keyframes"][index] for index in (0, 19, 24)}
    records = {"camera_source": str(args.trajectory), "camera_indices": list(cameras),
               "renderer": "LEGO environment gsplat rasterization_2dgs",
               "pca": "full-scene PCA, random_state=42, per-channel min-max, matching viewers",
               "models": {}}
    for name, path in (("legacy", args.legacy), ("release", args.release)):
        ckpt = torch.load(path, map_location="cpu", weights_only=True, mmap=True)
        source = ckpt["splats"]
        splats = {key: value.cuda() for key, value in source.items() if key != "hiera_feat"}
        colors = torch.cat([splats["sh0"], splats["shN"]], dim=1)
        record = {"checkpoint": str(path), "count": len(source["means"]), "pca": {}}
        for index, camera in cameras.items():
            Image.fromarray(render(splats, camera, colors, 3)).save(args.output / f"{name}-{index}-rgb.png")
        del colors
        for level in (1, 3, 5):
            features = source["hiera_feat"][:, level - 1].numpy()
            with threadpool_limits(limits=4):
                model = PCA(n_components=3, random_state=42).fit(features)
                colors_np = model.transform(features)
            low, high = colors_np.min(0), colors_np.max(0)
            colors_np = np.clip((colors_np - low) / (high - low + 1e-8), 0, 1)
            colors = torch.tensor(colors_np, device="cuda")
            record["pca"][str(level)] = {"explained_variance": model.explained_variance_ratio_.tolist()}
            for index, camera in cameras.items():
                Image.fromarray(render(splats, camera, colors, None)).save(args.output / f"{name}-{index}-level{level}.png")
            del colors
        records["models"][name] = record
        del splats, source, ckpt
        torch.cuda.empty_cache()
        print(f"Rendered {name}", flush=True)
    for index in cameras:
        fig, axes = plt.subplots(2, 4, figsize=(20, 6.4), facecolor="#111111")
        for row, name in enumerate(("legacy", "release")):
            for col, mode in enumerate(("rgb", "level1", "level3", "level5")):
                axes[row, col].imshow(Image.open(args.output / f"{name}-{index}-{mode}.png"))
                axes[row, col].set_title(f"{name} / {mode}", color="white", fontsize=12)
                axes[row, col].axis("off")
        fig.suptitle(f"Same camera {index} | independent PCA bases; compare boundaries, not hues", color="white")
        fig.tight_layout()
        fig.savefig(args.output / f"comparison-{index}.png", dpi=110, facecolor=fig.get_facecolor())
        plt.close(fig)
    (args.output / "comparison.json").write_text(json.dumps(records, indent=2))


if __name__ == "__main__":
    main()
