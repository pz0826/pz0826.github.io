import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SparkRenderer, SplatMesh, dyno } from '@sparkjsdev/spark';
import { SceneTables } from './data';
import { initialState, nodeAtLevel, queryWeights, relatedNodes } from './state';
import type { SceneAdapter, SceneCamera, SceneData, SceneState } from './types';

interface Options {
  host: HTMLElement;
  frame: HTMLElement;
  data: SceneData;
  signal: AbortSignal;
  onSelect: (node: number | null, index: number) => void;
  onManual: () => void;
  onError: (error: unknown) => void;
}
const WIDTH = 2048;
export class SparkAdapter implements SceneAdapter {
  readonly tables: SceneTables;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.02, 100);
  private controls: OrbitControls;
  private spark: SparkRenderer;
  private mesh!: SplatMesh;
  private worker: Worker;
  private overlay: THREE.DataTexture;
  private pixels: Uint8Array;
  private state = initialState;
  private version = 0;
  private disposed = false;
  private visible = true;
  private frameId = 0;
  private redraw = true;
  private resize: ResizeObserver;
  private motion?: {
    start: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    q0: THREE.Quaternion;
    q1: THREE.Quaternion;
    f0: number;
    f1: number;
  };
  private reveal = dyno.dynoFloat(0);
  private projection = dyno.dynoMat4(new THREE.Matrix4());
  private aspect = dyno.dynoFloat(1);
  private queryDim = dyno.dynoFloat(1);
  private tint = dyno.dynoVec3(new THREE.Vector3(1, 0.24, 0.2));
  private revealTarget = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    .matches;
  private lines = new THREE.Group();
  private requestId = 0;
  private pointerDown?: { x: number; y: number };

  private constructor(private options: Options) {
    const { host, data, signal } = options;
    this.tables = new SceneTables(signal, data.manifest.count);
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x090909, 1);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive Gaussian room. Drag to orbit; select a surface to explore its hierarchy.',
    );
    this.renderer.domElement.setAttribute('role', 'img');
    host.append(this.renderer.domElement);
    this.spark = new SparkRenderer({
      renderer: this.renderer,
      enable2DGS: true,
      sortRadial: false,
      preBlurAmount: 0.3,
      blurAmount: 0,
      onDirty: () => this.invalidate(),
    });
    this.scene.add(this.spark, this.lines);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.enableZoom = false; // Wheel scrolling always belongs to the page.
    this.controls.minDistance = 0.08;
    this.controls.maxDistance = 5;
    this.controls.rotateSpeed = 0.35;
    this.controls.addEventListener('start', this.manual);
    this.controls.addEventListener('change', this.invalidate);
    this.renderer.domElement.addEventListener(
      'pointerdown',
      this.onPointerDown,
    );
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.contextLost,
    );
    this.pixels = new Uint8Array(
      WIDTH * Math.ceil(data.manifest.count / WIDTH) * 4,
    );
    this.overlay = new THREE.DataTexture(
      this.pixels,
      WIDTH,
      this.pixels.length / 4 / WIDTH,
      THREE.RGBAFormat,
    );
    this.overlay.minFilter = this.overlay.magFilter = THREE.NearestFilter;
    this.overlay.needsUpdate = true;
    this.worker = new Worker(new URL('./picking.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = ({ data: hit }) => {
      if (hit.requestId !== this.requestId || this.disposed) return;
      options.onSelect(
        nodeAtLevel(this.tables.labels, hit.index, this.state.level),
        hit.index,
      );
    };
    this.worker.onerror = (event) => options.onError(new Error(event.message));
    this.resize = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.aspect.value = this.camera.aspect;
      this.camera.updateProjectionMatrix();
      this.invalidate();
    });
    this.resize.observe(host);
    this.moveTo(data.manifest.initialCamera, false);
    document.addEventListener('visibilitychange', this.visibilityChanged);
  }

  static async create(options: Options): Promise<SparkAdapter> {
    const adapter = new SparkAdapter(options);
    try {
      const [buffer] = await Promise.all([
        adapter.tables.bytes(options.data.manifest.geometry),
        adapter.tables.level(1),
      ]);
      options.signal.throwIfAborted();
      if (buffer.byteLength !== options.data.manifest.count * 32)
        throw new Error('Geometry count mismatch');
      const workerBuffer = buffer.slice(0);
      adapter.worker.postMessage({ type: 'init', buffer: workerBuffer }, [
        workerBuffer,
      ]);
      const texture = dyno.dynoSampler2D(adapter.overlay);
      const modifier = dyno.dynoBlock(
        { gsplat: dyno.Gsplat },
        { gsplat: dyno.Gsplat },
        ({ gsplat }) => ({
          gsplat: new dyno.Dyno({
            inTypes: {
              gsplat: dyno.Gsplat,
              table: 'sampler2D',
              reveal: 'float',
              projection: 'mat4',
              aspect: 'float',
              dim: 'float',
              tint: 'vec3',
            },
            outTypes: { gsplat: dyno.Gsplat },
            inputs: {
              gsplat,
              table: texture,
              reveal: adapter.reveal,
              projection: adapter.projection,
              aspect: adapter.aspect,
              dim: adapter.queryDim,
              tint: adapter.tint,
            },
            statements: ({ inputs: i, outputs: o }) => [
              `${o.gsplat} = ${i.gsplat};`,
              `vec4 feature = texelFetch(${i.table}, ivec2(${i.gsplat}.index % ${WIDTH}, ${i.gsplat}.index / ${WIDTH}), 0);`,
              `vec4 clip = ${i.projection} * vec4(${i.gsplat}.center, 1.0);`,
              `float radius = length(clip.xy / max(0.0001, clip.w) * vec2(${i.aspect}, 1.0));`,
              `float amount = ${i.reveal} >= 0.999 ? 1.0 : (${i.reveal} <= 0.001 ? 0.0 : 1.0 - smoothstep(${i.reveal} * 3.5 - 0.12, ${i.reveal} * 3.5, radius));`,
              `vec3 base = mix(${i.gsplat}.rgba.rgb, feature.rgb, amount);`,
              `${o.gsplat}.rgba.rgb = mix(base * (feature.a > 0.0 ? 1.0 : ${i.dim}), ${i.tint}, feature.a);`,
            ],
          }).outputs.gsplat,
        }),
      );
      adapter.mesh = new SplatMesh({
        fileBytes: buffer,
        fileName: 'room.splat',
        lod: false,
        enableLod: false,
        objectModifier: modifier,
      });
      await adapter.mesh.initialized;
      options.signal.throwIfAborted();
      if (adapter.mesh.numSplats !== options.data.manifest.count)
        throw new Error('Renderer changed Gaussian count');
      adapter.scene.add(adapter.mesh);
      await adapter.apply(initialState);
      adapter.invalidate();
      return adapter;
    } catch (error) {
      adapter.dispose();
      throw error;
    }
  }

  async apply(state: SceneState) {
    const version = ++this.version;
    this.state = state;
    const query = this.options.data.queries.find(
      (query) => query.id === state.queryId,
    );
    const table = await this.tables.level(
      state.level,
      state.view === 'ai' || this.reveal.value > 0,
    );
    if (state.complete && query)
      await Promise.all(
        this.options.data.manifest.levels.map((level) =>
          this.tables.level(level),
        ),
      );
    if (version !== this.version || this.disposed) return;
    const weights =
      state.complete && query
        ? queryWeights(
            query,
            this.options.data.nodes,
            this.tables.labels,
            this.options.data.manifest.count,
          )
        : undefined;
    const selected = state.selected;
    for (let i = 0; i < this.options.data.manifest.count; i++) {
      const p = i * 4;
      if (table.pca) {
        this.pixels[p] = table.pca[i * 3];
        this.pixels[p + 1] = table.pca[i * 3 + 1];
        this.pixels[p + 2] = table.pca[i * 3 + 2];
      }
      this.pixels[p + 3] = weights
        ? weights[i]
        : selected !== null && table.labels[i] === selected
          ? 115
          : 0;
    }
    this.queryDim.value = state.complete && query ? 0.8 : 1;
    if (state.complete && query) this.tint.value.set(1, 0, 0);
    else this.tint.value.set(0.75, 0.9, 1);
    this.overlay.needsUpdate = true;
    this.mesh.needsUpdate = true;
    this.revealTarget = state.view === 'ai' ? 1 : 0;
    if (this.reducedMotion) this.reveal.value = this.revealTarget;
    this.updateRelations();
    this.invalidate();
  }

  moveTo(pose: SceneCamera, animate = true) {
    const [w, x, y, z] = pose.wxyz;
    const q = new THREE.Quaternion(x, y, z, w).multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.PI,
      ),
    );
    const position = new THREE.Vector3(...pose.position);
    const fov = THREE.MathUtils.radToDeg(pose.fov_rad);
    if (animate && !this.reducedMotion)
      this.motion = {
        start: performance.now(),
        from: this.camera.position.clone(),
        to: position,
        q0: this.camera.quaternion.clone(),
        q1: q,
        f0: this.camera.fov,
        f1: fov,
      };
    else {
      this.motion = undefined;
      this.camera.position.copy(position);
      this.camera.quaternion.copy(q);
      this.camera.fov = fov;
      this.syncControls();
    }
    this.invalidate();
  }
  private syncControls() {
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.camera.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.controls.target
      .copy(this.camera.position)
      .add(
        this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.3),
      );
  }
  cancelMotion() {
    this.motion = undefined;
    ++this.requestId;
  }
  home() {
    this.moveTo(this.options.data.manifest.initialCamera);
  }
  setInteractive(enabled: boolean) {
    this.controls.enabled = enabled;
    this.renderer.domElement.style.touchAction = enabled ? 'none' : 'pan-y';
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible) this.invalidate();
  }
  zoom(factor: number) {
    this.manual();
    this.camera.position
      .sub(this.controls.target)
      .multiplyScalar(factor)
      .add(this.controls.target);
    this.invalidate();
  }
  private manual = () => {
    this.cancelMotion();
    this.options.onManual();
  };
  private visibilityChanged = () => {
    if (!document.hidden) this.invalidate();
  };
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError(new Error('WebGL context lost'));
  };
  private onPointerDown = (event: PointerEvent) => {
    this.pointerDown = { x: event.clientX, y: event.clientY };
  };
  private onPointerUp = (event: PointerEvent) => {
    const down = this.pointerDown;
    this.pointerDown = undefined;
    if (
      !this.controls.enabled ||
      !down ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5
    )
      return;
    this.manual();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      this.camera,
    );
    this.worker.postMessage({
      type: 'pick',
      requestId: ++this.requestId,
      origin: ray.ray.origin.toArray(),
      direction: ray.ray.direction.toArray(),
    });
  };
  private clearLines() {
    for (const child of [...this.lines.children]) {
      const line = child as THREE.Line;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.lines.remove(child);
    }
  }
  private updateRelations() {
    this.clearLines();
    const node =
      this.state.selected === null
        ? undefined
        : this.options.data.nodes.get(this.state.selected);
    if (!node) return;
    for (const related of relatedNodes(this.options.data, this.state)) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...node.center),
        new THREE.Vector3(...related.center),
      ]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineDashedMaterial({
          color: 0xffffff,
          opacity: 0.65,
          transparent: true,
          dashSize: 0.018,
          gapSize: 0.012,
          depthTest: false,
        }),
      );
      line.computeLineDistances();
      line.renderOrder = 2;
      this.lines.add(line);
    }
  }
  private updateFrame() {
    const frame = this.options.frame;
    const node =
      this.state.selected === null
        ? undefined
        : this.options.data.nodes.get(this.state.selected);
    if (!node) {
      frame.hidden = true;
      return;
    }
    const points = [];
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(...node.bounds_min);
      if (i & 1) p.x = node.bounds_max[0];
      if (i & 2) p.y = node.bounds_max[1];
      if (i & 4) p.z = node.bounds_max[2];
      p.project(this.camera);
      if (p.z < -1 || p.z > 1) {
        frame.hidden = true;
        return;
      }
      points.push(p);
    }
    const x0 = Math.max(0, Math.min(...points.map((p) => (p.x + 1) / 2))),
      x1 = Math.min(1, Math.max(...points.map((p) => (p.x + 1) / 2)));
    const y0 = Math.max(0, Math.min(...points.map((p) => (1 - p.y) / 2))),
      y1 = Math.min(1, Math.max(...points.map((p) => (1 - p.y) / 2)));
    frame.hidden = x1 <= x0 || y1 <= y0;
    Object.assign(frame.style, {
      left: `${x0 * 100}%`,
      top: `${y0 * 100}%`,
      width: `${(x1 - x0) * 100}%`,
      height: `${(y1 - y0) * 100}%`,
    });
  }
  private invalidate = () => {
    this.redraw = true;
    if (!this.disposed && !this.frameId && this.visible && !document.hidden)
      this.frameId = requestAnimationFrame(this.render);
  };
  private render = (now: number) => {
    this.frameId = 0;
    if (this.disposed || !this.visible || document.hidden) return;
    const moving = !!this.motion;
    if (this.motion) {
      const m = this.motion,
        t = Math.min(1, (now - m.start) / 1200),
        ease = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(m.from, m.to, ease);
      this.camera.quaternion.slerpQuaternions(m.q0, m.q1, ease);
      this.camera.fov = THREE.MathUtils.lerp(m.f0, m.f1, ease);
      this.syncControls();
      if (t === 1) this.motion = undefined;
    }
    const revealing = Math.abs(this.reveal.value - this.revealTarget) > 0.001;
    if (revealing) {
      this.reveal.value = THREE.MathUtils.lerp(
        this.reveal.value,
        this.revealTarget,
        0.12,
      );
      if (Math.abs(this.reveal.value - this.revealTarget) < 0.001)
        this.reveal.value = this.revealTarget;
    }
    if (this.redraw || moving || revealing) {
      this.redraw = false;
      this.camera.updateMatrixWorld();
      const projection = new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      );
      const cameraChanged = !projection.equals(this.projection.value);
      this.projection.value.copy(projection);
      if (this.mesh && (cameraChanged || moving || revealing))
        this.mesh.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
      this.updateFrame();
    }
    if (moving || revealing) this.invalidate();
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.version;
    cancelAnimationFrame(this.frameId);
    this.resize.disconnect();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.renderer.domElement.removeEventListener(
      'pointerdown',
      this.onPointerDown,
    );
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.contextLost,
    );
    this.controls.dispose();
    this.worker.terminate();
    this.clearLines();
    this.mesh?.dispose();
    this.overlay.dispose();
    this.spark.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
