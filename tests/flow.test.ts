import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlowField, sampleFlow } from '../src/lib/scene/flow-field.ts';
const peak = (f: FlowField) => {
  let distance = 0,
    energy = 0;
  for (let i = 0; i < f.values.length; i += 4) {
    distance = Math.max(
      distance,
      Math.hypot(f.values[i], f.values[i + 1], f.values[i + 2]),
    );
    energy = Math.max(energy, f.values[i + 3]);
  }
  return { distance, energy };
};
const advance = (f: FlowField, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) f.step(1 / 60);
};
test('stationary cursor adds no energy; faster strokes impart more momentum', () => {
  const still = new FlowField();
  still.push(0, 0, 0, 0, 0.02);
  advance(still, 1);
  assert.deepEqual(peak(still), { distance: 0, energy: 0 });
  const slow = new FlowField(),
    fast = new FlowField();
  slow.push(-0.4, 0, -0.2, 0, 0.2);
  fast.push(-0.4, 0, -0.2, 0, 0.025);
  assert.equal(
    peak(fast).distance,
    0,
    'input injects momentum, not an instant position jump',
  );
  advance(slow, 0.2);
  advance(fast, 0.2);
  assert.ok(peak(fast).distance > peak(slow).distance * 1.3);
});
test('wake evolves after input, then decays over tens of seconds without divergence', () => {
  const f = new FlowField();
  f.push(-0.4, 0, -0.2, 0, 0.06);
  advance(f, 0.2);
  const early = peak(f);
  advance(f, 1);
  const later = peak(f);
  assert.ok(
    later.distance > early.distance,
    'momentum should continue moving particles after the stroke',
  );
  advance(f, 10);
  assert.ok(
    peak(f).energy > 0.01,
    'wake must persist well beyond a cursor hover',
  );
  advance(f, 25);
  assert.ok(peak(f).energy < later.energy * 0.03);
  assert.ok(peak(f).distance < later.distance * 0.25);
  assert.ok(f.values.every(Number.isFinite));
  assert.ok(sampleFlow({ values: f.values }, 0, 0).every(Number.isFinite));
});
