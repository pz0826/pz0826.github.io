import { useEffect, useRef, useState, type CSSProperties } from 'react';
import manifest from '../../content/art-gallery.json';
import './art-gallery.css';

type Photo = (typeof manifest.photos)[keyof typeof manifest.photos];
const photos = manifest.photos as Record<string, Photo>;
const echoes = manifest.echoes as Record<
  string,
  { id: string; theme: string; similarity: number }[]
>;
const themes = manifest.themes;
const revealed = new Set<string>();
let animations = 0;
const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = (n: number) => String(n).padStart(2, '0');

function PhotoImage({
  id,
  small = false,
  replay = 0,
}: {
  id: string;
  small?: boolean;
  replay?: number;
}) {
  const p = photos[id];
  const box = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string>();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const playedReplay = useRef(0);
  useEffect(() => {
    const el = box.current!;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        const bounds = el.getBoundingClientRect();
        const desired =
          Math.max(bounds.width, bounds.height) *
          Math.min(window.devicePixelRatio || 1, 2);
        const size = small
          ? 640
          : desired <= 640
            ? 640
            : desired <= 1280
              ? 1280
              : 1920;
        setSrc(p.images[String(size) as '640'].src);
        observer.disconnect();
      },
      { rootMargin: '180px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, small, p]);
  useEffect(() => {
    if (!src) return;
    let cancelled = false,
      frame = 0,
      counted = false;
    const release = () => {
      if (counted) {
        animations--;
        counted = false;
      }
    };
    const finish = () => {
      release();
      if (!cancelled) {
        revealed.add(id);
        setReady(true);
      }
    };
    const forceReplay = replay > playedReplay.current;
    const run = async () => {
      const img = image.current!;
      const feature = new Image();
      const needsFeature =
        !small && !reduced() && (!revealed.has(id) || forceReplay);
      // Request the ~2 KB feature map alongside RGB, never a model in the browser.
      const featureReady = needsFeature
        ? (() => {
            feature.src = p.pca;
            return feature
              .decode()
              .then(() => true)
              .catch(() => false);
          })()
        : Promise.resolve(false);
      try {
        await img.decode();
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled) return;
      if (
        small ||
        reduced() ||
        (revealed.has(id) && !forceReplay) ||
        animations >= 2
      ) {
        finish();
        return;
      }
      counted = true;
      animations++;
      // A missing or slow PCA sidecar must never hold a decoded photograph hostage.
      const valid = await Promise.race([
        featureReady,
        new Promise<boolean>((r) => setTimeout(() => r(false), 900)),
      ]);
      if (cancelled) {
        release();
        return;
      }
      if (!valid || reduced()) {
        finish();
        return;
      }
      playedReplay.current = replay;
      const output = canvas.current!;
      setReady(false);
      const rect = box.current!.getBoundingClientRect();
      output.width = Math.min(
        1600,
        Math.round(rect.width * Math.min(devicePixelRatio, 2)),
      );
      output.height = Math.round((output.width * p.height) / p.width);
      const ctx = output.getContext('2d')!;
      const buffer = document.createElement('canvas');
      const b = buffer.getContext('2d')!;
      const start = performance.now();
      const render = (now: number) => {
        if (cancelled) return;
        const t = (now - start) / 700;
        if (t >= 1 || reduced()) {
          finish();
          return;
        }
        const short = t < 0.48 ? 16 : t < 0.65 ? 32 : t < 0.81 ? 64 : 128;
        buffer.width =
          (short / 16) * Math.round(16 * Math.max(1, p.width / p.height));
        buffer.height =
          (short / 16) * Math.round(16 * Math.max(1, p.height / p.width));
        b.globalAlpha = 1;
        b.imageSmoothingEnabled = true;
        b.drawImage(img, 0, 0, buffer.width, buffer.height);
        if (t < 0.48) {
          b.globalAlpha = 1 - Math.min(1, Math.max(0, (t - 0.1) / 0.34));
          const [x, y, w, h] = p.content;
          b.drawImage(
            feature,
            x * feature.width,
            y * feature.height,
            w * feature.width,
            h * feature.height,
            0,
            0,
            buffer.width,
            buffer.height,
          );
        }
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, output.width, output.height);
        ctx.drawImage(buffer, 0, 0, output.width, output.height);
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
    };
    run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      release();
    };
  }, [src, id, p, small, attempt, replay]);
  return (
    <span
      className={`art-image ${ready ? 'is-ready' : ''}`}
      ref={box}
      onClickCapture={(e) => {
        if (!failed) return;
        e.stopPropagation();
        setFailed(false);
        setAttempt((v) => v + 1);
        if (image.current) image.current.src = src!;
      }}
      style={
        {
          aspectRatio: `${p.width}/${p.height}`,
          '--photo-ratio': p.width / p.height,
        } as CSSProperties
      }
    >
      <img
        ref={image}
        src={src}
        alt={p.alt}
        width={p.width}
        height={p.height}
        decoding="async"
      />
      <canvas ref={canvas} aria-hidden="true" hidden={ready} />
      {failed && (
        <span className="art-image-error" role="status">
          Image unavailable. Click to retry.
        </span>
      )}
    </span>
  );
}

function CollectionCover({
  theme,
  mounted,
  open,
}: {
  theme: (typeof themes)[number];
  mounted: boolean;
  open: (id: string) => void;
}) {
  const [replay, setReplay] = useState(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReplay = useRef(-Infinity);
  const cancelReplay = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  };
  useEffect(() => cancelReplay, []);
  const requestReplay = () => {
    cancelReplay();
    if (reduced() || !revealed.has(theme.cover)) return;
    hoverTimer.current = setTimeout(() => {
      if (performance.now() - lastReplay.current < 1600) return;
      lastReplay.current = performance.now();
      setReplay((n) => n + 1);
    }, 140);
  };
  return (
    <article className="art-cover-card">
      <button
        className="art-cover"
        disabled={!mounted}
        onClick={() => open(theme.id)}
        aria-label={`Explore ${theme.title}`}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') requestReplay();
        }}
        onPointerLeave={cancelReplay}
        onFocus={(e) => {
          if (e.currentTarget.matches(':focus-visible')) requestReplay();
        }}
        onBlur={cancelReplay}
      >
        <span className="art-cover-photo">
          <PhotoImage id={theme.cover} replay={replay} />
        </span>
        <span className="art-cover-label">
          <span>
            <small>{theme.zh}</small>
            <strong>{theme.title}</strong>
          </span>
          <span className="art-cover-arrow" aria-hidden="true">
            ↗
          </span>
        </span>
        <span className="art-cover-description">{theme.description}</span>
      </button>
    </article>
  );
}

type EchoPath = {
  id: string;
  d: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  lx: number;
  ly: number;
  similarity: number;
};
function EchoConnections({
  source,
  root,
  rail,
}: {
  source: string;
  root: React.RefObject<HTMLDivElement | null>;
  rail: React.RefObject<HTMLDivElement | null>;
}) {
  const [geometry, setGeometry] = useState<{
    width: number;
    height: number;
    paths: EchoPath[];
  }>({ width: 0, height: 0, paths: [] });
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      const bounds = el.getBoundingClientRect();
      const origin = el
        .querySelector(`[data-photo-id="${source}"] .art-image`)
        ?.getBoundingClientRect();
      if (!origin) return;
      const paths = echoes[source].flatMap((match, i) => {
        const target = el
          .querySelector(`[data-echo-id="${match.id}"] .art-image`)
          ?.getBoundingClientRect();
        if (!target || !target.width) return [];
        const sx = origin.left - bounds.left + origin.width * (0.36 + i * 0.14),
          sy = origin.bottom - bounds.top + 5;
        const tx = target.left - bounds.left + target.width * 0.5,
          ty = target.top - bounds.top - 7;
        const dy = ty - sy,
          c1y = sy + dy * 0.42,
          c2y = ty - dy * 0.38;
        const t = 0.76,
          u = 1 - t;
        return [
          {
            id: match.id,
            sx,
            sy,
            tx,
            ty,
            d: `M ${sx} ${sy} C ${sx} ${c1y}, ${tx} ${c2y}, ${tx} ${ty}`,
            lx:
              u * u * u * sx +
              3 * u * u * t * sx +
              3 * u * t * t * tx +
              t * t * t * tx,
            ly:
              u * u * u * sy +
              3 * u * u * t * c1y +
              3 * u * t * t * c2y +
              t * t * t * ty,
            similarity: match.similarity,
          },
        ];
      });
      setGeometry({ width: bounds.width, height: bounds.height, paths });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    el.querySelectorAll('.art-image').forEach((node) => observer.observe(node));
    rail.current?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    el.addEventListener('animationend', schedule);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      rail.current?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      el.removeEventListener('animationend', schedule);
    };
  }, [source, root, rail]);
  return (
    <svg
      className="art-echo-connections"
      width={geometry.width}
      height={geometry.height}
      aria-label="Feature similarity connections"
    >
      {geometry.paths.map((path, i) => (
        <g key={path.id} data-connection={path.id}>
          <title>
            {Math.round(path.similarity * 100)}% feature similarity — weighted
            cosine score, not a probability
          </title>
          <path className="echo-thread" d={path.d} />
          <path
            className="echo-signal"
            d={path.d}
            pathLength={100}
            style={{ animationDelay: `-${i * 1.1}s` }}
          />
          <path
            className="echo-diamond"
            d={`M${path.sx - 4} ${path.sy}l4 -4 4 4 -4 4Z M${path.tx - 3} ${path.ty}l3 -3 3 3 -3 3Z`}
          />
          <g
            className="echo-score-label"
            transform={`translate(${path.lx + 12} ${path.ly})`}
          >
            <rect
              x={-5}
              y={-13}
              width={String(Math.round(path.similarity * 100)).length * 7 + 23}
              height={19}
              rx={2}
            />
            <text className="echo-score">
              <tspan>{Math.round(path.similarity * 100)}</tspan>
              <tspan className="echo-percent" dx={4}>
                %
              </tspan>
            </text>
          </g>
        </g>
      ))}
    </svg>
  );
}

function Lightbox({
  id,
  onClose,
  onChange,
  sequence,
  opener,
}: {
  opener: HTMLElement | null;
  id: string;
  onClose: () => void;
  onChange: (id: string) => void;
  sequence: string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [full, setFull] = useState(false);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(false);
  const p = photos[id],
    index = sequence.indexOf(id);
  useEffect(() => {
    const el = dialog.current!;
    const focused = opener ?? (document.activeElement as HTMLElement);
    const previous = document.body.style.overflow;
    el.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      el.close();
      focused?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    setFull(false);
    setError(false);
    setZoom(false);
  }, [id]);
  return (
    <dialog
      ref={dialog}
      className="art-lightbox"
      aria-label="Photograph viewer"
      onCancel={onClose}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' && index < sequence.length - 1)
          onChange(sequence[index + 1]);
        if (e.key === 'ArrowLeft' && index > 0) onChange(sequence[index - 1]);
      }}
    >
      <header>
        <span className="eyebrow">
          {pad(index + 1)} / {pad(sequence.length)}
        </span>
        <button onClick={onClose} autoFocus aria-label="Close photograph">
          Close ×
        </button>
      </header>
      <div className={`art-lightbox-image ${zoom ? 'zoomed' : ''}`}>
        <button
          onClick={() => setZoom(!zoom)}
          aria-label={zoom ? 'Fit photograph' : 'Enlarge photograph'}
        >
          <img src={p.images['1280'].src} alt={p.alt} />
          <img
            key={id}
            className={`art-full ${full ? 'loaded' : ''}`}
            src={p.images['3200'].src}
            alt=""
            onLoad={() => setFull(true)}
            onError={() => setError(true)}
          />
        </button>
      </div>
      <footer>
        <button
          disabled={index === 0}
          onClick={() => onChange(sequence[index - 1])}
          aria-label="Previous photograph"
        >
          ←
        </button>
        <p>
          {p.alt}
          <span>
            {error
              ? 'Preview available · large image unavailable'
              : full
                ? 'Click photograph to enlarge / fit'
                : 'Loading the larger photograph…'}
          </span>
        </p>
        <button
          disabled={index === sequence.length - 1}
          onClick={() => onChange(sequence[index + 1])}
          aria-label="Next photograph"
        >
          →
        </button>
      </footer>
    </dialog>
  );
}

export default function ArtGallery() {
  const [inputMode, setInputMode] = useState<'pointer' | 'keyboard'>('pointer');
  const lightboxOpener = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [active, setActive] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [spread, setSpread] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [echo, setEcho] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<{
    theme: string;
    index: number;
  } | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const flowRoot = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const theme = themes.find((t) => t.id === active);
  const sequence = theme?.spreads.flat() || [];
  function open(id: string, index?: number) {
    const next = index ?? positions[id] ?? 0;
    setActive(id);
    setSpread(next);
    setEcho(null);
    setPositions((previous) => ({ ...previous, [id]: next }));
  }
  useEffect(() => {
    if (!active || !rail.current) return;
    const el = rail.current;
    const index = positions[active] || 0;
    const item = el.children[index] as HTMLElement;
    if (item) el.scrollLeft = item.offsetLeft - el.offsetLeft;
    heading.current?.focus({ preventScroll: true });
    const rect = heading.current?.getBoundingClientRect();
    if (rect && (rect.top < 95 || rect.bottom > innerHeight))
      heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    // A theme switch restores that theme's page, ordinary scrolling only updates memory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  function go(index: number) {
    if (!theme || !rail.current) return;
    const el = rail.current.children[index] as HTMLElement;
    rail.current.scrollTo({
      left: el.offsetLeft - rail.current.offsetLeft,
      behavior: reduced() ? 'instant' : 'smooth',
    });
  }
  const pointer = useRef<{
    x: number;
    scroll: number;
    dragged: boolean;
    pointer: number;
  } | null>(null);
  return (
    <div
      className="art-exhibition"
      data-ready={mounted}
      data-input={inputMode}
      onPointerDownCapture={() => setInputMode('pointer')}
      onKeyDownCapture={(e) => {
        if (e.key !== 'Escape') setInputMode('keyboard');
      }}
    >
      {!theme ? (
        <>
          <div className="art-intro">
            <div>
              <h3>
                Another way
                <br />
                of seeing.
              </h3>
            </div>
            <p>
              Between the shape of the land
              <br />
              and the traces we leave.
            </p>
          </div>
          <div className="art-group-heading">
            <span className="eyebrow">Three ways of looking</span>
            <span>Selected photographs</span>
          </div>
          <div className="art-covers primary">
            {themes.slice(0, 3).map((t) => (
              <CollectionCover
                key={t.id}
                theme={t}
                mounted={mounted}
                open={open}
              />
            ))}
          </div>
          <div className="art-series-heading">
            <span className="eyebrow">Two passing seasons</span>
            <span>A different light. A different hour.</span>
          </div>
          <div className="art-covers secondary">
            {themes.slice(3).map((t) => (
              <CollectionCover
                key={t.id}
                theme={t}
                mounted={mounted}
                open={open}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <nav className="art-chapter-nav" aria-label="Photography themes">
            <button
              onClick={() => {
                setActive(null);
                setEcho(null);
                setReturnTo(null);
              }}
            >
              ← Collections
            </button>
            <div>
              {themes.map((t) => (
                <button
                  key={t.id}
                  aria-current={active === t.id ? 'page' : undefined}
                  onClick={() => {
                    setReturnTo(null);
                    open(t.id);
                  }}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </nav>
          <div className="art-chapter-heading">
            <div>
              <span className="eyebrow">
                {theme.zh} / {sequence.length} photographs
              </span>
              <h3 ref={heading} tabIndex={-1}>
                {theme.title}
              </h3>
            </div>
            <p>{theme.description}</p>
          </div>
          {returnTo && (
            <button
              className="art-return eyebrow"
              onClick={() => {
                open(returnTo.theme, returnTo.index);
                setReturnTo(null);
              }}
            >
              ← Back to {themes.find((t) => t.id === returnTo.theme)?.title}
            </button>
          )}
          <div className="art-chapter-stage" key={active} ref={flowRoot}>
            <div
              className="art-spreads"
              ref={rail}
              role="region"
              aria-label={`${theme.title} photographic spreads`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (
                  e.key === 'ArrowRight' &&
                  spread < theme.spreads.length - 1
                ) {
                  e.preventDefault();
                  go(spread + 1);
                }
                if (e.key === 'ArrowLeft' && spread > 0) {
                  e.preventDefault();
                  go(spread - 1);
                }
              }}
              onScroll={() => {
                const el = rail.current;
                if (!el) return;
                const children = Array.from(el.children) as HTMLElement[];
                const next = children.reduce(
                  (best, node, i) =>
                    Math.abs(node.offsetLeft - el.offsetLeft - el.scrollLeft) <
                    Math.abs(
                      children[best].offsetLeft - el.offsetLeft - el.scrollLeft,
                    )
                      ? i
                      : best,
                  0,
                );
                setSpread(next);
                if (echo && !theme.spreads[next].includes(echo)) setEcho(null);
                setPositions((old) =>
                  old[active!] === next ? old : { ...old, [active!]: next },
                );
              }}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button === 0)
                  pointer.current = {
                    x: e.clientX,
                    scroll: e.currentTarget.scrollLeft,
                    dragged: false,
                    pointer: e.pointerId,
                  };
              }}
              onPointerMove={(e) => {
                const p = pointer.current;
                if (!p) return;
                const dx = e.clientX - p.x;
                if (Math.abs(dx) > 6) {
                  p.dragged = true;
                  e.currentTarget.setPointerCapture(p.pointer);
                  e.currentTarget.classList.add('dragging');
                  e.currentTarget.scrollLeft = p.scroll - dx;
                }
              }}
              onPointerUp={(e) => {
                const p = pointer.current;
                if (!p) return;
                if (e.currentTarget.hasPointerCapture(p.pointer))
                  e.currentTarget.releasePointerCapture(p.pointer);
                e.currentTarget.classList.remove('dragging');
                if (p.dragged) {
                  go(spread);
                  setTimeout(() => {
                    pointer.current = null;
                  }, 0);
                } else pointer.current = null;
              }}
              onPointerCancel={(e) => {
                pointer.current = null;
                e.currentTarget.classList.remove('dragging');
              }}
              onClickCapture={(e) => {
                if (pointer.current?.dragged) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              {theme.spreads.map((pair, i) => (
                <div
                  className={`art-spread ${pair.length === 1 ? 'solo' : i % 3 === 1 ? 'paired' : 'offset'}`}
                  key={i}
                  aria-label={`Spread ${i + 1} of ${theme.spreads.length}`}
                >
                  {pair.map((id, j) => (
                    <figure
                      key={id}
                      data-photo-id={id}
                      style={
                        {
                          '--photo-ratio': photos[id].width / photos[id].height,
                        } as CSSProperties
                      }
                      className={`art-print print-${j} ${photos[id].width < photos[id].height ? 'portrait' : 'landscape'}`}
                    >
                      <button
                        className="art-open-photo"
                        onClick={(e) => {
                          lightboxOpener.current = e.currentTarget;
                          setLightbox(id);
                        }}
                        aria-label={`Open photograph: ${photos[id].alt}`}
                      >
                        <PhotoImage id={id} />
                        <span className="art-enlarge" aria-hidden="true">
                          ↗
                        </span>
                      </button>
                      <figcaption>
                        <span>{pad(sequence.indexOf(id) + 1)}</span>
                        <button
                          aria-expanded={echo === id}
                          onClick={() => setEcho(echo === id ? null : id)}
                        >
                          Visual echoes{' '}
                          <span aria-hidden="true">
                            {echo === id ? '−' : '+'}
                          </span>
                        </button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ))}
            </div>
            <div className="art-paging" aria-label="Spread navigation">
              <button
                disabled={spread === 0}
                onClick={() => go(spread - 1)}
                aria-label="Previous spread"
              >
                ←
              </button>
              <div className="art-page-marks">
                {theme.spreads.map((_, i) => (
                  <button
                    key={i}
                    className={spread === i ? 'current' : ''}
                    aria-label={`Go to spread ${i + 1}`}
                    aria-current={spread === i ? 'step' : undefined}
                    onClick={() => go(i)}
                  />
                ))}
              </div>
              <button
                disabled={spread === theme.spreads.length - 1}
                onClick={() => go(spread + 1)}
                aria-label="Next spread"
              >
                →
              </button>
              <span className="art-sr-only" aria-live="polite">
                Spread {spread + 1} of {theme.spreads.length}
              </span>
            </div>
            {echo && (
              <aside
                className="art-echoes"
                aria-label="Visual echoes across collections"
              >
                <div className="art-echo-intro">
                  <span className="eyebrow">Visual echoes</span>
                  <p>
                    A shape remembered
                    <br />
                    in another photograph.
                  </p>
                  <small>
                    Feature similarity
                    <br />
                    Follow a thread into another collection.
                  </small>
                  <button
                    onClick={() => setEcho(null)}
                    aria-label="Close visual echoes"
                  >
                    Close ×
                  </button>
                </div>
                <div className="art-echo-candidates">
                  {echoes[echo].map((match) => (
                    <button
                      key={match.id}
                      className="art-echo-candidate"
                      data-echo-id={match.id}
                      onClick={() => {
                        setReturnTo({ theme: active!, index: spread });
                        const next = themes.find((t) => t.id === match.theme)!;
                        open(
                          next.id,
                          next.spreads.findIndex((s) => s.includes(match.id)),
                        );
                      }}
                    >
                      <PhotoImage id={match.id} small />
                      <span>
                        {themes.find((t) => t.id === match.theme)?.title}
                        <span aria-hidden="true"> ↗</span>
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            )}
            {echo && (
              <EchoConnections source={echo} root={flowRoot} rail={rail} />
            )}
          </div>
        </>
      )}
      <p className="art-colophon eyebrow">
        Photographs by Yuning Peng{' '}
        <span>Light, space, and the intervals between.</span>
      </p>
      {lightbox && (
        <Lightbox
          id={lightbox}
          onClose={() => setLightbox(null)}
          onChange={setLightbox}
          sequence={sequence}
          opener={lightboxOpener.current}
        />
      )}
    </div>
  );
}
