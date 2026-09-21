import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: [
    '--no-sandbox',
    '--use-angle=vulkan',
    '--enable-features=Vulkan',
    '--disable-vulkan-surface',
    '--ignore-gpu-blocklist',
  ],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
    }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4323');
  await page.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
    null,
    { timeout: 60000 },
  );
  const bounds = () =>
    page.locator('.hud-outline').evaluate((e) => {
      const points = (e.getAttribute('points') || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p.split(',').map(Number));
      if (!points.length) return null;
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1]);
      return [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...ys),
        Math.max(...ys),
      ];
    });
  const cases = [
    { step: '9', delay: 300, button: 'left' },
    { step: '74', delay: 400, button: 'right' },
    { step: '972', delay: 1400, button: 'left' },
    { step: '972', delay: 1400, button: 'right' },
  ];
  for (const item of cases) {
    await page
      .getByRole('button', { name: 'Reset camera and selection' })
      .click();
    await page
      .locator('[data-query-id="room-query-02"]')
      .evaluate((e) => e.click());
    await page.waitForFunction(
      (id) =>
        document.querySelector('.room-experience')?.dataset.selected === id,
      item.step,
      { timeout: 15000 },
    );
    await page.waitForTimeout(item.delay);
    const box = await page.locator('.room-canvas canvas').boundingBox(),
      x = box.x + box.width * 0.4,
      y = box.y + box.height * 0.68;
    await page.mouse.move(x, y);
    await page.mouse.down({ button: item.button });
    await page.waitForTimeout(65);
    const before = await bounds();
    await page.mouse.move(x + 1, y + 1);
    await page.waitForTimeout(65);
    const after = await bounds();
    assert.ok(
      before && after,
      'selection envelope remains visible during handoff',
    );
    const max = Math.max(...after.map((v, i) => Math.abs(v - before[i])));
    console.log(item, max);
    assert.ok(
      max < 12,
      `one-pixel ${item.button} drag must not jump at ${item.step}: ${max}px`,
    );
    // Move far enough to be a drag, not an object-selection click.
    await page.mouse.move(x + 10, y + 2);
    await page.mouse.up({ button: item.button });
    assert.equal(
      await page.locator('.room-experience').getAttribute('data-playing'),
      'false',
    );
    await page.waitForTimeout(3000);
    assert.equal(
      await page.locator('.room-experience').getAttribute('data-selected'),
      item.step,
      'canceled query must not resume',
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'Intermediate and close-detail query handoffs remain continuous for orbit and pan.',
  );
} finally {
  await browser.close();
}
