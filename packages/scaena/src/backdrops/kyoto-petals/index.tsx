import { useMemo, type CSSProperties } from 'react';
import { useCanvas } from '../../lib/useCanvas';
import { createKyotoPetalsRenderer, type KyotoPetalsOptions } from './renderer';

export type { KyotoPetalsOptions } from './renderer';

export interface KyotoPetalsProps extends KyotoPetalsOptions {
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

export function KyotoPetals({
  seed,
  className,
  style,
  density,
  wind,
  fallSpeed,
  sky,
  palette,
}: KyotoPetalsProps) {
  const renderer = useMemo(
    () =>
      createKyotoPetalsRenderer(seed ?? Math.floor(Math.random() * 2 ** 31), {
        density,
        wind,
        fallSpeed,
        sky,
        palette,
      }),
    // Reinitialising on every option change is intentional: petal layout +
    // sprite cache bake the options into immutable structures.
    [seed, density, wind, fallSpeed, sky, palette],
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
