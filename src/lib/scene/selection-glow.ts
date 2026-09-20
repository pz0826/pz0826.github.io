import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

/** Only HDR selection emission crosses the bloom threshold; the room stays quiet. */
export class SelectionGlow {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.2, 1.1);
  // Spark already writes display-space RGB; OutputPass would apply gamma twice.
  private output = new ShaderPass(CopyShader);
  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
  }
  resize(width: number, height: number) {
    this.composer.setSize(width, height);
  }
  render(selected: boolean) {
    this.bloom.enabled = selected;
    this.composer.render();
  }
  dispose() {
    this.bloom.dispose();
    this.output.dispose();
    this.renderPass.dispose();
    this.composer.dispose();
  }
}
