import type { SceneQuery, Vec3 } from './types.ts';
export type FocusBounds = { min: Vec3; max: Vec3 };
export interface DirectedStep {
  node: number;
  bounds?: FocusBounds;
  context?: number;
}
// Exhibition choreography only. Saved research chains/scores remain untouched.
// Spatial windows disambiguate repeated feature clusters in disconnected objects.
const photo: FocusBounds = {
  min: [-0.13, -0.73, 0.39],
  max: [0.14, -0.59, 0.64],
};
export const QUERY_DIRECTION: Record<string, DirectedStep[]> = {
  'room-query-02': [
    { node: 9 },
    {
      node: 74,
      bounds: { min: [0.96, -0.18, -0.01], max: [1.25, 0.23, 0.23] },
    },
    {
      node: 972,
      bounds: { min: [1.02, -0.13, -0.01], max: [1.2, 0.09, 0.18] },
      context: 2.4,
    },
  ],
  'room-query-09': [
    { node: 37 },
    { node: 22, bounds: photo },
    { node: 1879, bounds: photo, context: 3 },
  ],
  'room-query-12': [{ node: 429 }, { node: 1066, context: 3 }],
  'room-query-17': [
    { node: 43 },
    {
      node: 1398,
      bounds: { min: [-1.5, 0.07, -0.2], max: [-1.35, 0.2, -0.1] },
      context: 3,
    },
  ],
  'room-query-19': [{ node: 43 }, { node: 1406, context: 3 }],
  'room-query-24': [
    {
      node: 104,
      bounds: { min: [-0.13, 0.13, -0.2], max: [0.16, 0.37, 0.28] },
    },
    {
      node: 1765,
      bounds: { min: [0.015, 0.26, 0.215], max: [0.058, 0.3, 0.25] },
      context: 3,
    },
  ],
};
export function directedSteps(query: SceneQuery): DirectedStep[] {
  return (
    QUERY_DIRECTION[query.id] ??
    query.primary_chain.map((step) => ({ node: step.node_id }))
  );
}
export function stepBounds(queryId: string | null, step: number) {
  return queryId ? QUERY_DIRECTION[queryId]?.[step]?.bounds : undefined;
}
export function withinBounds(point: readonly number[], bounds?: FocusBounds) {
  return (
    !bounds || point.every((v, i) => v >= bounds.min[i] && v <= bounds.max[i])
  );
}
