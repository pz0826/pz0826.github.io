# Focus envelope, selection consistency and feature dial

Follow-up: the dial is now shared by Human and AI. Mountain and flower icons replace mode-dependent labels, indicating whole objects and fine parts. In Human it changes picking granularity; in AI it also changes PCA features.

The dial appearance and interrupted-transition behavior below are superseded by [overlay and overlapping-wave notes](overlay-motion-v0.7.md).

## Selection compositing

v0.5 switched from display-space blending to linear offscreen blending on selection. Correct output encoding did not remove the difference between those two compositing operations; the previous 9% brightness change was perceptible, and the regression tolerance was too broad.

All frames now use the same linear RenderPass + OutputPass chain. Bloom is still allocated only on first selection and disabled otherwise. Its linear-space threshold is 1.3, above the maximum ordinary scene RGB including the reveal wave. Emission is 0.55 (previously 0.22), and tint mixing is 0.5 (previously 0.35), restricted to selected source IDs. Human and AI regression checks now require unselected-region brightness to remain within 1%; local measured changes were under 0.003%. Background stays [9,9,9]. A local halo can still brighten immediately neighboring pixels, as intended.

## Room perimeter and gaze depth

The room-space envelope is a rounded superellipsoid:

```
q = (p - [-.2, 0, .15]) / [1.8, .87, 1.8]
r = (qx^4 + qy^4 + qz^4)^(1/4)
spatialAlpha = exp(-4 * r^14)
```

At normalized radius .7, opacity is about 97%; at .9 it is about 40%; at 1 it is about 2%. The high power preserves most of the interior and suppresses the boundary steeply. This envelope follows the room, not the canvas; geometric crop filters still remove ceiling/outside debris.

The depth reference now comes from OrbitControls' current target (or the recorded camera's forward target during a query). It therefore follows panning and camera navigation rather than remaining fixed at the initial room center. Depth opacity starts falling at .5 scene units from this focal plane and reaches 40% at 1.5 units. It is still a transparency effect, not lens blur or eye tracking. Shader, picking and flow camera data use the same target.

## Dial and transitions

`FeatureDial.tsx` implements an shared vertical scale on the right of the canvas: mountain → flower, levels 1–5, clickable labels, a draggable native range input and keyboard control. No focal-length units are invented: this changes semantic feature granularity, not camera FOV or geometry detail. The former Human “Detail level” label was misleading; it changed selection membership, not visible geometric resolution, and has been replaced by neutral accessible labels. The selected level is retained across view changes. Existing child-part choices and parent navigation remain available.

A level change keeps the previous PCA texture and reveals the new one along the Human/AI radial wave, with a small scale pulse and displacement over 3.2 seconds. Rapid changes snapshot the currently mixed color before continuing. Loaded PCA maps remain fixed per level; no new random colors are generated. Reduced-motion bypasses the transition. The slider remains operable during table loading so a fetch cannot interrupt an ongoing drag; existing request epochs discard obsolete choices.

Relation edges now use round-capped dots spaced approximately three CSS pixels apart.

## Checks

13 unit tests cover focus and existing geometry/flow contracts. Browser suites cover both-mode brightness consistency, queries and cancellation, picking and wheel zoom, shared Human/AI dial visibility, interrupted transitions, keyboard and pointer dial input, and mobile layout. Current screenshots are in ignored `.preview/dial/`. The renderer continues to suspend offscreen rendering; local performance results are stored in `.preview/performance.json`.
