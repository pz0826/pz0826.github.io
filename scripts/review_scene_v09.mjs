import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = `.preview/v09-${process.env.REVIEW_PASS || 'before-crop'}`;
await mkdir(directory, { recursive: true });
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
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: 'reduce',
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(60000);
try {
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4323');
  await page.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
  );
  const stage = page.locator('.room-stage');
  await stage.scrollIntoViewIfNeeded();
  const shot = async (name) => {
    await page.waitForTimeout(450);
    await stage.screenshot({ path: `${directory}/${name}.png` });
  };
  await shot('home');
  const b = await page.locator('.room-canvas').boundingBox();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.82, b.y + b.height * 0.43, {
    steps: 20,
  });
  await page.mouse.up();
  await shot('door');
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.82, b.y + b.height * 0.5, {
    steps: 20,
  });
  await page.mouse.up();
  await shot('sofa-wall');
  await page
    .getByRole('button', { name: 'Reset camera and selection' })
    .click();
  if (!process.env.CROP_ONLY) {
    for (const name of ['Piano', 'Plant']) {
      await page
        .getByRole('button', { name: `Observe ${name}`, exact: true })
        .click();
      for (const mode of ['Branch', 'Layer', 'Network']) {
        await page.getByRole('button', { name: mode, exact: true }).click();
        await shot(`${name}-${mode}`);
      }
    }
    const buttons = page.locator('.query-options button');
    const count = await buttons.count();
    for (let q = 0; q < count; q++) {
      await buttons.nth(q).evaluate((el) => el.click());
      const terms = await page
        .locator('.query-steps button:not(:text("Stop"))')
        .count();
      for (let step = 0; step < terms; step++) {
        await page.waitForFunction(
          (i) =>
            document
              .querySelectorAll('.query-steps button')
              [i]?.classList.contains('current'),
          step,
        );
        await shot(`query-${q}-step-${step}`);
      }
      for (const mode of ['Branch', 'Layer', 'Network']) {
        await page
          .getByRole('button', { name: mode, exact: true })
          .evaluate((el) => el.click());
        await shot(`detail-${q}-${mode}`);
      }
    }
  }
  await writeFile(`${directory}/errors.json`, JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Review captures:', directory);
} finally {
  await browser.close();
}
