import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const b = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
try {
  const p = await b.newPage({ reducedMotion: 'reduce' });
  await p.route('**/scenes/**', (r) => r.abort());
  await p.goto('http://127.0.0.1:4321/#arts');
  await p
    .getByRole('button', { name: 'Explore After Dark', exact: true })
    .click();
  for (const viewport of [
    { width: 1720, height: 900 },
    { width: 1920, height: 650 },
    { width: 1440, height: 1050 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await p.setViewportSize(viewport);
    for (const theme of [
      'Elemental',
      'Imprints',
      'Order',
      'In Bloom',
      'After Dark',
    ]) {
      await p
        .locator('.art-chapter-nav')
        .getByRole('button', { name: theme, exact: true })
        .click();
      const bad = await p.locator('.art-spread').evaluateAll((spreads) =>
        spreads.flatMap((spread, i) => {
          const frame = spread.getBoundingClientRect();
          return [...spread.querySelectorAll('.art-print')].flatMap((print) => {
            const img = print.querySelector('.art-image'),
              r = img.getBoundingClientRect(),
              cap = print.querySelector('figcaption').getBoundingClientRect();
            const photo = img.querySelector('img'),
              ratio =
                Number(photo.getAttribute('width')) /
                Number(photo.getAttribute('height'));
            return r.top < frame.top - 1 ||
              cap.bottom > frame.bottom + 1 ||
              Math.abs(r.width / r.height - ratio) > 0.01
              ? [
                  {
                    page: i + 1,
                    top: r.top - frame.top,
                    bottom: cap.bottom - frame.top,
                    available: frame.height,
                    ratio: r.width / r.height,
                    expected: ratio,
                  },
                ]
              : [];
          });
        }),
      );
      assert.deepEqual(
        bad,
        [],
        `${theme} ${viewport.width}×${viewport.height}: full image AND caption fit`,
      );
      const nav = await p.locator('.art-paging').evaluate((el) => {
        const r = el.getBoundingClientRect(),
          parent = el.parentElement.getBoundingClientRect();
        return Math.abs(r.left + r.width / 2 - parent.left - parent.width / 2);
      });
      assert.ok(nav < 1, 'Navigation optically centered');
    }
    console.log(
      `All 66 photographs and captions fit at ${viewport.width}×${viewport.height}`,
    );
  }
  await p.setViewportSize({ width: 1720, height: 900 });
  await p.getByRole('button', { name: 'Go to spread 1', exact: true }).click();
  await p.locator('.art-spread').first().locator('.is-ready').waitFor();
  await p
    .locator('.art-exhibition')
    .screenshot({ path: '.preview/arts-night-uncropped.png' });
} finally {
  await b.close();
}
