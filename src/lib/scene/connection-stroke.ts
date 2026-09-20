export interface StrokePoint {
  x: number;
  y: number;
}
export function polyline(points: readonly StrokePoint[]) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('');
}
/** A tapered packet travels by arc length, not by distance along the screen chord. */
export function fiberPacket(points: readonly StrokePoint[], phase: number) {
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
        ),
    );
  const total = distances.at(-1)!;
  const at = (u: number) => {
    const distance = Math.max(0, Math.min(1, u)) * total;
    let i = 1;
    while (i < distances.length - 1 && distances[i] < distance) i++;
    const t =
      (distance - distances[i - 1]) /
      Math.max(0.0001, distances[i] - distances[i - 1]);
    return {
      x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
      y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
    };
  };
  const center = phase * 1.4 - 0.2;
  return Array.from({ length: 16 }, (_, i) => {
    const start = center - 0.12 + (i * 0.24) / 16,
      end = start + 0.24 / 16;
    if (end < 0 || start > 1) return { d: '', opacity: 0 };
    const lo = Math.max(0, start),
      hi = Math.min(1, end);
    const segment = [
      at(lo),
      ...points.filter(
        (_, j) => distances[j] > lo * total && distances[j] < hi * total,
      ),
      at(hi),
    ];
    return {
      d: polyline(segment),
      opacity: Math.sin((Math.PI * (i + 0.5)) / 16) ** 2,
    };
  });
}
