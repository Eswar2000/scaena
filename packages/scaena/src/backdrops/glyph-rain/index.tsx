import { useMemo, type CSSProperties } from 'react';
import { useCanvas } from '../../lib/useCanvas';
import { createGlyphRainRenderer, type GlyphRainOptions } from './renderer';

export type { GlyphRainOptions } from './renderer';

export interface GlyphRainProps extends GlyphRainOptions {
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

export function GlyphRain({
  seed,
  className,
  style,
  speedRange,
  density,
  trailLength,
  glyphs,
  cellSize,
  headColor,
  bodyColor,
}: GlyphRainProps) {
  const renderer = useMemo(
    () =>
      createGlyphRainRenderer(seed ?? Math.floor(Math.random() * 2 ** 31), {
        speedRange,
        density,
        trailLength,
        glyphs,
        cellSize,
        headColor,
        bodyColor,
      }),
    // Reinitialising on every option change is intentional: stream layout +
    // glyph alphabet bake the options into immutable per-instance state.
    [seed, speedRange, density, trailLength, glyphs, cellSize, headColor, bodyColor],
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
