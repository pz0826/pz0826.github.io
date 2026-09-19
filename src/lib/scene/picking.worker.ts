// Exact source index from ray/2D Gaussian intersections. Work stays off the UI thread.
// Choose the strongest front-to-back alpha contribution, not a cluster bounding box.
let geometry: Float32Array;
let rgba: Uint8Array;
self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    geometry = new Float32Array(data.buffer);
    rgba = new Uint8Array(data.buffer);
    return;
  }
  if (!geometry) return;
  const { origin: o, direction: d, requestId } = data;
  const hits: { index: number; t: number; alpha: number }[] = [];
  for (let i = 0; i < geometry.length / 8; i++) {
    const b = i * 32,
      f = i * 8;
    const opacity = rgba[b + 27] / 255;
    if (opacity < 0.03) continue;
    let w = (rgba[b + 28] - 128) / 128,
      x = (rgba[b + 29] - 128) / 128,
      y = (rgba[b + 30] - 128) / 128,
      z = (rgba[b + 31] - 128) / 128;
    const inv = 1 / Math.hypot(w, x, y, z);
    w *= inv;
    x *= inv;
    y *= inv;
    z *= inv;
    const nx = 2 * (x * z + w * y),
      ny = 2 * (y * z - w * x),
      nz = 1 - 2 * (x * x + y * y);
    const dot = nx * d[0] + ny * d[1] + nz * d[2];
    if (Math.abs(dot) < 1e-7) continue;
    const cx = geometry[f] - o[0],
      cy = geometry[f + 1] - o[1],
      cz = geometry[f + 2] - o[2];
    const t = (nx * cx + ny * cy + nz * cz) / dot;
    if (t < 0.02 || t > 100) continue;
    const px = t * d[0] - cx,
      py = t * d[1] - cy,
      pz = t * d[2] - cz;
    const u =
      ((1 - 2 * (y * y + z * z)) * px +
        2 * (x * y + w * z) * py +
        2 * (x * z - w * y) * pz) /
      geometry[f + 3];
    const v =
      (2 * (x * y - w * z) * px +
        (1 - 2 * (x * x + z * z)) * py +
        2 * (y * z + w * x) * pz) /
      geometry[f + 4];
    const r2 = u * u + v * v;
    if (r2 > 8) continue;
    const alpha = Math.min(0.99, opacity * Math.exp(-0.5 * r2));
    if (alpha > 0.01) hits.push({ index: i, t, alpha });
  }
  hits.sort((a, b) => a.t - b.t);
  let transmittance = 1,
    best = 0.015,
    index = -1;
  for (const hit of hits) {
    const contribution = transmittance * hit.alpha;
    if (contribution > best) {
      best = contribution;
      index = hit.index;
    }
    transmittance *= 1 - hit.alpha;
    if (transmittance < 0.01) break;
  }
  self.postMessage({ requestId, index });
};
