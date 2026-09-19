import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { withinAnchor } from './art-anchors';
import { SceneHud } from './scene-hud';
import { createArtField } from './art-modifier';
import { ART, ROOM_AXES, fromRoom, toRoom } from './art-direction';
import { SceneTables } from './data';
import { initialState, nodeAtLevel, queryWeights } from './state';
import type { SceneAdapter, SceneCamera, SceneData, SceneState } from './types';

interface Options {
  host: HTMLElement;
  hud: HTMLElement;
  onNode: (id: number, level: number) => void;
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
  private hud?: SceneHud;
  private geometry!: Float32Array;
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
  private field!: ReturnType<typeof createArtField>;
  private projection = new THREE.Matrix4();
  private lastTime = 0;
  private brushTarget = 0;
  private pointerActive = false;
  private lastPointerMove = 0;
  private homeView = true;
  private revealTarget = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    .matches;
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
      preBlurAmount: 0,
      blurAmount: 0,
      onDirty: () => this.invalidate(),
    });
    this.scene.add(this.spark);
    // OrbitControls caches its up-axis basis during construction.
    this.camera.up.set(...ROOM_AXES[2]);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.enableZoom = false; // Wheel scrolling always belongs to the page.
    this.controls.minDistance = 0.08;
    this.controls.maxDistance = 12;
    this.controls.rotateSpeed = 0.35;
    this.controls.addEventListener('start', this.manual);
    this.controls.addEventListener('change', this.invalidate);
    this.renderer.domElement.addEventListener(
      'pointerdown',
      this.onPointerDown,
    );
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener(
      'pointermove',
      this.onPointerMove,
    );
    this.renderer.domElement.addEventListener(
      'pointerleave',
      this.onPointerLeave,
    );
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
    this.field = createArtField(this.overlay);
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
      if (this.homeView) this.placeHome();
      this.camera.updateProjectionMatrix();
      this.invalidate();
    });
    this.resize.observe(host);
    this.placeHome();
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
      adapter.mesh = new SplatMesh({
        fileBytes: buffer,
        fileName: 'room.splat',
        lod: false,
        enableLod: false,
        objectModifier: adapter.field.modifier,
      });
      await adapter.mesh.initialized;
      options.signal.throwIfAborted();
      if (adapter.mesh.numSplats !== options.data.manifest.count)
        throw new Error('Renderer changed Gaussian count');
      adapter.scene.add(adapter.mesh);
      adapter.geometry = new Float32Array(buffer);
      adapter.hud = new SceneHud(
        options.hud,
        options.data,
        adapter.geometry,
        adapter.tables,
        options.onNode,
      );
      await adapter.hud.initialize();
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
      state.view === 'ai' || this.field.progress.value > 0,
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
    await this.hud?.select(state);
    if (version !== this.version || this.disposed) return;
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
        : selected !== null &&
            table.labels[i] === selected &&
            withinAnchor(
              selected,
              toRoom(
                this.geometry[i * 8],
                this.geometry[i * 8 + 1],
                this.geometry[i * 8 + 2],
              ),
            )
          ? 115
          : 0;
    }
    this.field.dim.value = state.complete && query ? 0.8 : 1;
    if (state.complete && query) this.field.tint.value.set(1, 0, 0);
    else this.field.tint.value.set(0.75, 0.9, 1);
    this.overlay.needsUpdate = true;
    this.mesh.needsUpdate = true;
    this.revealTarget = state.view === 'ai' ? 1 : 0;
    if (this.reducedMotion) this.field.progress.value = this.revealTarget;
    this.invalidate();
  }

  moveTo(pose: SceneCamera, animate = true) {
    this.homeView = false;
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
    // Recorded quaternion retains the original roll during playback;
    // subsequent manual orbit uses the room's stable vertical axis.
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
  private placeHome() {
    this.motion = undefined;
    const target = new THREE.Vector3(...fromRoom(...ART.target));
    const eye = new THREE.Vector3(...fromRoom(...ART.eye));
    const fit = Math.max(1, 1.45 / this.camera.aspect);
    this.camera.position.copy(target).add(eye.sub(target).multiplyScalar(fit));
    this.camera.up.set(...ROOM_AXES[2]);
    this.camera.fov = ART.fov;
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.controls.target.copy(target);
    this.invalidate();
  }
  home() {
    this.homeView = true;
    this.placeHome();
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
    this.homeView = false;
    this.options.onManual();
  };
  private visibilityChanged = () => {
    if (!document.hidden) this.invalidate();
  };
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError(new Error('WebGL context lost'));
  };
  private onPointerMove = (event: PointerEvent) => {
    if (
      !this.controls.enabled ||
      this.pointerDown ||
      this.reducedMotion ||
      event.pointerType === 'touch'
    )
      return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      this.camera,
    );
    const o = toRoom(...ray.ray.origin.toArray()),
      d = toRoom(...ray.ray.direction.toArray());
    const t = (0.2 - o[2]) / d[2];
    if (t > 0)
      this.field.brush.value.set(o[0] + d[0] * t, o[1] + d[1] * t, 0.2);
    this.brushTarget = 1;
    this.pointerActive = true;
    this.lastPointerMove = performance.now();
    this.invalidate();
  };
  private onPointerLeave = () => {
    this.brushTarget = 0;
    this.pointerActive = false;
    this.invalidate();
  };
  private onPointerDown = (event: PointerEvent) => {
    this.pointerDown = { x: event.clientX, y: event.clientY };
    this.brushTarget = 0;
    this.pointerActive = false;
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
      field: {
        progress: this.field.progress.value,
        time: this.field.time.value,
        brush: this.field.brush.value.toArray(),
        strength: this.field.strength.value,
      },
      requestId: ++this.requestId,
      origin: ray.ray.origin.toArray(),
      direction: ray.ray.direction.toArray(),
    });
  };
  private invalidate = () => {
    this.redraw = true;
    if (!this.disposed && !this.frameId && this.visible && !document.hidden)
      this.frameId = requestAnimationFrame(this.render);
  };
  private render = (now: number) => {
    this.frameId = 0;
    if (this.disposed || !this.visible || document.hidden) return;
    const dt = this.lastTime
      ? Math.min(0.05, (now - this.lastTime) / 1000)
      : 0.016;
    this.lastTime = now;
    if (now - this.lastPointerMove > 550) {
      this.pointerActive = false;
      this.brushTarget = 0;
    }
    const fieldActive =
      this.pointerActive ||
      Math.abs(this.field.strength.value - this.brushTarget) > 0.003;
    this.field.strength.value = THREE.MathUtils.lerp(
      this.field.strength.value,
      this.brushTarget,
      1 - Math.exp(-dt * 7),
    );
    if (!fieldActive) this.field.strength.value = this.brushTarget;
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
    const revealing =
      Math.abs(this.field.progress.value - this.revealTarget) > 0.001;
    if (revealing) {
      this.field.progress.value = THREE.MathUtils.lerp(
        this.field.progress.value,
        this.revealTarget,
        1 - Math.exp(-dt * 3.5),
      );
      if (Math.abs(this.field.progress.value - this.revealTarget) < 0.001)
        this.field.progress.value = this.revealTarget;
    }
    if (revealing || fieldActive) this.field.time.value += dt;
    if (this.redraw || moving || revealing || fieldActive) {
      this.redraw = false;
      this.camera.updateMatrixWorld();
      const projection = new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      );
      const cameraChanged = !projection.equals(this.projection);
      this.projection.copy(projection);
      if (this.mesh && (cameraChanged || moving || revealing || fieldActive))
        this.mesh.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
      this.hud?.update(this.camera, {
        progress: this.field.progress.value,
        time: this.field.time.value,
        brush: this.field.brush.value.toArray(),
        strength: this.field.strength.value,
      });
    }
    if (moving || revealing || fieldActive) this.invalidate();
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
      'pointermove',
      this.onPointerMove,
    );
    this.renderer.domElement.removeEventListener(
      'pointerleave',
      this.onPointerLeave,
    );
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.contextLost,
    );
    this.controls.dispose();
    this.worker.terminate();
    this.hud?.dispose();
    this.mesh?.dispose();
    this.overlay.dispose();
    this.spark.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
