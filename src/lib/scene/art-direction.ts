import { sampleFlow, type FlowSnapshot } from './flow-field.ts';
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
  ambient: number;
  flow?: FlowSnapshot;
}
export function revealWave(p: readonly number[], progress: number) {
  const radius = Math.hypot(p[0] + 0.2, p[1]);
  return (
    Math.exp(-6 * (radius - (-0.45 + 2.9 * progress)) ** 2) *
    Math.sin(Math.PI * progress)
  );
}
/** Same field algebra in GLSL, the picking worker and attached labels. */
export function displace(
  p: readonly number[],
  field: FieldState,
): [number, number, number] {
  const [x, y, z] = p,
    { progress, time, ambient } = field;
  const flow = sampleFlow(field.flow, x, y);
  const wave = revealWave(p, progress);
  const n = [
    Math.sin(
      y * 1.7 + z * 1.1 + time * 0.21 + 0.35 * Math.sin(x * 2.3 - time * 0.11),
    ),
    Math.cos(
      x * 1.5 - z * 1.3 - time * 0.19 + 0.4 * Math.sin(y * 2.1 + time * 0.13),
    ),
    Math.sin(
      x * 2.1 - y * 1.6 + time * 0.17 + 0.3 * Math.cos(z * 2.4 + time * 0.1),
    ),
  ];
  const amplitude = 0.006 * ambient + flow[3] * 0.055 + wave * 0.045;
  return [
    x + flow[0] + n[0] * amplitude + (x + 0.2) * wave * 0.06,
    y + flow[1] + n[1] * amplitude + y * wave * 0.06,
    z + flow[2] + n[2] * amplitude * 0.7,
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
float artWave(vec3 p,float progress) {
  float radius=length(p.xy+vec2(.2,0.));
  return exp(-6.*pow(radius-(-.45+2.9*progress),2.))*sin(3.14159265*progress);
}
vec3 artDisplace(vec3 p,float progress,float time,float ambient,vec4 flow) {
  float wave=artWave(p,progress);
  vec3 n=vec3(
    sin(p.y*1.7+p.z*1.1+time*.21+.35*sin(p.x*2.3-time*.11)),
    cos(p.x*1.5-p.z*1.3-time*.19+.4*sin(p.y*2.1+time*.13)),
    sin(p.x*2.1-p.y*1.6+time*.17+.3*cos(p.z*2.4+time*.1)));
  float amplitude=.006*ambient+flow.w*.055+wave*.045;
  return p+flow.xyz+n*amplitude*vec3(1.,1.,.7)+vec3((p.x+.2)*wave*.06,p.y*wave*.06,0.);
}
`;
