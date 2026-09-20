import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LevelTransitions } from '../src/lib/scene/level-transitions.ts';
import { appearanceBlend, fieldWave } from '../src/lib/scene/art-direction.ts';

function weights(queue: LevelTransitions, p: readonly number[]) {
  const out = [0, 0, 0, 0, 0];
  out[queue.base - 1] = 1;
  for (const wave of queue.waves) {
    const a = appearanceBlend(p, wave.progress);
    for (let i = 0; i < 5; i++) out[i] *= 1 - a;
    out[wave.level - 1] += a;
  }
  return out;
}
test('new choices preserve existing fronts, their colors and displacement', () => {
  const q = new LevelTransitions();
  q.choose(1, true);
  q.choose(2, true);
  q.advance(0.2);
  const p = [0.1, 0, 0.2],
    before = weights(q, p),
    wave = fieldWave(p, 1, q.progresses());
  const oldProgress = q.waves[0].progress;
  q.choose(3, true);
  assert.equal(q.waves[0].progress, oldProgress);
  assert.deepEqual(weights(q, p), before);
  assert.equal(fieldWave(p, 1, q.progresses()), wave);
  q.advance(0.3);
  assert.ok(q.waves[0].progress > oldProgress);
  const mixed = weights(q, p);
  assert.ok(
    mixed.slice(0, 3).every((w) => w > 0.001),
    'three levels coexist in an overlapping region',
  );
  assert.ok(Math.abs(mixed.reduce((a, b) => a + b, 0) - 1) < 1e-10);
  q.advance(3.2);
  assert.equal(q.base, 3);
  assert.equal(q.waves.length, 0);
  assert.deepEqual(weights(q, p), [0, 0, 1, 0, 0]);
});
test('completed fronts retire without restarting later fronts; newest choice wins', () => {
  const q = new LevelTransitions();
  q.choose(1, true);
  q.choose(5, true);
  q.advance(2);
  q.choose(2, true);
  q.advance(1.3);
  assert.equal(q.base, 5);
  assert.equal(q.waves.length, 1);
  assert.ok(Math.abs(q.waves[0].progress - 1.3 / 3.2) < 1e-10);
  q.choose(4, true);
  q.choose(4, true);
  assert.equal(q.waves.length, 2);
  q.advance(3.2);
  assert.equal(q.base, 4);
  assert.equal(q.waves.length, 0);
  q.choose(1, false);
  assert.equal(q.base, 1);
  assert.equal(q.waves.length, 0);
});

test('selected-object origins travel with their own overlapping fronts', () => {
  const q = new LevelTransitions();
  q.choose(1, false);
  const origin = [1.1, 0.1, 0.15];
  q.choose(2, true, origin);
  q.advance(0.2);
  origin[0] = -1.5;
  q.choose(3, true, [-1.5, -0.2, 0.3]);
  assert.deepEqual(q.waves[0].origin, [1.1, 0.1, 0.15]);
  assert.deepEqual(q.waves[1].origin, [-1.5, -0.2, 0.3]);
  assert.ok(
    appearanceBlend([1.1, 0.1, 0.15], 0.1, q.waves[0].origin) >
      appearanceBlend([-1.5, -0.2, 0.3], 0.1, q.waves[0].origin),
  );
  assert.ok(
    appearanceBlend([1.1, 0.1, 0.15], 0.9, q.waves[0].origin, true) <
      appearanceBlend([-1.5, -0.2, 0.3], 0.9, q.waves[0].origin, true),
    'Human reveal also starts at the object',
  );
  for (const p of [
    [-1.94, -0.83, -0.24],
    [1.52, 0.85, 0.85],
  ]) {
    assert.equal(appearanceBlend(p, 1, q.waves[0].origin), 1);
    assert.equal(appearanceBlend(p, 0, q.waves[0].origin, true), 0);
  }
});
