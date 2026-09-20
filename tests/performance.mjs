// A local diagnostic, not a field benchmark. Run separately from other GPU tests.
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
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
  });
  await page.addInitScript(() => {
    window.__draws = 0;
    window.__times = [];
    for (const [name, index] of [
      ['drawArraysInstanced', 3],
      ['drawElementsInstanced', 4],
    ]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        if (args[index] > 100000) {
          window.__draws++;
          window.__times.push(performance.now());
        }
        return original.apply(this, args);
      };
    }
  });
  const start = Date.now();
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4321');
  await page.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
  );
  const readyMs = Date.now() - start;
  await page.waitForTimeout(3000);
  const idle0 = await page.evaluate(() => window.__draws);
  await page.waitForTimeout(2000);
  const idle1 = await page.evaluate(() => window.__draws);
  await page.evaluate(() => {
    window.__times = [];
  });
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.waitForTimeout(6200);
  const result = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const intervals = window.__times
      .slice(1)
      .map((t, i) => t - window.__times[i])
      .filter((t) => t > 1)
      .sort((a, b) => a - b);
    return {
      gpu: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
      transitionDraws: window.__times.length,
      submissionIntervalP50: intervals[Math.floor(intervals.length * 0.5)],
      submissionIntervalP95: intervals[Math.floor(intervals.length * 0.95)],
      jsHeapBytes: performance.memory?.usedJSHeapSize,
      geometryResource: performance
        .getEntriesByType('resource')
        .filter((x) => x.name.endsWith('room.splat.gz'))
        .map((x) => ({
          durationMs: x.duration,
          encodedBytes: x.encodedBodySize,
        })),
    };
  });
  const tag = await page
    .getByRole('button', { name: 'Observe Plant' })
    .locator('span')
    .boundingBox();
  await page.mouse.click(tag.x + tag.width / 2, tag.y + tag.height / 2);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.__times = [];
  });
  await page.waitForTimeout(1800);
  const glowTiming = await page.evaluate(() => {
    const intervals = window.__times
      .slice(1)
      .map((t, i) => t - window.__times[i])
      .filter((t) => t > 1)
      .sort((a, b) => a - b);
    return {
      selectionIntervalP50: intervals[Math.floor(intervals.length * 0.5)],
      selectionIntervalP95: intervals[Math.floor(intervals.length * 0.95)],
    };
  });
  Object.assign(result, glowTiming);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Arts', exact: true })
    .click();
  await page.waitForTimeout(1000);
  const off0 = await page.evaluate(() => window.__draws);
  await page.waitForTimeout(1800);
  const off1 = await page.evaluate(() => window.__draws);
  Object.assign(result, {
    readyMs,
    ambientDrawsOver2s: idle1 - idle0,
    offscreenDraws: off1 - off0,
    viewport: [1440, 1000],
    dpr: 1,
    note: 'Single local run. Draw-submission intervals, not GPU completion times or field Core Web Vitals.',
  });
  assert.equal(off1 - off0, 0, 'offscreen flow must stop rendering');
  await mkdir('.preview', { recursive: true });
  await writeFile('.preview/performance.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
