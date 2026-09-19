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
  -L 4321:127.0.0.1:4321 pyn@100.65.194.90
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
    spark-adapter.ts       Camera, 2DGS, GPU recoloring, resource lifecycle
    picking.worker.ts      Visible Gaussian picking off the main thread
  styles/                  Base, layout, scene, and content styles
public/
  media/                   Reused paper media and identity resources
  scenes/room/             Compressed browser geometry, feature tables, metadata
scripts/                   Offline scene export and integrity checks
tests/                     Interaction invariants and real-browser smoke tests
docs/                      Design, data provenance, and implementation notes
```

Edit profile/publications in `src/content/`; add normal page sections in `src/components/sections/`. Keep renderer-specific code behind `SceneAdapter`. Future photo galleries can be separate islands with their own data manifest, without importing the 3D renderer. Arts currently has a clearly marked placeholder until photographs are supplied.

## Scene and interactions

- Original Mip-NeRF 360 **room** demo: 1,064,578 ordered 2D Gaussians and five normalized hierarchy levels.
- Human/AI radial transition keeps the camera and selection. Feature colors load by level.
- Clicking a surface picks a source Gaussian through a worker and selects its current-level cluster. Parent/part controls follow actual node IDs.
- Nearby uses center distance; Similar uses saved CLIP affinities. These are geometric/feature links, not inferred relationship names.
- Six featured recorded COR queries replay original cameras and intermediate selections. All ten cached final candidates are painted by their normalized scores. No live LLM endpoint is required.
- Manual input cancels playback. Wheel scrolling always scrolls the page; touch devices explicitly enter/exit Explore. Offscreen/hidden scenes stop requesting frames. Static content and the room poster remain usable on load/WebGL failure.

The first browser export uses DC RGB and 8-bit quaternions in `.splat`, with zero local Z scale and Spark's `enable2DGS`. It does not retain degree-3 view-dependent spherical harmonics, and is not pixel-identical to the original gsplat renderer. It retains all Gaussians and IDs. Gzip compression is lossless; browser-side `DecompressionStream` decodes assets before use. See `docs/browser-demo-2026-09-20.md` for validation and current limitations.

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
npm run build            # Astro type check and static production build
npm run test:browser     # Requires preview server + Chrome (CHROME_PATH can override)
```

The browser test uses headless Vulkan on this machine's RTX 4090. Set `SOFTWARE_WEBGL=1` for software WebGL; it is much slower on the full scene. Screenshots and test results are saved in `.preview/`. Node/CI checks require no GPU.

The GitHub workflow only builds and uploads a preview artifact. It does not deploy or change the live GitHub Pages site. Hosting can later serve `dist/` as a normal static site; preserve the separate `/LEGO-Webpage/` and `/GAGS-Webpage/` project URLs when changing Pages settings.
