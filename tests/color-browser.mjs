// Color-pipeline regression: selecting an object must not darken the room or
// turn the black page background gray when switching to an offscreen target.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import assert from 'node:assert/strict';
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
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4321');
  await page.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
  );
  await page.waitForTimeout(500);
  const canvas = page.locator('.room-canvas canvas');
  const capture = async () =>
    sharp(await canvas.screenshot())
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  const results = [];
  for (const mode of ['Human', 'AI']) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.waitForTimeout(500);
    const human = await capture();
    const anchor = await page
      .locator('[data-query-id="room-query-12"] i')
      .boundingBox();
    await page.mouse.click(anchor.x - 6, anchor.y + 12);
    await page.waitForFunction(
      () => !!document.querySelector('.room-experience')?.dataset.selected,
    );
    await page.waitForTimeout(800);
    const selected = await capture();
    const { width, height } = human.info;
    const corner = (data) => [
      ...data.subarray(
        (Math.floor(height * 0.15) * width + Math.floor(width * 0.1)) * 3,
        (Math.floor(height * 0.15) * width + Math.floor(width * 0.1)) * 3 + 3,
      ),
    ];
    for (const state of [human, selected])
      assert.ok(
        corner(state.data).every((v) => Math.abs(v - 9) <= 2),
        'background stays #090909',
      );
    let before = 0,
      after = 0;
    // Compare the unselected sofa/left wall, excluding plant and its halo.
    for (let y = Math.floor(height * 0.3); y < height * 0.78; y++)
      for (let x = Math.floor(width * 0.22); x < width * 0.48; x++) {
        const i = (y * width + x) * 3;
        const a = human.data[i] + human.data[i + 1] + human.data[i + 2];
        if (a > 75) {
          before += a;
          after +=
            selected.data[i] + selected.data[i + 1] + selected.data[i + 2];
        }
      }
    assert.ok(before > 1000);
    const ratio = after / before;
    assert.ok(
      ratio > 0.99 && ratio < 1.01,
      `selection preserves room brightness: ${ratio}`,
    );
    results.push({
      mode,
      ratio,
      backgroundBefore: corner(human.data),
      backgroundSelected: corner(selected.data),
    });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, errors }));
} finally {
  await browser.close();
}
