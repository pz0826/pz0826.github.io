/** Visual study of the real controls over deliberately hostile backgrounds. */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const out = '.preview/overlay-study';
await mkdir(out, { recursive: true });
const variants = {
  narrow: '',
  difference: `.scene-bottom{mix-blend-mode:difference;isolation:auto}.scene-bottom>.eyebrow,.camera-controls{mix-blend-mode:normal!important}.feature-dial,.view-switch,.camera-controls,.scene-bottom>.eyebrow{isolation:auto;mix-blend-mode:difference;color:white!important;text-shadow:none!important}.feature-dial::before,.view-switch::before,.camera-controls::before,.scene-bottom>.eyebrow::before{display:none}.feature-dial *,.view-switch *,.camera-controls *{color:white!important}.dial-ticks,.dial-ticks *{stroke:white!important}`,
  highlight: `.feature-dial::before,.view-switch::before,.camera-controls::before,.scene-bottom>.eyebrow::before{display:none}.feature-dial,.view-switch,.camera-controls,.scene-bottom>.eyebrow{text-shadow:0 1px 2px #000,0 -1px 2px #000}.dial-ticks,.dial-end svg{filter:drop-shadow(0 1px 1px #000) drop-shadow(0 -1px 1px #000)}.view-switch button[aria-pressed=true]{background:#eee9dc!important;color:#181815!important;text-shadow:none}.view-switch button[aria-pressed=true]::after{display:none}`,
};
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
  await p.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4323');
  await p.waitForFunction(
    () =>
      document.querySelector('.room-experience')?.dataset.sceneStatus ===
      'ready',
  );
  const slider = p.getByRole('slider', { name: 'Scene level', exact: true });
  await slider.focus();
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(1100);
  for (let i = 0; i < 9; i++)
    await p.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await p.mouse.move(40, 40);
  await p.waitForTimeout(900);
  for (const [name, css] of Object.entries(variants)) {
    const sheet = await p.addStyleTag({ content: css || '/* baseline */' });
    await p.screenshot({ path: `${out}/scene-${name}.png` });
    await sheet.evaluate((s) => s.remove());
  }
  const controls = await p.evaluate(() =>
    ['.feature-dial', '.view-switch', '.scene-bottom']
      .map((s) => document.querySelector(s).outerHTML)
      .join(''),
  );
  const base = await readFile('src/styles/scene.css', 'utf8');
  const backgrounds = {
    dark: '#090909',
    gray: '#808080',
    bright: '#e4dcc5',
    texture:
      'repeating-linear-gradient(35deg,#181d21 0 7px,#c4b576 7px 15px,#45434c 15px 23px,#f0e4c9 23px 27px)',
  };
  // Scope each candidate to its card, including pseudo-elements.
  const scoped = Object.entries(variants)
    .map(([name, css]) =>
      css.replace(
        /([^{}]+)\{/g,
        (_, sel) =>
          sel
            .split(',')
            .map((s) => `.${name} ${s}`)
            .join(',') + '{',
      ),
    )
    .join('\n');
  const css = `${base}\n:root{--mono:monospace}*{box-sizing:border-box}body{margin:0;padding:24px;background:#181818;color:#eee;font:13px monospace}h1{font-size:18px;font-weight:400}main{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.sample{height:440px;position:relative;isolation:isolate;overflow:hidden}.heading{padding:6px 9px;background:#151515;color:#ddd;font-size:12px;position:absolute;top:0;left:0}.feature-dial{right:24px;top:51%;transform:translateY(-50%)}.scene-bottom{left:12px;right:12px;bottom:12px;gap:4px}.view-switch{left:42%;bottom:52px;top:auto;font-size:12px}.view-switch button{color:#eee;background:none;border:0;font:inherit}.scene-bottom>.eyebrow{font:10px monospace}.camera-controls button{border:0}.dial-end{border:0}.camera-controls{gap:0}.scene-bottom .eyebrow{margin:0}${scoped}`;
  const names = {
    narrow: 'A · narrow backing',
    difference: 'B · difference text',
    highlight: 'C · shadow + highlight',
  };
  const html = `<!doctype html><html><head><meta charset="UTF-8"><title>Scene overlay contrast study</title><style>${css}</style></head><body><h1>Same controls / same sizes — dark · middle gray · bright · high-frequency texture</h1><main>${Object.entries(
    backgrounds,
  )
    .map(([bg, color]) =>
      Object.keys(variants)
        .map(
          (v) =>
            `<section class="sample ${v}" style="background:${color}"><span class="heading">${names[v]} / ${bg}</span>${controls}</section>`,
        )
        .join(''),
    )
    .join('')}</main></body></html>`;
  await writeFile(`${out}/comparison.html`, html);
  await p.setViewportSize({ width: 1320, height: 1660 });
  await p.setContent(html);
  await p.screenshot({ path: `${out}/comparison.png`, fullPage: true });
  await p.screenshot({
    path: `${out}/comparison-key.png`,
    clip: { x: 20, y: 520, width: 1280, height: 900 },
  });
  await writeFile(
    `${out}/result.json`,
    JSON.stringify(
      {
        errors,
        variants: Object.keys(variants),
        backgrounds: Object.keys(backgrounds),
      },
      null,
      2,
    ),
  );
  console.log({ errors, output: `${out}/comparison.png` });
} finally {
  await b.close();
}
