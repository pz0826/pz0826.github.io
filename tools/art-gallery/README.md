# Photography exhibition export

The source of truth for this exhibition edit is `edit.json`: stable photo IDs,
source filenames, alt text, five covers and explicitly ordered spreads. A spread
contains one or two photos. This is an editorial export of the user's completed
66-photo review, not a live connection to the review database. Edit spreads here
without changing the user's source tags. The private final catalog snapshot lives
in `photography-review/final-selection-snapshot.json`.

## Reproduce assets

From the repository root, using the installed DINO environment:

```sh
OPENBLAS_NUM_THREADS=4 /home/pyn/anaconda3/envs/dinov2/bin/python \
  tools/art-gallery/export.py --source photography-review/originals
```

Optional `--dinov2` and `--checkpoint` arguments override local code/weight paths.
Requires PyTorch, NumPy, Pillow, and CUDA. The local model source is
`/home/pyn/CODE/dinov2`; weights are DINOv2 ViT-S/14 with four registers.
No model or feature extractor runs in the browser.

- EXIF orientation is applied and embedded color profiles converted to sRGB.
- Exported WebP files have maximum long edges 640/1280/1920/3200, qualities
  79/83/85/90, retain the whole composition, and contain no source EXIF/GPS.
- Inference resizes the long edge to 504, then symmetrically reflect-pads to
  multiples of 14. Content coordinates accompany each tiny patch preview; canvas
  crops only the padding. The original photograph is never center-cropped.
- Each actual photo's normalized 384-dimensional patch tokens are centered and
  reduced by full SVD/PCA to 3 components. Component signs are deterministic;
  per-component 2nd/98th percentiles map RGB. Bases/means/normalization and raw
  features are retained privately in `photography-review/art-features/`.
- A pooled/shared PCA basis is exported privately for visual comparison. The
  public reveal uses per-image PCA for stronger within-frame contrast. Feature
  colors are not semantic labels and are not comparable across photographs.
- Visual echo scores use **65% normalized CLS cosine + 35% mean cosine of aligned
  2×2 pooled patch regions**. Rank only photos outside the current photo's themes,
  then retain the best candidate from each of three different themes. Scores are
  affinities, not probabilities or claims of matching locations/objects. The
  curated grouping and sequencing remain independent of this exploratory score.
- Browser intermediates are generated from the decoded display WebP on a fixed
  16→32→64→128 short-side grid. PCA changes to RGB on the first grid, then the grid
  refines; complete reveal takes 700ms. At most two animations run concurrently.
  A page-session cache avoids repeated reveals; reduced motion skips them.
- Thumbnails are requested only near the viewport (including horizontal clipping).
  The modal requests the 3200 derivative only after a photograph is opened.
  No other large photographs are prefetched. Failed PCA falls back to decoded RGB.

## Editing and checking

Descriptions and English/Chinese theme names also live in `edit.json`. Re-export
updates `src/content/art-gallery.json` and `public/media/arts/`. There are no source
filenames, original-resolution downloads or private feature matrices in the web
manifest. The full export is about 88 MiB on disk; this is **not** a page-load size.

```sh
node scripts/check_art_assets.mjs
node tests/art-gallery-browser.mjs
npm run build
```

The browser test uses the running localhost:4321 preview (or `BASE_URL`), blocks
only the independent room assets, and checks request timing, navigation, echo
return, large-image loading, image aspect ratios and mobile/reduced-motion behavior.
