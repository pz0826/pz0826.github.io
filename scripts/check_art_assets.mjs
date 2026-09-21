import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
const config = JSON.parse(
  await readFile('tools/art-gallery/edit.json', 'utf8'),
);
const manifest = JSON.parse(
  await readFile('src/content/art-gallery.json', 'utf8'),
);
assert.equal(Object.keys(manifest.photos).length, 66);
assert.equal(manifest.themes.length, 5);
assert.match(manifest.checkpointSha256, /^[a-f0-9]{64}$/);
let bytes = 0;
const referenced = new Set();
for (const theme of manifest.themes) {
  const sequence = theme.spreads.flat();
  assert.equal(new Set(sequence).size, sequence.length);
  assert.ok(sequence.includes(theme.cover));
  assert.ok(theme.spreads.every((s) => s.length === 1 || s.length === 2));
}
for (const [id, p] of Object.entries(manifest.photos)) {
  assert.ok(config.photos.some((photo) => photo.id === id));
  assert.equal(p.content.length, 4);
  const [x, y, w, h] = p.content;
  assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1);
  for (const [long, image] of Object.entries(p.images)) {
    referenced.add(image.src.split('/').at(-1));
    assert.ok(Math.max(image.width, image.height) <= Number(long));
    assert.ok(
      Math.abs(image.width / image.height - p.width / p.height) < 0.012,
    );
    const actual = await stat('public' + image.src);
    assert.equal(actual.size, image.bytes);
    bytes += actual.size;
  }
  const png = await readFile('public' + p.pca);
  referenced.add(p.pca.split('/').at(-1));
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16) <= 36 && png.readUInt32BE(20) <= 36);
  const ownThemes = manifest.themes
    .filter((t) => t.spreads.flat().includes(id))
    .map((t) => t.id);
  const targets = new Set();
  for (const echo of manifest.echoes[id]) {
    assert.ok(echo.id !== id && manifest.photos[echo.id]);
    assert.ok(!ownThemes.includes(echo.theme));
    assert.ok(
      manifest.themes
        .find((t) => t.id === echo.theme)
        .spreads.flat()
        .includes(echo.id),
    );
    assert.ok(echo.similarity >= -1 && echo.similarity <= 1);
    targets.add(echo.theme);
  }
  assert.equal(targets.size, 3);
}
assert.deepEqual(
  (await readdir('public/media/arts')).sort(),
  [...referenced].sort(),
  'Publish only the photography derivatives referenced by the gallery',
);
console.log(
  `Verified 66 photographs, 5 complete edits, real patch-PCA sidecars, 198 cross-theme candidates, ${(bytes / 1024 ** 2).toFixed(1)} MiB of responsive derivatives.`,
);
