# Ways of seeing — installation pass

Baseline: local tag `homepage-v0.1`, commit `2ded66b`. This pass changes presentation; the source scene, hierarchy IDs, recorded queries, and research files are preserved.

## Implemented

- An elevated, centered room, with a floor-aligned coordinate frame. Soft bounds remove the window exterior and broken upper walls. Additional front/side cuts open the interior; alpha feathering and a canvas vignette merge its edges into the page background.
- Small isotropic Gaussian particles replace full surface splats at render time. Human mode retains muted room colors; AI mode uses the existing per-level PCA colors. A spatial wave displaces and compresses particles as colors change. Pointer movement produces a local curl that settles after the cursor stops. This is a procedural visual field, not a fluid simulation.
- Four curated landmarks (sofa, television, piano, plant) float with their source-backed geometry. Selecting one adds a pale highlight, a projected point-cloud envelope, and two fine connection lines. The default connections indicate visual proximity; Nearby/Similar use the existing data. They do not claim newly inferred semantic relationships.
- The envelope is a convex hull of sampled, cropped cluster points. It is a rough Watch Dogs-inspired prototype, not a depth-tested, pixel-accurate object silhouette. Labels are manually named; coarse clusters have local spatial bounds to avoid highlighting unrelated repeated features. Camera rotation and particle movement also update these overlays.
- Heading decoration and paper numbering are removed. Paper theme, venue and year now sit above the title. Navigation corners travel into and out of the selected link using the Iris timing pattern.
- Text-query controls and replay flow retain their existing layout and data. Their appearance/camera path can be reconsidered after the installation composition is approved.

The new fallback image, `public/scenes/room/installation-poster.webp`, is a browser capture of the actual art renderer. It replaces the old interior camera image for loading, mobile opt-in, and failure states. It is tracked by the asset manifest.

## Editing map

| File | Responsibility |
| --- | --- |
| `src/lib/scene/art-direction.ts` | Room basis, camera, crop, particle size, shared CPU/GLSL displacement |
| `src/lib/scene/art-modifier.ts` | Spark GPU modifier: crop, particle geometry, color transition |
| `src/lib/scene/art-anchors.ts` | Curated object names and spatial membership bounds |
| `src/lib/scene/scene-hud.ts` | Projected labels, selection envelope and connections |
| `src/lib/scene/spark-adapter.ts` | Camera, renderer lifecycle, interaction scheduling |
| `src/lib/scene/picking.worker.ts` | Source-index picking with the same crop and deformation |

No offline re-training or destructive asset crop is required. A different presentation can reuse the existing binary geometry. WebGL continues to pause offscreen, and reduced-motion skips the wave and pointer field. The single room is still a roughly 29 MB initial geometry/label download; cropping currently reduces visible content, not network bytes.

## Next motion proposal — focus on images

Preference confirmed: **subtle cover enlargement, essentially stationary text**. The following remains a proposal, not part of this implementation.

1. **Publication covers:** keep the outer frame fixed; on pointer hover, ease the image from 1.00 to 1.02 over roughly 420 ms, then return over 320 ms. A small pair of viewfinder corners can brighten with it. Keep titles, metadata, and paragraphs still. For videos, animate only the poster/paused state so playback controls never move. Keyboard focus on a related paper link should produce the same focus indication without changing tab order.
2. **Photography:** reuse that focus treatment in the future contact sheet, once actual photos arrive. One focused frame gains clarity and shows its existing location/date caption; surrounding frames remain steady. Avoid cursor-following images or staggered entrance effects that compete with the work.
3. **Scrolling:** retain normal reading and the navigation's active corners. No character splitting, parallax body text, or repeated reveal animation. On touch or reduced-motion, keep the frame/caption state changes and skip enlargement.

Start with one paper cover before applying the effect to all works. Evaluate whether the corners duplicate the navigation too strongly; the fallback is enlargement alone.

## References

- [Spark reveal effects](https://sparkjs.dev/examples/#splat-reveal-effects): Magic's point-like material and Spread's spatial deformation informed the installation. The field here is implemented locally and tied to the actual room and picking coordinates.
- [Codrops Iris](https://tympanus.net/Development/LineMenuStyles/#Iris): persistent corner pseudo-elements with opposing travel and a short overshooting easing curve.
- [Codrops image hover study](https://tympanus.net/codrops/2020/07/01/creating-a-menu-image-animation-on-hover/): a reference for image-led feedback; the proposed cover treatment keeps the image in its frame and substantially reduces movement.

## Validation

Run `npm test`, `npm run check:assets`, `npm run build`, and `npm run test:browser`. The dedicated `node tests/art-browser.mjs` exercises actual canvas picking, particle motion and settling, and overlay tracking during orbit on hardware WebGL. `node tests/performance.mjs` records local draw-submission timings; these are not Mac performance guarantees or GPU completion timings. Browser screenshots/results live in ignored `.preview/`.

2026-09-20 local verification: seven unit tests passed; all 49.8 MiB of scene assets passed integrity checks; Astro reported zero type errors/warnings. Static production browser checks passed desktop/mobile, query cancellation/completion, navigation, scroll, and loading-failure fallback. The art interaction check selected a source cluster through an actual canvas click and verified moving tags/outline during orbit. On the local RTX 4090 at 1440 × 1000 and DPR 1, Human/AI draw-submission intervals were 16.7 ms median / 16.9 ms p95 in one run, with zero idle/offscreen draws; stationary-cursor settling also produced zero further draws. The existing large renderer chunk warning remains in the build.
