// Editorial landmarks, scoped spatially because coarse feature clusters can repeat
// in disconnected parts of a room. These do not change saved research query results.
export const OBJECT_ANCHORS = [
  { id: 9, name: 'Sofa', min: [0.68, -0.7, -0.2], max: [1.5, 0.72, 0.5] },
  {
    id: 37,
    name: 'Television',
    min: [-0.05, -0.82, -0.22],
    max: [0.78, -0.3, 0.7],
  },
  { id: 43, name: 'Piano', min: [-1.9, -0.45, -0.21], max: [-0.9, 0.66, 0.7] },
  {
    id: 24,
    name: 'Plant',
    min: [-0.8, -0.62, -0.22],
    max: [-0.25, -0.16, 0.7],
  },
] as const;
export function withinAnchor(id: number, point: readonly number[]) {
  const anchor = OBJECT_ANCHORS.find((anchor) => anchor.id === id);
  return (
    !anchor || point.every((v, i) => v >= anchor.min[i] && v <= anchor.max[i])
  );
}
