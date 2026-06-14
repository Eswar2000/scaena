import { useMemo, type CSSProperties } from 'react';
import { useCanvas } from '../../lib/useCanvas';
import { createTidalDriftRenderer, type TidalDriftOptions } from './renderer';

export type { TidalDriftOptions } from './renderer';

export interface TidalDriftProps extends TidalDriftOptions {
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

export function TidalDrift({
  seed,
  className,
  style,
  palette,
  waveSpeed,
  cloudOpacity,
  vignette,
}: TidalDriftProps) {
  const renderer = useMemo(
    () =>
      createTidalDriftRenderer(seed ?? Math.floor(Math.random() * 2 ** 31), {
        palette,
        waveSpeed,
        cloudOpacity,
        vignette,
      }),
    // Background gradient stops and sprite caches are keyed on the resolved
    // options, so a rebuild is required when any of them change.
    [seed, palette, waveSpeed, cloudOpacity, vignette],
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
