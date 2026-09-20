import { useFeatureWheel } from '../../lib/scene/use-feature-wheel';

/** A finite five-detent thumbwheel, with a fixed index and moving etched ribs. */
export default function FeatureDial({
  level,
  disabled,
  onChange,
}: {
  level: number;
  disabled: boolean;
  onChange: (level: number) => void;
}) {
  const { host, step } = useFeatureWheel(level, disabled, onChange);
  return (
    <div className="feature-dial" role="group" aria-label="Scene granularity">
      <button
        className="dial-end"
        disabled={disabled || level === 1}
        aria-label="Coarser level"
        title="Whole objects · coarser"
        onClick={() => step(-1)}
      >
        <svg viewBox="0 0 24 32" aria-hidden="true">
          <path className="dial-arrow" d="m9 3 3-2 3 2" />
          <path d="M2 25 9 13l5 7 3-4 5 9H2Z M6.5 16.6l2.5 1.9 2.3-2.2" />
        </svg>
      </button>
      <div
        ref={host}
        className="dial-wheel"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Scene level"
        aria-orientation="vertical"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={level}
        aria-valuetext={`Level ${level} of 5, ${level === 1 ? 'whole objects' : level === 5 ? 'fine parts' : 'object parts'}`}
        aria-disabled={disabled}
        title="Drag or scroll to explore whole objects and fine parts"
      >
        <svg
          className="dial-ticks"
          viewBox="0 0 44 208"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {Array.from({ length: 51 }, (_, i) => i - 15).map((i) => (
            <line
              key={i}
              data-tick={i}
              data-level={
                i % 5 === 0 && i >= 0 && i <= 20 ? i / 5 + 1 : undefined
              }
              className={
                i % 5 === 0 && i >= 0 && i <= 20 ? 'major-tick' : undefined
              }
              x1={15}
              x2={29}
              y1={104}
              y2={104}
            />
          ))}
          <path className="dial-needle" d="m2 101 5 3-5 3 M37 104h5" />
        </svg>
      </div>
      <button
        className="dial-end dial-end-flower"
        disabled={disabled || level === 5}
        aria-label="Finer level"
        title="Fine parts · finer"
        onClick={() => step(1)}
      >
        <svg viewBox="0 0 24 32" aria-hidden="true">
          <g transform="translate(3 0) scale(.75)">
            <path d="M2 5c4 0 6 4 6 4l4-6 4 6s2-4 6-4v5c0 5-5 8-10 8S2 15 2 10V5Z M12 18v5" />
          </g>
          <path className="dial-arrow" d="m9 28 3 2 3-2" />
        </svg>
      </button>
    </div>
  );
}
