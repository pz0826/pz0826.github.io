// The installation's coordinate frame. Source tensors and entity IDs stay intact.
// Basis fitted to the floor/back wall; local Z is up. All distances are scene units.
export const ROOM_AXES = [
  [0.989084761, -0.147321596, 0.002771772],
  [0.145239901, 0.977934042, 0.150167844],
  [-0.024833577, -0.148126154, 0.988656632],
] as const;
export const ART = {
  min: [-1.95, -0.84, -0.25],
  max: [1.53, 0.86, 0.95],
  feather: [0.14, 0.12, 0.23],
  target: [-0.2, 0, 0.23],
  eye: [1.15, 3.8, 4.4],
  fov: 34,
  humanScale: 0.55,
  aiScale: 0.32,
  minScale: 0.00065,
  maxScale: 0.005,
} as const;
export function toRoom(
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return ROOM_AXES.map((axis) => axis[0] * x + axis[1] * y + axis[2] * z) as [
    number,
    number,
    number,
  ];
}
export function fromRoom(
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [0, 1, 2].map(
    (i) => ROOM_AXES[0][i] * x + ROOM_AXES[1][i] * y + ROOM_AXES[2][i] * z,
  ) as [number, number, number];
}
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function cropWeight(p: readonly number[]) {
  const box = p.reduce(
    (v, x, i) =>
      v *
      smooth(ART.min[i], ART.min[i] + ART.feather[i], x) *
      (1 - smooth(ART.max[i] - ART.feather[i], ART.max[i], x)),
    1,
  );
  const front = 1 - smooth(0.48, 0.79, p[1]) * smooth(0.3, 0.6, p[2]);
  const sides =
    1 -
    Math.max(1 - smooth(-1.86, -1.6, p[0]), smooth(1.28, 1.49, p[0])) *
      smooth(0.48, 0.77, p[2]);
  return box * front * sides;
}
export interface FieldState {
  progress: number;
  time: number;
  brush: readonly number[];
  strength: number;
}
/** Kept algebraically identical to the GLSL field, for picking and attached tags. */
export function displace(
  p: readonly number[],
  field: FieldState,
): [number, number, number] {
  const [x, y, z] = p,
    { progress: t, time, brush, strength } = field;
  const front = -2.3 + 4.4 * t;
  const wave = Math.exp(-14 * (x - front) ** 2) * Math.sin(Math.PI * t);
  const dx = x - brush[0],
    dy = y - brush[1];
  const falloff = Math.exp(-(dx * dx + dy * dy) / 0.14) * strength;
  return [
    x +
      wave * 0.1 * Math.sin(y * 9 + time * 1.5) -
      dy * falloff * 0.24 +
      Math.sin(y * 18 + time * 3) * falloff * 0.024,
    y +
      wave * 0.12 * Math.cos(x * 7 + time) -
      wave * y * 0.12 +
      dx * falloff * 0.24 +
      Math.cos(x * 17 - time * 2) * falloff * 0.024,
    z +
      wave * 0.08 * Math.sin(y * 8 + time * 2) +
      Math.sin((x + y) * 13 + time * 3) * falloff * 0.034,
  ];
}
export function pointScale(sx: number, sy: number, progress: number) {
  return Math.max(
    ART.minScale,
    Math.min(
      ART.maxScale,
      Math.min(sx, sy) *
        (ART.humanScale + (ART.aiScale - ART.humanScale) * progress),
    ),
  );
}
export const FIELD_GLSL = `
vec3 artDisplace(vec3 p, float progress, float time, vec3 brush, float strength) {
  float front=-2.3+4.4*progress;
  float wave=exp(-14.0*pow(p.x-front,2.0))*sin(3.14159265*progress);
  vec2 d=p.xy-brush.xy;
  float falloff=exp(-dot(d,d)/.14)*strength;
  return p+vec3(wave*.10*sin(p.y*9.0+time*1.5)-d.y*falloff*.24+sin(p.y*18.0+time*3.0)*falloff*.024,
    wave*.12*cos(p.x*7.0+time)-wave*p.y*.12+d.x*falloff*.24+cos(p.x*17.0-time*2.0)*falloff*.024,
    wave*.08*sin(p.y*8.0+time*2.0)+sin((p.x+p.y)*13.0+time*3.0)*falloff*.034);
}
`;
