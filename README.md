# Yuning Peng — Ways of seeing

An artistic personal research homepage, built with Astro, React, Three.js, and Spark. Development takes place on `feat/artistic-homepage`; the original site remains on its existing branch.

## Run locally

Use Node 22.12 or newer (`.nvmrc` selects Node 22):

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:4321. `npm run build` checks types and produces the static site in `dist/`; `npm run preview` serves that build. The checked-in browser scene is sufficient to run the website; Python, CUDA, and research checkpoints are only needed to regenerate assets.

This checkout is on exFAT, so `.npmrc` disables dependency executable symlinks. Scripts call their Node entrypoints explicitly. On this Linux machine, the dedicated runtime can be selected with:

```bash
export PATH="/home/pyn/.local/share/homepage-toolchain/node_modules/node/bin:$PATH"
```

To keep the development server running after disconnecting SSH:

```bash
npm run dev:background
npm run dev:status
npm run dev:logs
# Stop this checkout's managed server:
npm run dev:stop
```

Astro manages the background server and its lock file; no terminal session needs to stay open on Linux. The server binds only to loopback. From the Mac, keep this SSH command running and open http://localhost:4321:

```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -L 4321:127.0.0.1:4321 your-user@your-server
```

An SSH config host alias works in place of the IP. If local port 4321 is already occupied, use `-L 4322:127.0.0.1:4321` and open http://localhost:4322. The page renders on the Mac GPU; SSH carries site assets and development updates.

## Structure

```text
src/
  content/                 Typed profile, news, and publication records
  layouts/                 Document shell, fonts, metadata
  pages/                   Static routes
  components/
    Navigation.astro       Native anchors and scroll indication
    sections/              Info, News, Works, Arts
    scene/                 React scene controls and playback orchestration
  lib/scene/
    types.ts               Renderer-independent scene contract
    data.ts                Manifest and lazy binary-table loader
    state.ts               Selection, hierarchy, relations, query state
    art-direction.ts       Room frame, crop, camera and shared displacement
    flow-field.ts          Momentum, advection, pressure and lingering wake
    art-modifier.ts        GPU particle material and Human/AI wave
    art-anchors.ts         Curated object landmarks and spatial bounds
    scene-hud.ts           Projected tags, selection envelope and links
    selection-glow.ts      Selected Gaussian emission and restrained bloom
    spark-adapter.ts       Camera, GPU recoloring, resource lifecycle
    picking.worker.ts      Visible Gaussian picking off the main thread
  styles/                  Base, layout, scene, and content styles
public/
  media/                   Reused paper media and identity resources
  scenes/room/             Compressed browser geometry, feature tables, metadata
scripts/                   Offline scene export and integrity checks
tests/                     Interaction invariants and real-browser smoke tests
docs/                      Design, data provenance, and implementation notes
```

Edit profile/publications in `src/content/`; add normal page sections in `src/components/sections/`. Keep renderer-specific code behind `SceneAdapter`. The Arts island contains five photographic collections, a horizontal album, on-demand large-image viewing, real DINO/PCA reveals and cross-theme visual echoes. Edit sequencing in `tools/art-gallery/edit.json`; see `tools/art-gallery/README.md` for export details.

## Scene and interactions

- Original Mip-NeRF 360 **room** demo: 1,064,578 ordered 2D Gaussians and five normalized hierarchy levels.
- A softly cropped room floats in an elevated view. Human restores native Gaussian surfaces; AI uses small feature-colored particles. A spatial wave changes geometry and color together while keeping camera and selection.
- Pointer speed and direction stir a small flow with a zoom-independent screen footprint and roughly 7–13 second recovery. Subtle ambient movement continues while visible. Floating object tags, a sampled selection envelope, emission and fine links follow the scene's camera and deformation.
- Clicking a surface picks a source Gaussian through a worker and selects its current-level cluster. A photographic thumbwheel follows five hierarchy levels; the floating × clears selection without resetting the camera.
- Branch / Layer / Network expose real scene-graph connections as upward arches with inward-moving light signals.
- Six spatial query invitations replay curated intermediate clusters with progressively framed cameras. No live LLM endpoint is required.
- Manual input cancels playback. Wheel input over the room zooms; outside it the page scrolls. Touch devices explicitly enter/exit Explore. Slow or data-saving connections retain the poster until entry, with a small manifest-latency fallback when network information is unavailable. Offscreen/hidden scenes stop requesting frames. Static content and the room poster remain usable on load/WebGL failure.

The browser export uses DC RGB and 8-bit quaternions in `.splat`, with zero local Z scale. The artistic modifier interpolates between native Human surfaces and small isotropic AI particles at render time. It does not retain degree-3 view-dependent spherical harmonics, and is not pixel-identical to the original gsplat renderer. It retains all Gaussians and IDs. Gzip compression is lossless; browser-side `DecompressionStream` decodes assets before use. See [thumbwheel and contrast study](docs/thumbwheel-v0.8.md), [overlay and overlapping-wave notes](docs/overlay-motion-v0.7.md), [focus, material and flow notes](docs/feature-dial-v0.6.md), [installation notes and cover-motion proposal](docs/art-direction-v0.2.md) and [baseline browser notes](docs/browser-demo-2026-09-20.md) for the original data contract.

Regenerate assets on the research machine:

```bash
/home/pyn/anaconda3/envs/lego/bin/python scripts/export_room_web.py \
  --source /home/pyn/CODE/LEGO/outputs_homepage_legacy/mipnerf360/room
npm run check:assets
```

Research checkpoints and raw feature tensors stay outside this repository. The smaller browser assets are versioned so a fresh checkout works. The source dataset is [Mip-NeRF 360](https://jonbarron.info/mipnerf360/); scene semantics and recorded demos are from [LEGO](https://pz0826.github.io/LEGO-Webpage/). The original template's MIT license is retained.

## Validation and delivery

```bash
npm test                 # Replay races, hierarchy mapping, weighted candidates, occlusion picking
npm run check:assets     # Checksums, lengths, hierarchy references, query IDs
npm run check:arts       # All photo derivatives, aspect ratios, PCA and echo candidates
npm run build            # Astro type check and static production build
npm run test:browser     # Requires preview server + Chrome (CHROME_PATH can override)
node tests/art-browser.mjs # Particle movement, settling, picking and attached overlays
```

The browser test uses headless Vulkan on this machine's RTX 4090. Set `SOFTWARE_WEBGL=1` for software WebGL; it is much slower on the full scene. Screenshots and test results are saved in `.preview/`. Node/CI checks require no GPU.

The GitHub workflow validates and builds the site, then deploys only `dist/` to GitHub Pages on pushes to `feat/artistic-homepage`. Pull requests run checks and upload a preview without deploying. In Settings → Pages, set Source to **GitHub Actions**; the branch-root Jekyll publisher cannot build Astro source. Preserve the separate `/LEGO-Webpage/` and `/GAGS-Webpage/` project repositories and their Pages settings.

## Release assets

Only browser-ready files live in `public/`: research media, used identity artwork,
compressed room data, and the 330 referenced photo derivatives/PCA previews.
Original photographs, review databases, feature matrices and model weights stay
outside Git. `.preview/`, `.astro/`, `dist/`, caches, logs and local environment
files are ignored. Tests and the reusable photo-review/export tools are retained
as development source and are not copied into the static deployment.

The first release is v1.0.0. See `docs/CHANGELOG.md` for iteration details and
`docs/launch-review.md` for browser coverage and remaining verification limits.
