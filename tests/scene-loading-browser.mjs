import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4321';
try {
  for (const scenario of [
    { name: '3G', connection: { effectiveType: '3g', downlink: 1.8 } },
    { name: 'Save data', connection: { effectiveType: '4g', saveData: true } },
    {
      name: 'Low bandwidth',
      connection: { effectiveType: '4g', downlink: 0.8 },
    },
    {
      name: 'No network API / stalled manifest',
      connection: null,
      delay: true,
    },
    { name: 'No network API / fast manifest', connection: null, fast: true },
  ]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.addInitScript(
      (connection) =>
        Object.defineProperty(navigator, 'connection', {
          configurable: true,
          value: connection,
        }),
      scenario.connection,
    );
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    // Intentionally fail the large asset so retry can be checked without WebGL.
    await page.route('**/room.splat.gz', (r) => r.abort());
    let manifests = 0;
    await page.route('**/scenes/room/manifest.json', async (r) => {
      manifests++;
      if (scenario.delay && manifests === 1)
        await new Promise((resolve) => setTimeout(resolve, 2500));
      await r.continue().catch(() => {});
    });
    await page.goto(base);
    if (!scenario.fast) {
      await page
        .getByRole('button', { name: 'Explore the room', exact: false })
        .waitFor();
      await page.waitForTimeout(scenario.delay ? 700 : 400);
      assert.equal(
        await page
          .locator('.room-experience')
          .getAttribute('data-scene-status'),
        'idle',
      );
      assert.equal(
        requests.some((u) =>
          /spark-adapter|room\.splat|nodes\.json|labels-level/.test(u),
        ),
        false,
        'No renderer or scene payload before opt-in',
      );
      assert.equal(manifests, scenario.delay ? 1 : 0);
      assert.ok(
        await page
          .locator('.room-poster')
          .evaluate((e) => e.complete && e.naturalWidth > 0),
      );
      if (scenario.name === '3G')
        await page.screenshot({ path: '.preview/slow-network-poster.png' });
      await page
        .getByRole('button', { name: 'Explore the room', exact: false })
        .click();
    }
    await page
      .getByRole('button', { name: 'Retry scene', exact: false })
      .waitFor();
    assert.ok(requests.some((u) => u.endsWith('/room.splat.gz')));
    assert.equal(
      await page
        .getByRole('button', { name: 'Explore the room', exact: false })
        .count(),
      0,
    );
    if (scenario.fast)
      assert.equal(
        manifests,
        1,
        'Reuse the manifest instead of downloading it twice',
      );
    const firstRequests = requests.filter((u) =>
      u.endsWith('/room.splat.gz'),
    ).length;
    await page
      .getByRole('button', { name: 'Retry scene', exact: false })
      .click();
    await page
      .getByRole('button', { name: 'Retry scene', exact: false })
      .waitFor();
    assert.ok(
      requests.filter((u) => u.endsWith('/room.splat.gz')).length >
        firstRequests,
      'Retry honors explicit intent even on slow connections',
    );
    console.log(`PASS ${scenario.name}`);
    await page.close();
  }
} finally {
  await browser.close();
}
