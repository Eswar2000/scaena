import type { BackdropId } from './backdrops';

/**
 * A single tweakable knob shown in the Customize panel. The `key` matches
 * the corresponding field on the backdrop's `*Options` type.
 *
 * `default` here is the *demo's "leave it alone" value*; when the user
 * matches the default, we omit the key from the emitted `props` so the
 * generated snippet stays tidy and matches the library's true defaults.
 */
export type NumberControl = {
  kind: 'number';
  key: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  default: number;
};

export type BooleanControl = {
  kind: 'boolean';
  key: string;
  label: string;
  hint?: string;
  default: boolean;
};

export type SelectControl = {
  kind: 'select';
  key: string;
  label: string;
  hint?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  default: string;
};

export type ColorControl = {
  kind: 'color';
  key: string;
  label: string;
  hint?: string;
  default: string;
};

export type TextControl = {
  kind: 'text';
  key: string;
  label: string;
  hint?: string;
  default: string;
  maxLength?: number;
};

/** A pair of number sliders bound to a `[min, max]` tuple field. */
export type RangeTupleControl = {
  kind: 'range-tuple';
  key: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  default: [number, number];
};

export type PropControl =
  | NumberControl
  | BooleanControl
  | SelectControl
  | ColorControl
  | TextControl
  | RangeTupleControl;

/**
 * Controls available per backdrop. Backdrops not listed (or listed as `[]`)
 * have no tweakable props yet — the panel will show a friendly "coming soon".
 */
export const PROP_SCHEMAS: Record<BackdropId, ReadonlyArray<PropControl>> = {
  'liquid-aurora': [
    {
      kind: 'select',
      key: 'palette',
      label: 'palette',
      hint: 'named color preset for the aurora blobs',
      default: 'aurora',
      options: [
        { value: 'aurora', label: 'aurora' },
        { value: 'sunset', label: 'sunset' },
        { value: 'oceanic', label: 'oceanic' },
        { value: 'plasma', label: 'plasma' },
      ],
    },
    {
      kind: 'number',
      key: 'blobCount',
      label: 'blobCount',
      hint: 'how many ribbons drift on screen',
      min: 1,
      max: 12,
      step: 1,
      default: 6,
    },
    {
      kind: 'number',
      key: 'blobScale',
      label: 'blobScale',
      hint: 'radius multiplier per blob',
      min: 0.3,
      max: 2.5,
      step: 0.05,
      default: 1,
    },
    {
      kind: 'number',
      key: 'speed',
      label: 'speed',
      hint: 'animation speed multiplier',
      min: 0,
      max: 3,
      step: 0.05,
      default: 1,
    },
    {
      kind: 'boolean',
      key: 'vignette',
      label: 'vignette',
      hint: 'dark radial fade around the edges',
      default: true,
    },
  ],

  'kyoto-petals': [
    {
      kind: 'select',
      key: 'sky',
      label: 'sky',
      hint: 'atmospheric preset (gradient + sun glow + mist)',
      default: 'kyoto',
      options: [
        { value: 'kyoto', label: 'kyoto' },
        { value: 'twilight', label: 'twilight' },
        { value: 'midnight', label: 'midnight' },
      ],
    },
    {
      kind: 'number',
      key: 'density',
      label: 'density',
      hint: 'particle-count multiplier (capped at 250)',
      min: 0.1,
      max: 2,
      step: 0.05,
      default: 1,
    },
    {
      kind: 'number',
      key: 'wind',
      label: 'wind',
      hint: 'horizontal drift multiplier',
      min: 0,
      max: 3,
      step: 0.05,
      default: 1,
    },
    {
      kind: 'number',
      key: 'fallSpeed',
      label: 'fallSpeed',
      hint: 'vertical fall-speed multiplier',
      min: 0.1,
      max: 3,
      step: 0.05,
      default: 1,
    },
  ],

  'glyph-rain': [
    {
      kind: 'text',
      key: 'glyphs',
      label: 'glyphs',
      hint: 'character set drawn in each column',
      maxLength: 96,
      default: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789Z',
    },
    {
      kind: 'number',
      key: 'cellSize',
      label: 'cellSize',
      hint: 'pixel size of each glyph cell',
      min: 8,
      max: 40,
      step: 1,
      default: 18,
    },
    {
      kind: 'number',
      key: 'density',
      label: 'density',
      hint: 'fraction of columns that have a running stream',
      min: 0.05,
      max: 1,
      step: 0.05,
      default: 0.55,
    },
    {
      kind: 'range-tuple',
      key: 'speedRange',
      label: 'speedRange',
      hint: 'min/max cells-per-second per column',
      min: 1,
      max: 30,
      step: 0.5,
      default: [5, 13],
    },
    {
      kind: 'number',
      key: 'trailLength',
      label: 'trailLength',
      hint: 'trail persistence: 0 snappy, 1 very long',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.55,
    },
    {
      kind: 'color',
      key: 'headColor',
      label: 'headColor',
      hint: 'color of the leading glyph in each column',
      default: '#d8ffe6',
    },
    {
      kind: 'color',
      key: 'bodyColor',
      label: 'bodyColor',
      hint: 'color of the trailing body glyphs',
      default: '#22e26b',
    },
  ],

  // Backdrops without exposed knobs yet — the panel handles these gracefully.
  'midnight-meteor': [],
  'tidal-drift': [],
  'wire-mesa': [],
  'flow-field': [],
};

/** All currently-set values for a backdrop, keyed by control `key`. */
export type PropsValues = Record<string, unknown>;

/**
 * Strip values that equal their schema default. Keeps the emitted `props`
 * object minimal — and matches what the library would do with no input.
 */
export function pruneDefaults(
  backdrop: BackdropId,
  values: PropsValues,
): PropsValues {
  const schema = PROP_SCHEMAS[backdrop];
  const out: PropsValues = {};
  for (const ctrl of schema) {
    const v = values[ctrl.key];
    if (v === undefined) continue;
    if (isDefault(ctrl, v)) continue;
    out[ctrl.key] = v;
  }
  return out;
}

function isDefault(ctrl: PropControl, value: unknown): boolean {
  if (ctrl.kind === 'range-tuple') {
    const v = value as [number, number] | undefined;
    return (
      Array.isArray(v) &&
      v.length === 2 &&
      v[0] === ctrl.default[0] &&
      v[1] === ctrl.default[1]
    );
  }
  return value === ctrl.default;
}

/**
 * Render a `props` object literal as the source you'd write yourself.
 * Single-line for ≤1 key, multi-line otherwise. Returns `''` if empty.
 */
export function formatPropsLiteral(props: PropsValues, indent = '      '): string {
  const keys = Object.keys(props);
  if (keys.length === 0) return '';
  if (keys.length === 1) {
    const k = keys[0] as string;
    return `{ ${k}: ${formatValue(props[k])} }`;
  }
  const lines = keys.map((k) => `${indent}  ${k}: ${formatValue(props[k])},`);
  return `{\n${lines.join('\n')}\n${indent}}`;
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  return JSON.stringify(v);
}
