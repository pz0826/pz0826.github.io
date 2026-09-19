import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4321';
await mkdir('.preview/screenshots', { recursive: true });
const gpuArgs = process.env.SOFTWARE_WEBGL
  ? ['--enable-unsafe-swiftshader']
  : [
      '--use-angle=vulkan',
      '--enable-features=Vulkan',
      '--disable-vulkan-surface',
      '--ignore-gpu-blocklist',
    ];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', ...gpuArgs],
});
const errors = [];
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
page.setDefaultTimeout(60000);
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
try {
  const start = Date.now();
  await page.goto(base);
  const room = page.locator('.room-experience');
  await page.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
    { timeout: 60000 },
  );
  console.log(`Room ready in ${Date.now() - start}ms`);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: '.preview/screenshots/desktop-human.png' });
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.scene-status')?.textContent ===
      'Ready to explore',
  );
  await page.waitForTimeout(1800);
  assert.equal(await room.getAttribute('data-view'), 'ai');
  await page.screenshot({ path: '.preview/screenshots/desktop-ai.png' });
  await page
    .getByRole('group', { name: 'Scene detail level' })
    .getByRole('button', { name: '3', exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector('.room-experience')?.dataset.level === '3',
  );
  await page.waitForFunction(
    () =>
      document.querySelector('.scene-status')?.textContent ===
      'Ready to explore',
  );
  await page.getByRole('button', { name: 'Human', exact: true }).click();
  await page.waitForTimeout(1000);
  await page
    .getByRole('button', { name: 'Observe Plant', exact: true })
    .click();
  await page.waitForFunction(
    () => !!document.querySelector('.room-experience')?.dataset.selected,
    { timeout: 10000 },
  );
  console.log(
    'Selected source-backed object',
    await room.getAttribute('data-selected'),
  );
  await page.screenshot({ path: '.preview/screenshots/desktop-selection.png' });
  assert.equal(await room.getAttribute('data-selected'), '24');
  assert.ok(
    (await page.locator('.hud-outline').getAttribute('points')).length > 10,
  );
  await page.getByRole('button', { name: 'Nearby', exact: true }).click();
  assert.ok(await page.locator('.relation-list button').count());
  await page
    .getByRole('button', { name: 'Reset camera and selection' })
    .click();
  await page.getByRole('button', { name: /sofa → toy/ }).click();
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  const stopped = await room.getAttribute('data-selected');
  await page.waitForTimeout(3200);
  assert.equal(await room.getAttribute('data-playing'), 'false');
  assert.equal(await room.getAttribute('data-selected'), stopped);
  await page.getByRole('button', { name: 'Human', exact: true }).click();
  await page.getByRole('button', { name: /piano → logo/ }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('.query-steps')
        ?.textContent.includes('10 candidate matches'),
    { timeout: 20000 },
  );
  await page.waitForFunction(
    () =>
      document.querySelector('.scene-status')?.textContent ===
      'Ready to explore',
  );
  await page.waitForTimeout(2000);
  console.log('Final query cluster', await room.getAttribute('data-selected'));
  await page.locator('.room-stage').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.preview/screenshots/desktop-query.png' });
  const before = await page.evaluate(() => scrollY);
  const stage = await page.locator('.room-stage').boundingBox();
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);
  assert.ok(
    Math.abs((await page.evaluate(() => scrollY)) - before) < 2,
    'wheel over scene must zoom without scrolling the document',
  );
  await page.mouse.move(15, stage.y + stage.height / 2);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(400);
  assert.ok(
    (await page.evaluate(() => scrollY)) > before,
    'outside the scene, wheel still scrolls the page',
  );
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Works', exact: true })
    .click();
  assert.equal(new URL(page.url()).hash, '#works');
  await page.screenshot({ path: '.preview/screenshots/desktop-works.png' });
  assert.equal(await page.locator('.work').count(), 5);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: '.preview/screenshots/full-page.png',
    fullPage: true,
  });
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await mobile.goto(base);
  await mobile.waitForTimeout(1200);
  assert.equal(
    await mobile.locator('.room-experience').getAttribute('data-scene-status'),
    'idle',
  );
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await mobile.screenshot({
    path: '.preview/screenshots/mobile.png',
    fullPage: true,
  });
  await mobile.getByRole('button', { name: 'Explore the room' }).click();
  await mobile.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
    { timeout: 60000 },
  );
  await mobile.getByRole('button', { name: 'Done exploring' }).click();
  assert.equal(
    await mobile
      .locator('canvas')
      .evaluate((canvas) => canvas.style.touchAction),
    'pan-y',
  );
  await mobile.close();
  const fallback = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await fallback.route('**/scenes/room/room.splat.gz', (route) =>
    route.abort(),
  );
  await fallback.goto(base);
  await fallback.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'error',
  );
  assert.ok(
    await fallback.getByRole('button', { name: 'Retry scene' }).isVisible(),
  );
  await fallback
    .getByRole('navigation')
    .getByRole('link', { name: 'Info', exact: true })
    .click();
  assert.equal(new URL(fallback.url()).hash, '#info');
  await fallback.close();
  assert.deepEqual(errors, []);
  await writeFile(
    '.preview/browser-result.json',
    JSON.stringify(
      { passed: true, errors, date: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(
    'Desktop, mobile, query cancellation, picking, scroll and failure fallback passed.',
  );
} finally {
  await browser.close();
}
