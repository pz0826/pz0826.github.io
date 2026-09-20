import assert from 'node:assert/strict';
import * as art from '../src/lib/scene/art-direction.ts';
import { FlowField } from '../src/lib/scene/flow-field.ts';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import {
  initialState,
  sceneReducer,
  nodeAtLevel,
  queryWeights,
} from '../src/lib/scene/state.ts';
import type { SceneNode, SceneQuery } from '../src/lib/scene/types.ts';

const node = { id: 12, scene_level: 2 } as SceneNode;
const query = {
  id: 'a',
  cached_results: [
    { final_cluster_id: 12, total_score: 0.9 },
    { final_cluster_id: 31, total_score: 0.5 },
  ],
} as SceneQuery;
test('a manual view change cancels replay without discarding selection; late steps cannot take over', () => {
  const started = sceneReducer(
    { ...initialState, selected: 4 },
    { type: 'start', query },
  );
  const step = sceneReducer(started, {
    type: 'step',
    queryId: 'a',
    step: 0,
    node,
    complete: false,
  });
  const manual = sceneReducer(step, { type: 'view', view: 'ai' });
  assert.equal(manual.selected, 12);
  assert.equal(manual.playing, false);
  assert.deepEqual(
    sceneReducer(manual, {
      type: 'step',
      queryId: 'a',
      step: 1,
      node: { ...node, id: 45 },
      complete: true,
    }),
    manual,
  );
});
test('an old query cannot mutate a newer replay', () => {
  const started = sceneReducer(initialState, {
    type: 'start',
    query: { ...query, id: 'b' },
  });
  assert.equal(
    sceneReducer(started, {
      type: 'step',
      queryId: 'a',
      step: 1,
      node,
      complete: true,
    }),
    started,
  );
});
test('hierarchy selection follows Gaussian membership, including unassigned leaves', () => {
  const labels = new Map([
    [1, Int32Array.of(3, 4)],
    [2, Int32Array.of(12, -1)],
  ]);
  assert.equal(nodeAtLevel(labels, 0, 2), 12);
  assert.equal(nodeAtLevel(labels, 1, 2), null);
  assert.equal(nodeAtLevel(labels, -1, 1), null);
});
test('query painting uses each candidate’s own level and highest score wins overlaps', () => {
  const nodes = new Map([
    [12, node],
    [31, { id: 31, scene_level: 1 } as SceneNode],
  ]);
  const labels = new Map([
    [1, Int32Array.of(31, 31, 31, 0)],
    [2, Int32Array.of(12, 12, 0, 0)],
  ]);
  const weights = queryWeights(query, nodes, labels, 4);
  assert.ok(Math.abs(weights[0] / 255 - 0.9) < 1 / 255);
  assert.equal(weights[0], weights[1]);
  assert.equal(weights[2], 51);
  assert.equal(weights[3], 0);
});
test('2D picking returns the visible source ID, not an occluded Gaussian', () => {
  const worker: {
    onmessage?: (event: { data: unknown }) => void;
    postMessage: (value: unknown) => void;
  } = {
    postMessage: (value) => {
      result = value;
    },
  };
  let result: unknown;
  const source = stripTypeScriptTypes(
    readFileSync(
      new URL('../src/lib/scene/picking.worker.ts', import.meta.url),
      'utf8',
    ).replace(/^import[\s\S]*?;\n/, ''),
  );
  runInNewContext(source, {
    self: worker,
    Float32Array,
    Uint8Array,
    Math,
    ...art,
  });
  const buffer = new ArrayBuffer(64),
    floats = new Float32Array(buffer),
    bytes = new Uint8Array(buffer);
  // Source 0 is behind source 1; both centered on the ray, opaque XY discs.
  for (let i = 0; i < 2; i++) {
    floats[i * 8 + 2] = i === 0 ? 3 : 2;
    floats[i * 8 + 3] = floats[i * 8 + 4] = 0.2;
    bytes[i * 32 + 27] = 255;
    bytes.set([255, 128, 128, 128], i * 32 + 28);
  }
  worker.onmessage!({ data: { type: 'init', buffer } });
  worker.onmessage!({
    data: {
      type: 'pick',
      requestId: 7,
      origin: [0, 0, 0],
      direction: [0, 0, 1],
    },
  });
  assert.equal((result as { index: number }).index, 1);
  worker.onmessage!({
    data: {
      type: 'pick',
      requestId: 8,
      origin: [10, 0, 0],
      direction: [0, 0, 1],
    },
  });
  assert.equal((result as { index: number }).index, -1);
});

test('room crop rejects exterior debris and the art transform settles to original geometry', () => {
  assert.equal(art.cropWeight([0, 0, 0.2]), 1);
  assert.equal(art.cropWeight([3, 0, 0.2]), 0);
  assert.equal(art.cropWeight([0, 0, 1.8]), 0);
  assert.equal(
    art.cropWeight([-0.58, 0.35, 0.74]),
    0,
    'interior ceiling fragment',
  );
  assert.equal(
    art.cropWeight([0.35, -0.45, 0.72]),
    0,
    'second interior ceiling fragment',
  );
  assert.equal(
    art.cropWeight([-0.5, -0.4, 0.4]),
    1,
    'plant must survive the ceiling crop',
  );
  const world = art.fromRoom(0.3, -0.2, 0.4);
  const local = art.toRoom(...world);
  for (let i = 0; i < 3; i++)
    assert.ok(Math.abs(local[i] - [0.3, -0.2, 0.4][i]) < 1e-8);
  for (const progress of [0, 1]) {
    const p = art.displace(local, {
      progress,
      time: 3,
      ambient: 0,
    });
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(p[i] - local[i]) < 1e-8);
  }
});

test('material wave responds early in both directions and restores original human splats', () => {
  assert.ok(
    art.appearanceBlend([0, 0, 0.1], 0.1) > 0.2,
    'visible central response within half a second',
  );
  assert.ok(
    art.appearanceBlend([1.6, 0, 0.1], 0.9) < 0.8,
    'reverse transition reaches outer geometry promptly',
  );
  const sizes = art.splatScales(0.013, 0.009, 0, [0, 0, 0.1], 0);
  assert.ok(Math.abs(sizes[0] - 0.013) < 1e-10);
  assert.ok(Math.abs(sizes[1] - 0.009) < 1e-10);
  assert.ok(sizes[2] > 0 && sizes[2] <= 0.0003 + 1e-12);
  for (let t = 0; t <= 1; t += 0.001) {
    const scale = art.splatScales(0.013, 0.009, 0, [0, 0, 0.1], t);
    assert.ok(scale.every((s) => Number.isFinite(s) && s > 0));
  }
  const ai = art.splatScales(0.013, 0.009, 0, [0, 0, 0.1], 1);
  assert.ok(ai.every((v) => Math.abs(v - ai[0]) < 1e-9));
  assert.ok(ai[0] < 0.009);
  const outlier = art.splatScales(0.5, 0.001, 0, [0, 0, 0.1], 0);
  assert.ok(
    outlier[0] <= 0.016 + 1e-10,
    'long reconstruction splats cannot become needles',
  );
});

test('particle picking follows the disturbed center and ignores cropped geometry', () => {
  let result: { index: number } | undefined;
  const worker = {
    onmessage: undefined as undefined | ((event: { data: unknown }) => void),
    postMessage: (value: { index: number }) => {
      result = value;
    },
  };
  const source = stripTypeScriptTypes(
    readFileSync(
      new URL('../src/lib/scene/picking.worker.ts', import.meta.url),
      'utf8',
    ).replace(/^import[\s\S]*?;\n/, ''),
  );
  runInNewContext(source, {
    self: worker,
    Float32Array,
    Uint8Array,
    Math,
    ...art,
  });
  const buffer = new ArrayBuffer(64),
    floats = new Float32Array(buffer),
    bytes = new Uint8Array(buffer);
  floats.set(art.fromRoom(0, 0, 0.2), 0);
  floats.set(art.fromRoom(3, 0, 0.2), 8);
  for (let i = 0; i < 2; i++) {
    floats[i * 8 + 3] = floats[i * 8 + 4] = 0.008;
    bytes[i * 32 + 27] = 255;
  }
  worker.onmessage!({ data: { type: 'init', buffer } });
  const fluid = new FlowField();
  fluid.push(-0.2, 0, 0.1, 0, 0.05);
  for (let i = 0; i < 30; i++) fluid.step(1 / 60);
  const field = {
    progress: 0.5,
    time: 2,
    ambient: 1,
    flow: { values: fluid.values },
  };
  const p = art.displace([0, 0, 0.2], field);
  worker.onmessage!({
    data: {
      type: 'pick',
      requestId: 1,
      field,
      origin: art.fromRoom(p[0], p[1], p[2] + 2),
      direction: art.fromRoom(0, 0, -1),
    },
  });
  assert.equal(result?.index, 0);
  worker.onmessage!({
    data: {
      type: 'pick',
      requestId: 2,
      field,
      origin: art.fromRoom(3, 0, 2),
      direction: art.fromRoom(0, 0, -1),
    },
  });
  assert.equal(result?.index, -1);
});
