import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4323';
const findings = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/scenes/room/manifest.json', (r) => r.abort());
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 375, 390, 700, 768, 1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    const header = await page.locator('.masthead-row').evaluate((el) => {
      const [identity, nav] = [...el.children].map((c) =>
        c.getBoundingClientRect(),
      );
      return {
        overlap: identity.right - nav.left,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    if (header.overlap > 1 || header.overflow > 1)
      findings.push({ width, ...header });
    for (const section of ['Info', 'News', 'Works', 'Arts']) {
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: section, exact: true })
        .click();
      await page.waitForTimeout(200);
      const active = await page
        .getByRole('navigation', { name: 'Main navigation' })
        .locator('[aria-current]')
        .textContent();
      assert.equal(
        active,
        section,
        `${width}: active navigation after clicking ${section}`,
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      if (overflow > 1) findings.push({ width, section, overflow });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#works').scrollIntoViewIfNeeded();
  for (const video of await page.locator('.work video').all()) {
    await video.scrollIntoViewIfNeeded();
    await video.evaluate((e) => e.play());
    await page.waitForTimeout(400);
    const playback = await video.evaluate((e) => ({
      time: e.currentTime,
      error: e.error?.message,
      width: e.videoWidth,
    }));
    assert.ok(
      playback.time > 0 && playback.width > 0 && !playback.error,
      JSON.stringify(playback),
    );
    await page.locator('#info').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    assert.equal(
      await video.evaluate((e) => e.paused),
      true,
      'Offscreen video pauses',
    );
  }
  await page.locator('#arts').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const brokenImages = await page
    .locator('img[src]')
    .evaluateAll((es) =>
      es.filter((e) => e.complete && e.naturalWidth === 0).map((e) => e.src),
    );
  assert.deepEqual(brokenImages, []);
  assert.deepEqual(errors, []);
  await writeFile(
    '.preview/site-audit.json',
    JSON.stringify({ findings, errors }, null, 2),
  );
  console.log(JSON.stringify({ findings, errors }));
  assert.deepEqual(
    findings,
    [],
    'Responsive layout remains clear at all widths',
  );
} finally {
  await browser.close();
}
