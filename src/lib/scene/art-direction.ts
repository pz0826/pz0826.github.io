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
  max: [1.53, 0.86, 0.86],
  feather: [0.14, 0.12, 0.13],
  target: [-0.2, 0, 0.23],
  eye: [1.15, 3.8, 4.4],
  fov: 34,
  humanScale: 1,
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
  const front = 1 - smooth(0.38, 0.52, p[1]) * smooth(0.27, 0.4, p[2]);
  const sides =
    1 -
    Math.max(1 - smooth(-1.86, -1.6, p[0]), smooth(1.28, 1.49, p[0])) *
      smooth(0.48, 0.77, p[2]);
  // Ceiling fragments occupy the otherwise empty volume above the room interior.
  const interior =
    smooth(-1.4, -1.28, p[0]) *
    (1 - smooth(1.03, 1.15, p[0])) *
    smooth(-0.61, -0.55, p[1]) *
    (1 - smooth(0.47, 0.58, p[1]));
  return box * front * sides * (1 - interior * smooth(0.56, 0.64, p[2]));
}
export function artifactWeight(p: readonly number[], sx: number, sy: number) {
  return 1 - smooth(0.02, 0.065, Math.max(sx, sy)) * smooth(0.25, 0.55, p[2]);
}
export interface FieldState {
  progress: number;
  time: number;
  ambient: number;
  flow?: FlowSnapshot;
}
export function revealFront(progress: number) {
  return -0.15 + 2.25 * (progress + 0.09 * Math.sin(2 * Math.PI * progress));
}
export function appearanceBlend(p: readonly number[], progress: number) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const radius = Math.hypot(p[0] + 0.2, p[1]);
  const a = smooth(-0.22, 0.22, -0.15 - radius),
    b = smooth(-0.22, 0.22, 2.1 - radius);
  return Math.max(
    0,
    Math.min(
      1,
      (smooth(-0.22, 0.22, revealFront(progress) - radius) - a) /
        Math.max(0.0001, b - a),
    ),
  );
}
export function revealWave(p: readonly number[], progress: number) {
  return (
    Math.exp(
      -10 * (Math.hypot(p[0] + 0.2, p[1]) - revealFront(progress)) ** 2,
    ) * Math.sin(Math.PI * progress)
  );
}
export function focusWeight(p: readonly number[], field: FieldState) {
  const radius = Math.hypot(
    (p[0] + 0.2) / 2,
    p[1] / 1.05,
    (p[2] - 0.15) / 1.05,
  );
  let weight = 1 - 0.38 * smooth(0.78, 1.25, radius);
  const frame = field.flow?.frame;
  if (frame) {
    const depth = p.reduce(
      (s, v, i) => s + (v - frame.eye[i]) * frame.forward[i],
      0,
    );
    const focus = ART.target.reduce<number>(
      (s, v, i) => s + (v - frame.eye[i]) * frame.forward[i],
      0,
    );
    weight *=
      (1 - 0.28 * smooth(0.9, 2.2, Math.abs(depth - focus))) *
      smooth(0.04, 0.28, depth);
  }
  return weight;
}
/** Same field algebra in GLSL, the picking worker and attached labels. */
export function displace(
  p: readonly number[],
  field: FieldState,
): [number, number, number] {
  const [x, y, z] = p,
    { progress, time, ambient } = field;
  let fx = x,
    fy = y,
    depth = 1;
  const frame = field.flow?.frame;
  if (frame) {
    const d = p.map((v, i) => v - frame.eye[i]);
    depth = Math.max(
      0.05,
      d.reduce((s, v, i) => s + v * frame.forward[i], 0),
    );
    fx =
      d.reduce((s, v, i) => s + v * frame.right[i], 0) /
      (depth * frame.tanFov * frame.aspect);
    fy = d.reduce((s, v, i) => s + v * frame.up[i], 0) / (depth * frame.tanFov);
  }
  const flow = sampleFlow(field.flow, fx, fy);
  const gate = 0.5 * smooth(0, 0.02, flow[3]);
  const shift = frame
    ? [0, 1, 2].map(
        (i) =>
          depth *
          frame.tanFov *
          (frame.right[i] * flow[0] * frame.aspect + frame.up[i] * flow[1]),
      )
    : [flow[0], flow[1], flow[2]];
  const flowAmplitude = frame ? depth * frame.tanFov * 0.005 : 0.009;
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
  const amplitude = 0.014 * ambient + flow[3] * flowAmplitude + wave * 0.045;
  return [
    x + shift[0] * gate + n[0] * amplitude + (x + 0.2) * wave * 0.06,
    y + shift[1] * gate + n[1] * amplitude + y * wave * 0.06,
    z + shift[2] * gate + n[2] * amplitude * 0.7,
  ];
}
export function pointScale(sx: number, sy: number, _progress = 1) {
  return Math.max(
    ART.minScale,
    Math.min(ART.maxScale, Math.min(sx, sy) * ART.aiScale),
  );
}
export function splatScales(
  sx: number,
  sy: number,
  sz: number,
  p: readonly number[],
  progress: number,
) {
  const blend = appearanceBlend(p, progress),
    small = pointScale(sx, sy),
    wave = revealWave(p, progress);
  // Stay on the covariance projection path even at the Human endpoint. A tiny
  // thickness prevents a zero/nonzero switch into Spark's oriented-quad path.
  // Guard long reconstruction outliers without inflating ordinary surfaces.
  const limit = Math.min(0.05, Math.max(0.001, Math.min(sx, sy) * 16));
  const native = [
    Math.min(sx, limit),
    Math.min(sy, limit),
    Math.max(sz, Math.min(0.0003, Math.min(sx, sy) * 0.04)),
  ];
  return native.map(
    (v) =>
      Math.exp(
        Math.log(Math.max(v, 1e-6)) * (1 - blend) + Math.log(small) * blend,
      ) *
      (1 - 0.25 * wave),
  );
}
export const FIELD_GLSL = `
float artFront(float t){return -.15+2.25*(t+.09*sin(6.2831853*t));}
float artBlend(vec3 p,float t){
  if(t<=0.)return 0.;if(t>=1.)return 1.;
  float r=length(p.xy+vec2(.2,0.));
  float a=smoothstep(-.22,.22,-.15-r),b=smoothstep(-.22,.22,2.1-r);
  return clamp((smoothstep(-.22,.22,artFront(t)-r)-a)/max(.0001,b-a),0.,1.);
}
float artWave(vec3 p,float t) {
  return exp(-10.*pow(length(p.xy+vec2(.2,0.))-artFront(t),2.))*sin(3.14159265*t);
}
float artInteriorCut(vec3 p){
  float inside=smoothstep(-1.4,-1.28,p.x)*(1.-smoothstep(1.03,1.15,p.x))*smoothstep(-.61,-.55,p.y)*(1.-smoothstep(.47,.58,p.y));
  return 1.-inside*smoothstep(.56,.64,p.z);
}
float artFocus(vec3 p,vec3 eye,vec3 forward){
  float r=length((p-vec3(-.2,0.,.15))/vec3(2.,1.05,1.05));
  float depth=dot(p-eye,forward),focus=dot(vec3(-.2,0.,.23)-eye,forward);
  return (1.-.38*smoothstep(.78,1.25,r))*(1.-.28*smoothstep(.9,2.2,abs(depth-focus)))*smoothstep(.04,.28,depth);
}
vec3 artDisplace(vec3 p,float progress,float time,float ambient,vec4 flow,vec3 right,vec3 up,float depth,float tanFov,float aspect) {
  float wave=artWave(p,progress);
  vec3 n=vec3(
    sin(p.y*1.7+p.z*1.1+time*.21+.35*sin(p.x*2.3-time*.11)),
    cos(p.x*1.5-p.z*1.3-time*.19+.4*sin(p.y*2.1+time*.13)),
    sin(p.x*2.1-p.y*1.6+time*.17+.3*cos(p.z*2.4+time*.1)));
  float amplitude=.014*ambient+flow.w*depth*tanFov*.005+wave*.045;
  vec3 shift=depth*tanFov*(right*flow.x*aspect+up*flow.y)*.5*smoothstep(0.,.02,flow.w);
  return p+shift+n*amplitude*vec3(1.,1.,.7)+vec3((p.x+.2)*wave*.06,p.y*wave*.06,0.);
}
`;
