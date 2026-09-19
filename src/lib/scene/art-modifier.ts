import * as THREE from 'three';
import { dyno } from '@sparkjsdev/spark';
import { ART, FIELD_GLSL, ROOM_AXES } from './art-direction';

export function createArtField(texture: THREE.DataTexture) {
  const progress = dyno.dynoFloat(0),
    time = dyno.dynoFloat(0),
    strength = dyno.dynoFloat(0);
  const brush = dyno.dynoVec3(new THREE.Vector3(0, 0, 0)),
    dim = dyno.dynoFloat(1),
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
          strength: 'float',
          brush: 'vec3',
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
          strength,
          brush,
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
          `float crop=edges.x*edges.y*edges.z;`,
          `crop*=1.0-smoothstep(.48,.79,p.y)*smoothstep(.30,.60,p.z);`,
          `crop*=1.0-max(1.0-smoothstep(-1.86,-1.60,p.x),smoothstep(1.28,1.49,p.x))*smoothstep(.48,.77,p.z);`,
          `vec4 feature=texelFetch(${i.table},ivec2(${i.gsplat}.index%2048,${i.gsplat}.index/2048),0);`,
          `float front=-2.3+4.4*${i.progress};`,
          `float blend=${i.progress}<.001?0.0:(${i.progress}>.999?1.0:1.0-smoothstep(front-.26,front+.26,p.x));`,
          `float wave=exp(-14.0*pow(p.x-front,2.0))*sin(3.14159265*${i.progress});`,
          `vec3 moved=artDisplace(p,${i.progress},${i.time},${i.brush},${i.strength});`,
          `${o.gsplat}.center=transpose(${i.frame})*moved;`,
          `float size=clamp(min(${i.gsplat}.scales.x,${i.gsplat}.scales.y)*mix(${ART.humanScale},${ART.aiScale},${i.progress}),${ART.minScale},${ART.maxScale});`,
          `${o.gsplat}.scales=vec3(size*(1.0-.45*wave));`,
          `vec3 human=mix(${i.gsplat}.rgba.rgb,vec3(dot(${i.gsplat}.rgba.rgb,vec3(.2126,.7152,.0722))),.18)*1.02+.045;`,
          `vec3 base=mix(human,feature.rgb*.90+.04,blend);`,
          `${o.gsplat}.rgba.rgb=mix(base*(feature.a>0.0?1.0:${i.dim}),${i.tint},feature.a)+wave*.12;`,
          `${o.gsplat}.rgba.a*=crop*.94;`,
        ],
      }).outputs.gsplat,
    }),
  );
  return { modifier, progress, time, strength, brush, dim, tint };
}
