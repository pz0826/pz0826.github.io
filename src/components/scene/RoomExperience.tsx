import { directedSteps } from '../../lib/scene/query-direction';
import FeatureDial from './FeatureDial';
import { useEffect, useReducer, useRef, useState } from 'react';
import { loadSceneData, SceneTables } from '../../lib/scene/data';
import { initialState, nodeAtLevel, sceneReducer } from '../../lib/scene/state';
import type { SceneData, SceneQuery } from '../../lib/scene/types';
import type { SparkAdapter } from '../../lib/scene/spark-adapter';

export default function RoomExperience() {
  const host = useRef<HTMLDivElement>(null),
    hud = useRef<HTMLDivElement>(null),
    container = useRef<HTMLDivElement>(null);
  const adapter = useRef<SparkAdapter | null>(null);
  const [data, setData] = useState<SceneData | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [state, dispatch] = useReducer(sceneReducer, initialState);
  const [exploring, setExploring] = useState(false),
    [mobile, setMobile] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const playRef = useRef<(query: SceneQuery) => void>(() => {});
  const [detail, setDetail] = useState('');
  const [tableBusy, setTableBusy] = useState(false);
  const picked = useRef(-1),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const manualEpoch = useRef(0);
  const finishWait = useRef<(() => void) | null>(null);
  const current = useRef(state);
  current.current = state;
  const cancel = () => {
    ++manualEpoch.current;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    finishWait.current?.();
    finishWait.current = null;
    adapter.current?.cancelMotion();
    dispatch({ type: 'stop' });
  };
  const fail = (error: unknown) => {
    if ((error as Error)?.name === 'AbortError') return;
    console.error(error);
    cancel();
    adapter.current?.dispose();
    adapter.current = null;
    setStatus('error');
    setDetail(
      'The interactive room could not load. You can retry or continue exploring the work below.',
    );
  };

  useEffect(() => {
    const media = matchMedia('(max-width: 700px), (pointer: coarse)');
    const changed = () => setMobile(media.matches);
    changed();
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    // Loading is opt-in on touch devices; the poster and all content work immediately.
    if (matchMedia('(pointer: coarse)').matches && !exploring) return;
    const abort = new AbortController();
    let local: SparkAdapter | undefined;
    let observer: IntersectionObserver | undefined;
    setStatus('loading');
    (async () => {
      // Start the large geometry transfer as soon as the manifest arrives,
      // while the browser is still downloading/parsing the renderer module.
      const sceneRequest = loadSceneData(abort.signal).then(
        async (sceneData) => {
          const tables = new SceneTables(
            abort.signal,
            sceneData.manifest.count,
          );
          await Promise.all([
            tables.bytes(sceneData.manifest.geometry),
            tables.level(1),
          ]);
          return { sceneData, tables };
        },
      );
      const [{ sceneData, tables }, { SparkAdapter }] = await Promise.all([
        sceneRequest,
        import('../../lib/scene/spark-adapter'),
      ]);
      abort.signal.throwIfAborted();
      setData(sceneData);
      local = await SparkAdapter.create({
        host: host.current!,
        hud: hud.current!,
        onQuery: (query) => playRef.current(query),
        data: sceneData,
        tables,
        signal: abort.signal,
        onSelect: (id, index) => {
          picked.current = index;
          dispatch({ type: 'select', id });
        },
        onManual: cancel,
        onError: fail,
      });
      if (abort.signal.aborted) {
        local.dispose();
        return;
      }
      adapter.current = local;
      local.setInteractive(
        !matchMedia('(max-width: 700px), (pointer: coarse)').matches ||
          exploring,
      );
      setStatus('ready');
      observer = new IntersectionObserver(
        (entries) => local?.setVisible(entries[0].isIntersecting),
        { threshold: 0.01 },
      );
      observer.observe(container.current!);
    })().catch(fail);
    return () => {
      abort.abort();
      observer?.disconnect();
      local?.dispose();
      adapter.current = null;
      timers.current.forEach(clearTimeout);
      ++manualEpoch.current;
      finishWait.current?.();
    };
  }, [attempt]);
  useEffect(() => {
    adapter.current?.setInteractive(!mobile || exploring);
  }, [mobile, exploring, status]);
  useEffect(() => {
    if (!adapter.current || status !== 'ready') return;
    let live = true;
    setTableBusy(true);
    adapter.current
      .apply(state)
      .catch(fail)
      .finally(() => {
        if (live) setTableBusy(false);
      });
    return () => {
      live = false;
    };
  }, [state, status]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancel();
        picked.current = -1;
        setExploring(false);
        dispatch({ type: 'select', id: null });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  async function level(value: number) {
    cancel();
    const engine = adapter.current;
    if (!engine || !data) return;
    const epoch = manualEpoch.current;
    await engine.tables.level(value);
    if (manualEpoch.current !== epoch) return;
    let selected =
      picked.current >= 0
        ? nodeAtLevel(engine.tables.labels, picked.current, value)
        : null;
    if (selected === null && current.current.selected !== null) {
      let node = data.nodes.get(current.current.selected);
      while (node && node.scene_level > value)
        node = data.nodes.get(node.parent_id);
      if (node?.scene_level === value) selected = node.id;
    }
    dispatch({ type: 'level', level: value, selected });
  }
  async function play(query: SceneQuery, startStep = 0) {
    cancel();
    const epoch = manualEpoch.current;
    const engine = adapter.current;
    if (!engine || !data) return;
    picked.current = -1;
    dispatch({ type: 'start', query });
    const steps = directedSteps(query);
    for (let index = startStep; index < steps.length; index++) {
      const step = steps[index],
        node = data.nodes.get(step.node);
      if (!node) continue;
      await engine.tables.level(
        node.scene_level,
        current.current.view === 'ai',
      );
      if (epoch !== manualEpoch.current) return;
      // Frame the current object, never jump to the saved final close-up first.
      await engine.frameNode(
        node.id,
        query.camera,
        step.context ?? (index === 0 ? 1.65 : 2),
        step.bounds,
      );
      if (epoch !== manualEpoch.current) return;
      dispatch({
        type: 'step',
        queryId: query.id,
        step: index,
        node,
        complete: index === steps.length - 1,
      });
      if (index < steps.length - 1) {
        await new Promise<void>((resolve) => {
          finishWait.current = resolve;
          timers.current.push(
            setTimeout(() => {
              finishWait.current = null;
              resolve();
            }, 2600),
          );
        });
        if (epoch !== manualEpoch.current) return;
      }
    }
  }
  playRef.current = (query) => {
    void play(query).catch(fail);
  };
  const query = data?.queries.find((query) => query.id === state.queryId);
  const disabled = status !== 'ready';
  function enter() {
    setExploring(true);
    if (status === 'idle' || status === 'error')
      setAttempt((value) => value + 1);
  }

  return (
    <div
      className={`room-experience ${exploring ? 'is-exploring' : ''}`}
      ref={container}
      data-scene-status={status}
      data-table-busy={tableBusy}
      data-view={state.view}
      data-level={state.level}
      data-selected={state.selected ?? ''}
      data-playing={state.playing}
    >
      <div className="room-stage">
        <img
          className={`room-poster ${status === 'ready' ? 'is-loaded' : ''}`}
          src="/scenes/room/installation-poster.webp"
          alt="A living room suspended in darkness, reconstructed as a field of light."
          width="1600"
          height="900"
          fetchPriority="high"
        />
        <div
          className="room-canvas"
          ref={host}
          style={{ opacity: status === 'ready' ? 1 : 0 }}
        />
        <div
          ref={hud}
          className="scene-hud"
          role="group"
          aria-label="Objects in the room"
        />
        <div
          className="view-switch"
          role="group"
          aria-label="Scene representation"
        >
          <button
            disabled={disabled}
            aria-pressed={state.view === 'human'}
            onClick={() => {
              cancel();
              dispatch({ type: 'view', view: 'human' });
            }}
          >
            Human
          </button>
          <span aria-hidden="true">/</span>
          <button
            disabled={disabled}
            aria-pressed={state.view === 'ai'}
            onClick={() => {
              cancel();
              dispatch({ type: 'view', view: 'ai' });
            }}
          >
            AI
          </button>
        </div>
        {status === 'ready' && (
          <FeatureDial
            level={state.level}
            disabled={disabled}
            onChange={(value) => void level(value).catch(fail)}
          />
        )}
        {mobile && (
          <button
            className="explore-button"
            disabled={status === 'loading'}
            onClick={() => {
              if (exploring) {
                cancel();
                setExploring(false);
              } else enter();
            }}
          >
            {exploring ? 'Done exploring ↗' : 'Explore the room ↗'}
          </button>
        )}
        {status !== 'ready' && (
          <div className="scene-loading" role="status">
            {status === 'error' ? (
              <>
                <p>{detail}</p>
                <button onClick={() => setAttempt((value) => value + 1)}>
                  Retry scene ↻
                </button>
              </>
            ) : (
              <span>
                {status === 'idle'
                  ? 'A different perspective is one click away.'
                  : 'Opening the room…'}
              </span>
            )}
          </div>
        )}
        {status === 'ready' && (
          <div className="scene-bottom">
            <span className="eyebrow">
              {state.view === 'ai'
                ? 'A field of relationships'
                : 'A room, remembered'}
              <span className="desktop-hint">
                {' '}
                · Move to stir · Drag to orbit · Scroll to zoom
              </span>
            </span>
            <div className="camera-controls">
              <button
                aria-label="Zoom in"
                onClick={() => adapter.current?.zoom(0.88)}
              >
                +
              </button>
              <button
                aria-label="Zoom out"
                onClick={() => adapter.current?.zoom(1.12)}
              >
                −
              </button>
              <button
                aria-label="Reset camera and selection"
                onClick={() => {
                  cancel();
                  picked.current = -1;
                  dispatch({ type: 'reset' });
                  adapter.current?.home();
                }}
              >
                ↺
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="query-summary">
        {query && (
          <div className="query-replay" aria-live="polite">
            <p>“{query.text}”</p>
            <div className="query-steps eyebrow">
              {query.terms.map((term, index) => (
                <button
                  key={`${index}-${term}`}
                  className={index === state.step ? 'current' : ''}
                  onClick={() => void play(query, index).catch(fail)}
                >
                  {index + 1}. {term}
                </button>
              ))}
              <span>
                {state.complete
                  ? 'A detail, found'
                  : state.playing
                    ? 'Exploring…'
                    : 'Paused'}
              </span>
              {state.playing && <button onClick={cancel}>Stop</button>}
            </div>
          </div>
        )}
        <p className="query-note eyebrow">
          <a
            className="lego-credit"
            href="https://pz0826.github.io/LEGO-Webpage/"
          >
            <span>powered by</span>
            <img src="/media/lego-logo.png" alt="LEGO" width="57" height="20" />
            <svg className="link-arrow" viewBox="0 0 20 20" aria-hidden="true">
              <path className="arrow-stem" d="M4 16L14 6" />
              <path className="arrow-head" d="M7 6H14V13" />
            </svg>
          </a>
        </p>
      </div>
    </div>
  );
}
