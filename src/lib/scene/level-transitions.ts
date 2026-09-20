import { ART } from './art-direction.ts';
/** Ordered, overlapping reveals. New choices never reset an existing front. */
export class LevelTransitions {
  base = 1;
  target?: number;
  readonly duration = 3.2;
  readonly waves: {
    level: number;
    progress: number;
    origin: readonly number[];
  }[] = [];

  choose(
    level: number,
    animate: boolean,
    origin: readonly number[] = ART.target,
  ) {
    if (level === this.target) return;
    if (this.target === undefined || !animate) {
      this.base = level;
      this.waves.length = 0;
    } else this.waves.push({ level, progress: 0, origin: [...origin] });
    this.target = level;
  }
  advance(dt: number) {
    for (const wave of this.waves)
      wave.progress = Math.min(1, wave.progress + dt / this.duration);
    // Completed prefixes no longer contribute; later fronts keep their clocks.
    while (this.waves[0]?.progress === 1) this.base = this.waves.shift()!.level;
  }
  origins() {
    return this.waves.map((wave) => wave.origin);
  }
  progresses() {
    return this.waves.map((wave) => wave.progress);
  }
}
