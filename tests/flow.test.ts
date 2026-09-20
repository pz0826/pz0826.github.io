import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlowField, sampleFlow } from '../src/lib/scene/flow-field.ts';
import { displace } from '../src/lib/scene/art-direction.ts';
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
test('wake evolves after input, then recovers in roughly a third of the original time without divergence', () => {
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
  advance(f, 2);
  assert.ok(
    peak(f).energy > 0.002,
    'a small wake should remain after the gesture',
  );
  advance(f, 10);
  assert.ok(peak(f).energy < later.energy * 0.06);
  assert.ok(peak(f).distance < later.distance * 0.25);
  assert.ok(f.values.every(Number.isFinite));
  assert.ok(sampleFlow({ values: f.values }, 0, 0).every(Number.isFinite));
});

test('same screen gesture has the same projected displacement at different zoom distances', () => {
  const f = new FlowField();
  f.setViewport(1440, 700);
  f.push(-0.04, 0, 0.04, 0, 0.05);
  advance(f, 0.3);
  const projected = [2, 8].map((z) => {
    const frame = {
      eye: [0, 0, z],
      right: [1, 0, 0],
      up: [0, 1, 0],
      forward: [0, 0, -1],
      tanFov: 0.3,
      aspect: 1440 / 700,
    };
    const p = displace([0, 0, 0.2], {
      progress: 0,
      time: 2,
      ambient: 0,
      flow: { values: f.values, frame },
    });
    return [
      (p[0] / ((z - p[2]) * frame.tanFov * frame.aspect)) * 720,
      (p[1] / ((z - p[2]) * frame.tanFov)) * 350,
    ];
  });
  assert.ok(Math.hypot(...projected[0]) > 0.1);
  assert.ok(
    Math.hypot(
      projected[0][0] - projected[1][0],
      projected[0][1] - projected[1][1],
    ) < 1e-5,
  );
});
