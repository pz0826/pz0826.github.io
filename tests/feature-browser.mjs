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
  const slider = p.getByRole('slider', { name: 'Scene level', exact: true });
  const settled = async (level) => {
    await p.waitForFunction(
      (n) =>
        Math.abs(
          Number(document.querySelector('.dial-wheel').dataset.position) -
            (n - 1),
        ) < 0.003,
      level,
    );
    await p.waitForFunction(
      (n) =>
        document.querySelector('.room-experience').dataset.level === String(n),
      level,
    );
    const offset = await p.evaluate((n) => {
      const mark = document
        .querySelector(`[data-tick][data-level="${n}"]`)
        .getBoundingClientRect();
      const needle = document
        .querySelector('.dial-needle')
        .getBoundingClientRect();
      return Math.abs(
        (mark.top + mark.bottom - needle.top - needle.bottom) / 2,
      );
    }, level);
    assert.ok(offset < 0.2, `detent offset ${offset}px`);
  };
  await settled(1);
  await p.screenshot({ path: '.preview/dial/human.png' });
  await p.getByRole('button', { name: 'AI', exact: true }).click();
  await slider.focus();
  await p.keyboard.press('End');
  await settled(5);
  await p.keyboard.press('ArrowUp');
  await p.waitForTimeout(100);
  await p.keyboard.press('ArrowUp');
  await settled(3);
  await p.screenshot({ path: '.preview/dial/ai-level3.png' });
  // Continuous drag moves fractional ribs before crossing a scene-level threshold.
  const box = await slider.boundingBox(),
    x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x, y - 10, { steps: 4 });
  const partial = Number(await slider.getAttribute('data-position'));
  assert.ok(
    partial > 2.1 && partial < 2.5,
    `continuous movement was ${partial}`,
  );
  assert.equal(await slider.getAttribute('aria-valuenow'), '3');
  await p.mouse.move(x, y - 45, { steps: 12 });
  await p.waitForTimeout(140);
  await p.mouse.up();
  await settled(4);
  // Scroll in the wheel changes detents without scrolling the page or moving the camera tags.
  const scroll = await p.evaluate(() => scrollY);
  await p.evaluate(() => {
    window.__canvasWheels = 0;
    document
      .querySelector('.room-canvas canvas')
      .addEventListener('wheel', () => window.__canvasWheels++);
  });
  await p.mouse.move(x, y);
  await p.mouse.wheel(0, 80);
  await settled(5);
  assert.equal(await p.evaluate(() => scrollY), scroll);
  assert.equal(
    await p.evaluate(() => window.__canvasWheels),
    0,
    'dial wheel events must not reach the scene controls',
  );
  await p.mouse.wheel(0, 80);
  await settled(5);
  await p.getByRole('button', { name: 'Coarser level', exact: true }).click();
  await settled(4);
  // Interrupt a running wheel and take direct control instead of waiting for animation.
  await slider.focus();
  await p.keyboard.press('Home');
  await p.waitForTimeout(80);
  await p.mouse.move(x, y);
  await p.mouse.down();
  const grabbed = Number(await slider.getAttribute('data-position'));
  await p.waitForTimeout(150);
  assert.equal(Number(await slider.getAttribute('data-position')), grabbed);
  await p.mouse.move(x, y - 45, { steps: 10 });
  await p.waitForTimeout(100);
  await p.mouse.up();
  await p.waitForTimeout(1000);
  await p.setViewportSize({ width: 390, height: 844 });
  await slider.focus();
  await p.keyboard.press('Home');
  await settled(1);
  await p.screenshot({ path: '.preview/dial/mobile.png' });
  await p.getByRole('button', { name: 'Human', exact: true }).click();
  await p.getByRole('button', { name: 'Finer level', exact: true }).click();
  await settled(2);
  // Real touch events: capture must keep the gesture off the page and canvas.
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await slider.focus();
  await p.keyboard.press('Home');
  await settled(1);
  const touchBox = await slider.boundingBox();
  const tx = touchBox.x + touchBox.width / 2,
    ty = touchBox.y + touchBox.height * 0.8;
  const scrollBeforeTouch = await p.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: tx, y: ty }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: tx, y: ty - i * 9 }],
    });
    await p.waitForTimeout(35);
  }
  await p.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await settled(3);
  assert.equal(await p.evaluate(() => scrollY), scrollBeforeTouch);
  await cdp.detach();
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await slider.focus();
  await p.keyboard.press('End');
  await settled(5);
  assert.equal(
    await p.locator('.room-experience').getAttribute('data-view'),
    'human',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Wheel: continuous drag, finite detents, interruption, wheel isolation, keyboard, mobile and reduced motion passed',
  );
} finally {
  await b.close();
}
