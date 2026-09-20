import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4323';
await mkdir('.preview/v10', { recursive: true });
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
  for (const look of ['signal', 'arcs', 'constellation', 'bridges']) {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?connections=${look}`);
    await page.waitForFunction(
      () =>
        document.querySelector('.room-experience')?.dataset.sceneStatus ===
        'ready',
      null,
      { timeout: 60000 },
    );
    const stage = page.locator('.room-stage');
    await stage.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    if (look === 'signal') {
      await stage.screenshot({ path: '.preview/v10/invitations.png' });
      console.log(
        'Visible invitations',
        await page.locator('.query-tag:visible').count(),
      );
      console.log(
        await page.locator('.query-tag').evaluateAll((es) =>
          es.map((e) => ({
            id: e.dataset.queryId,
            visible: getComputedStyle(e).visibility,
            rect: e.getBoundingClientRect().toJSON(),
          })),
        ),
      );
    }
    // Start the TV journey and pause on the complete object for identical framing.
    await page
      .locator('[data-query-id="room-query-09"]')
      .evaluate((e) => e.click());
    await page.waitForFunction(
      () =>
        document.querySelector('.room-experience')?.dataset.selected === '37',
    );
    await page
      .getByRole('button', { name: 'Stop', exact: true })
      .evaluate((e) => e.click());
    await stage.scrollIntoViewIfNeeded();
    await page
      .getByRole('button', { name: 'Layer', exact: true })
      .evaluate((e) => e.click());
    await page.waitForTimeout(500);
    await stage.screenshot({ path: `.preview/v10/tv-${look}.png` });
    await page
      .getByRole('button', { name: 'Reset camera and selection' })
      .click();
    await page
      .locator('[data-query-id="room-query-02"]')
      .evaluate((e) => e.click());
    await page.waitForFunction(
      () =>
        document.querySelector('.room-experience')?.dataset.selected === '972',
      null,
      { timeout: 15000 },
    );
    await page.waitForTimeout(500);
    await stage.screenshot({ path: `.preview/v10/head-${look}.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:28px;background:#090909;color:#ddd;font:14px system-ui}h1{font-size:22px;font-weight:400}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}img{width:100%}figure{margin:0}figcaption{margin:6px 0 18px}h2{font-size:15px}</style><h1>Connections / visual study</h1>${['tv', 'head'].map((subject) => `<h2>${subject === 'tv' ? 'Television' : 'Cow head'}</h2><div class="row">${['signal', 'arcs', 'constellation', 'bridges'].map((look, i) => `<figure><img src="${subject}-${look}.png"><figcaption>${['A · Signal', 'B · Arcs', 'C · Constellation', 'D · Bridges'][i]}</figcaption></figure>`).join('')}</div>`).join('')}`;
  await writeFile('.preview/v10/comparison.html', html);
  const sheet = await browser.newPage({
    viewport: { width: 2800, height: 1000 },
  });
  await sheet.goto(
    new URL('../.preview/v10/comparison.html', import.meta.url).href,
  );
  await sheet.screenshot({
    path: '.preview/v10/comparison.png',
    fullPage: true,
  });
  // A second sheet shows the line treatment at a readable size; originals remain intact.
  const sharp = (await import('sharp')).default;
  for (const subject of ['tv', 'head'])
    for (const look of ['signal', 'arcs', 'constellation', 'bridges']) {
      await sharp(`.preview/v10/${subject}-${look}.png`)
        .extract({ left: 450, top: 50, width: 700, height: 510 })
        .toFile(`.preview/v10/detail-${subject}-${look}.png`);
    }
  await writeFile(
    '.preview/v10/details.html',
    html.replaceAll('src="', 'src="detail-'),
  );
  await sheet.goto(
    new URL('../.preview/v10/details.html', import.meta.url).href,
  );
  await sheet.screenshot({ path: '.preview/v10/details.png', fullPage: true });
  console.log('Four connection looks captured without browser errors');
} finally {
  await browser.close();
}
