import { useMemo, type CSSProperties } from 'react';
import { useCanvas } from '../../lib/useCanvas';
import { createMidnightMeteorRenderer, type MidnightMeteorOptions } from './renderer';

export type { MidnightMeteorOptions } from './renderer';

export interface MidnightMeteorProps extends MidnightMeteorOptions {
  seed?: number;
  className?: string;
  style?: CSSProperties;
}

const containerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  overflow: 'hidden',
};

const canvasStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};

export function MidnightMeteor({
  seed,
  className,
  style,
  sky,
  starDensity,
  meteorRate,
  nebula,
  vignette,
}: MidnightMeteorProps) {
  const renderer = useMemo(
    () =>
      createMidnightMeteorRenderer(seed ?? Math.floor(Math.random() * 2 ** 31), {
        sky,
        starDensity,
        meteorRate,
        nebula,
        vignette,
      }),
    // Options are baked into immutable scene structures (sprite caches, star
    // layout) at construction time, so we rebuild the renderer on any change.
    [seed, sky, starDensity, meteorRate, nebula, vignette],
  );

  const canvasRef = useCanvas({
    draw: renderer.draw,
    setup: renderer.setup,
    deps: [renderer],
  });

  return (
    <div className={className} style={{ ...containerStyle, ...style }} aria-hidden="true">
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}
