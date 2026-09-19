// Real GPU integration checks for the installation; run separately from other GPU tests.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: [
    '--no-sandbox',
    '--use-angle=vulkan',
    '--enable-features=Vulkan',
    '--disable-vulkan-surface',
    '--ignore-gpu-blocklist',
  ],
});
try {
  await mkdir('.preview/art', { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__artDraws = 0;
    for (const [name, index] of [
      ['drawArraysInstanced', 3],
      ['drawElementsInstanced', 4],
    ]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        if (args[index] > 100000) window.__artDraws++;
        return original.apply(this, args);
      };
    }
  });
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4321');
  await page.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(2500);
  const canvas = page.locator('.room-canvas canvas');
  const box = await canvas.boundingBox();
  const x = box.x + box.width * 0.5,
    y = box.y + box.height * 0.6;
  const count = () => page.evaluate(() => window.__artDraws);
  const before = await count();
  await page.mouse.move(x - 70, y);
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(x - 70 + i * 12, y + Math.sin(i) * 18);
    await page.waitForTimeout(50);
  }
  await page.screenshot({ path: '.preview/art/disturbance.png' });
  const hoverDraws = (await count()) - before;
  assert.ok(hoverDraws > 10, 'hover must animate the particle field');
  await page.waitForTimeout(2500);
  const settled = await count();
  await page.waitForTimeout(1000);
  assert.equal(
    await count(),
    settled,
    'a stationary cursor must let the field settle',
  );
  await page.mouse.click(x, y);
  await page.waitForFunction(
    () => !!document.querySelector('.room-experience')?.dataset.selected,
    null,
    { timeout: 15000 },
  );
  const picked = await page
    .locator('.room-experience')
    .getAttribute('data-selected');
  const plant = page.getByRole('button', {
    name: 'Observe Plant',
    exact: true,
  });
  await plant.click();
  await page.waitForFunction(
    () => document.querySelector('.room-experience')?.dataset.selected === '24',
  );
  await page.waitForTimeout(800);
  const tagBefore = await plant.boundingBox();
  const outlineBefore = await page
    .locator('.hud-outline')
    .getAttribute('points');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 110, y - 35, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const tagAfter = await plant.boundingBox();
  assert.ok(
    Math.hypot(tagAfter.x - tagBefore.x, tagAfter.y - tagBefore.y) > 5,
    'object tags must follow the orbit',
  );
  assert.notEqual(
    await page.locator('.hud-outline').getAttribute('points'),
    outlineBefore,
  );
  await page.screenshot({ path: '.preview/art/orbit-selection.png' });
  await page
    .getByRole('button', { name: 'Reset camera and selection' })
    .click();
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.waitForTimeout(280);
  await page.screenshot({ path: '.preview/art/spread.png' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '.preview/art/ai.png' });
  assert.deepEqual(errors, []);
  const result = { passed: true, hoverDraws, settledDraws: 0, picked, errors };
  await writeFile('.preview/art/result.json', JSON.stringify(result, null, 2));
  console.log(result);
} finally {
  await browser.close();
}
