import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Use identical linear compositing in every state. Only the halo is optional. */
export class SelectionGlow {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom?: UnrealBloomPass;
  private output = new OutputPass();
  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.output);
  }
  resize(width: number, height: number) {
    this.composer.setSize(width, height);
  }
  render(selected: boolean) {
    if (selected && !this.bloom) {
      // Ordinary RGB stays below this threshold. Bloom targets selection emission.
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        0.12,
        0.15,
        1.17,
      );
      this.composer.insertPass(this.bloom, 1);
    }
    if (this.bloom) this.bloom.enabled = selected;
    this.composer.render();
  }
  dispose() {
    this.bloom?.dispose();
    this.output.dispose();
    this.renderPass.dispose();
    this.composer.dispose();
  }
}
