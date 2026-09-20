import type { CSSProperties } from 'react';

/** Semantic granularity, expressed as a lens scale rather than geometry LOD. */
export default function FeatureDial({
  level,
  disabled,
  onChange,
}: {
  level: number;
  disabled: boolean;
  onChange: (level: number) => void;
}) {
  return (
    <div
      className="feature-dial"
      role="group"
      aria-label="Feature granularity"
      style={{ '--level-position': `${(level - 1) * 25}%` } as CSSProperties}
    >
      <span className="eyebrow">Feature</span>
      <span className="dial-end">Whole</span>
      <div className="dial-scale">
        <div className="dial-ticks" aria-hidden="true" />
        <i className="dial-needle" aria-hidden="true" />
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          value={level}
          disabled={disabled}
          aria-label="Feature level"
          aria-orientation="vertical"
          aria-valuetext={`Level ${level} of 5, ${level === 1 ? 'whole objects' : level === 5 ? 'fine parts' : 'object parts'}`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className="dial-labels">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              disabled={disabled}
              aria-label={`Feature level ${value}`}
              aria-pressed={level === value}
              onClick={() => onChange(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <span className="dial-end">Parts</span>
    </div>
  );
}
