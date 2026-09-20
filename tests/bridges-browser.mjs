// Endpoints follow the scene; the arch shape must ignore local flow samples.
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
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto(`${process.env.PREVIEW_URL || 'http://127.0.0.1:4323'}/`);
  await page.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
    null,
    { timeout: 60000 },
  );
  await page.locator('.room-stage').scrollIntoViewIfNeeded();
  await page
    .locator('[data-query-id="room-query-09"]')
    .evaluate((e) => e.click());
  await page.waitForFunction(
    () => document.querySelector('.room-experience')?.dataset.selected === '37',
  );
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(
    await page.locator('.hud-links').getAttribute('data-look'),
    'bridges',
  );
  const paths = () =>
    page
      .locator('.connection-spine')
      .evaluateAll((es) =>
        es
          .filter((e) => e.style.display !== 'none')
          .map((e) => ({
            id: e.dataset.nodeId,
            points: [
              ...e.getAttribute('d').matchAll(/[ML]([-\d.e+]+) ([-\d.e+]+)/g),
            ].map((m) => [Number(m[1]), Number(m[2])]),
          })),
      );
  const before = await paths();
  assert.ok(before.length > 2 && before[0].points.length === 65);
  let endpointTravel = 0;
  const shape = (points) =>
    points.map((p, i) =>
      p.map(
        (v, axis) =>
          v - points[0][axis] * (1 - i / 64) - (points[64][axis] * i) / 64,
      ),
    );
  const checkShape = async () => {
    for (const edge of await paths()) {
      const initial = before.find((e) => e.id === edge.id);
      if (!initial) continue;
      const a = shape(initial.points),
        b = shape(edge.points);
      assert.ok(
        b.every((p, i) =>
          p.every((v, axis) => Math.abs(v - a[i][axis]) < 1e-6),
        ),
        'only endpoint interpolation may change the arch during flow',
      );
      endpointTravel = Math.max(
        endpointTravel,
        ...[0, 64].map((i) =>
          Math.hypot(
            ...edge.points[i].map((v, axis) => v - initial.points[i][axis]),
          ),
        ),
      );
    }
  };
  const box = await page.locator('.room-canvas canvas').boundingBox();
  const x = box.x + box.width * 0.5,
    y = box.y + box.height * 0.5;
  for (let i = 0; i < 16; i++) {
    await page.mouse.move(x - 150 + i * 20, y + Math.sin(i * 0.5) * 65);
    await page.waitForTimeout(35);
    await checkShape();
  }
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(350);
    await checkShape();
  }
  assert.ok(
    endpointTravel > 0.01,
    'endpoints must follow visible scene displacement',
  );
  await page.mouse.move(x, y + 100);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 125, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await paths();
  assert.notDeepEqual(
    after,
    before,
    'camera orbit must still reproject bridges',
  );
  assert.ok(
    after.length > 2 &&
      after.every((e) => e.points.every((p) => p.every(Number.isFinite))),
  );
  assert.deepEqual(errors, []);
  console.log(
    'Bridge endpoints track flow while arch shape stays smooth; camera orbit updates projection.',
  );
} finally {
  await browser.close();
}
