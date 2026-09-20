import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { FlowField, sampleFlow } from '../src/lib/scene/flow-field.ts';
import {
  graphAdjacent,
  relationCandidates,
} from '../src/lib/scene/relations.ts';
import {
  QUERY_DIRECTION,
  withinBounds,
} from '../src/lib/scene/query-direction.ts';
import type { SceneData } from '../src/lib/scene/types.ts';
const root = new URL('../public/scenes/room/', import.meta.url);
const json = (name: string) =>
  JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const graph = json('graph.json');
const data = {
  nodes: new Map(
    json('nodes.json').nodes.map((n: { id: number }) => [n.id, n]),
  ),
  graph: {
    ...graph,
    index: new Map(graph.ids.map((id: number, i: number) => [id, i])),
    bits: new Uint8Array(gunzipSync(readFileSync(new URL(graph.file, root)))),
  },
} as SceneData;
test('every exhibition edge belongs to the saved graph and respects the selected scope', () => {
  for (const id of [9, 24, 43, 972, 1406])
    for (const mode of ['branch', 'layer', 'network'] as const) {
      const selected = data.nodes.get(id)!;
      const nodes = relationCandidates(data, selected, mode);
      assert.ok(nodes.length);
      for (const node of nodes) {
        assert.ok(graphAdjacent(data, id, node.id));
        assert.notEqual(id, node.id);
        if (mode === 'layer')
          assert.equal(node.scene_level, selected.scene_level);
        if (mode === 'branch')
          assert.ok(
            node.parent_id === id ||
              (selected.parent_id > 0 && node.parent_id === selected.parent_id),
          );
      }
    }
});
test('directed query stages have nonempty spatially scoped memberships, without editing source results', () => {
  const geometry = new Float32Array(
    Uint8Array.from(gunzipSync(readFileSync(new URL('room.splat.gz', root))))
      .buffer,
  );
  const axes = [
    [0.989084761, -0.147321596, 0.002771772],
    [0.145239901, 0.977934042, 0.150167844],
    [-0.024833577, -0.148126154, 0.988656632],
  ];
  const labels = new Map<number, Int32Array>();
  for (let level = 1; level <= 5; level++)
    labels.set(
      level,
      new Int32Array(
        Uint8Array.from(
          gunzipSync(
            readFileSync(new URL(`labels-level-${level}.i32.gz`, root)),
          ),
        ).buffer,
      ),
    );
  for (const query of json('queries.json').queries.filter(
    (q: { featured: boolean }) => q.featured,
  )) {
    const stages = QUERY_DIRECTION[query.id];
    assert.equal(stages.length, query.terms.length);
    for (const stage of stages) {
      const node = data.nodes.get(stage.node)!;
      assert.ok(node);
      const column = labels.get(node.scene_level)!;
      let count = 0;
      for (let i = 0; i < column.length; i++)
        if (column[i] === node.id) {
          const p = axes.map((a) =>
            a.reduce((sum, v, j) => sum + v * geometry[i * 8 + j], 0),
          );
          if (withinBounds(p, stage.bounds)) count++;
        }
      assert.ok(count > 15, `${query.id} stage ${node.id} is empty`);
    }
  }
});
test('click ring is localized, finite and relaxes without repeated input', () => {
  const f = new FlowField();
  f.setViewport(1440, 800);
  f.tap(0, 0);
  let peak = 0;
  for (let i = 0; i < 60; i++) {
    f.step(1 / 60);
    peak = Math.max(
      peak,
      ...sampleFlow({ values: f.values }, 0.035, 0).map(Math.abs),
    );
  }
  assert.ok(peak > 0.001);
  assert.ok(
    sampleFlow({ values: f.values }, 0.6, 0.6).every((x) => Math.abs(x) < 1e-5),
  );
  for (let i = 0; i < 1200; i++) f.step(1 / 60);
  assert.ok(Math.max(...f.values.map(Math.abs)) < peak * 0.02);
});
