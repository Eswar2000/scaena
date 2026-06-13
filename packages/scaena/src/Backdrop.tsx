import type { CSSProperties } from 'react';
import { FlowField } from './backdrops/flow-field';
import { GlyphRain } from './backdrops/glyph-rain';
import { KyotoPetals } from './backdrops/kyoto-petals';
import { LiquidAurora } from './backdrops/liquid-aurora';
import { MidnightMeteor } from './backdrops/midnight-meteor';
import { TidalDrift } from './backdrops/tidal-drift';
import { WireMesa } from './backdrops/wire-mesa';

export type BackdropName =
  | 'midnight-meteor'
  | 'kyoto-petals'
  | 'liquid-aurora'
  | 'tidal-drift'
  | 'wire-mesa'
  | 'flow-field'
  | 'glyph-rain';

export interface BackdropProps {
  /** Which backdrop to render. */
  name: BackdropName;
  /** Deterministic seed; same seed → same layout. */
  seed?: number;
  /** Optional class on the wrapper. */
  className?: string;
  /** Optional inline styles on the wrapper. */
  style?: CSSProperties;
}

/**
 * Drop-in scenic backdrop. Fills its nearest positioned ancestor —
 * wrap it in a `position: relative` container.
 */
export function Backdrop({ name, seed, className, style }: BackdropProps) {
  switch (name) {
    case 'midnight-meteor':
      return <MidnightMeteor seed={seed} className={className} style={style} />;
    case 'kyoto-petals':
      return <KyotoPetals seed={seed} className={className} style={style} />;
    case 'liquid-aurora':
      return <LiquidAurora seed={seed} className={className} style={style} />;
    case 'tidal-drift':
      return <TidalDrift seed={seed} className={className} style={style} />;
    case 'wire-mesa':
      return <WireMesa seed={seed} className={className} style={style} />;
    case 'flow-field':
      return <FlowField seed={seed} className={className} style={style} />;
    case 'glyph-rain':
      return <GlyphRain seed={seed} className={className} style={style} />;
    default:
      return null;
  }
}
