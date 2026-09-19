# Browser demo implementation · 2026-09-20

## Delivered structure

Astro 7.3.3 statically renders the homepage; React handles the room island. Three.js 0.180.0 and Spark 2.2.0 are dynamically imported only when the room starts. Node 22 is isolated under `/home/pyn/.local/share/homepage-toolchain`. exFAT cannot create symlinks, so package scripts call actual Node entrypoints and `.npmrc` uses `bin-links=false`.

Profile/news/publications are typed content records. Layout, static sections, scene UI, state/data, rendering, picking worker, and styles are separate. The previous Jekyll implementation and unused assets were removed on `feat/artistic-homepage`; original academic content is archived in `content-source-legacy.md`. Five papers, four news entries, education, honors, internship, and contact links have been migrated. Arts intentionally waits for actual photographs.

## Browser data contract

Source: `/home/pyn/CODE/LEGO/outputs_homepage_legacy/mipnerf360/room`.

- All **1,064,578** Gaussians remain in original source order. No decimation or LoD remapping.
- Standard `.splat`: float32 center and XY scale, zero Z scale, uint8 RGBA, quantized wxyz. Spark's `enable2DGS` handles zero Z as a plane, with Z-depth sorting and `preBlurAmount=.3`.
- DC RGB is used in this first export. Degree-3 view-dependent SH is not included. This is an explicit quality/bandwidth tradeoff, not a pixel-exact port of gsplat.
- Five int32 cluster tables and five uint8 PCA tables share geometry indices. Original tree node IDs are preserved; UI levels start at 1.
- Six featured COR queries from the original eleven are exposed in the interface. Their original camera poses and cached results are preserved. Every final candidate contributes according to its score, with the original ascending-score overwrite rule and dimmed background.
- Source OpenCV c2w poses convert to Three.js by a local X-axis half-turn. The original roll is retained.
- All binary exports are gzip-compressed with deterministic timestamps. The loader supports both HTTP `Content-Encoding: gzip` and ordinary static `.gz` file delivery.
- Browser assets total **49.7 MiB**, geometry **28.1 MiB**. Initial geometry + first-level labels are about **29 MiB**, plus metadata and the renderer bundle. Each later level fetches its own colors/labels. The initial 15 MiB budget is not yet met; future compression/SH work must preserve small-object memberships and query fidelity.

`npm run check:assets` verifies every asset checksum, table length, parent/child reference, and cached query ID. Research checkpoints, raw feature tensors, and photography originals are not in Git; derived browser assets are included so a fresh checkout is runnable.

## Interactions and boundaries

Human/AI uses a screen-space radial feature reveal without changing the camera or current selection. Hierarchy changes preserve a manually picked Gaussian's membership. Explicit parent/part selectors follow the saved tree. A Web Worker intersects actual oriented 2D Gaussian planes and chooses the strongest visible alpha contribution; it returns source indices instead of guessing from cluster boxes. It approximates the visible contribution threshold and does not reproduce the renderer's subpixel filtering exactly.

Nearby means nearest same-level cluster centers. Similar means same-level neighbors from the saved CLIP affinities; the UI says when none are available. These links do not claim verified physical/semantic relationships. Query relations come from the validated saved COR results.

Query steps share selection and hierarchy state with manual controls. Input cancels pending timers, camera transitions, and stale picks; old replay callbacks cannot take over a new query. Manual hierarchy changes also discard stale asynchronous loads. Escape clears selection and exits touch exploration. Scroll is never captured by camera zoom; zoom has explicit buttons. Rendering is scheduled only for changes, sorting updates, and transitions, and stops when offscreen or hidden.

Touch devices initially show the poster and enter WebGL through Explore. Reduced motion skips camera/reveal transitions. Model-load failure displays a retry control while all static content remains usable. No live query endpoint, secrets, or research service is exposed by the preview.

## Validation

- Astro check: 0 errors, 0 warnings, 0 hints. Production static build passes. Spark's approximately 3 MiB deferred renderer bundle still triggers the bundler's large-chunk advisory; it is not in the static content's initial execution path.
- Five focused invariant tests pass: replay interruption, stale query rejection, hierarchy membership, all-candidate cross-level weights, and occlusion-aware source picking.
- Actual Chrome + RTX 4090/Vulkan browser flows pass at desktop 1440×1000 and touch 390×844: Human/AI, level changes, source-backed click selection, nearby relations, query interruption and final candidates, scrolling over canvas, navigation, mobile Explore exit, load-failure fallback. No page/console errors in the success path.
- The same complete browser suite also passes against the production `dist/` served by a plain Python HTTP server, exercising client-side gzip decoding. With JavaScript disabled, all five papers and native anchor navigation remain available.
- Actual recorded scene checks: clicked cluster 434 at the plant region; the piano-logo replay reaches cluster 1707 at level 5. Screenshots visually checked against the source poster and saved query preview. This is a visual/invariant validation, not a new COR benchmark or a quantitative renderer-equivalence claim.
- Local diagnostic with DPR 1, full scene, Chrome headless Vulkan on RTX 4090: ready state after **523 ms**, geometry transfer/decode fetch entry **98 ms**, transition draw-submission median **16.7 ms**, p95 **17.0 ms**, reported JS heap about **131 MB**. **0** scene draws in a two-second idle window and **0** in a 1.8-second offscreen window. These are one local run's submission intervals, not GPU completion timings, network performance, mobile measurements, or field Web Vitals.

Screenshots, browser results, and performance JSON are local in `.preview/`. The software WebGL attempt produced correct images but was much slower; it is not used for the timing report. Real Mac/Safari and physical-phone feedback remain the next device checks.

## Preview and next iteration

`npm run dev:background` starts Astro's managed daemon on `127.0.0.1:4321`; status/log/stop scripts are in package.json. The Mac can tunnel with `ssh -N -L 4321:127.0.0.1:4321 pyn@100.65.194.90` and open `http://localhost:4321`. The Linux agent cannot establish a tunnel in the Mac's network namespace; the local terminal command completes that step.

This branch's CI only checks and builds a downloadable artifact. It does not deploy the live site. The next design iteration should prioritize the actual Mac viewing experience, first-camera framing, control density, and photographic selection. Hover color accents, a more expressive relation presentation, SH/compression tuning, and the DINO-to-photo gallery remain polish/extensions rather than silently simulated features.
