# v0.9 — selection, relationships and directed query journeys

> Historical study: the one-off comparison scripts mentioned below were removed in the v1.0.0 cleanup. Current regression tests remain under `tests/`.

## Selection feedback

A primary click/tap injects a small expanding ring into the existing view-space flow grid. It lasts 0.85 seconds, adds no continuing force from a stationary pointer, and relaxes through the existing flow displacement field. Label clicks also trigger the ring. Camera drags and secondary clicks do not inject it. Reduced-motion skips the ring.

Selection tint and emission fade in over 300ms with a smoothstep gain uniform. Changing selection restarts this short gain; reapplying the same selection does not. Emission rises from 0.55 to 0.68, with bright-source attenuation to avoid blowing out white fabric and labels. Bloom threshold remains above ordinary source RGB. The shared color pipeline is unchanged.

The technical selection panel (IDs, level, parent/parts, nearby/similar) is removed. Escape and camera reset still clear selection.

## Actual graph connections

`scripts/export_scene_graph.py` reads the retained `legacy_adjacency.npz`; it does not recompute or invent edges. This is the legacy bounding-sphere proximity graph, not the later typed COR graph. Its 2,549-node matrix is dense (~4 million directed entries including the diagonal), so displaying all entries is not useful visually.

The export adds a ~193 KiB compressed bit matrix and a JSON index with robust membership-median anchors. Original sphere centers often fall between disconnected feature occurrences and are unsuitable as visual endpoints. The source graph itself is unchanged.

A small attached control offers:

- **Branch**, default: actual edges to direct children and siblings.
- **Layer**: actual edges to nodes at the same semantic level.
- **Network**: actual edges across levels.

All eligible source edges are considered, then cropped/offscreen endpoints are omitted and endpoints closer than 18 CSS pixels are coalesced visually. Branch/Layer display at most 24 edges; Network at most 36, at lower opacity. Edges closer than 14px to the selection center are omitted. This is an exhibition sampling rule, not a complete graph inspector. The chosen pattern persists between selections. A local 260ms acquisition flicker accompanies edge changes; reduced-motion shows a steady trace.

Review captures include Piano and Plant and the six final query details in all three styles. Branch preserves the strongest local composition; Layer and Network offer denser alternatives. `scripts/review_scene_v09.mjs` reproduces the study under `.preview/v09-*`.

## Crop decision

Before/after captures used identical camera gestures. Lifting the entire front-wall cut from 0.40 to 0.52 restored loose foreground fragments without a convincing continuous sofa wall. That broad change was discarded. Only the door region has a smoothly raised height cap (up to 0.77); the rest of the front cut, interior ceiling rejection and oversized-Gaussian suppression remain. This restores the door corner without restoring all damaged high wall geometry. No model file changed.

## Directed query journeys

`query-direction.ts` is a separate exhibition layer; `queries.json`, cached candidates and research scores remain untouched. The page explicitly describes the journeys as choreographed from recorded research queries. It highlights one curated stage at a time instead of painting all final candidate matches red.

| Journey | Exhibition IDs | Spatial/visual check |
| --- | --- | --- |
| sofa → toy → head | 9 → 74 → 972 | Complete armchair, cow toy, then its right-hand head. The original final node 972 was correct. The temporary substitution 350 covered the body and resulted from a visual misidentification; restored after the user clarified the toy’s anatomy. |
| TV → photo → person | 37 → 22 → 1879 | Photo and person scoped to the frame above the TV, excluding disconnected occurrences. |
| flowerpot → label | 429 → 1066 | Pot and its front sticker; original 711 was mostly elsewhere. |
| piano → wheel | 43 → 1398 | Whole piano, then the right caster, spatially scoped. |
| piano → logo | 43 → 1406 | Whole piano, then the front brand lettering. |
| bottle → cap | 104 → 1765 | Bottle and actual cap; bounds use memberships rather than misleading sphere centers. |

Each stage fits a camera to the visible scoped member bounds using the saved viewing direction, with contextual padding and viewport aspect compensation. A 1.2s camera move is followed by observation time before advancing (2.6s per intermediate stage). It never begins with the saved final close-up. The target/focus position travels with the camera. Manual input, Escape, starting another query and unmounting cancel pending progression. Clicking a term restarts from that stage. Reduced-motion applies the same framing immediately.

## Validation

- Production typecheck and build.
- Unit coverage for real graph membership/mode filters, nonempty curated memberships, localized click ring and decay, plus existing flow/picking/state tests.
- Browser captures of all featured steps and three relationship densities, including large and small selections.
- Animated browser checks: each intermediate selection remains within view after camera settling; cancellation prevents later stages; edge count stays bounded.
- Existing desktop/mobile/query/scroll/fallback and selection color regressions.

Linux Chromium was used for verification; final subjective interaction feel can be reviewed in the Mac preview.
