# v0.12 — fiber signals and editorial alignment

## Connections

Replace width modulation with a uniform 0.85 CSS-pixel stroke. The quiet base carries one finite light packet per edge on independent 5.5–8.1 second cycles. Packets traverse the actual projected path by arc length over 2.6–3.1 seconds, with a sine-squared brightness envelope. Sixteen contiguous equal-width pieces approximate a soft leading and trailing fade. No widened ribbon, moving dot, bloom or whole-edge periodic strobe is used. The existing brief acquisition cue remains; reduced-motion preference disables packet travel, including changes to that preference while the page is open.

D remains the default, with unchanged arch heights and graph selection. The approved endpoint-only displacement model is preserved. All comparison geometries share this fiber treatment. The old variable-width helper is removed.

## Demo and header

Desktop query summary is a single three-column grid: query left, stages centered and LEGO credit right. The two outer columns have equal width, so long sentences do not shift the center. Below 850px the stages move to a second row to avoid overlap.

Move the research direction beside the masthead name. On narrower screens it stacks immediately below the name. “Ways of seeing” replaces the previous hero-intro label using its typography. The descriptive sentence stays on the right; the duplicate label within the scene is removed.

## Links and work

A shared SVG arrow is used on resource, contact, news and inline biography links, plus the React LEGO credit. Hover and keyboard focus extend the shaft toward the upper right and slightly enlarge the head without reflowing link text. Reduced motion disables the transition. Navigation and scene-control buttons retain their existing interaction language.

Work metadata uses “theme · venue year”. ByteDance experience uses the same media/copy grid as papers, with Research experience in the metadata position. The left column reuses the repository's existing colored ByteDance SVG unchanged. The date is 2026.05 — 2026.09, location Hangzhou, China. Both technical description bullets are transcribed from the user's supplied image.

## Validation

Production build/type check and 19 unit tests. Browser regression covers live packet motion, constant width, reduced motion, endpoint/arch stability, aligned query columns, header relocation, logo loading, experience alignment, metadata separators and link-arrow feedback. Desktop/mobile query playback, cancellation, navigation and fallback checks remain in the main browser suite. Screenshots under `.preview/v12/` show the header, active summary, AI fiber scene and experience row.
