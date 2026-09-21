# Five-detent thumbwheel and overlay contrast

> Historical study: the one-off comparison scripts mentioned below were removed in the v1.0.0 cleanup. Current regression tests remain under `tests/`.

This implements direction A from [the design research](dial-design-references-2026-09-20.md). The indicator stays fixed while the etched scale moves. Cylindrical projection compresses rib spacing and brightness at the edges. The desktop wheel window is 208px high (previous scale: 200px); the pointer area is 44px wide and the backing is 36px wide. The mountain and tulip also act as coarser/finer buttons. Their chevrons periodically move outward by 3px and settle, replacing the visible “Drag ↕” cue. The unavailable direction stops at each endpoint; both cues pause during dragging and respect reduced motion. The backing extends 12px above and below the control to leave clearance throughout the animation. No numerical focal lengths are implied.

## Input and motion

`use-feature-wheel.ts` owns continuous input separately from discrete scene state. Pointer capture supports mouse, pen and touch. Dragging moves the scale continuously; crossing a detent with a small hysteresis triggers the existing scene-level callback. Release uses [Motion's inertia](https://motion.dev/docs/react-transitions#inertia), not a per-change recoil impulse. The velocity-derived destination is snapped to one of five finite positions, with short decay and strongly damped endpoint correction. A new grab stops the animation at its current position immediately. Keyboard and icon buttons select exact targets. Reduced-motion removes the animated settling.

Scroll inside the wheel changes levels, consumes the event and does not zoom the canvas or scroll the page. Scroll outside it retains the existing scene/page behavior. Scene transitions still use the concurrent wave system; wheel animation never waits for a scene reveal to finish. Existing request epochs reject outdated asynchronous table requests.

Motion 13.4.0 is pinned in the package manifest and lockfile. No scene assets changed.

Pointer focus no longer draws a rectangular outline. Keyboard focus retains a subtle glow on the fixed index or icon, and the slider keeps its accessible name, value and keyboard input.

## Label collision handling

Previously, object tags only checked canvas bounds; there was no exclusion for overlaid controls. The HUD now measures the whole label, including its translated text, against reserved control rectangles. On overlap the entire tag immediately becomes invisible and non-interactive. Hidden tags continue updating their projected position, then reappear with a 4px release margin to avoid boundary flicker. Layout reads are batched before writes. This addresses partial labels showing through the translucent dial without pinning them against its edge.

## Contrast study and choice

`scripts/compare_scene_controls.mjs` renders three alternatives over the same zoomed room, then compares cloned controls over dark, middle-gray, bright and high-frequency backgrounds. The isolated comparison uses system monospace and rearranges the controls to fit cards; the full-room captures retain the production layout and fonts.

| Candidate | Result |
| --- | --- |
| Narrow translucent backing | Most consistent visual readability across the tested backgrounds; smaller footprint without reducing label text or control hit areas. |
| Difference blend, no backing | Clean on uniformly bright backgrounds, but the wheel and text nearly disappear over middle gray. Complex image colors also make strokes inconsistent. |
| Text/stroke shadows with a bright selected pill | Selected mode is clear, but outlined glyphs and ribs look busier and the other controls compete with high-frequency texture. |

The page uses the first candidate. All added top rules are removed. Backings fit closely around the existing controls; selected mode and the central detent retain bright emphasis. This is a visual comparison, not a claim of formal contrast compliance on every image.

Run after building and serving `dist`:

```bash
PREVIEW_URL=http://127.0.0.1:4323 node scripts/compare_scene_controls.mjs
```

Outputs are ignored under `.preview/overlay-study/`: `comparison.html`, `comparison.png`, `comparison-key.png`, and `scene-{narrow,difference,highlight}.png`.

## Validation

Production build/type checking passes. The browser regression covers continuous fractional travel, finite endpoints, settled tick alignment, fast successive choices, grabbing mid-animation, wheel-event isolation, keyboard, narrow-screen layout, actual emulated touch input and reduced-motion settling. The full room suite passes picking, queries/cancellation, zoom, mobile and failure fallback. `tests/hud-browser.mjs` additionally checks pointer focus, arrow endpoint states and maximum-travel padding, reduced motion, whole-label overlap/recovery in Human and AI modes, and continued projection during occlusion. Testing used Linux Chromium; Safari's final interaction feel still needs the user's Mac preview.
