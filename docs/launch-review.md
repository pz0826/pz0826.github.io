# Pre-launch review — v0.14.3

## Changes made

- Added the requested square, translucent selection-close button above Branch / Layer / Network. It clears the highlight, graph, and active query without resetting the camera or leaving mobile exploration. Mode buttons retain their own pressed state.
- Fixed a cross-section shortcut leak: Escape in the photography viewer previously reached the room's global handler and cleared its selection. An open dialog now owns Escape.

## Verified

- Production build succeeds; 19 unit tests pass. The renderer bundle still triggers Vite's size advisory and is dynamically imported.
- The saved scene passes count, hierarchy and checksum checks: 1,064,578 Gaussians, 2,549 nodes and 11 queries. All 66 photographs, five theme edits, PCA sidecars and 198 echo candidates pass asset checks.
- Desktop scene: Human/AI and hierarchy switching, selection, relationship patterns, close-button dismissal, query interruption and completion, orbit/pan handoff, zoom versus page scrolling, and photo-modal Escape isolation.
- Touch-mode simulation: initial poster, opt-in scene loading, Done exploring returning vertical page scrolling.
- Failed scene download: poster and other page content remain usable; Retry can recover. Failed photo download can retry without accidentally opening a theme. An unavailable large photograph retains its smaller preview. A missing PCA image still reveals the RGB photograph.
- Navigation and layout at 320, 375, 390, 700, 768, 1024, 1280 and 1920 pixels: no horizontal page overflow, masthead collision or incorrect active-section marker. Research videos play and pause when scrolled away.
- Gallery: deferred downloads, five-theme entry, hover reveal, spread dragging/navigation, echoes and return, on-demand large images, keyboard and pointer focus return, and reduced motion.
- All 66 images and their captions preserve aspect ratios and fit across 1720×900, 1920×650, 1440×1050, 390×844 and 844×390.
- Built-page internal anchors and referenced local assets resolve. Fifteen unique external URLs returned HTTP 200. The MDPI and ScienceDirect links could not be verified because TLS connections failed from this environment; neither has been changed or classified as a dead link.

Browser checks used Linux Chrome, including touch/viewport emulation. They do not constitute Safari/iOS device verification. No publication or deployment was performed.

## Follow-up decisions (v0.14.4)

1. **Slow-network loading — implemented:** reported 2G/3G, downlink below 1.5 Mbps, or save-data preference defers scene data and renderer import until entry. A manifest request taking over two seconds also switches to manual entry. Explicit entry/retry bypasses this gate. The manifest fallback detects latency, not reliable bandwidth; it cannot identify every slow link. Network Information is an optional browser signal ([MDN reference](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/connection)). Touch remains opt-in.
2. **Gallery history — deferred by request:** themes and spread positions remain in component state. No URL/history change.

The selection-close backing is now 16×16 pixels, aligned to the connection controls' upper-right edge with a four-pixel gap and a transparent 24×24 hit area.

At v1.0.0 the workflow only uploaded a preview. The deployment repair now publishes the built `dist/` directory after successful checks on pushes to `feat/artistic-homepage`. Pages Source must be GitHub Actions, rather than the branch-root Jekyll publisher.
