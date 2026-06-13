import { useEffect, useRef } from 'react';

export interface CanvasFrameContext {
  ctx: CanvasRenderingContext2D;
  /** CSS pixel width of the canvas. */
  width: number;
  /** CSS pixel height of the canvas. */
  height: number;
  /** Seconds since the renderer started (paused-time excluded). */
  time: number;
  /** Seconds since the previous frame (clamped). */
  delta: number;
  /** Devicepixelratio currently in use. */
  dpr: number;
  /** True when the user prefers reduced motion. */
  reducedMotion: boolean;
}

export interface UseCanvasOptions {
  /** Called once per frame to draw. */
  draw: (frame: CanvasFrameContext) => void;
  /** Optional setup hook, called when the canvas mounts or resizes. */
  setup?: (frame: Omit<CanvasFrameContext, 'time' | 'delta'>) => void;
  /** Dependencies that should trigger a re-init. */
  deps?: unknown[];
}

/**
 * Mounts a canvas with:
 *   - HiDPI scaling via devicePixelRatio
 *   - ResizeObserver for crisp resizes
 *   - requestAnimationFrame loop with delta time
 *   - Pause on tab hidden (Page Visibility API)
 *   - prefers-reduced-motion awareness (draws a single frame, no loop)
 */
export function useCanvas({ draw, setup, deps = [] }: UseCanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Hold the latest callbacks in refs so we don't re-init the loop on every render.
  const drawRef = useRef(draw);
  const setupRef = useRef(setup);
  drawRef.current = draw;
  setupRef.current = setup;

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are forwarded by the caller
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = reducedMotionQuery.matches;
    let dpr = window.devicePixelRatio || 1;
    let cssWidth = 0;
    let cssHeight = 0;
    let rafId = 0;
    let startTime = performance.now();
    let lastFrameTime = startTime;
    let pausedDuration = 0;
    let hiddenAt: number | null = null;

    const applySize = () => {
      const rect = canvas.getBoundingClientRect();
      cssWidth = Math.max(1, Math.floor(rect.width));
      cssHeight = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setupRef.current?.({ ctx, width: cssWidth, height: cssHeight, dpr, reducedMotion });
    };

    const drawOnce = () => {
      const now = performance.now();
      const time = (now - startTime - pausedDuration) / 1000;
      const delta = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      drawRef.current({
        ctx,
        width: cssWidth,
        height: cssHeight,
        time,
        delta,
        dpr,
        reducedMotion,
      });
    };

    const loop = () => {
      drawOnce();
      rafId = requestAnimationFrame(loop);
    };

    const start = () => {
      cancelAnimationFrame(rafId);
      lastFrameTime = performance.now();
      if (reducedMotion) {
        drawOnce();
      } else {
        rafId = requestAnimationFrame(loop);
      }
    };

    applySize();
    start();

    const ro = new ResizeObserver(() => {
      applySize();
      // Re-draw immediately so reduced-motion users see the new layout.
      if (reducedMotion) drawOnce();
    });
    ro.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        cancelAnimationFrame(rafId);
      } else if (hiddenAt !== null) {
        pausedDuration += performance.now() - hiddenAt;
        hiddenAt = null;
        start();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onMotionPrefChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      start();
    };
    reducedMotionQuery.addEventListener('change', onMotionPrefChange);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotionQuery.removeEventListener('change', onMotionPrefChange);
    };
  }, deps);

  return canvasRef;
}
