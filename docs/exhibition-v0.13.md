# v0.13 — converging signals and continuous camera handoff

## Local checkpoint

Commit `b2b3608` records v0.12 before this iteration. Its body describes the accumulated spatial queries, connection studies, scene interactions and page presentation changes. This iteration remains a separate working change for review.

## Connection visibility and motion

Use a uniform 1.05 CSS-pixel spine and packet width, replacing v0.12's 0.85px. Restore the earlier distance-dependent base opacity: `max(0.38, 0.88 - screenLength / 1100)`, with secondary connections at 0.42. Packets use a brighter near-white color and 0.95 peak alpha instead of 0.72, while retaining their smooth sine-squared envelope and independently staggered timing. Reverse their arc-length progress: connected endpoints now send light toward the selected object's centroid.

The prior iteration removed periodic whole-line glints, leaving travel and acquisition cues. Restore subtle independent opacity dips on 3.4–6.22 second cycles; these use scene time and run without camera input. Reduced motion disables both traveling packets and periodic glints. Bridge elevation, density, selected centroid and endpoint-only displacement remain unchanged.

## Camera handoff

Previously the query animation independently interpolated the quaternion and the OrbitControls target. Between keyframes, the rendered camera could therefore face away from the controller's target; the next pointer movement corrected that mismatch abruptly. Query framing also allowed distances down to 0.38 while OrbitControls enforced 0.6, pushing the final close-up outward on manual input.

During query framing, interpolate position, FOV and target, then orient the camera toward that same target each frame. Both automatic framing and OrbitControls now use the same minimum distance of 0.38. Manual input still cancels pending query stages. The generic recorded-camera path retains its existing quaternion behavior; the active progressive query path uses node framing.

## Page presentation

The desktop masthead uses a shared text baseline for name, research direction and navigation, instead of centering unequal font boxes. Below 1100px the research direction still stacks beneath the name.

The biography names the first two supervisors as supervising “here” at the just-mentioned Wuhan University, then explicitly introduces the two HKUST co-supervisors. ByteDance dates move alongside Research experience in the metadata row; descriptions become paragraphs. The logo column stretches to the copy height rather than imposing a 16:10 box, and the Works section's bottom padding is reduced to 55px.

## Validation

- Production type check/build, 19 unit tests and asset integrity checks.
- Query handoff regression: interrupt armchair and toy framing at 300/400ms and the final head close-up at 1400ms; exercise both orbit and pan. One-pixel input moves the projected selection envelope by approximately 0.6–1.1px, below the 12px discontinuity threshold; cancelled stages remain cancelled.
- Presentation browser checks: uniform widths, inward packet progress measured on rendered SVG curves, idle glints, reduced motion, shared masthead baseline, summary alignment, experience alignment, link feedback and 390/320px overflow.
- Existing animated exhibition regression: staged object framing, graph density, query cancellation and Human/AI/level switching.
- Screenshots: `.preview/v13/header.png`, `query-bar.png`, `fiber-ai.png`, `experience.png`.
