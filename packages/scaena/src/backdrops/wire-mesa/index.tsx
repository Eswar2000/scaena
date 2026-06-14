import { useMemo, type CSSProperties } from 'react';
import { useCanvas } from '../../lib/useCanvas';
import { createWireMesaRenderer, type WireMesaOptions } from './renderer';

export type { WireMesaOptions } from './renderer';

export interface WireMesaProps extends WireMesaOptions {
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

export function WireMesa({
  seed,
  className,
  style,
  palette,
  scrollSpeed,
  terrainHeight,
  fogDistance,
  cameraBob,
}: WireMesaProps) {
  const renderer = useMemo(
    () =>
      createWireMesaRenderer(seed ?? Math.floor(Math.random() * 2 ** 31), {
        palette,
        scrollSpeed,
        terrainHeight,
        fogDistance,
        cameraBob,
      }),
    // The terrain height map, background bake, and palette tables are all
    // computed at setup time, so any option change requires a full rebuild.
    [seed, palette, scrollSpeed, terrainHeight, fogDistance, cameraBob],
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
