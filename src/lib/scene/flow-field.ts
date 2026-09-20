// Small view-space fluid grid with depth-aware reconstruction into the room. Semi-Lagrangian transport, pressure projection,
// vorticity confinement and an advected displacement/energy field.
// CPU grid + GPU texture keeps picking and labels on the same deformed surface.
export const FLOW = {
  width: 128,
  height: 72,
  minX: -1,
  minY: -1,
  spanX: 2,
  spanY: 2,
};
export interface FlowFrame {
  eye: readonly number[];
  right: readonly number[];
  up: readonly number[];
  forward: readonly number[];
  focus?: readonly number[];
  tanFov: number;
  aspect: number;
}
export interface FlowSnapshot {
  values: Float32Array;
  frame?: FlowFrame;
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const W = FLOW.width,
  H = FLOW.height,
  N = W * H;
const hx = FLOW.spanX / (W - 1),
  hy = FLOW.spanY / (H - 1);
function sample(
  a: Float32Array,
  x: number,
  y: number,
  stride = 1,
  channel = 0,
) {
  x = clamp(x, 0, W - 1);
  y = clamp(y, 0, H - 1);
  const ix = Math.min(W - 2, Math.floor(x)),
    iy = Math.min(H - 2, Math.floor(y));
  const fx = x - ix,
    fy = y - iy,
    i = (iy * W + ix) * stride + channel;
  return (
    (a[i] * (1 - fx) + a[i + stride] * fx) * (1 - fy) +
    (a[i + W * stride] * (1 - fx) + a[i + (W + 1) * stride] * fx) * fy
  );
}
export function sampleFlow(
  flow: FlowSnapshot | undefined,
  x: number,
  y: number,
) {
  if (!flow) return [0, 0, 0, 0];
  const gx = (x - FLOW.minX) / hx,
    gy = (y - FLOW.minY) / hy;
  return [0, 1, 2, 3].map((c) => sample(flow.values, gx, gy, 4, c));
}
export class FlowField {
  readonly values = new Float32Array(N * 4);
  private u = new Float32Array(N);
  private v = new Float32Array(N);
  private nextU = new Float32Array(N);
  private nextV = new Float32Array(N);
  private nextValues = new Float32Array(N * 4);
  private curl = new Float32Array(N);
  private pressure = new Float32Array(N);
  private nextPressure = new Float32Array(N);
  private divergence = new Float32Array(N);

  private radiusX = 0.04;
  private radiusY = 0.07;
  setViewport(width: number, height: number) {
    this.radiusX = (2 * 36) / width;
    this.radiusY = (2 * 36) / height;
  }
  /** Carry the wake with the room when the camera moves. A focal-plane
   * reprojection preserves momentum and displacement instead of resetting them.
   * This is a 2.5D approximation; foreground/background share the focal plane. */
  reproject(previous: FlowFrame, next: FlowFrame, focus: readonly number[]) {
    const dot = (a: readonly number[], b: readonly number[]) =>
      a.reduce((s, v, i) => s + v * b[i], 0);
    const distance = dot(
      focus.map((v, i) => v - next.eye[i]),
      previous.forward,
    );
    this.nextValues.fill(0);
    this.nextU.fill(0);
    this.nextV.fill(0);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const nx = FLOW.minX + x * hx,
          ny = FLOW.minY + y * hy;
        const ray = next.forward.map(
          (v, i) =>
            v +
            next.tanFov * (next.right[i] * nx * next.aspect + next.up[i] * ny),
        );
        const denominator = dot(ray, previous.forward);
        if (Math.abs(denominator) < 1e-4) continue;
        const depth = distance / denominator;
        if (depth <= 0.05) continue;
        const point = next.eye.map((v, i) => v + ray[i] * depth);
        const oldDelta = point.map((v, i) => v - previous.eye[i]);
        const oldDepth = dot(oldDelta, previous.forward);
        if (oldDepth <= 0.05) continue;
        const ox =
          dot(oldDelta, previous.right) /
          (oldDepth * previous.tanFov * previous.aspect);
        const oy = dot(oldDelta, previous.up) / (oldDepth * previous.tanFov);
        if (Math.abs(ox) > 1 || Math.abs(oy) > 1) continue;
        const gx = (ox + 1) / hx,
          gy = (oy + 1) / hy,
          index = y * W + x;
        // Jacobian of the perspective projection maps vectors, not just positions.
        const transform = (u: number, v: number) => {
          const world = previous.right.map(
            (r, i) =>
              oldDepth *
              previous.tanFov *
              (r * u * previous.aspect + previous.up[i] * v),
          );
          const dz = dot(world, next.forward);
          return [
            (dot(world, next.right) / (next.tanFov * next.aspect) - nx * dz) /
              depth,
            (dot(world, next.up) / next.tanFov - ny * dz) / depth,
          ];
        };
        const velocity = transform(
          sample(this.u, gx, gy),
          sample(this.v, gx, gy),
        );
        const displacement = transform(
          sample(this.values, gx, gy, 4, 0),
          sample(this.values, gx, gy, 4, 1),
        );
        this.nextU[index] = velocity[0];
        this.nextV[index] = velocity[1];
        this.nextValues[index * 4] = displacement[0];
        this.nextValues[index * 4 + 1] = displacement[1];
        this.nextValues[index * 4 + 2] = sample(this.values, gx, gy, 4, 2);
        this.nextValues[index * 4 + 3] = sample(this.values, gx, gy, 4, 3);
      }
    }
    [this.u, this.nextU] = [this.nextU, this.u];
    [this.v, this.nextV] = [this.nextV, this.v];
    this.values.set(this.nextValues);
  }
  clear() {
    for (const a of [
      this.values,
      this.nextValues,
      this.u,
      this.v,
      this.nextU,
      this.nextV,
      this.pressure,
      this.nextPressure,
      this.curl,
      this.divergence,
    ])
      a.fill(0);
  }
  // Integrated impulse from a stroke segment. No pointer motion means no force.
  push(x0: number, y0: number, x1: number, y1: number, seconds: number) {
    const dx = x1 - x0,
      dy = y1 - y0,
      distance = Math.hypot(dx, dy);
    if (!distance || distance > 1.4 || seconds <= 0 || seconds > 0.25) return;
    const speed = Math.min(
      5,
      (Math.hypot(dx / this.radiusX, dy / this.radiusY) * 0.04) /
        Math.max(0.008, seconds),
    );
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(dx / this.radiusX, dy / this.radiusY) * 2),
    );
    const impulse = ((10 / 3) * (0.25 + speed * 0.4)) / steps;
    for (let s = 1; s <= steps; s++) {
      const x = x0 + (dx * s) / steps,
        y = y0 + (dy * s) / steps;
      for (let row = 1; row < H - 1; row++)
        for (let col = 1; col < W - 1; col++) {
          const px = FLOW.minX + col * hx - x,
            py = FLOW.minY + row * hy - y;
          const weight = Math.exp(
            -((px / this.radiusX) ** 2 + (py / this.radiusY) ** 2),
          );
          const i = row * W + col;
          this.u[i] = clamp(this.u[i] + dx * impulse * weight, -1.8, 1.8);
          this.v[i] = clamp(this.v[i] + dy * impulse * weight, -1.8, 1.8);
          this.values[i * 4 + 3] = Math.min(
            1,
            this.values[i * 4 + 3] + distance * impulse * weight * 0.75,
          );
        }
    }
  }
  step(dt: number) {
    dt = Math.min(dt, 1 / 30);
    const decay = Math.exp(-dt / (8 / 3));
    // Advect momentum by its own velocity, retaining a wake after input stops.
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x,
          bx = x - (this.u[i] * dt) / hx,
          by = y - (this.v[i] * dt) / hy;
        this.nextU[i] = sample(this.u, bx, by) * decay;
        this.nextV[i] = sample(this.v, bx, by) * decay;
      }
    [this.u, this.nextU] = [this.nextU, this.u];
    [this.v, this.nextV] = [this.nextV, this.v];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        this.curl[i] =
          (this.v[i + 1] - this.v[i - 1]) / (2 * hx) -
          (this.u[i + W] - this.u[i - W]) / (2 * hy);
      }
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx =
          (Math.abs(this.curl[i + 1]) - Math.abs(this.curl[i - 1])) / (2 * hx);
        const gy =
          (Math.abs(this.curl[i + W]) - Math.abs(this.curl[i - W])) / (2 * hy);
        const norm = Math.hypot(gx, gy) + 1e-5,
          force = this.curl[i] * 0.018 * dt;
        this.u[i] += (gy / norm) * force;
        this.v[i] -= (gx / norm) * force;
      }
    // Remove divergence so impulses spread into rolling eddies, not radial stretching.
    this.pressure.fill(0);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        this.divergence[i] =
          (this.u[i + 1] - this.u[i - 1]) / (2 * hx) +
          (this.v[i + W] - this.v[i - W]) / (2 * hy);
      }
    const ax = 1 / (hx * hx),
      ay = 1 / (hy * hy);
    for (let k = 0; k < 18; k++) {
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          this.nextPressure[i] =
            ((this.pressure[i - 1] + this.pressure[i + 1]) * ax +
              (this.pressure[i - W] + this.pressure[i + W]) * ay -
              this.divergence[i]) /
            (2 * (ax + ay));
        }
      [this.pressure, this.nextPressure] = [this.nextPressure, this.pressure];
    }
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        this.u[i] -= (this.pressure[i + 1] - this.pressure[i - 1]) / (2 * hx);
        this.v[i] -= (this.pressure[i + W] - this.pressure[i - W]) / (2 * hy);
        const bx = x - (this.u[i] * dt) / hx,
          by = y - (this.v[i] * dt) / hy;
        const spring = Math.exp(-dt / (4 / 3));
        this.nextValues[i * 4] = clamp(
          sample(this.values, bx, by, 4, 0) * spring + this.u[i] * dt * 0.7,
          -this.radiusX * 0.6,
          this.radiusX * 0.6,
        );
        this.nextValues[i * 4 + 1] = clamp(
          sample(this.values, bx, by, 4, 1) * spring + this.v[i] * dt * 0.7,
          -this.radiusY * 0.6,
          this.radiusY * 0.6,
        );
        this.nextValues[i * 4 + 2] =
          sample(this.values, bx, by, 4, 2) * spring +
          Math.tanh(this.curl[i]) * dt * 0.006;
        this.nextValues[i * 4 + 3] =
          sample(this.values, bx, by, 4, 3) * Math.exp(-dt / 4);
      }
    this.values.set(this.nextValues);
  }
}
