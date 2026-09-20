import type { SceneData, SceneNode } from './types.ts';
export type RelationStyle = 'branch' | 'layer' | 'network';
export function graphAdjacent(data: SceneData, a: number, b: number) {
  const row = data.graph.index.get(a),
    col = data.graph.index.get(b);
  return (
    row !== undefined &&
    col !== undefined &&
    a !== b &&
    !!(data.graph.bits[row * data.graph.stride + (col >> 3)] & (1 << (col & 7)))
  );
}
/** Source graph edges only. Modes filter the graph; they never invent relations. */
export function relationCandidates(
  data: SceneData,
  selected: SceneNode,
  mode: RelationStyle,
) {
  return [...data.nodes.values()].filter((node) => {
    if (!graphAdjacent(data, selected.id, node.id)) return false;
    if (mode === 'layer') return node.scene_level === selected.scene_level;
    if (mode === 'branch')
      return (
        node.parent_id === selected.id ||
        (selected.parent_id > 0 && node.parent_id === selected.parent_id)
      );
    return true;
  });
}
