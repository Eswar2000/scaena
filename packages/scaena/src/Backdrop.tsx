import type { CSSProperties } from 'react';
import { Aurora } from './backdrops/aurora';
import { DeepOcean } from './backdrops/deep-ocean';
import { KyotoPetals } from './backdrops/kyoto-petals';
import { MidnightMeteor } from './backdrops/midnight-meteor';

export type BackdropName = 'midnight-meteor' | 'kyoto-petals' | 'aurora' | 'deep-ocean';

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
    case 'aurora':
      return <Aurora seed={seed} className={className} style={style} />;
    case 'deep-ocean':
      return <DeepOcean seed={seed} className={className} style={style} />;
    default:
      return null;
  }
}
