import * as THREE from 'three';
import {
  cropWeight,
  displace,
  fromRoom,
  toRoom,
  type FieldState,
} from './art-direction';
import type { SceneData, SceneState } from './types';
import type { SceneTables } from './data';
import { relatedNodes } from './state';

import { OBJECT_ANCHORS as ANCHORS, withinAnchor } from './art-anchors';
type Point = [number, number, number];
type ScreenPoint = { x: number; y: number };
const NS = 'http://www.w3.org/2000/svg';
function hull(points: ScreenPoint[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: ScreenPoint, b: ScreenPoint, c: ScreenPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (input: ScreenPoint[]) => {
    const out: ScreenPoint[] = [];
    for (const p of input) {
      while (out.length > 1 && cross(out.at(-2)!, out.at(-1)!, p) <= 0)
        out.pop();
      out.push(p);
    }
    return out;
  };
  return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
}
export class SceneHud {
  private svg = document.createElementNS(NS, 'svg');
  private outline = document.createElementNS(NS, 'polygon');
  private links = document.createElementNS(NS, 'path');
  private items: { id: number; point: Point; button: HTMLButtonElement }[] = [];
  private samples = new Map<number, Point[]>();
  private selected: number | null = null;
  private selectedPoints: Point[] = [];
  private relationTargets: { id: number; point: Point }[] = [];
  private caption = document.createElement('span');
  private disposed = false;
  private selectionVersion = 0;
  constructor(
    private host: HTMLElement,
    private data: SceneData,
    private geometry: Float32Array,
    private tables: SceneTables,
    onSelect: (id: number, level: number) => void,
  ) {
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.classList.add('hud-traces');
    this.links.classList.add('hud-links');
    this.outline.classList.add('hud-outline');
    this.svg.append(this.links, this.outline);
    this.host.append(this.svg);
    this.caption.className = 'hud-caption';
    this.host.append(this.caption);
    for (const anchor of ANCHORS) {
      const node = data.nodes.get(anchor.id);
      if (!node) continue;
      const button = document.createElement('button');
      button.className = 'object-tag';
      button.setAttribute('aria-label', `Observe ${anchor.name}`);
      const dot = document.createElement('i'),
        label = document.createElement('span');
      label.textContent = anchor.name;
      button.append(dot, label);
      button.hidden = true;
      button.onclick = () => onSelect(node.id, node.scene_level);
      this.host.append(button);
      this.items.push({ id: node.id, point: toRoom(...node.center), button });
    }
  }
  private async points(id: number) {
    if (this.samples.has(id)) return this.samples.get(id)!;
    const node = this.data.nodes.get(id);
    if (!node) return [];
    const { labels } = await this.tables.level(node.scene_level);
    if (this.disposed) return [];
    const stride = Math.max(1, Math.floor(node.entity_count / 450));
    const points: Point[] = [];
    let hits = 0;
    for (let i = 0; i < labels.length; i++)
      if (labels[i] === id && hits++ % stride === 0) {
        const p = toRoom(
          this.geometry[i * 8],
          this.geometry[i * 8 + 1],
          this.geometry[i * 8 + 2],
        );
        if (cropWeight(p) > 0.15 && withinAnchor(id, p)) points.push(p);
      }
    // Trim isolated outliers before projecting a readable selection envelope.
    const axes = [0, 1, 2].map((i) =>
      points.map((p) => p[i]).sort((a, b) => a - b),
    );
    const result = points.filter((p) =>
      axes.every(
        (a, i) =>
          p[i] >= a[Math.floor(a.length * 0.03)] &&
          p[i] <= a[Math.floor(a.length * 0.97)],
      ),
    );
    this.samples.set(id, result);
    return result;
  }
  async initialize() {
    await Promise.all(
      this.items.map(async (item) => {
        const points = await this.points(item.id);
        if (!points.length) return;
        item.point = [0, 1, 2].map(
          (i) =>
            points.map((p) => p[i]).sort((a, b) => a - b)[
              Math.floor(points.length / 2)
            ],
        ) as Point;
        item.button.hidden = false;
      }),
    );
  }
  async select(state: SceneState) {
    const version = ++this.selectionVersion;
    this.selected = state.selected;
    const id = state.selected;
    this.selectedPoints = [];
    this.relationTargets = [];
    if (id !== null) {
      const points = await this.points(id);
      if (version !== this.selectionVersion || this.disposed) return;
      this.selectedPoints = points;
    }
    const relations = await Promise.all(
      relatedNodes(this.data, state).map(async (node) => {
        const points = await this.points(node.id);
        if (!points.length) return null;
        const point = [0, 1, 2].map(
          (i) =>
            points.map((p) => p[i]).sort((a, b) => a - b)[
              Math.floor(points.length / 2)
            ],
        ) as Point;
        return { id: node.id, point };
      }),
    );
    if (version !== this.selectionVersion || this.disposed) return;
    this.relationTargets = relations.filter(
      (item): item is { id: number; point: Point } => item !== null,
    );
    for (const item of this.items)
      item.button.setAttribute('aria-pressed', String(item.id === id));
    this.host.classList.toggle('has-selection', id !== null);
    this.caption.textContent =
      id === null || ANCHORS.some((a) => a.id === id)
        ? ''
        : 'A fragment of the room';
  }
  update(camera: THREE.Camera, field: FieldState) {
    if (this.disposed) return;
    const { width, height } = this.host.getBoundingClientRect();
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const project = (point: Point) => {
      const p = new THREE.Vector3(
        ...fromRoom(...displace(point, field)),
      ).project(camera);
      return {
        x: ((p.x + 1) * width) / 2,
        y: ((1 - p.y) * height) / 2,
        z: p.z,
      };
    };
    const positions = this.items.map((item) => {
      const p = project(item.point);
      const visible =
        p.z > -1 &&
        p.z < 1 &&
        p.x > 30 &&
        p.x < width - 100 &&
        p.y > 30 &&
        p.y < height - 80;
      item.button.style.visibility = visible ? 'visible' : 'hidden';
      item.button.style.transform = `translate(${p.x}px,${p.y}px)`;
      return { id: item.id, ...p };
    });
    const points = this.selectedPoints
      .map(project)
      .filter(
        (p) =>
          p.z > -1 &&
          p.z < 1 &&
          p.x > 0 &&
          p.x < width &&
          p.y > 0 &&
          p.y < height,
      );
    const envelope = hull(points);
    this.outline.setAttribute(
      'points',
      envelope.map((p) => `${p.x},${p.y}`).join(' '),
    );
    if (!points.length) {
      this.links.setAttribute('d', '');
      this.caption.hidden = true;
      return;
    }
    const center = {
      x: points.reduce((v, p) => v + p.x, 0) / points.length,
      y: points.reduce((v, p) => v + p.y, 0) / points.length,
    };
    const candidates = this.relationTargets.length
      ? this.relationTargets.map((item) => ({
          id: item.id,
          ...project(item.point),
        }))
      : positions;
    const targets = candidates
      .filter((p) => p.id !== this.selected && p.z > -1 && p.z < 1)
      .sort(
        (a, b) =>
          Math.hypot(a.x - center.x, a.y - center.y) -
          Math.hypot(b.x - center.x, b.y - center.y),
      )
      .slice(0, 2);
    this.links.setAttribute(
      'd',
      targets.map((p) => `M ${center.x} ${center.y} L ${p.x} ${p.y}`).join(' '),
    );
    this.caption.hidden = false;
    this.caption.style.transform = `translate(${Math.min(width - 150, Math.max(15, center.x))}px,${Math.max(22, Math.min(...points.map((p) => p.y)) - 25)}px)`;
  }
  dispose() {
    this.disposed = true;
    this.host.replaceChildren();
    this.samples.clear();
    this.items = [];
    this.selectedPoints = [];
  }
}
