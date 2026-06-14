import type { CSSProperties } from 'react';
import { FlowField, type FlowFieldOptions } from './backdrops/flow-field';
import { GlyphRain, type GlyphRainOptions } from './backdrops/glyph-rain';
import { KyotoPetals, type KyotoPetalsOptions } from './backdrops/kyoto-petals';
import { LiquidAurora, type LiquidAuroraOptions } from './backdrops/liquid-aurora';
import {
  MidnightMeteor,
  type MidnightMeteorOptions,
} from './backdrops/midnight-meteor';
import { TidalDrift, type TidalDriftOptions } from './backdrops/tidal-drift';
import { WireMesa, type WireMesaOptions } from './backdrops/wire-mesa';

export type BackdropName =
  | 'midnight-meteor'
  | 'kyoto-petals'
  | 'liquid-aurora'
  | 'tidal-drift'
  | 'wire-mesa'
  | 'flow-field'
  | 'glyph-rain';

/** Map of `name` → per-backdrop options. Each entry's `props` field is
 *  narrowed automatically when you set `name` on `<Backdrop>`. */
export interface BackdropOptionsMap {
  'midnight-meteor': MidnightMeteorOptions;
  'kyoto-petals': KyotoPetalsOptions;
  'liquid-aurora': LiquidAuroraOptions;
  'tidal-drift': TidalDriftOptions;
  'wire-mesa': WireMesaOptions;
  'flow-field': FlowFieldOptions;
  'glyph-rain': GlyphRainOptions;
}

/** Fields shared by every backdrop variant. */
interface BackdropCommonProps {
  /** Deterministic seed; same seed → same layout. */
  seed?: number;
  /** Optional class on the wrapper. */
  className?: string;
  /** Optional inline styles on the wrapper. */
  style?: CSSProperties;
}

/**
 * Discriminated union over `name`. TypeScript narrows the shape of `props`
 * the moment you pick a name, so e.g.:
 *
 *   <Backdrop name="liquid-aurora" props={{ palette: 'sunset' }} />
 *
 * autocompletes `palette` / `blobCount` / etc., but rejects a key like
 * `density` that belongs to a different backdrop.
 */
export type BackdropProps = {
  [K in BackdropName]: BackdropCommonProps & {
    name: K;
    /** Per-backdrop knobs. See the README for each backdrop's reference. */
    props?: BackdropOptionsMap[K];
  };
}[BackdropName];

/**
 * Drop-in scenic backdrop. Fills its nearest positioned ancestor —
 * wrap it in a `position: relative` container.
 */
export function Backdrop(props: BackdropProps) {
  const { name, seed, className, style } = props;
  // `props.props` is narrowed per `name`; the dedicated components each
  // accept their own options as flat props, so we spread.
  switch (name) {
    case 'midnight-meteor':
      return (
        <MidnightMeteor
          seed={seed}
          className={className}
          style={style}
          {...(props.props ?? {})}
        />
      );
    case 'kyoto-petals':
      return (
        <KyotoPetals
          seed={seed}
          className={className}
          style={style}
          {...(props.props ?? {})}
        />
      );
    case 'liquid-aurora':
      return (
        <LiquidAurora
          seed={seed}
          className={className}
          style={style}
          {...(props.props ?? {})}
        />
      );
    case 'tidal-drift':
      return (
        <TidalDrift
          seed={seed}
          className={className}
          style={style}
          {...(props.props ?? {})}
        />
      );
    case 'wire-mesa':
      return (
        <WireMesa
          seed={seed}
          className={className}
          style={style}
          {...(props.props ?? {})}
        />
      );
    case 'flow-field':
      return (
        <FlowField
          seed={seed}
          className={className}
          style={style}
          {...(props.props ?? {})}
        />
      );
    case 'glyph-rain':
      return (
        <GlyphRain
          seed={seed}
          className={className}
          style={style}
          {...(props.props ?? {})}
        />
      );
    default:
      return null;
  }
}
