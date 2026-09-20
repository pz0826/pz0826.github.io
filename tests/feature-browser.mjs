import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const b = await chromium.launch({
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
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await mkdir('.preview/dial', { recursive: true });
  await p.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4321');
  await p.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
  );
  await p.waitForTimeout(1000);
  assert.equal(
    await p.getByRole('slider', { name: 'Feature level', exact: true }).count(),
    0,
  );
  await p.screenshot({ path: '.preview/dial/human.png' });
  await p.getByRole('button', { name: 'AI', exact: true }).click();
  await p.waitForTimeout(5100);
  await p.screenshot({ path: '.preview/dial/ai-level1.png' });
  await p.getByRole('button', { name: 'Feature level 5', exact: true }).click();
  await p.waitForTimeout(950);
  await p.screenshot({ path: '.preview/dial/level-wave.png' });
  await p.getByRole('button', { name: 'Feature level 3', exact: true }).click();
  await p.waitForTimeout(3600);
  await p.screenshot({ path: '.preview/dial/ai-level3.png' });
  const slider = p.getByRole('slider', { name: 'Feature level', exact: true });
  await slider.focus();
  await p.keyboard.press('End');
  await p.waitForTimeout(500);
  assert.equal(
    await p.locator('.room-experience').getAttribute('data-level'),
    '5',
  );
  const box = await slider.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2, box.y + 15, { steps: 4 });
  await p.mouse.up();
  await p.waitForTimeout(3600);
  assert.equal(
    await p.locator('.room-experience').getAttribute('data-level'),
    '1',
  );
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: '.preview/dial/mobile.png' });
  await p.getByRole('button', { name: 'Human', exact: true }).click();
  assert.equal(await slider.count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'AI-only dial, rapid level changes, keyboard and pointer slider checks passed',
  );
} finally {
  await b.close();
}
