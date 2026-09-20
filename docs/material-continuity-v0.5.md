# Material and interaction continuity

This pass corrects v0.4 (`716a126`). The research assets, Gaussian IDs, label files and query results are unchanged.

## Projection and color corrections

The prior scale interpolation crossed Spark's zero-scale test: the Human endpoint used oriented 2D quads, while nonzero Z scales used covariance projection. Now both endpoints use covariance projection, a tiny thickness (at most 0.0003 scene units), and log-space scale interpolation. Human retains ordinary source XY scales and orientations. Exceptionally long reconstruction splats are capped at 16 times their minor axis and 0.05 scene units, with a 0.001 floor on that cap. A 0.15 pixel-variance prefilter stabilizes nearly edge-on projections. CPU picking uses the same scales.

**Correction to v0.4's color explanation:** Spark emits display RGB to the screen, but converts to linear RGB for an offscreen render target. CopyShader omitted the conversion back to display RGB, darkening the room. Selection postprocessing now uses OutputPass. An explicit scene background also ensures that the render target is cleared in the correct color space; otherwise RenderPass's early clear can reuse the screen-space clear color and produce a gray background. Direct display-space blending and linear offscreen blending can still differ slightly at translucent edges.

Shader emission is reduced from 1.5 to 0.22, tint mixing from 0.7 to 0.35, bloom strength from 0.3 to 0.1. Selection overrides only a quarter of the focus fade multiplied by selection weight. Ordinary Human color uses `rgb * 1.03 + .025`; AI uses `feature * .92 + .035`. Postprocessing targets and passes are allocated only on first selection; frames without selection render directly.

## What the three-dimensional fade actually does

For each undeformed Gaussian center `p` in floor-aligned room coordinates:

1. Compute ellipsoidal radius `r = length((p - [-.2, 0, .15]) / [2, 1.05, 1.05])`. Alpha stays unchanged through `r=.78`, then smoothly drops to 62% by `r=1.25`.
2. Compute camera-forward depth `d = dot(p-eye, forward)`, and the depth `df` of the room target `[-.2, 0, .23]`. Alpha stays unchanged when `abs(d-df) <= .9`, then smoothly drops to 72% by a difference of `2.2` scene units.
3. Multiply these two factors with original opacity, geometric crop and artifact filters. A separate near-camera fade from depth .04 to .28 prevents abrupt intersections.

The fixed room-space factor follows the geometry during orbit; the depth factor changes smoothly with the camera. The focal reference is the room target, not gaze tracking or the currently selected object. These are artistic opacity envelopes: there is no blur kernel, lens aperture or physically simulated depth of field. The remaining 2D mask only feathers the outer canvas border. Previously the first two factors could fall to 28% and 35% respectively, so their product suppressed peripheral opacity too aggressively.

## Flow changes

v0.4 did more than change radius: the original room-space 64×36 solver moved to a screen-space 128×72 grid, damping shortened, and displacement was gated by transported energy to constrain far-field pressure effects. It also cleared the entire field on camera changes, producing the reported discontinuity.

This pass keeps semi-Lagrangian advection, pressure projection and vorticity confinement. The brush expands from 24 to 36 CSS pixels; rendered displacement and residual-flow noise are halved, without halving the stored momentum. The energy gate is softer. Existing wakes are reprojected with camera motion, including displacement and velocity vectors. The reprojection uses the room focal plane: it is a 2.5D approximation, not a full depth-resolved 3D fluid simulation. No camera-change handler clears the wake. Normal damping continues during drag and after release.

## Loading and validation

Geometry fetch now starts once scene metadata arrives, concurrently with loading/parsing the renderer module. No additional scene downloads were introduced. The gzip geometry is exactly 29,469,932 bytes in v0.3, v0.4 and this revision. v0.4 added approximately 19 KB to the uncompressed renderer bundle compared with v0.3.

Three fresh Chromium processes per version on the Linux RTX 4090 (1440×1000, DPR 1, local static server) gave median first-large-splat-draw GPU completion times of roughly 544 ms (v0.3), 564 ms (v0.4) and 553 ms (this pass before final outlier cap). The diagnostic performs one `gl.finish()` after the first large instanced draw. It does not reproduce a dramatic slowdown. These measurements do not cover the user's SSH connection or Mac browser/GPU; no specific cause for the Mac loading delay is established. Raw timings are in ignored `.preview/load-compare.json`.

Twelve unit checks include positive continuous scales, bounded long splats, preserved wakes through camera pan/zoom and zoom-independent gesture footprint. Browser checks cover picking, annotation motion, queries, cancellation, wheel zoom, mobile and error fallback. `tests/color-browser.mjs` specifically checks selection does not darken the whole room or turn the page background gray. The measured unselected-region brightness ratio after selecting the plant was 1.09; background was [9,9,9] in both states. Screenshots are in `.preview/rebalance/`.
