import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Allocate and compile postprocessing only on selection, never on first load. */
export class SelectionGlow {
  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private bloom?: UnrealBloomPass;
  private output?: OutputPass;
  private width = 1;
  private height = 1;
  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
  ) {}
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.composer?.setSize(width, height);
  }
  render(selected: boolean) {
    if (!selected) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(this.scene, this.camera);
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        0.1,
        0.15,
        1.04,
      );
      // Spark encodes linear RGB when rendering into a target. Convert once
      // on output; a CopyShader would visibly darken the whole room.
      this.output = new OutputPass();
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.bloom);
      this.composer.addPass(this.output);
      this.composer.setSize(this.width, this.height);
    }
    this.composer.render();
  }
  dispose() {
    this.bloom?.dispose();
    this.output?.dispose();
    this.renderPass?.dispose();
    this.composer?.dispose();
  }
}
