# Overlay readability and overlapping feature reveals

The dial's appearance, input handling and backing are now superseded by [the v0.8 thumbwheel](thumbwheel-v0.8.md). The concurrent scene-wave system below remains in use.

The shared Human/AI lens scale now draws 21 explicit SVG ticks, including both endpoints. Five longer ticks indicate selectable levels without visible numbers; the active tick is longer and brighter. The indicator and ticks share the same SVG coordinates so their stroke centers align, including at mobile sizes. The simple tulip uses a smaller viewport than the mountain (19 vs 24 CSS pixels) to balance their perceived size. Native range dragging, keyboard input, accessible level names and click targets remain available.

The scale, mode switch, camera controls and scene caption use crisp translucent rectangles, matching the object labels' dark surface and faint top rule. These replace the rejected blurred backings. Relationship edges share the selected polygon's 0.8 CSS pixel stroke width. At that width, round dots were too faint in visual comparison, so the edges use dense 3-pixel dashes with 3-pixel gaps and a subtle dark shadow.

Dial movement uses a damped spring for the indicator and a small counter-motion/rebound of the entire tick strip. An interrupted motion preserves position and velocity. The animation stops requesting frames when settled, cancels on unmount and bypasses motion when reduced-motion is requested. This is visual detent feedback, not hardware haptics.

## Concurrent waves

Previously, interrupting a level reveal froze its current colors into a CPU snapshot and restarted one shared progress clock. Now `LevelTransitions` retains an ordered list of independent 3.2-second waves. A new choice starts at zero while all previous waves continue. The shader applies their spatial blends in chronological order, so more than two feature levels can coexist; the last completed choice becomes the final appearance. Completed prefixes are retired without changing the remaining clocks. Reduced-motion changes are immediate.

The five immutable PCA color maps occupy a roughly 21 MiB RGBA texture array; each layer is populated once when its data is first requested. A small, dynamically sized float texture holds wave targets and progress. This adds GPU color storage compared with the previous single snapshot texture but removes the million-point CPU color-mixing pass on interruption. Source assets and network payloads are unchanged. Concurrent displacement envelopes use the maximum wave strength rather than their sum, preventing rapid scrubbing from amplifying motion without bound. Picking and annotation projection receive the same active wave progress values as rendering.

## Validation

- Production build and type checking pass; 15 unit tests pass, including continuity when a wave is appended, three-level overlap, prefix retirement and final convergence.
- Browser checks pass for shared dial interaction, rapid changes, keyboard/drag input, mobile layout, scene picking, zoom, query cancellation and ambient/pointer motion.
- The dial refinement additionally checks indicator/tick alignment within 0.1 CSS pixels on desktop and mobile, including reduced-motion input. A local motion capture confirmed strip recoil, intermediate indicator positions and exact final alignment without browser errors. Dot/dash comparison captures are in `.preview/dial-refinement/`.
- Human and AI nonselected-region brightness remains within the 1% regression tolerance; observed ratios were 1.00055 and 0.99968. Background remains [9,9,9].
- Local RTX 4090 Chromium captures show the zoomed controls, larger relation dots and overlapping reveals without browser errors. Observed draw-submission intervals during the capture were 33.3 ms median and 37.2 ms p95; these are not GPU-completion measurements or Safari performance guarantees.

Ignored inspection captures live in `.preview/overlap/`.
