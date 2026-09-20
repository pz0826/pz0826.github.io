import {
  toRoom,
  fromRoom,
  cropWeight,
  displace,
  splatScales,
  focusWeight,
  artifactWeight,
} from './art-direction.ts';
// Same source-index geometry, material interpolation and displacement as rendering.
// Ray response approximates projected Gaussian coverage (without subpixel filtering).
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
    let opacity = rgba[b + 27] / 255;
    let center = [geometry[f], geometry[f + 1], geometry[f + 2]],
      scales = [geometry[f + 3], geometry[f + 4], geometry[f + 5]];
    if (data.field) {
      const local = toRoom(center[0], center[1], center[2]);
      opacity *=
        cropWeight(local) *
        artifactWeight(local, scales[0], scales[1]) *
        focusWeight(local, data.field) *
        0.98;
      if (opacity < 0.03) continue;
      center = fromRoom(...displace(local, data.field));
      scales = splatScales(
        scales[0],
        scales[1],
        scales[2],
        local,
        data.field.progress,
      );
    }
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
    const axes = [
      [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
      [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
      [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)],
    ];
    const v = center.map((c, j) => c - o[j]);
    const vc = axes.map((a) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2]);
    const dc = axes.map((a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]);
    let t: number, r2: number;
    if (scales[2] < 1e-7) {
      if (Math.abs(dc[2]) < 1e-7) continue;
      t = vc[2] / dc[2];
      r2 =
        ((t * dc[0] - vc[0]) / scales[0]) ** 2 +
        ((t * dc[1] - vc[1]) / scales[1]) ** 2;
    } else {
      const a = dc.map((v, j) => v / scales[j]),
        c = vc.map((v, j) => v / scales[j]);
      t =
        (a[0] * c[0] + a[1] * c[1] + a[2] * c[2]) /
        (a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
      r2 = a.reduce((s, v, j) => s + (t * v - c[j]) ** 2, 0);
    }
    if (t < 0.02 || t > 100 || r2 > 8) continue;
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
