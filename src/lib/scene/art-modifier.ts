import * as THREE from 'three';
import { dyno } from '@sparkjsdev/spark';
import { ART, FIELD_GLSL, ROOM_AXES } from './art-direction';
import { FLOW } from './flow-field';

export function createArtField(
  texture: THREE.DataTexture,
  flowTexture: THREE.DataTexture,
) {
  const progress = dyno.dynoFloat(0),
    time = dyno.dynoFloat(0),
    ambient = dyno.dynoFloat(1);
  const eye = dyno.dynoVec3(new THREE.Vector3()),
    right = dyno.dynoVec3(new THREE.Vector3(1, 0, 0)),
    up = dyno.dynoVec3(new THREE.Vector3(0, 1, 0)),
    forward = dyno.dynoVec3(new THREE.Vector3(0, 0, -1));
  const lens = dyno.dynoVec2(new THREE.Vector2(0.3, 2)),
    emission = dyno.dynoFloat(1.5);
  const flowTable = dyno.dynoSampler2D(flowTexture);
  const dim = dyno.dynoFloat(1),
    tint = dyno.dynoVec3(new THREE.Vector3(0.8, 0.93, 1));
  const frame = dyno.dynoMat3(
    new THREE.Matrix3().set(
      ...(ROOM_AXES.flat() as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ]),
    ),
  );
  const table = dyno.dynoSampler2D(texture);
  const min = dyno.dynoVec3(new THREE.Vector3(...ART.min)),
    max = dyno.dynoVec3(new THREE.Vector3(...ART.max)),
    feather = dyno.dynoVec3(new THREE.Vector3(...ART.feather));
  const modifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => ({
      gsplat: new dyno.Dyno({
        inTypes: {
          gsplat: dyno.Gsplat,
          table: 'sampler2D',
          progress: 'float',
          time: 'float',
          ambient: 'float',
          eye: 'vec3',
          right: 'vec3',
          up: 'vec3',
          forward: 'vec3',
          lens: 'vec2',
          emission: 'float',
          flowTable: 'sampler2D',
          frame: 'mat3',
          dim: 'float',
          tint: 'vec3',
          min: 'vec3',
          max: 'vec3',
          feather: 'vec3',
        },
        outTypes: { gsplat: dyno.Gsplat },
        inputs: {
          gsplat,
          table,
          progress,
          time,
          ambient,
          eye,
          right,
          up,
          forward,
          lens,
          emission,
          flowTable,
          frame,
          dim,
          tint,
          min,
          max,
          feather,
        },
        globals: () => [FIELD_GLSL],
        statements: ({ inputs: i, outputs: o }) => [
          `${o.gsplat}=${i.gsplat};`,
          `vec3 p=${i.frame}*${i.gsplat}.center;`,
          `vec3 edges=smoothstep(${i.min},${i.min}+${i.feather},p)*(1.0-smoothstep(${i.max}-${i.feather},${i.max},p));`,
          `float crop=edges.x*edges.y*edges.z*artInteriorCut(p);`,
          `crop*=1.-smoothstep(.02,.065,max(${i.gsplat}.scales.x,${i.gsplat}.scales.y))*smoothstep(.25,.55,p.z);`,
          `crop*=1.0-smoothstep(.38,.52,p.y)*smoothstep(.27,.4,p.z);`,
          `crop*=1.0-max(1.0-smoothstep(-1.86,-1.60,p.x),smoothstep(1.28,1.49,p.x))*smoothstep(.48,.77,p.z);`,
          `vec4 feature=texelFetch(${i.table},ivec2(${i.gsplat}.index%2048,${i.gsplat}.index/2048),0);`,
          `float blend=artBlend(p,${i.progress});`,
          `float wave=artWave(p,${i.progress});`,
          `vec3 viewDelta=p-${i.eye};`,
          `float depth=max(.05,dot(viewDelta,${i.forward}));`,
          `vec2 screen=vec2(dot(viewDelta,${i.right})/(depth*${i.lens}.x*${i.lens}.y),dot(viewDelta,${i.up})/(depth*${i.lens}.x));`,
          `vec2 grid=clamp((screen+1.)*.5*vec2(${FLOW.width - 1}.,${FLOW.height - 1}.),vec2(0.),vec2(${FLOW.width - 1}.,${FLOW.height - 1}.));`,
          `ivec2 cell=ivec2(min(floor(grid),vec2(${FLOW.width - 2}.,${FLOW.height - 2}.)));`,
          `vec2 fraction=grid-vec2(cell);`,
          `vec4 flow=mix(mix(texelFetch(${i.flowTable},cell,0),texelFetch(${i.flowTable},cell+ivec2(1,0),0),fraction.x),mix(texelFetch(${i.flowTable},cell+ivec2(0,1),0),texelFetch(${i.flowTable},cell+ivec2(1,1),0),fraction.x),fraction.y);`,
          `vec3 moved=artDisplace(p,${i.progress},${i.time},${i.ambient},flow,${i.right},${i.up},depth,${i.lens}.x,${i.lens}.y);`,
          `${o.gsplat}.center=transpose(${i.frame})*moved;`,
          `float size=clamp(min(${i.gsplat}.scales.x,${i.gsplat}.scales.y)*${ART.aiScale},${ART.minScale},${ART.maxScale});`,
          `${o.gsplat}.scales=mix(${i.gsplat}.scales,vec3(size),blend)*(1.-.25*wave);`,
          `vec3 human=${i.gsplat}.rgba.rgb;`,
          `vec3 base=mix(human,feature.rgb*.90+.04,blend);`,
          `${o.gsplat}.rgba.rgb=mix(base*(feature.a>0.0?1.0:${i.dim}),${i.tint},feature.a*.7)+${i.tint}*feature.a*${i.emission}+wave*.08;`,
          `${o.gsplat}.rgba.a*=crop*mix(artFocus(p,${i.eye},${i.forward}),1.,min(1.,feature.a*2.))* .98;`,
        ],
      }).outputs.gsplat,
    }),
  );
  return {
    modifier,
    progress,
    time,
    ambient,
    dim,
    tint,
    eye,
    right,
    up,
    forward,
    lens,
    emission,
  };
}
