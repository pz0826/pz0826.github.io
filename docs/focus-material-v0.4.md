# Room focus and material pass

Historical v0.4 description. See [v0.5 corrections](material-continuity-v0.5.md), particularly the corrected color-space explanation and camera-wake continuity.

Preserved baseline: `homepage-v0.3` at `baacf1e`. Research geometry, source ordering, labels and recorded query data remain unchanged.

## Presentation

- **Earlier response:** the radial front now accelerates at the start and end, with its former empty lead-in removed. Total traversal is 4.6 seconds. Color and scale use the same spatial blend, including when reversing midway.
- **Human / AI material:** Human restores the source Gaussian XY scales, zero Z thickness and quaternion; AI uses small isotropic particles. This dataset was trained as 2DGS, so the faithful Human endpoint consists of oriented surface discs, rather than artificially inflated spheres. The advancing wave interpolates the shape and color together. The browser export still has DC RGB rather than the research renderer's view-dependent SH.
- **Precise overhead cleanup:** a floor-aligned interior volume removes the disconnected fragments visible in the 0.65–0.95 height bands while preserving the plant and surrounding furniture. The high front wall cut is tighter. Very large high-wall Gaussians have reduced opacity so their broad tails do not smear across the opened interior when native scales return. These are reversible presentation filters, not destructive source edits.
- **Three-dimensional fade:** an ellipsoidal distance from the room center and camera depth relative to the room's focal plane control alpha. The subject remains legible while nearer/farther peripheral geometry fades. Selection overrides some of this fade. This is transparency-based atmospheric focus, not optical depth-of-field blur. The 2D mask is retained only as a thin, soft outer border.
- **Selection emission:** selected source Gaussians receive brighter cyan emission (recorded query candidates retain score-weighted red). Spark's extended accumulator preserves HDR values; Three.js bloom adds a restrained halo above a 1.1 threshold only while a selection exists. A copy pass avoids applying display gamma a second time. This adds visual glow, not light cast onto surrounding furniture.

## Local gesture and ambient movement

The fluid grid is now **128 × 72 in view coordinates**. A 24 CSS-pixel brush radius is converted independently along screen X and Y; displacement is reconstructed into the room using each point's camera depth and the camera basis. Consequently, zooming changes the affected world-space volume while the visible brush footprint remains approximately constant. The grid resolution introduces roughly one-cell sampling uncertainty.

Impulse gain is one third of v0.3. Momentum damping (8/3 s), displacement restoration (4/3 s), and energy damping (4 s) are also one third of the prior constants. Energy gates the visible displacement so pressure projection cannot visibly pull the entire room. The typical residual motion settles in roughly 7–13 seconds. Orbit/zoom, explicit camera moves and resize clear the small remaining wake rather than carrying a view-relative gesture onto a different surface.

Ambient amplitude increases from 0.006 to 0.014 scene units horizontally (vertical amplitude is 70% of that). It remains spatially varying and slow; the room remains recognizable. Reduced-motion still disables this motion and skips reveal transitions. Offscreen/hidden rendering and simulation still pause.

## Files and checks

`art-direction.ts` contains crop, focus, material interpolation and CPU/GPU-matched movement. `flow-field.ts` owns simulation and brush calibration. `art-modifier.ts` applies the material. `selection-glow.ts` isolates postprocessing and its lifecycle. The worker now handles both oriented 2D discs and interpolated 3D ellipsoids, including their deformed centers and opacity; source IDs remain stable.

Unit checks cover the marked interior-fragment locations versus preserved plant geometry, early changes in both transition directions, native Human scale restoration, isotropic AI scales, shorter wake decay, and identical projected gesture displacement at two camera distances. Browser checks exercise actual picking, moving annotations, wheel zoom, query cancellation/completion, mobile and failure states. Local screenshots and recordings remain in ignored `.preview/`.

Validation: all 11 unit checks and both browser suites passed. A local RTX 4090 / Chrome Vulkan run at 1440 × 1000, DPR 1 measured draw-submission intervals of 33.3 ms median / 37.8 ms p95 during transition and 33.2 / 37.8 ms with selection bloom active. Ambient rendering submitted 60 frames over two seconds; offscreen rendering submitted none. These are one-machine submission timings, not GPU completion times or a guarantee for visitors' devices. Current material screenshots are in `.preview/material/`; older flow recordings show v0.3.

References: [Spark Magic / Spread source](https://raw.githubusercontent.com/sparkjsdev/spark/main/examples/splat-reveal-effects/index.html) for coordinated scale and color reveals, and [Spark shader effects](https://raw.githubusercontent.com/sparkjsdev/spark/main/examples/splat-shader-effects/index.html) for per-splat color modulation. The reveal, fluid integration and selection glow here are tailored to this room.
