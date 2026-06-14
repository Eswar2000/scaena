import { useMemo, type CSSProperties } from 'react';
import { useCanvas } from '../../lib/useCanvas';
import { createLiquidAuroraRenderer, type LiquidAuroraOptions } from './renderer';

export type { LiquidAuroraOptions } from './renderer';

export interface LiquidAuroraProps extends LiquidAuroraOptions {
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

export function LiquidAurora({
  seed,
  className,
  style,
  blobCount,
  speed,
  blobScale,
  palette,
  vignette,
}: LiquidAuroraProps) {
  const renderer = useMemo(
    () =>
      createLiquidAuroraRenderer(seed ?? Math.floor(Math.random() * 2 ** 31), {
        blobCount,
        speed,
        blobScale,
        palette,
        vignette,
      }),
    // Reinitialising on every option change is intentional: scene generation
    // (blob layout, sprite cache) bakes options into immutable structures.
    [seed, blobCount, speed, blobScale, palette, vignette],
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
