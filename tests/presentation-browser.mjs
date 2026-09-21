import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
await mkdir('.preview/v13', { recursive: true });
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
      viewport: { width: 1600, height: 1150 },
    }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4323');
  await page.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
    null,
    { timeout: 60000 },
  );
  assert.equal(await page.locator('.scene-heading').count(), 0);
  assert.equal(
    await page.locator('.hero-intro > span').textContent(),
    'Ways of seeing',
  );
  const role = await page.locator('.masthead-role').boundingBox(),
    name = await page.locator('.wordmark').boundingBox();
  assert.ok(role.x > name.x + name.width);
  await page.evaluate(() => document.fonts.ready);
  const centers = await page
    .locator('.wordmark, .masthead-role, .masthead nav a')
    .evaluateAll((es) =>
      es.map((e) => {
        const style = getComputedStyle(e);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const metrics = ctx.measureText(e.textContent.trim());
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:0;height:0';
        e.append(probe);
        const baseline = probe.getBoundingClientRect().y;
        probe.remove();
        return (
          baseline +
          (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) /
            2
        );
      }),
    );
  const header = await page.locator('.masthead').boundingBox();
  assert.ok(
    centers.every(
      (center) => Math.abs(center - header.y - header.height / 2) < 1,
    ),
    'visible glyphs are optically centered in the masthead',
  );
  await page.waitForTimeout(600); // let the existing poster crossfade finish
  await page.screenshot({ path: '.preview/v13/header.png' });
  await page
    .locator('[data-query-id="room-query-09"]')
    .evaluate((e) => e.click());
  await page.waitForFunction(
    () => document.querySelector('.room-experience')?.dataset.selected === '37',
  );
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.waitForTimeout(1500);
  const summary = await page.locator('.query-summary').boundingBox();
  const sentence = await page.locator('.query-replay > p').boundingBox(),
    steps = await page.locator('.query-steps').boundingBox(),
    credit = await page.locator('.query-note').boundingBox();
  assert.ok(
    Math.abs(steps.x + steps.width / 2 - summary.x - summary.width / 2) < 2,
    'stages centered',
  );
  assert.ok(
    Math.abs(sentence.x - summary.x) < 2 &&
      Math.abs(credit.x + credit.width - summary.x - summary.width) < 2,
  );
  assert.ok(
    Math.abs(sentence.y + sentence.height / 2 - credit.y - credit.height / 2) <
      2,
    'sentence and credit share one row',
  );
  await page
    .locator('.query-summary')
    .screenshot({ path: '.preview/v13/query-bar.png' });
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.waitForTimeout(3400);
  const strokes = page.locator('.connection-spine, .connection-packet');
  assert.ok(
    (
      await strokes.evaluateAll((es) =>
        es
          .filter((e) => e.style.display !== 'none')
          .map((e) => e.getAttribute('stroke-width')),
      )
    ).every((w) => w === '1.05'),
  );
  const packet = () =>
    page.locator('.connection-packet').evaluateAll((es) =>
      es
        .filter((e) => e.style.display !== 'none')
        .map((e) => e.getAttribute('d'))
        .join(''),
    );
  // Read packet progress along the rendered SVG arc; all normal motion is idle.
  const signals = () =>
    page.locator('.connection-spine').evaluateAll((es) =>
      es
        .filter((e) => e.style.display !== 'none')
        .map((e) => {
          let packet = e.nextElementSibling;
          for (let j = 0; j < 8; j++) packet = packet.nextElementSibling;
          const d = packet.getAttribute('d');
          let progress = null;
          if (packet.style.display !== 'none' && d) {
            const point = packet.getPointAtLength(packet.getTotalLength() / 2);
            const length = e.getTotalLength();
            let best = Infinity;
            for (let j = 0; j <= 200; j++) {
              const p = e.getPointAtLength((length * j) / 200);
              const distance = Math.hypot(p.x - point.x, p.y - point.y);
              if (distance < best) {
                best = distance;
                progress = j / 200;
              }
            }
          }
          return {
            id: e.dataset.nodeId,
            progress,
            opacity: Number(e.style.opacity),
          };
        }),
    );
  const signatures = new Set();
  let previous = [],
    inward = 0,
    outward = 0,
    blinks = 0;
  for (let i = 0; i < 24; i++) {
    signatures.add(await packet());
    const current = await signals();
    for (const edge of current) {
      const old = previous.find((p) => p.id === edge.id);
      if (!old) continue;
      if (Math.abs(edge.opacity - old.opacity) > 0.1) blinks++;
      if (old.progress === null || edge.progress === null) continue;
      const delta = edge.progress - old.progress;
      if (delta < -0.015 && delta > -0.3) inward++;
      if (delta > 0.015 && delta < 0.3) outward++;
    }
    previous = current;
    await page.waitForTimeout(140);
  }
  assert.ok(signatures.size > 3, 'light packets move over time');
  assert.ok(
    inward > 3 && outward === 0,
    'packets converge toward the selected source',
  );
  assert.ok(
    blinks > 0,
    'independent glints also run with the camera stationary',
  );
  await page
    .locator('.room-stage')
    .screenshot({ path: '.preview/v13/fiber-ai.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  assert.equal(await packet(), '', 'reduced motion disables travelling light');
  await page.locator('.experience').scrollIntoViewIfNeeded();
  await page.locator('.experience-identity img').evaluate((e) => e.decode());
  const copy = await page.locator('#forest .work-copy').boundingBox(),
    experience = await page.locator('.experience .work-copy').boundingBox();
  assert.ok(
    Math.abs(copy.x - experience.x) < 2,
    'experience uses the paper copy column',
  );
  assert.ok(
    await page
      .locator('.experience-identity img')
      .evaluate((e) => e.complete && e.naturalWidth > 0),
  );
  assert.ok(
    (await page.locator('.experience').textContent()).includes(
      '2026.05 — 2026.09',
    ),
  );
  assert.ok(
    (await page.locator('#forest .work-metadata').textContent())
      .replace(/\s+/g, ' ')
      .includes('Remote sensing · Forests 2023'),
  );
  await page
    .locator('.experience')
    .screenshot({ path: '.preview/v13/experience.png' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const link = page.locator('#lego .text-links a').first();
  await link.scrollIntoViewIfNeeded();
  const shaft = link.locator('.arrow-stem');
  await page.mouse.move(5, 5);
  const rest = await shaft.evaluate((e) => getComputedStyle(e).transform);
  await link.hover();
  await page.waitForTimeout(300);
  assert.notEqual(
    await shaft.evaluate((e) => getComputedStyle(e).transform),
    rest,
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `no overflow at ${width}px`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'Fiber motion/reduced motion, fixed widths, aligned summary/header/experience, logo, separators and link feedback passed.',
  );
} finally {
  await browser.close();
}
