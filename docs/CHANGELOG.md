# Homepage iteration log

## v0.8 — thumbwheel and stable scene overlays

- Replace the feature slider with a fixed-index photographic thumbwheel: cylindrical scale projection, continuous dragging, finite detents, velocity-aware settling, touch, wheel and keyboard input.
- Preserve concurrent feature-level reveal waves when choices interrupt an unfinished transition.
- Use narrow translucent control backings; retain full hit areas and remove decorative top rules.
- Replace the visible drag hint with periodic directional arrow motion, suppress the unavailable endpoint, and reserve padding for the animation.
- Remove the pointer-focus rectangle while retaining a keyboard focus cue.
- Hide whole object tags when they overlap controls; keep hidden projections live and add release hysteresis to prevent partial/stale labels.
- Validate production build, scene picking and query playback, wheel interaction, mobile/reduced-motion behavior, and HUD collision/recovery in both vision modes.

Detailed design notes: `feature-dial-v0.6.md`, `overlay-motion-v0.7.md`, `thumbwheel-v0.8.md`.
