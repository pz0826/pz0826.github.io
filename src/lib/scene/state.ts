import type { SceneNode, SceneQuery, SceneState } from './types.ts';
export const initialState: SceneState = {
  view: 'human',
  level: 1,
  selected: null,
  relation: 'none',
  queryId: null,
  step: -1,
  playing: false,
  complete: false,
};
export type Action =
  | { type: 'view'; view: SceneState['view'] }
  | { type: 'level'; level: number; selected: number | null }
  | { type: 'select'; id: number | null; level?: number }
  | { type: 'relation'; relation: SceneState['relation'] }
  | { type: 'start'; query: SceneQuery }
  | {
      type: 'step';
      queryId: string;
      step: number;
      node: SceneNode;
      complete: boolean;
    }
  | { type: 'stop' }
  | { type: 'reset' };
export function sceneReducer(state: SceneState, action: Action): SceneState {
  switch (action.type) {
    case 'view':
      return { ...state, view: action.view, playing: false };
    case 'level':
      return {
        ...state,
        level: Math.max(1, Math.min(5, action.level)),
        selected: action.selected,
        playing: false,
        queryId: null,
        complete: false,
      };
    case 'select':
      return {
        ...state,
        selected: action.id,
        level: action.level ?? state.level,
        playing: false,
        queryId: null,
        complete: false,
      };
    case 'relation':
      return { ...state, relation: action.relation, playing: false };
    case 'start':
      return {
        ...state,
        selected: null,
        queryId: action.query.id,
        step: -1,
        playing: true,
        complete: false,
        relation: 'none',
      };
    case 'step':
      return state.playing && state.queryId === action.queryId
        ? {
            ...state,
            selected: action.node.id,
            level: action.node.scene_level,
            step: action.step,
            complete: action.complete,
            playing: !action.complete,
          }
        : state;
    case 'stop':
      return { ...state, playing: false };
    case 'reset':
      return { ...initialState, view: state.view };
  }
}
/** Preserve the picked Gaussian across hierarchy changes. Never select a random child. */
export function nodeAtLevel(
  labels: Map<number, Int32Array>,
  index: number,
  level: number,
): number | null {
  const id = labels.get(level)?.[index];
  return id !== undefined && id > 0 ? id : null;
}
/** Ascending paint of every final candidate, matching the original viewer. */
export function queryWeights(
  query: SceneQuery,
  nodes: Map<number, SceneNode>,
  labels: Map<number, Int32Array>,
  count: number,
): Uint8Array {
  const weights = new Uint8Array(count);
  const results = [...query.cached_results].sort(
    (a, b) => a.total_score - b.total_score,
  );
  const min = results[0]?.total_score ?? 0;
  const range = (results.at(-1)?.total_score ?? 0) - min;
  for (const result of results) {
    const node = nodes.get(result.final_cluster_id);
    if (!node) continue;
    const column = labels.get(node.scene_level);
    if (!column)
      throw new Error(`Missing labels for level ${node.scene_level}`);
    const alpha = Math.round(
      255 *
        (0.2 + 0.7 * (range > 1e-8 ? (result.total_score - min) / range : 1)),
    );
    for (let i = 0; i < count; i++)
      if (column[i] === node.id) weights[i] = alpha;
  }
  return weights;
}
export function relatedNodes(
  data: {
    nodes: Map<number, SceneNode>;
    neighbors: Map<number, { node_id: number; cosine: number }[]>;
  },
  state: SceneState,
): SceneNode[] {
  const selected =
    state.selected === null ? undefined : data.nodes.get(state.selected);
  if (!selected || state.relation === 'none') return [];
  if (state.relation === 'similar')
    return (data.neighbors.get(selected.id) ?? [])
      .map((n) => data.nodes.get(n.node_id))
      .filter(
        (n): n is SceneNode => !!n && n.scene_level === selected.scene_level,
      )
      .slice(0, 3);
  return [...data.nodes.values()]
    .filter(
      (n) => n.id !== selected.id && n.scene_level === selected.scene_level,
    )
    .sort(
      (a, b) =>
        Math.hypot(...a.center.map((v, i) => v - selected.center[i])) -
        Math.hypot(...b.center.map((v, i) => v - selected.center[i])),
    )
    .slice(0, 3);
}
