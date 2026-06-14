'use client';

import { useCallback, useId, useState } from 'react';
import { getBackdrop, type BackdropId } from '../_lib/backdrops';
import {
  PROP_SCHEMAS,
  type PropControl,
  type PropsValues,
} from '../_lib/backdropPropsSchema';
import { Dropdown } from './Dropdown';

type Props = {
  /** Backdrop being tweaked. */
  active: BackdropId;
  /** Current values for that backdrop (raw, including defaults). */
  values: PropsValues;
  /** Fired whenever the user changes any control. */
  onChange: (values: PropsValues) => void;
  /** Reset the active backdrop's values to library defaults (clear all keys). */
  onReset: () => void;
};

/**
 * A collapsible panel that renders one form control per `PROP_SCHEMAS[active]`
 * entry. Tints itself with the active backdrop's chip theme so it feels part
 * of the scene rather than a foreign overlay.
 */
export function PropsPanel({ active, values, onChange, onReset }: Props) {
  const schema = PROP_SCHEMAS[active];
  const theme = getBackdrop(active).chip;
  const [open, setOpen] = useState(false);

  const setValue = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...values, [key]: value });
    },
    [onChange, values],
  );

  const hasTweaks = Object.keys(values).length > 0;
  const noControls = schema.length === 0;
  const panelId = useId();

  return (
    <div className="w-full max-w-xl">
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur transition focus:outline-none focus-visible:ring-2 ${theme.surface}`}
        >
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full transition-colors ${
              hasTweaks ? 'bg-emerald-300' : 'bg-white/30'
            }`}
          />
          {open ? 'Hide tweaks' : 'Customize'}
          {hasTweaks && !open && (
            <span className={`text-[10px] uppercase tracking-[0.18em] ${theme.accent}`}>
              {Object.keys(values).length} edited
            </span>
          )}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {hasTweaks && (
          <button
            type="button"
            onClick={onReset}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur transition focus:outline-none focus-visible:ring-2 ${theme.surface}`}
          >
            Reset
          </button>
        )}
      </div>

      {open && (
        <div
          id={panelId}
          className={`mt-3 rounded-2xl border p-4 text-left backdrop-blur ${theme.popup}`}
        >
          {noControls ? (
            <p className="px-1 py-3 text-center text-xs text-white/65">
              No tweaks for this backdrop yet — more coming soon.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
              {schema.map((ctrl) => (
                <ControlField
                  key={ctrl.key}
                  control={ctrl}
                  value={values[ctrl.key]}
                  accent={theme.accent}
                  onChange={(v) => setValue(ctrl.key, v)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type FieldProps = {
  control: PropControl;
  value: unknown;
  accent: string;
  onChange: (next: unknown) => void;
};

function ControlField({ control, value, accent, onChange }: FieldProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={`text-xs font-medium ${accent}`}>
          {control.label}
        </label>
        <FieldValueBadge control={control} value={value} />
      </div>
      <FieldInput id={id} control={control} value={value} onChange={onChange} />
      {control.hint && (
        <p className="text-[10px] leading-snug text-white/45">{control.hint}</p>
      )}
    </div>
  );
}

function FieldValueBadge({
  control,
  value,
}: {
  control: PropControl;
  value: unknown;
}) {
  if (value === undefined) {
    return (
      <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">
        default
      </span>
    );
  }
  if (control.kind === 'range-tuple') {
    const v = (value ?? control.default) as [number, number];
    return (
      <span className="font-mono text-[10px] text-white/70">
        {v[0]}–{v[1]}
      </span>
    );
  }
  if (control.kind === 'boolean') {
    return (
      <span className="font-mono text-[10px] text-white/70">
        {String(value)}
      </span>
    );
  }
  if (control.kind === 'color') {
    return (
      <span className="font-mono text-[10px] text-white/70">{String(value)}</span>
    );
  }
  if (control.kind === 'number') {
    return (
      <span className="font-mono text-[10px] text-white/70">{String(value)}</span>
    );
  }
  if (control.kind === 'select') {
    return (
      <span className="font-mono text-[10px] text-white/70">{String(value)}</span>
    );
  }
  // text — value is shown in its own input
  return null;
}

function FieldInput({
  id,
  control,
  value,
  onChange,
}: {
  id: string;
  control: PropControl;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  switch (control.kind) {
    case 'number': {
      const v = (typeof value === 'number' ? value : control.default) as number;
      return (
        <input
          id={id}
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
        />
      );
    }
    case 'boolean': {
      const v = typeof value === 'boolean' ? value : control.default;
      return (
        <label
          htmlFor={id}
          className="inline-flex w-fit cursor-pointer items-center gap-2 text-xs text-white/80"
        >
          <input
            id={id}
            type="checkbox"
            checked={v}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-white"
          />
          <span>{v ? 'on' : 'off'}</span>
        </label>
      );
    }
    case 'select': {
      const v = (typeof value === 'string' ? value : control.default) as string;
      return (
        <Dropdown
          id={id}
          value={v}
          options={control.options}
          onChange={onChange}
          ariaLabel={control.label}
        />
      );
    }
    case 'color': {
      const v = (typeof value === 'string' ? value : control.default) as string;
      return (
        <input
          id={id}
          type="color"
          value={v}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-full cursor-pointer rounded-md border border-white/15 bg-black/40 p-0.5"
        />
      );
    }
    case 'text': {
      const v = (typeof value === 'string' ? value : control.default) as string;
      return (
        <input
          id={id}
          type="text"
          value={v}
          maxLength={control.maxLength}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 font-mono text-[11px] text-white outline-none focus:border-white/40"
          spellCheck={false}
        />
      );
    }
    case 'range-tuple': {
      const v = (Array.isArray(value) ? value : control.default) as [
        number,
        number,
      ];
      const setMin = (next: number) => {
        const clamped = Math.min(next, v[1]);
        onChange([clamped, v[1]]);
      };
      const setMax = (next: number) => {
        const clamped = Math.max(next, v[0]);
        onChange([v[0], clamped]);
      };
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 text-[10px] uppercase tracking-wider text-white/45">
              min
            </span>
            <input
              id={id}
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={v[0]}
              onChange={(e) => setMin(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-7 text-[10px] uppercase tracking-wider text-white/45">
              max
            </span>
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={v[1]}
              onChange={(e) => setMax(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
            />
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
