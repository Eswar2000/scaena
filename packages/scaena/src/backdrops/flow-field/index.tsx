import { useMemo, type CSSProperties } from 'react';
import { useCanvas } from '../../lib/useCanvas';
import { createFlowFieldRenderer, type FlowFieldOptions } from './renderer';

export type { FlowFieldOptions } from './renderer';

export interface FlowFieldProps extends FlowFieldOptions {
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

export function FlowField({
  seed,
  className,
  style,
  palette,
  particleCount,
  speed,
  trailLength,
  lineWidth,
}: FlowFieldProps) {
  const renderer = useMemo(
    () =>
      createFlowFieldRenderer(seed ?? Math.floor(Math.random() * 2 ** 31), {
        palette,
        particleCount,
        speed,
        trailLength,
        lineWidth,
      }),
    // The particle pool, fade sprite, and palette are all baked at setup
    // time \u2014 options must rebuild the renderer to take effect.
    [seed, palette, particleCount, speed, trailLength, lineWidth],
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
