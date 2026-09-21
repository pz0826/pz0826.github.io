import { polyline, fiberPacket, type StrokePoint } from './connection-stroke';
import { graphAdjacent } from './relations';
import type { SceneData } from './types';
export type ConnectionLook = 'signal' | 'arcs' | 'constellation' | 'bridges';
export interface ScreenNode {
  id: number;
  x: number;
  y: number;
  z: number;
  bridgePoints?: StrokePoint[];
}
const NS = 'http://www.w3.org/2000/svg';
const diamond = (p: { x: number; y: number }, r: number) =>
  `M${p.x} ${p.y - r}l${r} ${r}l${-r} ${r}l${-r} ${-r}Z`;
/** Small SVG pool: stable per-edge signatures and independent, occasional signal dips. */
export class ConnectionArt {
  readonly group = document.createElementNS(NS, 'g');
  private edges = Array.from({ length: 24 }, () => {
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('fill', 'none');
    line.classList.add('connection-spine');
    const packets = Array.from({ length: 16 }, () => {
      const path = document.createElementNS(NS, 'path');
      path.classList.add('connection-packet');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#f1fcff');
      path.setAttribute('stroke-width', '1.05');
      path.setAttribute('stroke-linecap', 'butt');
      return path;
    });
    this.group.append(line, ...packets);
    return { line, packets };
  });
  private markers = document.createElementNS(NS, 'path');
  readonly look: ConnectionLook;
  constructor(private data: SceneData) {
    const requested = new URLSearchParams(location.search).get('connections');
    this.look =
      requested === 'arcs' ||
      requested === 'constellation' ||
      requested === 'signal'
        ? requested
        : 'bridges';
    this.group.classList.add('hud-links');
    this.group.dataset.look = this.look;
    this.markers.setAttribute('fill', 'none');
    this.markers.setAttribute('stroke', '#d9eaed');
    this.markers.setAttribute('stroke-width', '1.15');
    this.group.append(this.markers);
  }
  clear() {
    this.group.style.display = 'none';
    this.group.dataset.edgeCount = '0';
  }
  draw(
    center: { x: number; y: number },
    targets: ScreenNode[],
    time: number,
    reduced: boolean,
    acquisition: number,
  ) {
    this.group.style.display = '';
    const links = targets.map((p) => ({
      a: center,
      b: p,
      id: p.id,
      secondary: false,
    }));
    // A few genuine lateral graph edges interrupt the visual starburst.
    if (this.look === 'constellation')
      for (let i = 0; i < targets.length; i++) {
        const a = targets[i];
        const b = targets
          .slice(i + 1)
          .find(
            (b) =>
              graphAdjacent(this.data, a.id, b.id) &&
              Math.hypot(a.x - b.x, a.y - b.y) < 180,
          );
        if (b) links.push({ a, b, id: a.id + b.id, secondary: true });
        if (links.length >= targets.length + 4) break;
      }
    this.group.dataset.edgeCount = String(links.length);
    this.group.style.opacity = String(acquisition);
    this.edges.forEach(({ line, packets }, i) => {
      const edge = links[i];
      line.style.display = edge ? '' : 'none';
      packets.forEach((p) => (p.style.display = edge ? '' : 'none'));
      if (!edge) return;
      const { a, b, id, secondary } = edge,
        dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      const bend = (id % 2 ? 1 : -1) * Math.min(66, length * 0.23);
      const samples =
        this.look === 'bridges' && b.bridgePoints
          ? b.bridgePoints
          : Array.from({ length: 65 }, (_, i) => ({
              x: a.x + (dx * i) / 64,
              y: a.y + (dy * i) / 64,
            }));
      // Same transport treatment for every comparison geometry.
      if (this.look === 'arcs')
        samples.forEach((p, i) => {
          const t = i / 64,
            k = (2 * t * (1 - t) * bend) / Math.max(length, 0.001);
          p.x -= dy * k;
          p.y += dx * k;
        });
      const d = polyline(samples);
      const blinkPhase = (time + id * 0.137) % (3.4 + (id % 7) * 0.47);
      const blink = reduced
        ? 1
        : blinkPhase < 0.065
          ? 0.55
          : blinkPhase < 0.135
            ? 0.95
            : blinkPhase < 0.18
              ? 0.7
              : 1;
      const opacity =
        (secondary ? 0.42 : Math.max(0.38, 0.88 - length / 1100)) * blink;
      line.dataset.nodeId = String(id);
      line.setAttribute('d', d);
      line.setAttribute('stroke', '#d2e1e4');
      line.setAttribute('stroke-width', '1.05');
      line.style.opacity = String(opacity);
      // Independent short glints and brighter packets converge on the selection, even at rest.
      const cycle = 5.5 + (id % 7) * 0.43;
      const elapsed = (time + id * 0.713) % cycle;
      const duration = 2.6 + (id % 3) * 0.25;
      const active = !reduced && !secondary && elapsed < duration;
      const packet = active ? fiberPacket(samples, 1 - elapsed / duration) : [];
      packets.forEach((path, j) => {
        path.style.display = active ? '' : 'none';
        if (!active) return;
        path.setAttribute('d', packet[j].d);
        path.style.opacity = String(packet[j].opacity * 0.95);
      });
    });
    this.markers.setAttribute(
      'd',
      diamond(center, 7) +
        targets
          .map((p) => diamond(p, this.look === 'constellation' ? 3.6 : 2.8))
          .join(''),
    );
    this.markers.style.opacity = '.8';
  }
}
