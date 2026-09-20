import { ConnectionArt } from './connection-art';
import * as THREE from 'three';
import {
  cropWeight,
  displace,
  fromRoom,
  toRoom,
  type FieldState,
} from './art-direction';
import type { SceneData, SceneState, SceneQuery } from './types';
import type { SceneTables } from './data';
import {
  directedSteps,
  stepBounds,
  withinBounds,
  type FocusBounds,
} from './query-direction';
import { relationCandidates, type RelationStyle } from './relations';

import { withinAnchor } from './art-anchors';
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
  private leaders = document.createElementNS(NS, 'path');
  private connections: ConnectionArt;
  private trace = document.createElement('div');
  private state?: SceneState;
  private items: {
    id: number;
    query: SceneQuery;
    point: Point;
    button: HTMLButtonElement;
    offset: number;
  }[] = [];
  private samples = new Map<string, Point[]>();
  private selected: number | null = null;
  private selectedPoints: Point[] = [];
  private relationTargets: { id: number; point: Point }[] = [];
  private caption = document.createElement('div');
  private relationStyle: RelationStyle = 'branch';
  private relationStarted = 0;
  private motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  private get reducedMotion() {
    return this.motionPreference.matches;
  }
  private disposed = false;
  private selectionVersion = 0;
  constructor(
    private host: HTMLElement,
    private data: SceneData,
    private geometry: Float32Array,
    private tables: SceneTables,
    onQuery: (query: SceneQuery) => void,
    private invalidate: () => void,
  ) {
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.classList.add('hud-traces');
    this.connections = new ConnectionArt(data);
    this.outline.classList.add('hud-outline');
    this.leaders.setAttribute('fill', 'none');
    this.leaders.setAttribute('stroke', '#bacacd');
    this.leaders.setAttribute('stroke-width', '.6');
    this.leaders.setAttribute('opacity', '.24');
    this.svg.append(this.leaders, this.connections.group, this.outline);
    this.host.append(this.svg);
    this.caption.className = 'hud-caption';
    this.host.append(this.caption);
    this.trace.className = 'query-trace';
    this.trace.setAttribute('aria-hidden', 'true');
    this.trace.hidden = true;
    this.host.append(this.trace);
    this.caption.setAttribute('role', 'group');
    this.caption.setAttribute('aria-label', 'Connection pattern');
    for (const mode of ['branch', 'layer', 'network'] as const) {
      const button = document.createElement('button');
      button.textContent =
        mode === 'layer' ? 'Layer' : mode === 'network' ? 'Network' : 'Branch';
      button.setAttribute('aria-pressed', String(mode === this.relationStyle));
      button.onclick = () => {
        this.relationStyle = mode;
        for (const child of this.caption.children)
          child.setAttribute('aria-pressed', String(child === button));
        this.updateRelations();
        this.invalidate();
      };
      this.caption.append(button);
    }
    for (const query of data.queries.filter((q) => q.featured)) {
      const node = data.nodes.get(directedSteps(query)[0].node);
      if (!node) continue;
      const button = document.createElement('button');
      button.className = 'object-tag query-tag';
      button.setAttribute('aria-label', query.text);
      button.dataset.queryId = query.id;
      const dot = document.createElement('i'),
        label = document.createElement('span');
      label.textContent = query.text;
      button.append(dot, label);
      button.hidden = true;
      button.onclick = () => onQuery(query);
      this.host.append(button);
      this.items.push({
        id: node.id,
        query,
        point: toRoom(...node.center),
        button,
        offset:
          query.id === 'room-query-17'
            ? -48
            : query.id === 'room-query-19'
              ? 36
              : query.id === 'room-query-24'
                ? 32
                : 0,
      });
    }
  }
  selectionCenter(): Point | undefined {
    if (!this.selectedPoints.length) return;
    return [0, 1, 2].map(
      (i) =>
        this.selectedPoints.reduce((sum, p) => sum + p[i], 0) /
        this.selectedPoints.length,
    ) as Point;
  }

  async points(id: number, bounds?: FocusBounds) {
    const key = `${id}:${JSON.stringify(bounds)}`;
    if (this.samples.has(key)) return this.samples.get(key)!;
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
        if (
          cropWeight(p) > 0.15 &&
          withinAnchor(id, p) &&
          withinBounds(p, bounds)
        )
          points.push(p);
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
    this.samples.set(key, result);
    return result;
  }
  async initialize() {
    await Promise.all(
      this.items.map(async (item) => {
        const points = await this.points(
          item.id,
          directedSteps(item.query)[0].bounds,
        );
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
    this.state = state;
    this.selected = state.selected;
    const id = state.selected;
    this.selectedPoints = [];
    this.relationTargets = [];
    if (id !== null) {
      const points = await this.points(
        id,
        stepBounds(state.queryId, state.step),
      );
      if (version !== this.selectionVersion || this.disposed) return;
      this.selectedPoints = points;
    }
    this.updateRelations();
    for (const item of this.items)
      item.button.setAttribute(
        'aria-pressed',
        String(item.query.id === state.queryId),
      );
    const query = this.data.queries.find((q) => q.id === state.queryId);
    this.trace.replaceChildren();
    if (query)
      query.terms.forEach((term, i) => {
        const span = document.createElement('span');
        span.textContent = term;
        span.className =
          i === state.step ? 'current' : i < state.step ? 'visited' : '';
        this.trace.append(span);
      });
    this.host.classList.toggle('has-selection', id !== null);
  }
  private updateRelations() {
    const selected =
      this.selected === null ? undefined : this.data.nodes.get(this.selected);
    this.relationStarted = performance.now();
    // Graph bounds can span disconnected features. Use actual cropped memberships
    // for the selected object; relation endpoints use robust membership medians inside the room.
    this.relationTargets = selected
      ? relationCandidates(this.data, selected, this.relationStyle)
          .map((node) => ({
            id: node.id,
            point: toRoom(
              ...this.data.graph.centers[this.data.graph.index.get(node.id)!],
            ),
          }))
          .filter((node) => cropWeight(node.point) > 0.12)
      : [];
    this.host.dataset.relationStyle = this.relationStyle;
  }

  update(camera: THREE.Camera, field: FieldState) {
    if (this.disposed) return;
    const hostRect = this.host.getBoundingClientRect();
    const { width, height } = hostRect;
    // Read all layout before moving labels. Include the label's translated span,
    // not just its anchor or untransformed button (which misses its upper edge).
    const controls = [
      ...(this.host.parentElement?.querySelectorAll<HTMLElement>(
        '.feature-dial, .view-switch, .camera-controls, .scene-bottom > .eyebrow, .explore-button',
      ) ?? []),
    ].map((control) => {
      const r = control.getBoundingClientRect();
      const pad = control.classList.contains('feature-dial') ? 14 : 6;
      return {
        left: r.left - hostRect.left - pad,
        right: r.right - hostRect.left + pad,
        top: r.top - hostRect.top - pad,
        bottom: r.bottom - hostRect.top + pad,
      };
    });
    const extents = this.items.map(({ button }) => {
      // Reserve the maximum hover footprint, independent of animated scale.
      // Measuring the current transform made labels hide as they grew on hover.
      const span = button.querySelector('span')!;
      return {
        left: 0,
        right: button.offsetWidth + span.offsetWidth * 0.09,
        top: -12,
        bottom: Math.max(button.offsetHeight, span.offsetHeight * 1.09 - 6),
      };
    });
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const projectStatic = (point: Point) => {
      const p = new THREE.Vector3(...fromRoom(...point)).project(camera);
      return {
        x: ((p.x + 1) * width) / 2,
        y: ((1 - p.y) * height) / 2,
        z: p.z,
      };
    };
    const project = (point: Point) => projectStatic(displace(point, field));
    const occupied: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }[] = [];
    let leaders = '';
    this.items.forEach((item, index) => {
      const anchor = project(item.point);
      const extent = extents[index];
      const fits = (p: { x: number; y: number }, boxes = occupied) =>
        p.x > 12 &&
        p.x + extent.right < width - 12 &&
        p.y + extent.top > 12 &&
        p.y + extent.bottom < height - 20 &&
        !boxes.some(
          (r) =>
            p.x + extent.right + 6 > r.left &&
            p.x - 6 < r.right &&
            p.y + extent.bottom + 8 > r.top &&
            p.y + extent.top - 8 < r.bottom,
        );
      const preferred = { ...anchor, y: anchor.y + item.offset };
      // Nearby slots resolve sentence collisions, without pinning labels to a
      // control. Anchors keep moving in 3D; short leaders retain the association.
      const candidates = [0, -72, 72, -144, 144, -216, 216].flatMap((dy) =>
        [0, -extent.right - 18].map((dx) => ({
          ...anchor,
          x: anchor.x + dx,
          y: preferred.y + dy,
        })),
      );
      const p =
        candidates.find((p) => fits(p) && fits(p, controls)) ?? preferred;
      const occluded = !fits(p, controls) || !fits(p);
      const visible =
        anchor.z > -1 &&
        anchor.z < 1 &&
        anchor.x > 0 &&
        anchor.x < width &&
        anchor.y > 0 &&
        anchor.y < height &&
        !occluded &&
        (!this.state?.queryId || this.state.selected === null);
      if (visible) {
        occupied.push({
          left: p.x,
          right: p.x + extent.right,
          top: p.y + extent.top,
          bottom: p.y + extent.bottom,
        });
        if (Math.hypot(p.x - anchor.x, p.y - anchor.y) > 12)
          leaders += `M${anchor.x} ${anchor.y}L${p.x + 2} ${p.y + 6}`;
      }
      item.button.dataset.occluded = String(occluded);
      item.button.style.visibility = visible ? 'visible' : 'hidden';
      item.button.setAttribute('aria-hidden', String(!visible));
      item.button.tabIndex = visible ? 0 : -1;
      item.button.style.transform = `translate(${p.x}px,${p.y}px)`;
    });
    this.leaders.setAttribute('d', leaders);
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
      this.connections.clear();
      this.trace.hidden = true;
      this.caption.hidden = true;
      return;
    }
    const bridgeSource =
      this.connections.look === 'bridges' ? this.selectionCenter() : undefined;
    // All looks share the visible selection's centroid and displaced endpoints.
    const center = {
      x: points.reduce((v, p) => v + p.x, 0) / points.length,
      y: points.reduce((v, p) => v + p.y, 0) / points.length,
    };
    const candidates = this.relationTargets
      .map((item) => ({
        id: item.id,
        point: item.point,
        ...project(item.point),
      }))
      .filter(
        (p) =>
          p.z > -1 &&
          p.z < 1 &&
          p.x > 12 &&
          p.x < width - 12 &&
          p.y > 12 &&
          p.y < height - 20,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - center.x, a.y - center.y) -
          Math.hypot(b.x - center.x, b.y - center.y),
      );
    // Keep a spread of visible endpoints instead of drawing thousands of nearly
    // identical edges from the dense legacy graph. Every retained edge is real.
    const targets: typeof candidates = [];
    const limit =
      this.relationStyle === 'network'
        ? 14
        : this.relationStyle === 'layer'
          ? 11
          : 8;
    for (const p of candidates) {
      if (Math.hypot(p.x - center.x, p.y - center.y) < 26) continue;
      if (targets.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 48)) continue;
      targets.push(p);
      if (targets.length === limit) break;
    }
    const elapsed = performance.now() - this.relationStarted;
    // Brief, local signal acquisition: two quick interruptions, then a steady trace.
    const signal =
      this.reducedMotion || elapsed > 260
        ? 1
        : elapsed < 45
          ? 0.25
          : elapsed < 85
            ? 0.9
            : elapsed < 115
              ? 0.15
              : elapsed < 175
                ? 1
                : elapsed < 205
                  ? 0.35
                  : 1;
    // D lifts every connection along room +Z, not a screen-space normal.
    // Project the sampled 3D arch so its orientation follows camera orbit and
    // perspective; every point stays above the straight endpoint chord.
    // Only endpoints follow flow, just like A/B/C. Interpolate their screen-space
    // offsets across the unperturbed arch: no local flow samples along the line.
    const drawnTargets = bridgeSource
      ? targets.map((target) => {
          const end = target.point;
          const distance = Math.hypot(
            ...end.map((v, i) => v - bridgeSource[i]),
          );
          const lift = Math.min(0.28, Math.max(0.025, distance * 0.14));
          const restSource = projectStatic(bridgeSource),
            restEnd = projectStatic(end);
          const bridgePoints = [];
          for (let i = 0; i <= 64; i++) {
            const t = i / 64;
            const point = bridgeSource.map(
              (v, axis) =>
                v +
                (end[axis] - v) * t +
                (axis === 2 ? 4 * lift * t * (1 - t) : 0),
            ) as Point;
            const p = projectStatic(point);
            bridgePoints.push({
              x:
                p.x +
                (1 - t) * (center.x - restSource.x) +
                t * (target.x - restEnd.x),
              y:
                p.y +
                (1 - t) * (center.y - restSource.y) +
                t * (target.y - restEnd.y),
            });
          }
          return { ...target, bridgePoints };
        })
      : targets;
    this.connections.draw(
      center,
      drawnTargets,
      field.time,
      this.reducedMotion,
      signal,
    );
    this.trace.hidden = !this.state?.queryId;
    this.caption.hidden = false;
    const captionY = Math.max(22, Math.min(...points.map((p) => p.y)) - 25);
    const above = captionY - this.trace.offsetHeight - 8;
    const traceY =
      above >= 12 ? above : captionY + this.caption.offsetHeight + 8;
    this.trace.style.transform = `translate(${Math.max(12, Math.min(width - 240, center.x - 110))}px,${traceY}px)`;
    this.caption.style.transform = `translate(${Math.min(width - 150, Math.max(15, center.x))}px,${captionY}px)`;
  }
  dispose() {
    this.disposed = true;
    this.host.replaceChildren();
    this.samples.clear();
    this.items = [];
    this.selectedPoints = [];
  }
}
