# Room motion — momentum and lingering flow

This pass replaces the v0.2 cursor-centered oscillation. The visual target is a room that yields to a gesture, retains its wake, and gradually recovers while a much smaller ambient movement continues.

## References and implementation decision

The [Spark Magic / Spread source](https://raw.githubusercontent.com/sparkjsdev/spark/main/examples/splat-reveal-effects/index.html) is accessible. Magic combines small splat scales with time-varying spatial noise; Spread coordinates radial position, scale, and color emergence. These are procedural reveal shaders, not mouse-driven fluid solvers. The previous pass simplified their motion too heavily.

The [WebGL Fluid Simulation source](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/master/script.js) provided a reference for semi-Lagrangian advection, pressure projection, vorticity confinement, and dissipating injected momentum. This site implements its own small solver in `src/lib/scene/flow-field.ts`; it does not import the full-screen fluid application or add a dependency.

The solver is a **64 × 36 room-plane grid**, with 3D presentation layered on top. It is not a full volumetric fluid or a particle-to-particle fluid simulation. Running this small grid on the CPU lets the GPU renderer, worker picking, and projected object tags share identical displacement samples without a GPU readback. The million source Gaussians remain on the GPU.

## Behavior and tuning

- Pointer segments inject directional momentum. Force depends on distance and speed, with caps for fast gestures and discontinuous pointer jumps. A stationary pointer injects nothing. Dragging the camera does not stir the room.
- Velocity is advected and projected toward a divergence-free field. Vorticity confinement sustains small rolling eddies. Displacement accumulates over time instead of jumping directly to the cursor, then relaxes toward the room's original structure.
- Advected energy contributes a small, slowly varying 3D noise component. Momentum damping has an 8-second time constant; energy damping has a 12-second constant; positional restoration has a 4-second constant. Typical wakes visibly diminish over roughly 20–40 seconds. These are artistic parameters, not calibrated physical units.
- Ambient displacement is only 0.006 scene units horizontally and 0.0042 vertically. It uses smoothly warped spatial harmonics, with different phases across the room. It remains when the interaction energy has dissipated.
- Human/AI now progresses over **5.2 seconds**, using a broad radial front, soft positional expansion, smaller point scales near the front, and a staggered color reveal. A reverse switch follows the current progress back without resetting the scene.
- Visible ambient motion is capped around 30 fps; active pointer/camera gestures may draw sooner. Hidden/offscreen scenes pause both rendering and simulation. Reduced-motion suppresses ambient/stirring and skips transitions.
- Wheel/trackpad input over the canvas zooms; input outside it scrolls the page. Floating tags forward wheel input to the camera. Button zoom uses the same distance limits. Touch retains the explicit Explore / Done flow.
- `public/media/room-mask.svg` supplies a blurred rounded rectangle shared by canvas, poster and HUD. It preserves the broad corner regions lost to the old elliptical mask.

## Maintenance and validation

`flow-field.ts` owns the stateful simulation and bilinear sampler. `art-direction.ts` owns the CPU/GPU-matched 3D presentation, and `art-modifier.ts` samples the uploaded float texture. `spark-adapter.ts` translates input, advances fixed simulation steps, and schedules one animation chain. New RAF scheduling explicitly respects Spark's own sorting redraws.

Unit tests verify that stationary input adds no energy, faster input produces more momentum, displacement grows after a stroke has ended, the wake persists beyond ten seconds, and its energy decays over tens of seconds without non-finite values. Picking tests include a real fluid snapshot. Browser checks exercise canvas picking, moving tags/outline, wheel capture versus outside scrolling, recorded queries, mobile opt-in, and fallback. The art browser check also bounds the ambient frame count to catch accidental duplicate animation loops.

Run `npm test`, `npm run build`, `npm run check:assets`, `npm run test:browser`, `node tests/art-browser.mjs`, and `node tests/performance.mjs`. Performance diagnostics are local draw-submission measurements, not guarantees for a visitor's GPU.

2026-09-20 validation: nine unit tests, asset integrity, static build, desktop/mobile/fallback/query browser checks, and fluid interaction checks passed. Local RTX 4090, 1440 × 1000, DPR 1: 60 ambient draws in two seconds, transition submission intervals 33.3 ms median / 34.5 ms p95, and zero offscreen draws. The existing large renderer bundle warning remains. A 38-second local capture in `.preview/flow-motion.mp4` shows slow/quick strokes, 23 seconds without pointer input, and the Human/AI transition; it is a review artifact, not a website asset.
