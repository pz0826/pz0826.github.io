# v0.10 — spatial invitations and connection studies

## Visitor experience

Six featured natural-language queries now float at the first object in their curated chain. They replace the four object-name tags and the separate query catalogue. Default text is deliberately small and subdued; hover and keyboard focus brighten and enlarge it. Clicking or pressing Enter starts the existing progressive framing. A compact chain follows the current selection inside the viewport; the full active sentence, stage controls and LEGO attribution remain immediately below it. The readiness row and its vertical gap are removed.

Labels reserve their largest hover footprint so growth cannot trigger self-occlusion. Nearby vertical slots and a left-side alternative resolve collisions; displaced labels receive fine leaders back to their scene anchors. Entire labels are hidden if no safe slot exists or their anchor leaves the viewport. During replay, other invitations recede. Escape clears the selection; the existing reset button restores the overall view and invitations. These are projected 3D anchors with screen-space layout, not depth-tested 3D text.

## Reveal origin

Human/AI reveals and overlapping feature-level fronts use the selected cluster's cropped sample centroid, falling back to the room center without a selection. Every level front retains its own origin and clock. The reverse material transition also propagates outward. CPU picking and the GPU modifier share the same field parameters. The existing radial field is measured in the room's horizontal plane; this is an artistic spread, not a spherical fluid simulation. A rapid reversal during an unfinished material transition retains that transition's origin to preserve continuity.

## Three connection looks

Preview URL parameter, independent of the Branch/Layer/Network relationship scope:

- `?connections=signal` (default): unequal fine straight strokes, brighter short accents at different positions, independently timed brief signal dips.
- `?connections=arcs`: alternating shallow curved paths with small highlights and the same independent timing.
- `?connections=constellation`: straight paths plus up to four genuine lateral graph connections to soften the starburst topology.

All three use diamond endpoints, a larger selected marker, distance-weighted line brightness and reduced-motion support. Branch/Layer/Network retain at most 8/11/14 well-separated visible destinations; constellation adds at most four lateral links. Every edge still belongs to the saved legacy graph. Related-part emissive painting is not included in this study: brightness weighting applies to the connections, while selected-part illumination remains unchanged.

`scripts/review_scene_v10.mjs` captures a large object (television) and a small part (cow head, node 972) with identical camera framing for each look. It writes full frames and cropped detail comparison sheets under `.preview/v10/`. Static frames show shape and contrast; intermittent behavior requires the live preview. These studies can coexist while a preferred look is chosen.

## Validation

- Production build/type check; 19 unit tests including origin-relative outward propagation and independent overlapping origins.
- Asset integrity: unchanged 1,064,578 Gaussians; graph/query payloads from v0.9 remain intact.
- Desktop/mobile loading, query cancellation, camera wheel behavior and error fallback.
- Full-label collision/recovery in Human and AI modes, hover/focus visibility, keyboard query activation, staged framing and the corrected cow-head destination.
- Real GPU hover/ambient flow, picking/orbit/zoom, selected-object representation changes and interrupted feature changes.
- Color regression: unselected-region brightness ratio ~1.0001 in both modes; page black stays RGB 9/9/9.

Browser checks use Linux Chromium/Vulkan; Safari visual confirmation remains on the user's forwarded preview.

## D / Bridges follow-up

`?connections=bridges` retains the first three options and adds uniformly upward arches. Their endpoints are the selected cluster centroid and each related node's scene anchor. A parabolic lift of `4 h t (1-t)` along room +Z is applied to the straight 3D connection, with `h = clamp(0.14 × distance, 0.025, 0.28)` scene units. Thirty-two segments are projected through the live camera. Unlike B's alternating screen-space bend, the arch direction is tied to the floor and follows camera orbit; near a top-down view its apparent height naturally foreshortens. All previous density, diamond and flicker choices remain.

D stability correction (v0.10.2): curve samples and both endpoint markers use the camera-only projector. Pointer flow, ambient motion and reveal displacement no longer enter their geometry. Line-opacity signal flicker remains independent.
