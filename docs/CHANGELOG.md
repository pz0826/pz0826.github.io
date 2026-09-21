# Homepage iteration log

## v1.0.1 — Astro Pages deployment repair

- Diagnose the branch-source Pages failure at Build with Jekyll; the separate Astro validation/build had succeeded. A source-only content push cannot fix that publishing mismatch.
- Extend the existing workflow to upload the built `dist/` as a Pages artifact and deploy it after checks. Grant Pages/OIDC permissions only to the deploy job, serialize deployments, and exclude pull-request runs from publishing. Document the required GitHub Actions source setting.
- Link HKUST in the supervisor paragraph to its official homepage using the existing animated external-link arrow.

## v1.0.0 — first release candidate

- Remove the 01 / 02 / 03 prefixes from the three primary photography covers; all five theme labels now share the same unnumbered presentation.
- Include the finished five-theme, 66-photo exhibition, real DINO/PCA reveal assets, visual echoes, refined scene connections, slow-network entry and selection dismissal from the preceding iterations.
- Remove two unused university logos, the superseded room poster and three one-off visual-comparison scripts. Update the scene export manifest and exporter so the retired poster is no longer published.
- Keep original photographs, curation databases, raw features, generated screenshots, build output, caches, logs and local environment files out of Git. Retain reusable authoring tools, source code and regression tests.
- Add photography asset validation to CI, reject unreferenced gallery files, and update the README to describe the completed site. Mark historical study-script references as archived.
- Validate the production build, scene/photo integrity, unit tests and the gallery entry. Push the current development branch as the first complete release candidate; live-site deployment remains separate.

## v0.14.4 — slow-network entry and quieter selection dismissal

- Keep the static room poster and an Explore the room button on reported 2G/3G, sub-1.5 Mbps links and data-saving connections. Defer both scene payloads and renderer import until explicit entry; retain touch opt-in and normal desktop automatic loading.
- Reuse a small manifest request as a conservative latency fallback: if it takes longer than two seconds, abort it and offer manual entry. Explicit entry and Retry bypass the automatic-load gate. This is a latency heuristic, not a bandwidth measurement, for browsers without network information.
- Reduce the close button backing from 28 to 16 pixels and place it four pixels outside the connection controls' right edge, aligned to their top. Retain an invisible 24-pixel hit area and viewport clearance.
- Verify slow/save-data/low-bandwidth paths, missing-network-API fast and delayed paths, retry intent, no large pre-entry requests, and the existing desktop/mobile scene interactions. Leave gallery URLs and history unchanged.

## v0.14.3 — selection dismissal and pre-launch review

- Add a floating × above the right edge of Branch / Layer / Network, with a 28-pixel square translucent backing. Clear the selected part and links, cancel pending query stages, and preserve the current camera; reserve room for the button at viewport edges.
- Isolate the room’s Escape shortcut from open dialogs so closing a photograph no longer clears the unrelated room selection.
- Extend browser coverage for mouse dismissal, cancellation during a query, modal Escape isolation, and recovery after a failed scene download. Audit main navigation at eight widths, video playback and offscreen pausing, and local resources; retain the existing 66-photo framing and gallery interaction checks.
- Record remaining optional interaction choices and verification limits in `docs/launch-review.md`; leave loading policy, URL/history behavior and deployment unchanged.

## v0.14.2 — quieter cover interaction and clean focus return

- Replace explicit Reveal again controls with a short-dwell mouse-hover reveal on all five covers; allow keyboard focus to trigger the same reveal, cancel transient hovers, throttle repeated entries and respect reduced motion.
- Remove the heavy SVG text stroke that overpainted adjacent similarity-score glyphs. Space the smaller percent sign independently and use a quiet backing rectangle for legibility.
- Restore lightbox focus to the actual photo button with no scroll jump. Suppress pointer-origin focus rectangles on the rail/photo while retaining a neutral keyboard focus indicator, including after closing the viewer.

## v0.14.1 — gallery framing, reveal replay and flowing echoes

- Move the exhibition title above both collection groups; give Three ways of looking its own heading directly above the first three covers, matching Two passing seasons.
- Fix single-photo intrinsic sizing and conflicting viewport caps that let photos and captions extend beyond the horizontal rail. Use one shared stage-height budget with caption space, original aspect ratios and bounded offset spreads; verify all 66 photos across five desktop/mobile viewport sizes.
- Add a restrained forward-motion entrance for collections and a separate Reveal again control on each of the five covers, retaining reduced-motion preferences and lazy assets.
- Center previous/next arrows around the spread marks and remove the visible numerical spread counter while keeping a screen-reader announcement.
- Replace isolated echo ornaments with measured Bézier connections from the selected photograph to staggered candidate photographs. Add diamond anchors, subtle signals and percentages from the existing weighted-cosine feature scores, without treating them as probabilities. Recompute attachment points on resize and close echoes when browsing away from their source.

## v0.14 — photography collections and visual echoes

- Replace the Arts placeholder with a 3+2 collection entrance and one shared horizontal photographic gallery. Preserve all 66 final selections, with explicitly curated single-image, paired and offset spreads; remember each collection’s reading position.
- Extract real DINOv2 ViT-S/14 register patch features from every selected photograph and project to three PCA components. Reveal each photo once through feature color, aligned coarse RGB and progressively finer browser-generated mosaics; respect reduced motion and cap concurrent animations at two.
- Export color-managed, orientation-correct 640/1280/1920 WebP display sizes and a 3200-pixel on-demand viewer, preserving full compositions and removing source metadata. Keep source files and feature matrices private.
- Add opt-in Visual echoes: cross-collection candidates ranked by CLS and spatially pooled patch cosine similarity, with understated signal arcs and affinity marks inside an expandable panel. Provide a return path to the originating spread.
- Add responsive navigation, keyboard viewing, modal focus return, missing-PCA fallback and network-timing checks; keep curation order in tools/art-gallery/edit.json for the next editorial pass.

## Photography curation — five-theme preparation

- Update the current private review library to 原野 · Elemental, 印迹 · Imprints, 秩序 · Order, 花期 · In Bloom and 入夜 · After Dark, in that navigation order.
- Provisionally split the 20 existing landscape selections into 14 Elemental and 6 Imprints photographs, using settlements, fences and mountain roads as the Imprints criterion. Leave Order empty for the user's selection; preserve both existing nine-photo seasonal/night collections and their ordering.
- Back up the previous catalog and record individual classification reasons privately. Defer Arts gallery implementation until the user finishes reviewing these labels.

## Photography review service — reusable local curation

- Replace the temporary static contact gallery on port 4324 with an independent loopback-only service. Open arbitrary server-side photograph folders, optionally recurse, refresh the catalog and switch between recent folders.
- Persist separate per-folder themes and many-to-many photo memberships in SQLite. Support drag/drop, multi-selection, bulk assignment, removal, renaming, deletion, search and large-image browsing, while leaving originals untouched.
- Migrate the existing three suggested collections and 20 ordered candidates once. Generate oriented, color-managed thumbnails and previews on demand with disk/browser caching.
- Keep service code in `tools/photo-review/`; keep private catalog state, cache and photographs outside the published site and Git. Add startup documentation and isolated backend/browser regression coverage.

## v0.13.2 — optical glyph centering

- Calibrate desktop masthead alignment against the actual visible glyph bounds of the bundled Montserrat and Space Mono fonts. Offset the name by -2px and research direction by +0.4px so their visible centers align with the navigation and header center; keep narrow-screen stacked typography unchanged.

## v0.13.1 — vertically centered masthead

- Replace desktop baseline alignment with vertical centering for the name, research direction and navigation; center the complete row inside both the full-height and scrolled masthead. Keep the compact stacked identity on narrow screens.

## v0.13 — converging signals and continuous camera handoff (working iteration)

- Record the preceding v0.12 state locally as `b2b3608`, with a detailed commit description of the accumulated exhibition, query and presentation changes.
- Restore stronger connection visibility with constant 1.05px strokes and the earlier distance-based opacity; brighten traveling packets and reverse their travel toward the selected part. Restore independently timed short glints that run with the camera stationary. Keep the approved bridge geometry and endpoint displacement.
- Keep the animated camera orientation aligned with the interpolated OrbitControls target on every frame; share the same minimum distance between query framing and manual controls. Interrupting a progressive query now hands off its current viewpoint without a rotation/pan jump or a resumed query.
- Align name, research direction and navigation on a shared text baseline at desktop widths, retaining the stacked identity on smaller screens.
- Explicitly separate the two Wuhan supervisors from the two HKUST co-supervisors without repeating the Wuhan University name.
- Remove the internship logo's fixed landscape aspect ratio, tighten the section's bottom space, move dates into the metadata row, and present both descriptions as paragraphs without bullets.
- Validate mid-animation and close-detail camera handoff, inward packet travel and idle glints, reduced motion, layout and responsive overflow. See `exhibition-v0.13.md`.

## v0.12 — fiber signals and editorial alignment (working iteration)

- Replace varying line width with uniform thin connections carrying staggered, softly fading light packets along their arc length; retain D geometry and moving endpoints, and respect live reduced-motion changes.
- Align the active query, centered stages and right-aligned LEGO credit in one desktop row, with a narrow-screen wrap.
- Move research direction beside the masthead name and Ways of seeing into the hero introduction; retain the descriptive sentence on the right.
- Change work metadata to “theme · venue year”. Add directional arrow extension on hover/focus to resource, contact, news and inline biography links.
- Rebuild ByteDance experience on the paper grid, reuse the existing colored company logo, set 2026.05 — 2026.09, and include both supplied research-description bullets.
- Check fiber animation, accessibility preferences, row alignment, link feedback and responsive overflow in addition to existing scene/query regressions. See `exhibition-v0.12.md`.

## v0.11 — bridge signals and quieter framing (working iteration)

- Choose D as the default while keeping all comparison URLs; preserve its approved arch height and connection density.
- Replace A/D's isolated thick dash with several smoothly tapered width variations along each edge, rendered as a continuous ribbon and fine spine. Keep independent signal flicker.
- Align D with A/B/C's moving source centroid, endpoint projections, filtering and relationship logic. Interpolate endpoint offsets over the static arch, preventing local flow from warping its interior.
- Shorten the cow-head invitation to a direct query without the video-tour introduction, preserving the exported source prompt.
- Replace the text LEGO credit with the project's colored wordmark and retain its link/accessibility; center the tagline above the scroll cue below the demo.
- Add browser checks for moving endpoints with stable arch shape, default D, logo loading, revised copy and centered footer cues. See `exhibition-v0.11.md`.

## v0.10.2 — stable bridge geometry (working iteration)

- Detach D's entire 3D curve, source and destination diamonds from the ambient, pointer and reveal displacement fields. They now follow only fixed scene anchors and the camera.
- Keep A/B/C and D's independent line-opacity flicker unchanged.
- Verify that hovering and Human/AI transitions leave bridge paths unchanged, while orbiting still reprojects them.

## v0.10.1 — upward bridge connections (working iteration)

- Add D / Bridges (`?connections=bridges`) alongside A/B/C: each connection forms an arch raised along the room's vertical axis, with height proportional to endpoint distance and a capped maximum.
- Project sampled 3D arches through the current camera, preserving their spatial orientation during orbit; retain the endpoint diamonds and independent signal flicker.
- Extend the television/cow-head comparison captures to all four options.

## v0.10 — spatial queries and connection art (working iteration)

- Originate Human/AI and feature-level reveal waves at the selected object's cropped centroid, with independent origins for overlapping fronts and room-center fallback.
- Replace the separate query catalogue and object-name tags with six full-sentence spatial invitations; add hover/focus emphasis, collision-aware placement and fine anchor leaders.
- Follow each query stage inside the viewport and retain only the active sentence/stages plus linked LEGO attribution below it; remove the readiness row and extra gap.
- Add three URL-selectable connection studies: unequal signal strokes, curved links, and a sparse constellation with real lateral graph edges. Add endpoint diamonds and independently timed signal flicker.
- Bound connection density and preserve source-graph membership; capture television and cow-head comparisons in identical views.
- Update browser regressions for spatial entry points, complete-label avoidance, keyboard activation, staged playback, motion and color stability. See `exhibition-v0.10.md`.

## v0.9 — exhibition interaction (working iteration)

- Add localized click/tap ripples and a 300ms selection fade; modestly increase emission with protection for bright surfaces.
- Restore the door corner with a local crop profile; keep the sofa-wall cut after a broader restoration exposed detached fragments.
- Remove the technical selection panel and its parent/parts/nearby/similar controls.
- Export the saved legacy graph; offer Branch, Layer and Network traces beside the selected object, with bounded density and a brief acquisition flicker.
- Replace misleading top-score intermediate nodes with separately curated exhibition chains; progressively frame each complete object and then its details.
- Preserve original query data and document curated IDs, spatial windows, visual comparisons and validation in `exhibition-v0.9.md`.
- Correct the cow-toy interpretation: restore head node 972 (right side); the temporary node 350 highlighted the body. Keep the progressive armchair → toy → head framing.

## v0.8 — thumbwheel and stable scene overlays

- Replace the feature slider with a fixed-index photographic thumbwheel: cylindrical scale projection, continuous dragging, finite detents, velocity-aware settling, touch, wheel and keyboard input.
- Preserve concurrent feature-level reveal waves when choices interrupt an unfinished transition.
- Use narrow translucent control backings; retain full hit areas and remove decorative top rules.
- Replace the visible drag hint with periodic directional arrow motion, suppress the unavailable endpoint, and reserve padding for the animation.
- Remove the pointer-focus rectangle while retaining a keyboard focus cue.
- Hide whole object tags when they overlap controls; keep hidden projections live and add release hysteresis to prevent partial/stale labels.
- Validate production build, scene picking and query playback, wheel interaction, mobile/reduced-motion behavior, and HUD collision/recovery in both vision modes.

Detailed design notes: `feature-dial-v0.6.md`, `overlay-motion-v0.7.md`, `thumbwheel-v0.8.md`.
