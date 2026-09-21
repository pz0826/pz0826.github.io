import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const url = process.env.BASE_URL || 'http://127.0.0.1:4321';
await fs.mkdir('.preview', { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  // This test isolates the photography section from the independent WebGL demo.
  await page.route('**/scenes/**', (r) => r.abort());
  const requests = [];
  const errors = [];
  page.on('request', (r) => {
    if (r.url().includes('/media/arts/')) requests.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(700);
  assert.equal(
    requests.length,
    0,
    'No photo downloads before approaching Arts',
  );
  await page.locator('#arts').scrollIntoViewIfNeeded();
  await page
    .getByRole('button', { name: 'Explore Elemental', exact: true })
    .waitFor();
  await page
    .locator('.art-covers.primary .art-image.is-ready')
    .first()
    .waitFor();
  await page.waitForTimeout(1000);
  await page.locator('#arts').screenshot({ path: '.preview/arts-entry.png' });
  // Deliberate hover replays cached RGB without opening a collection.
  await page
    .getByRole('button', { name: 'Explore Elemental', exact: true })
    .hover();
  await page
    .locator('.art-covers.primary canvas:not([hidden])')
    .first()
    .waitFor();
  assert.equal(await page.locator('.art-chapter-heading').count(), 0);
  await page.waitForTimeout(850);

  assert.equal(
    requests.some((u) => u.includes('-3200.webp')),
    false,
  );
  await page
    .getByRole('button', { name: 'Explore Elemental', exact: true })
    .click();
  await page.locator('.art-spread').first().locator('.is-ready').waitFor();
  assert.equal(await page.locator('.art-spread').count(), 10);
  await page.locator('.art-chapter-nav').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page
    .locator('.art-exhibition')
    .screenshot({ path: '.preview/arts-elemental.png' });
  await page.getByRole('button', { name: 'Next spread', exact: true }).click();
  await page.waitForTimeout(900);
  assert.match(await page.locator('.art-paging').innerText(), /Spread 2 of 10/);
  await page
    .locator('.art-spread')
    .nth(1)
    .getByRole('button', { name: /Visual echoes/ })
    .first()
    .click();
  await page.locator('.art-echoes').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.art-echo-candidate').count(), 3);
  await page.screenshot({ path: '.preview/arts-echoes.png' });
  assert.equal(await page.locator('.echo-score').count(), 3);
  const anchors = await page.locator('.art-chapter-stage').evaluate((el) => {
    const root = el.getBoundingClientRect();
    return [...el.querySelectorAll('[data-connection]')].map((group) => {
      const target = el
        .querySelector(
          `[data-echo-id="${group.getAttribute('data-connection')}"] .art-image`,
        )
        .getBoundingClientRect();
      const path = group.querySelector('.echo-thread');
      const end = path.getPointAtLength(path.getTotalLength());
      return (
        Math.abs(end.x - (target.left - root.left + target.width / 2)) +
        Math.abs(end.y - (target.top - root.top - 7))
      );
    });
  });
  assert.ok(
    anchors.every((d) => d < 1),
    'Curves attach to actual candidate images',
  );
  const glyphs = await page.locator('.echo-score').evaluateAll((labels) =>
    labels.map((label) => {
      const [number, percent] = label.querySelectorAll('tspan');
      return {
        gap:
          percent.getBoundingClientRect().left -
          number.getBoundingClientRect().right,
        stroke: getComputedStyle(label).stroke,
      };
    }),
  );
  assert.ok(
    glyphs.every((g) => g.gap >= 3 && g.stroke === 'none'),
    'Percent glyph never overpaints the number',
  );
  await page.locator('.art-echo-candidate').first().click();
  assert.notEqual(
    await page.locator('.art-chapter-heading h3').innerText(),
    'Elemental',
  );
  await page
    .getByRole('button', { name: 'Back to Elemental', exact: false })
    .click();
  await page.waitForTimeout(200);
  assert.match(await page.locator('.art-paging').innerText(), /Spread 2 of 10/);
  assert.equal(
    requests.some((u) => u.includes('-3200.webp')),
    false,
    'Echo exploration uses small derivatives',
  );
  await page
    .locator('.art-spread')
    .nth(1)
    .locator('.art-open-photo')
    .first()
    .click();
  await page.locator('.art-lightbox[open]').waitFor();
  await page.locator('.art-full.loaded').waitFor();
  assert.equal(
    requests.some((u) => u.includes('-3200.webp')),
    true,
    'Large derivative starts only after opening',
  );
  await page.screenshot({ path: '.preview/arts-lightbox.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.art-lightbox').count(), 0);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.classList.contains('art-open-photo'),
    ),
    true,
    'Focus returns to the actual opener',
  );
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.activeElement).outlineStyle,
    ),
    'none',
    'Mouse opening and Escape closing do not leave a focus rectangle',
  );
  await page.keyboard.press('Enter');
  await page.locator('.art-lightbox[open]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.classList.contains('art-open-photo'),
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.activeElement).outlineStyle,
    ),
    'solid',
    'Keyboard opening preserves its focus indicator',
  );

  // Dragging turns a spread without opening a photograph.
  await page.locator('.art-spreads').scrollIntoViewIfNeeded();
  const bounds = await page.locator('.art-spreads').boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * 0.8,
    bounds.y + bounds.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.12,
    bounds.y + bounds.height * 0.5,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForTimeout(900);
  assert.match(await page.locator('.art-paging').innerText(), /Spread 3 of 10/);
  assert.equal(await page.locator('.art-lightbox').count(), 0);
  // Every loaded image/canvas rectangle retains the source ratio.
  const distortion = await page
    .locator('.art-image.is-ready')
    .evaluateAll((els) =>
      els
        .map((el) => {
          const r = el.getBoundingClientRect(),
            img = el.querySelector('img');
          return Math.abs(
            r.width / r.height -
              Number(img.getAttribute('width')) /
                Number(img.getAttribute('height')),
          );
        })
        .filter((n) => n > 0.02),
    );
  assert.deepEqual(distortion, [], 'No aspect ratio distortion');
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  await mobile.route('**/scenes/**', (r) => r.abort());
  await mobile.goto(url + '/#arts');
  await mobile
    .getByRole('button', { name: 'Explore In Bloom', exact: true })
    .click();
  await mobile.locator('.art-chapter-heading').scrollIntoViewIfNeeded();
  await mobile.waitForTimeout(500);
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    'No mobile page overflow',
  );
  await mobile.screenshot({ path: '.preview/arts-mobile.png' });
  assert.equal(
    await mobile
      .locator('.art-spread')
      .first()
      .locator('canvas:not([hidden])')
      .count(),
    0,
    'Reduced motion skips reveal',
  );
  // Failure to load a feature preview still displays decoded RGB.
  const fallback = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await fallback.route('**/scenes/**', (r) => r.abort());
  await fallback.route('**/*-pca.png', (r) => r.abort());
  await fallback.goto(url + '/#arts');
  await fallback
    .getByRole('button', { name: 'Explore Order', exact: true })
    .click();
  await fallback
    .locator('.art-spread')
    .first()
    .locator('.art-image.is-ready')
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: deferred loading, five-theme entry, spread navigation, cross-theme echoes and return, on-demand large viewer, ratios, mobile, reduced motion, failed-PCA fallback.',
  );
  console.log('Unique art requests:', new Set(requests).size);
} finally {
  await browser.close();
}
