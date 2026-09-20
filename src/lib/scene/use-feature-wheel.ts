import { animate } from 'motion';
import { useEffect, useRef } from 'react';

const clamp = (x: number) => Math.max(0, Math.min(4, x));
const detent = (x: number) => Math.round(clamp(x));

/** Continuous input with Motion's velocity-based decay; scene values stay discrete. */
export function useFeatureWheel(
  level: number,
  disabled: boolean,
  onChange: (level: number) => void,
) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ disabled, onChange });
  latest.current = { disabled, onChange };
  const control = useRef<{
    sync: (level: number) => void;
    step: (delta: number) => void;
  } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const ticks = [...el.querySelectorAll<SVGLineElement>('[data-tick]')];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let position = level - 1,
      selected = level - 1;
    let animation: ReturnType<typeof animate> | undefined;
    let drag:
      | {
          id: number;
          y: number;
          start: number;
          lastY: number;
          time: number;
          velocity: number;
          moved: boolean;
        }
      | undefined;
    let wheelSum = 0,
      wheelTime = 0;
    const paint = (p: number) => {
      position = p;
      el.dataset.position = String(p);
      // Project ribs around a cylinder: spacing and brightness fall toward its edges.
      for (const tick of ticks) {
        const value = Number(tick.dataset.tick) / 5;
        const angle = (value - p) * 0.46;
        const visible = Math.abs(angle) < 1.48;
        const y = 104 + 98 * Math.sin(angle);
        const face = Math.max(0, Math.cos(angle));
        tick.setAttribute('y1', String(y));
        tick.setAttribute('y2', String(y));
        const major = Number.isInteger(value) && value >= 0 && value <= 4;
        const half = (major ? 12 : 7) * (0.8 + 0.2 * face);
        tick.setAttribute('x1', String(22 - half));
        tick.setAttribute('x2', String(22 + half));
        tick.style.opacity = String(
          visible
            ? Math.pow(face, 1.6) * (value < 0 || value > 4 ? 0.2 : 1)
            : 0,
        );
        tick.classList.toggle(
          'current-tick',
          major && Math.abs(value - p) < 0.15,
        );
      }
    };
    const emit = (next: number) => {
      if (next === selected) return;
      selected = next;
      el.setAttribute('aria-valuenow', String(next + 1));
      el.setAttribute(
        'aria-valuetext',
        `Level ${next + 1} of 5, ${next === 0 ? 'whole objects' : next === 4 ? 'fine parts' : 'object parts'}`,
      );
      latest.current.onChange(next + 1);
    };
    const update = (p: number) => {
      paint(p);
      // Small hysteresis prevents repeated scene changes at a detent boundary.
      if (Math.abs(p - selected) > 0.56) emit(detent(p));
    };
    const stop = () => {
      animation?.stop();
      animation = undefined;
    };
    const settle = (velocity = 0, exact?: number) => {
      stop();
      const target =
        exact ?? detent(position + Math.max(-7, Math.min(7, velocity)) * 0.12);
      if (reduced.matches) {
        paint(target);
        emit(target);
        return;
      }
      animation = animate(position, target, {
        type: 'inertia',
        velocity,
        power: 0.12,
        timeConstant: 115,
        min: 0,
        max: 4,
        bounceStiffness: 500,
        bounceDamping: 45,
        restDelta: 0.002,
        modifyTarget: () => target,
        onUpdate: exact === undefined ? update : paint,
        onComplete: () => {
          paint(target);
          emit(target);
          animation = undefined;
        },
      });
    };
    const go = (value: number) => {
      if (latest.current.disabled) return;
      const target = detent(value);
      emit(target);
      settle(0, target);
    };
    const down = (e: PointerEvent) => {
      if (latest.current.disabled || e.button !== 0 || drag) return;
      e.preventDefault();
      e.stopPropagation();
      stop();
      el.focus({ preventScroll: true });
      el.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        y: e.clientY,
        start: position,
        lastY: e.clientY,
        time: e.timeStamp,
        velocity: 0,
        moved: false,
      };
      el.dataset.dragging = 'true';
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const pixelsPerLevel = el.clientHeight * (98 / 208) * 0.46;
      const displacement = (drag.y - e.clientY) / pixelsPerLevel;
      const raw = drag.start + displacement;
      const edge = clamp(raw);
      const p =
        edge +
        Math.sign(raw - edge) * Math.min(0.18, Math.abs(raw - edge) * 0.18);
      const dt = e.timeStamp - drag.time;
      if (dt > 0)
        drag.velocity =
          (((drag.lastY - e.clientY) / pixelsPerLevel) * 1000) / dt;
      drag.lastY = e.clientY;
      drag.time = e.timeStamp;
      drag.moved ||= Math.abs(e.clientY - drag.y) > 4;
      update(p);
    };
    const release = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const gesture = drag;
      drag = undefined;
      delete el.dataset.dragging;
      if (el.hasPointerCapture(e.pointerId))
        el.releasePointerCapture(e.pointerId);
      if (!gesture.moved && e.type === 'pointerup') {
        const y =
          ((e.clientY - el.getBoundingClientRect().top) / el.clientHeight) *
          208;
        const offset =
          Math.asin(Math.max(-1, Math.min(1, (y - 104) / 98))) / 0.46;
        go(position + offset);
      } else
        settle(
          e.type === 'pointerup' && e.timeStamp - gesture.time < 90
            ? gesture.velocity
            : 0,
        );
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (latest.current.disabled || drag) return;
      if (e.timeStamp - wheelTime > 150) wheelSum = 0;
      wheelTime = e.timeStamp;
      wheelSum +=
        e.deltaY *
        (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1);
      if (Math.abs(wheelSum) >= 28) {
        go(selected + Math.sign(wheelSum));
        wheelSum = 0;
      }
    };
    const key = (e: KeyboardEvent) => {
      const targets: Record<string, number> = {
        ArrowUp: selected - 1,
        ArrowDown: selected + 1,
        ArrowLeft: selected - 1,
        ArrowRight: selected + 1,
        Home: 0,
        End: 4,
        PageUp: selected - 1,
        PageDown: selected + 1,
      };
      if (!(e.key in targets)) return;
      e.preventDefault();
      e.stopPropagation();
      go(targets[e.key]);
    };
    const motionChanged = () => {
      if (reduced.matches) {
        stop();
        paint(selected);
      }
    };
    control.current = {
      step: (delta) => go(selected + delta),
      sync: (next) => {
        if (next - 1 !== selected) {
          selected = next - 1;
          if (!drag) settle(0, selected);
        }
      },
    };
    paint(position);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('keydown', key);
    reduced.addEventListener('change', motionChanged);
    return () => {
      stop();
      control.current = null;
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      el.removeEventListener('lostpointercapture', release);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('keydown', key);
      reduced.removeEventListener('change', motionChanged);
    };
  }, []);
  useEffect(() => {
    control.current?.sync(level);
  }, [level]);
  return { host, step: (delta: number) => control.current?.step(delta) };
}
