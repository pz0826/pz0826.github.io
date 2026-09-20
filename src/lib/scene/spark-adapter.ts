import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { stepBounds, withinBounds, type FocusBounds } from './query-direction';
import { withinAnchor } from './art-anchors';
import { SceneHud } from './scene-hud';
import { createArtField } from './art-modifier';
import { ART, ROOM_AXES, fromRoom, toRoom } from './art-direction';
import { FLOW, FlowField, type FlowFrame } from './flow-field';
import { SelectionGlow } from './selection-glow';
import { LevelTransitions } from './level-transitions';
import { SceneTables } from './data';
import { initialState, nodeAtLevel } from './state';
import type {
  SceneAdapter,
  SceneCamera,
  SceneData,
  SceneState,
  SceneQuery,
} from './types';

interface Options {
  host: HTMLElement;
  hud: HTMLElement;
  onQuery: (query: SceneQuery) => void;
  data: SceneData;
  tables: SceneTables;
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
  private levelPixels: Uint8Array<ArrayBuffer>;
  private levelTexture: THREE.DataArrayTexture;
  private loadedLevels = new Set<number>();
  private levels = new LevelTransitions();
  private wavePixels = new Float32Array(16 * 4);
  private wavesTexture: THREE.DataTexture;
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
    target0?: THREE.Vector3;
    target1?: THREE.Vector3;
  };
  private field!: ReturnType<typeof createArtField>;
  private projection = new THREE.Matrix4();
  private lastTime = 0;
  private flow = new FlowField();
  private flowFrame?: FlowFrame;
  private glow: SelectionGlow;
  private flowTexture: THREE.DataTexture;
  private flowAccumulator = 0;
  private stroke?: { x: number; y: number; time: number };
  private homeView = true;
  private revealTarget = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    .matches;
  private requestId = 0;
  private selectionStarted = 0;
  private paintedSelection: number | null = null;
  private pointerDown?: { x: number; y: number };

  private constructor(private options: Options) {
    const { host, data } = options;
    this.tables = options.tables;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x090909, 1);
    // Background clearing must use the active render target's color space.
    // RenderPass clears before scene rendering, so a cached screen-space clear
    // color would otherwise become gray after OutputPass.
    this.scene.background = new THREE.Color(0x090909);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive Gaussian room. Drag to orbit; select a surface to explore its hierarchy.',
    );
    this.renderer.domElement.setAttribute('role', 'img');
    host.append(this.renderer.domElement);
    this.spark = new SparkRenderer({
      renderer: this.renderer,
      enable2DGS: false,
      accumExtSplats: true,
      sortRadial: false,
      preBlurAmount: 0.15,
      blurAmount: 0,
      onDirty: () => this.invalidate(),
    });
    this.scene.add(this.spark);
    this.glow = new SelectionGlow(this.renderer, this.scene, this.camera);
    // OrbitControls caches its up-axis basis during construction.
    this.camera.up.set(...ROOM_AXES[2]);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 0.6;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 12;
    this.controls.rotateSpeed = 0.35;
    this.controls.addEventListener('start', this.manual);
    this.controls.addEventListener('change', this.onCameraChange);
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
      'pointercancel',
      this.onPointerCancel,
    );
    options.hud.addEventListener('wheel', this.onHudWheel, { passive: false });
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
    this.levelPixels = new Uint8Array(this.pixels.length * 5);
    this.levelTexture = new THREE.DataArrayTexture(
      this.levelPixels,
      WIDTH,
      this.pixels.length / 4 / WIDTH,
      5,
    );
    this.levelTexture.minFilter = this.levelTexture.magFilter =
      THREE.NearestFilter;
    this.levelTexture.needsUpdate = true;
    this.wavesTexture = new THREE.DataTexture(
      this.wavePixels,
      16,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.wavesTexture.minFilter = this.wavesTexture.magFilter =
      THREE.NearestFilter;
    this.wavesTexture.needsUpdate = true;
    this.flowTexture = new THREE.DataTexture(
      this.flow.values,
      FLOW.width,
      FLOW.height,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.flowTexture.minFilter = this.flowTexture.magFilter =
      THREE.NearestFilter;
    this.flowTexture.needsUpdate = true;
    this.field = createArtField(
      this.overlay,
      this.flowTexture,
      this.levelTexture,
      this.wavesTexture,
    );
    this.field.ambient.value = this.reducedMotion ? 0 : 1;
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
      this.glow.resize(width, height);
      this.flow.setViewport(width, height);
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
        options.onQuery,
        adapter.invalidate,
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
    const previousOrigin = this.hud?.selectionCenter();
    this.state = state;
    const table = await this.tables.level(
      state.level,
      state.view === 'ai' || this.field.progress.value > 0,
    );
    if (version !== this.version || this.disposed) return;
    await this.hud?.select(state);
    if (version !== this.version || this.disposed) return;
    const waveOrigin =
      state.selected === null
        ? ART.target
        : (this.hud?.selectionCenter() ?? previousOrigin ?? ART.target);
    const selected = state.selected;
    const bounds = stepBounds(state.queryId, state.step);
    if (table.pca) {
      if (!this.loadedLevels.has(state.level)) {
        const offset = (state.level - 1) * this.pixels.length;
        for (let i = 0; i < this.options.data.manifest.count; i++) {
          this.levelPixels[offset + i * 4] = table.pca[i * 3];
          this.levelPixels[offset + i * 4 + 1] = table.pca[i * 3 + 1];
          this.levelPixels[offset + i * 4 + 2] = table.pca[i * 3 + 2];
        }
        this.loadedLevels.add(state.level);
        this.levelTexture.addLayerUpdate(state.level - 1);
        this.levelTexture.needsUpdate = true;
      }
      this.levels.choose(
        state.level,
        state.view === 'ai' && !this.reducedMotion,
        waveOrigin,
      );
      this.syncLevelWaves();
    }
    for (let i = 0; i < this.options.data.manifest.count; i++) {
      const p = i * 4;
      this.pixels[p + 3] =
        selected !== null &&
        table.labels[i] === selected &&
        withinBounds(
          toRoom(
            this.geometry[i * 8],
            this.geometry[i * 8 + 1],
            this.geometry[i * 8 + 2],
          ),
          bounds,
        ) &&
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
    if (selected !== this.paintedSelection) {
      this.paintedSelection = selected;
      this.selectionStarted = performance.now();
      this.field.selectionGain.value =
        this.reducedMotion || selected === null ? 1 : 0;
    }
    this.field.dim.value = 1;
    this.field.tint.value.set(0.75, 0.9, 1);
    this.overlay.needsUpdate = true;
    this.mesh.needsUpdate = true;
    const target = state.view === 'ai' ? 1 : 0;
    if (
      target !== this.revealTarget &&
      (this.field.progress.value === 0 || this.field.progress.value === 1)
    ) {
      this.field.origin.value.set(waveOrigin[0], waveOrigin[1]);
      this.field.reverse.value = target === 0 ? 1 : 0;
    }
    this.revealTarget = target;
    if (this.reducedMotion) this.field.progress.value = this.revealTarget;
    this.invalidate();
  }

  private syncLevelWaves() {
    const count = this.levels.waves.length;
    if (count * 4 > this.wavePixels.length) {
      this.wavePixels = new Float32Array(4 * 2 ** Math.ceil(Math.log2(count)));
      this.wavesTexture.dispose();
      this.wavesTexture.image = {
        data: this.wavePixels,
        width: this.wavePixels.length / 4,
        height: 1,
      };
    }
    this.levels.waves.forEach((wave, i) => {
      this.wavePixels[i * 4] = wave.level - 1;
      this.wavePixels[i * 4 + 1] = wave.progress;
      this.wavePixels[i * 4 + 2] = wave.origin[0];
      this.wavePixels[i * 4 + 3] = wave.origin[1];
    });
    this.wavesTexture.needsUpdate = true;
    this.field.levelCount.value = count;
    this.field.baseLevel.value = this.levels.base - 1;
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
  async frameNode(
    id: number,
    pose: SceneCamera,
    context = 1.6,
    bounds?: FocusBounds,
  ) {
    const epoch = this.requestId;
    const points = await this.hud?.points(id, bounds);
    if (!points?.length || this.disposed || epoch !== this.requestId) return;
    const box = new THREE.Box3().setFromPoints(
      points.map((p) => new THREE.Vector3(...fromRoom(...p))),
    );
    const target = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const [w, x, y, z] = pose.wxyz;
    const recorded = new THREE.Quaternion(x, y, z, w).multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.PI,
      ),
    );
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(recorded);
    const fov = 46;
    const halfFov = Math.atan(
      Math.tan(THREE.MathUtils.degToRad(fov / 2)) *
        Math.min(1, this.camera.aspect),
    );
    const distance = Math.max(0.38, (radius * context) / Math.sin(halfFov));
    const position = target.clone().addScaledVector(direction, distance);
    const facing = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(position, target, this.camera.up),
    );
    this.homeView = false;
    if (this.reducedMotion) {
      this.motion = undefined;
      this.camera.position.copy(position);
      this.camera.quaternion.copy(facing);
      this.camera.fov = fov;
      this.controls.target.copy(target);
      this.camera.updateProjectionMatrix();
    } else {
      this.motion = {
        start: performance.now(),
        from: this.camera.position.clone(),
        to: position,
        q0: this.camera.quaternion.clone(),
        q1: facing,
        f0: this.camera.fov,
        f1: fov,
        target0: this.controls.target.clone(),
        target1: target,
      };
    }
    this.invalidate();
  }
  private ripple(clientX: number, clientY: number) {
    if (this.reducedMotion) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.flow.tap(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
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
    this.stroke = undefined;
    this.renderer.domElement.style.touchAction = enabled ? 'none' : 'pan-y';
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    this.lastTime = 0;
    this.stroke = undefined;
    if (visible) this.invalidate();
  }
  zoom(factor: number) {
    this.manual();
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(
      THREE.MathUtils.clamp(
        offset.length() * factor,
        this.controls.minDistance,
        this.controls.maxDistance,
      ),
    );
    this.camera.position.copy(this.controls.target).add(offset);
    this.invalidate();
  }
  private onHudWheel = (event: WheelEvent) => {
    if (!this.controls.enabled) return;
    event.preventDefault();
    this.renderer.domElement.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  };
  private onCameraChange = () => {
    this.stroke = undefined;
    this.invalidate();
  };
  private updateFieldFrame() {
    const m = this.camera.matrixWorld.elements;
    const previous = this.flowFrame;
    this.flowFrame = {
      eye: toRoom(...this.camera.position.toArray()),
      right: toRoom(m[0], m[1], m[2]),
      up: toRoom(m[4], m[5], m[6]),
      forward: toRoom(-m[8], -m[9], -m[10]),
      tanFov: Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5),
      aspect: this.camera.aspect,
      focus: toRoom(...this.controls.target.toArray()),
    };
    const f = this.flowFrame;
    if (
      previous &&
      (previous.eye.some((v, i) => Math.abs(v - f.eye[i]) > 1e-8) ||
        previous.forward.some((v, i) => Math.abs(v - f.forward[i]) > 1e-8) ||
        previous.up.some((v, i) => Math.abs(v - f.up[i]) > 1e-8) ||
        previous.tanFov !== f.tanFov ||
        previous.aspect !== f.aspect)
    ) {
      this.flow.reproject(previous, f, f.focus!);
      this.flowTexture.needsUpdate = true;
    }
    this.field.focus.value.set(...(f.focus as [number, number, number]));
    this.field.eye.value.set(...(f.eye as [number, number, number]));
    this.field.right.value.set(...(f.right as [number, number, number]));
    this.field.up.value.set(...(f.up as [number, number, number]));
    this.field.forward.value.set(...(f.forward as [number, number, number]));
    this.field.lens.value.set(f.tanFov, f.aspect);
  }
  private manual = () => {
    this.stroke = undefined;
    this.cancelMotion();
    this.homeView = false;
    this.options.onManual();
  };
  private visibilityChanged = () => {
    this.lastTime = 0;
    this.stroke = undefined;
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
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y = 1 - ((event.clientY - rect.top) / rect.height) * 2,
      time = performance.now();
    if (this.stroke)
      this.flow.push(
        this.stroke.x,
        this.stroke.y,
        x,
        y,
        (time - this.stroke.time) / 1000,
      );
    this.stroke = { x, y, time };
    this.invalidate();
  };
  private onPointerLeave = () => {
    this.stroke = undefined;
  };
  private onPointerCancel = () => {
    this.stroke = undefined;
    this.pointerDown = undefined;
  };
  private onPointerDown = (event: PointerEvent) => {
    this.pointerDown = { x: event.clientX, y: event.clientY };
    this.stroke = undefined;
  };
  private onPointerUp = (event: PointerEvent) => {
    const down = this.pointerDown;
    this.pointerDown = undefined;
    if (
      !this.controls.enabled ||
      event.button !== 0 ||
      !down ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5
    )
      return;
    this.manual();
    this.ripple(event.clientX, event.clientY);
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
        levelWaves: this.levels.progresses(),
        origin: this.field.origin.value.toArray(),
        levelOrigins: this.levels.origins(),
        reverse: this.field.reverse.value > 0.5,
        time: this.field.time.value,
        ambient: this.field.ambient.value,
        flow: { values: this.flow.values, frame: this.flowFrame },
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
    // Gentle idle flow at 30 fps; direct camera/pointer input can render sooner.
    const directInput =
      this.pointerDown || (this.stroke && now - this.stroke.time < 100);
    if (
      !this.reducedMotion &&
      !directInput &&
      !this.motion &&
      now - this.lastTime < 32
    ) {
      this.frameId = requestAnimationFrame(this.render);
      return;
    }
    const dt = this.lastTime
      ? Math.min(0.05, (now - this.lastTime) / 1000)
      : 1 / 60;
    this.lastTime = now;
    const fieldActive = !this.reducedMotion;
    if (fieldActive) {
      this.flowAccumulator += dt;
      while (this.flowAccumulator >= 1 / 60) {
        this.flow.step(1 / 60);
        this.flowAccumulator -= 1 / 60;
      }
      this.flowTexture.needsUpdate = true;
    }
    if (this.field.selectionGain.value < 1) {
      const t = Math.min(1, (now - this.selectionStarted) / 300);
      this.field.selectionGain.value = t * t * (3 - 2 * t);
    }
    const moving = !!this.motion;
    if (this.motion) {
      const m = this.motion,
        t = Math.min(1, (now - m.start) / 1200),
        ease = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(m.from, m.to, ease);
      this.camera.quaternion.slerpQuaternions(m.q0, m.q1, ease);
      this.camera.fov = THREE.MathUtils.lerp(m.f0, m.f1, ease);
      this.syncControls();
      if (m.target0 && m.target1)
        this.controls.target.lerpVectors(m.target0, m.target1, ease);
      if (t === 1) this.motion = undefined;
    }
    const revealing =
      Math.abs(this.field.progress.value - this.revealTarget) > 0.001;
    if (revealing) {
      const delta = this.revealTarget - this.field.progress.value;
      this.field.progress.value +=
        Math.sign(delta) * Math.min(Math.abs(delta), dt / 4.6);
      if (Math.abs(this.field.progress.value - this.revealTarget) < 0.001)
        this.field.progress.value = this.revealTarget;
    }
    const changingLevel = this.levels.waves.length > 0;
    if (changingLevel) {
      this.levels.advance(dt);
      this.syncLevelWaves();
    }
    if (revealing || changingLevel || fieldActive) this.field.time.value += dt;
    if (this.redraw || moving || revealing || changingLevel || fieldActive) {
      this.redraw = false;
      this.camera.updateMatrixWorld();
      this.updateFieldFrame();
      const projection = new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      );
      const cameraChanged = !projection.equals(this.projection);
      this.projection.copy(projection);
      if (
        this.mesh &&
        (cameraChanged || moving || revealing || changingLevel || fieldActive)
      )
        this.mesh.needsUpdate = true;
      this.glow.render(this.state.selected !== null);
      this.hud?.update(this.camera, {
        progress: this.field.progress.value,
        levelWaves: this.levels.progresses(),
        origin: this.field.origin.value.toArray(),
        levelOrigins: this.levels.origins(),
        reverse: this.field.reverse.value > 0.5,
        time: this.field.time.value,
        ambient: this.field.ambient.value,
        flow: { values: this.flow.values, frame: this.flowFrame },
      });
    }
    // Spark may have scheduled a sorting redraw while render() was running.
    if ((moving || revealing || changingLevel || fieldActive) && !this.frameId)
      this.frameId = requestAnimationFrame(this.render);
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
    this.renderer.domElement.removeEventListener(
      'pointercancel',
      this.onPointerCancel,
    );
    this.options.hud.removeEventListener('wheel', this.onHudWheel);
    this.controls.dispose();
    this.worker.terminate();
    this.hud?.dispose();
    this.mesh?.dispose();
    this.overlay.dispose();
    this.levelTexture.dispose();
    this.wavesTexture.dispose();
    this.flowTexture.dispose();
    this.glow.dispose();
    this.spark.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
