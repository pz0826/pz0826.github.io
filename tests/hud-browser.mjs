// Regression for complete label exclusion around scene controls and wheel cues.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
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
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } }),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await mkdir('.preview/hud', { recursive: true });
  await p.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4321');
  await p.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
  );
  await p.waitForTimeout(1000);
  const slider = p.getByRole('slider', { name: 'Scene level', exact: true });
  await slider.click();
  assert.equal(
    await slider.evaluate((e) => getComputedStyle(e).outlineStyle),
    'none',
  );
  assert.equal(await p.locator('.dial-hint').count(), 0);
  const arrowState = () =>
    p.locator('.dial-arrow').evaluateAll((arrows) =>
      arrows.map((e) => ({
        animated: e.getAnimations().length,
        transform: getComputedStyle(e).transform,
      })),
    );
  await slider.focus();
  await p.keyboard.press('Home');
  await p.waitForTimeout(900);
  assert.equal((await arrowState())[0].animated, 0);
  assert.equal((await arrowState())[1].animated, 1);
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(900);
  const clearance = await p.evaluate(() => {
    const dial = document.querySelector('.feature-dial'),
      arrows = [...dial.querySelectorAll('.dial-arrow')];
    arrows.forEach((e) => {
      for (const a of e.getAnimations()) {
        a.currentTime = 5200 * 0.74;
      }
    });
    const r = dial.getBoundingClientRect(),
      s = getComputedStyle(dial, '::before');
    return {
      top: arrows[0].getBoundingClientRect().top - (r.top + parseFloat(s.top)),
      bottom:
        r.bottom -
        parseFloat(s.bottom) -
        arrows[1].getBoundingClientRect().bottom,
    };
  });
  assert.ok(
    clearance.top >= 8 && clearance.bottom >= 8,
    JSON.stringify(clearance),
  );
  await p.screenshot({ path: '.preview/hud/arrow-clearance.png' });
  await p.keyboard.press('End');
  await p.waitForFunction(
    () => document.querySelector('[aria-label="Finer level"]').disabled,
  );
  await p.waitForTimeout(100);
  assert.equal((await arrowState())[1].animated, 0);
  await p.emulateMedia({ reducedMotion: 'reduce' });
  assert.ok((await arrowState()).every((a) => a.animated === 0));
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  const piano = p.locator('[aria-label="Observe Piano"]');
  for (const mode of ['Human', 'AI']) {
    await p.getByRole('button', { name: mode, exact: true }).click();
    await p.waitForTimeout(700);
    // Put just the last few pixels of the text under the control: the anchor itself
    // remains outside. This reproduces the partial-tag case without fragile camera coordinates.
    await p.evaluate(() => {
      const tag = document
        .querySelector('[aria-label="Observe Piano"] span')
        .getBoundingClientRect();
      const dial = document.querySelector('.feature-dial'),
        stage = dial.parentElement.getBoundingClientRect();
      dial.style.cssText = `left:${tag.right - stage.left - 6}px;right:auto;top:${tag.top - stage.top - 90}px;transform:none`;
    });
    await p.waitForFunction(
      () =>
        document.querySelector('[aria-label="Observe Piano"]').dataset
          .occluded === 'true',
    );
    assert.equal(
      await piano.evaluate((e) => getComputedStyle(e).visibility),
      'hidden',
    );
    assert.equal(await piano.evaluate((e) => getComputedStyle(e).opacity), '0');
    assert.equal(await piano.getAttribute('aria-hidden'), 'true');
    await p.screenshot({ path: `.preview/hud/${mode}-overlap.png` });
    const oldPosition = await piano.evaluate((e) => e.style.transform);
    const canvas = await p.locator('.room-canvas canvas').boundingBox();
    await p.mouse.move(
      canvas.x + canvas.width * 0.45,
      canvas.y + canvas.height * 0.7,
    );
    await p.mouse.down();
    await p.mouse.move(
      canvas.x + canvas.width * 0.45 + 65,
      canvas.y + canvas.height * 0.7 + 12,
      { steps: 12 },
    );
    await p.mouse.up();
    await p.waitForTimeout(100);
    assert.notEqual(
      await piano.evaluate((e) => e.style.transform),
      oldPosition,
      'hidden label projection must continue updating',
    );
    await p
      .locator('.feature-dial')
      .evaluate((e) => e.removeAttribute('style'));
    await p
      .getByRole('button', { name: 'Reset camera and selection', exact: true })
      .click();
    await p.waitForFunction(() => {
      const tag = document.querySelector('[aria-label="Observe Piano"]');
      return (
        tag.dataset.occluded === 'false' &&
        getComputedStyle(tag).visibility === 'visible'
      );
    });
  }
  await p.screenshot({ path: '.preview/hud/recovered.png' });
  assert.deepEqual(errors, []);
  console.log(
    'HUD overlap/recovery in both modes, live projection, arrow limits/padding, focus and reduced-motion checks passed',
  );
} finally {
  await b.close();
}
