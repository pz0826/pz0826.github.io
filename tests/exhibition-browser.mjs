import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
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
  await mkdir('.preview/exhibition', { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
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
  await page.locator('.room-stage').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.query-tag:visible').count(), 6);
  assert.equal(
    await page.locator('.scene-tools, .query-options, .scene-status').count(),
    0,
  );
  assert.ok(
    await page.getByRole('link', { name: /powered by LEGO/ }).isVisible(),
  );
  const invitation = page.locator('[data-query-id="room-query-12"]');
  await invitation.focus();
  await page.waitForTimeout(350);
  assert.equal(
    await invitation.evaluate((e) => getComputedStyle(e).opacity),
    '1',
  );
  assert.ok(
    await invitation.isVisible(),
    'focusing must not hide an expanding invitation',
  );
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.selected === '429',
  );
  assert.ok(await page.locator('.query-trace').isVisible());
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Reset camera and selection' })
    .click();

  await page
    .locator('[data-query-id="room-query-02"]')
    .evaluate((e) => e.click());
  for (const [step, id] of [
    [0, '9'],
    [1, '74'],
    [2, '972'],
  ]) {
    await page.waitForFunction(
      (id) =>
        document.querySelector('.room-experience')?.dataset.selected === id,
      id,
      { timeout: 15000 },
    );
    await page.waitForTimeout(1450); // settle camera, while the next step has not started
    const points = await page.locator('.hud-outline').getAttribute('points');
    const viewBox = (await page.locator('.hud-traces').getAttribute('viewBox'))
      .split(' ')
      .map(Number);
    const pairs = points
      .split(' ')
      .filter(Boolean)
      .map((p) => p.split(',').map(Number));
    assert.ok(
      pairs.length > 3,
      `step ${step} must show a complete selection envelope`,
    );
    assert.ok(
      pairs.every(
        ([x, y]) => x > 8 && y > 8 && x < viewBox[2] - 8 && y < viewBox[3] - 8,
      ),
      `step ${step} remains in view`,
    );
    await page
      .locator('.room-stage')
      .screenshot({ path: `.preview/exhibition/moving-step-${step}.png` });
  }
  assert.equal(await page.locator('.selection-panel').count(), 0);
  await page
    .getByRole('button', { name: 'Network', exact: true })
    .evaluate((e) => e.click());
  await page.waitForTimeout(350);
  const count = Number(
    await page.locator('.hud-links').getAttribute('data-edge-count'),
  );
  assert.ok(count > 2 && count <= 18);
  const path = await page
    .locator('.hud-links path')
    .evaluateAll((es) => es.map((e) => e.getAttribute('d')).join(' '));
  assert.ok(!/NaN|Infinity/.test(path));
  for (const mode of ['AI', 'Human', 'AI']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.waitForTimeout(3500);
    assert.equal(
      await page.locator('.room-experience').getAttribute('data-selected'),
      '972',
    );
  }
  const dial = page.getByRole('slider', { name: 'Scene level', exact: true });
  await dial.focus();
  await page.keyboard.press('Home');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(3600);

  await page
    .locator('[data-query-id="room-query-09"]')
    .evaluate((e) => e.click());
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3300);
  assert.equal(
    await page.locator('.room-experience').getAttribute('data-selected'),
    '',
  );
  assert.equal(
    await page.locator('.room-experience').getAttribute('data-playing'),
    'false',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Animated staged framing, source graph density and cancellation passed',
  );
} finally {
  await browser.close();
}
