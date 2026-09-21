import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from '@playwright/test';
const root = await mkdtemp(join(tmpdir(), 'photo-review-test-'));
const folder = join(root, '中文 相册'),
  other = join(root, 'other');
await mkdir(folder);
await mkdir(other);
const fixture = spawnSync('python3', [
  '-c',
  `from PIL import Image
import sys
from pathlib import Path
for i,c in enumerate(['red','green','blue']): Image.new('RGB',(300,200),c).save(Path(sys.argv[1])/f'{i} 照片.jpg')
Image.new('RGB',(200,300),'yellow').save(Path(sys.argv[2])/'other.jpg')`,
  folder,
  other,
]);
assert.equal(fixture.status, 0);
const socket = createServer();
await new Promise((r) => socket.listen(0, '127.0.0.1', r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const url = `http://127.0.0.1:${port}`;
let server,
  logs = '';
async function start() {
  server = spawn('python3', [
    'tools/photo-review/server.py',
    '--directory',
    folder,
    '--state-dir',
    join(root, 'state'),
    '--port',
    String(port),
  ]);
  server.stderr.on('data', (d) => (logs += d));
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url + '/api/config')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(logs);
}
async function stop() {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((r) => server.once('exit', r));
  }
}
let browser;
try {
  await start();
  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/review.html');
  await page.waitForSelector('.card');
  assert.equal(await page.locator('.card').count(), 3);
  async function tag(name) {
    await page.getByRole('button', { name: '新建主题', exact: true }).click();
    await page.getByLabel('主题名称', { exact: true }).fill(name);
    await page
      .locator('#name-form')
      .getByRole('button', { name: '保存', exact: true })
      .click();
    await page.waitForFunction(
      () => !document.querySelector('#name-dialog').open,
    );
  }
  await tag('山川');
  await tag('冷色');
  const tagButton = (name) =>
    page
      .locator('.tag-button')
      .filter({
        has: page
          .locator('span')
          .filter({ hasText: new RegExp('^' + name + '$') }),
      });
  await page.locator('.card').first().dragTo(tagButton('山川'));
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.tag-button')].some(
      (b) =>
        b.firstChild.textContent === '山川' && b.lastChild.textContent === '1',
    ),
  );
  await tagButton('山川').click();
  assert.equal(await page.locator('.card').count(), 1);
  await page.reload();
  await page.waitForSelector('.card');
  await tagButton('山川').click();
  assert.equal(await page.locator('.card').count(), 1);
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  await page.getByLabel('主题名称', { exact: true }).fill('远山');
  await page
    .locator('#name-form')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector('#name-dialog').open,
  );
  await tagButton('全部照片').click();
  await page.locator('.card input[type=checkbox]').nth(0).check();
  await page.locator('.card input[type=checkbox]').nth(1).check();
  await page.getByLabel('选择要加入的主题').selectOption({ label: '冷色' });
  await page.getByRole('button', { name: '加入主题', exact: true }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.tag-button')].some(
      (b) =>
        b.firstChild.textContent === '冷色' && b.lastChild.textContent === '2',
    ),
  );
  await tagButton('冷色').click();
  assert.equal(await page.locator('.card').count(), 2);
  await page.locator('.image-button').first().click();
  await page.waitForFunction(
    () => document.querySelector('#large-photo').naturalWidth > 0,
  );
  await page.locator('#photo-tags').getByText('远山', { exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector('#photo-tags input').checked,
  );
  await page.getByRole('button', { name: '关闭大图' }).click();
  await page.locator('.card input[type=checkbox]').nth(1).check();
  await page.getByRole('button', { name: '从此主题移除' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.card').length === 1,
  );
  await page.getByLabel('搜索照片').fill('missing');
  assert.equal(await page.locator('.card').count(), 0);
  await page.getByLabel('搜索照片').fill('');
  await page.getByLabel('照片目录', { exact: false }).fill(other);
  await page.getByRole('button', { name: '打开 / 重新扫描' }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.card').length === 1 &&
      document.querySelector('.filename').textContent === 'other.jpg',
  );
  assert.equal(await page.locator('.tag-button').count(), 3);
  await page.getByLabel('照片目录', { exact: false }).fill(folder);
  await page.getByRole('button', { name: '打开 / 重新扫描' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.card').length === 3,
  );
  await stop();
  await start();
  await page.reload();
  await page.waitForSelector('.card');
  await tagButton('冷色').click();
  assert.equal(await page.locator('.card').count(), 1);
  // Cross-site mutations and unrelated file routes are refused.
  assert.equal(
    (
      await fetch(url + '/api/open', {
        method: 'POST',
        headers: {
          Origin: 'https://example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: folder }),
      })
    ).status,
    403,
  );
  assert.equal((await fetch(url + '/server.py')).status, 404);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Drag/drop, multi-tag assignment, rename, removal, preview, search, path isolation, restart persistence, mobile layout and origin checks passed.',
  );
} finally {
  if (browser) await browser.close();
  await stop();
  await rm(root, { recursive: true, force: true });
}
