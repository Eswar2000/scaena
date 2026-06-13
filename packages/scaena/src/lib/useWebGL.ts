import { useEffect, useRef } from 'react';

export interface WebGLFrameContext {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  /** CSS pixel width of the canvas. */
  width: number;
  /** CSS pixel height of the canvas. */
  height: number;
  /** Seconds since the renderer started (excludes paused-tab time). */
  time: number;
  /** Seconds since the previous frame (clamped). */
  delta: number;
  /** True when the user prefers reduced motion. */
  reducedMotion: boolean;
}

export interface UseWebGLOptions {
  /** GLSL ES 1.0 fragment shader source. Must define `void main()` and write `gl_FragColor`. */
  fragmentShader: string;
  /**
   * Optional per-frame uniforms. Built-in uniforms (uResolution, uTime, uReducedMotion)
   * are always set automatically — only use this for custom uniforms.
   */
  uniforms?: (frame: WebGLFrameContext) => Record<string, number | readonly number[]>;
  /** Cap on devicePixelRatio for performance. Default 1.5 — keeps mid-tier laptops smooth. */
  maxDpr?: number;
  /** Dependencies that should trigger a re-init. */
  deps?: unknown[];
}

// Single full-screen triangle in NDC. After clipping it perfectly covers the viewport,
// and uses 1 fewer vertex than a quad (3 vs 4) — the standard fullscreen-shader trick.
const VERTEX_SHADER = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('[backdrops] gl.createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`[backdrops] shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, fragmentSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('[backdrops] gl.createProgram failed');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`[backdrops] program link error: ${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

/**
 * Mounts a WebGL canvas with:
 *   - HiDPI scaling (capped via maxDpr for performance)
 *   - ResizeObserver for crisp resizes
 *   - requestAnimationFrame loop
 *   - Pause on tab hidden
 *   - prefers-reduced-motion awareness (draws a single frozen frame)
 *   - Built-in uTime, uResolution, uReducedMotion uniforms
 *   - Optional caller-supplied uniforms
 */
export function useWebGL({
  fragmentShader,
  uniforms,
  maxDpr = 1.5,
  deps = [],
}: UseWebGLOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const uniformsRef = useRef(uniforms);
  uniformsRef.current = uniforms;

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are forwarded by the caller
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
    if (!gl) {
      console.warn('[backdrops] WebGL unavailable; backdrop will not render.');
      return;
    }

    let program: WebGLProgram;
    try {
      program = createProgram(gl, fragmentShader);
    } catch (err) {
      console.error(err);
      return;
    }

    // Fullscreen triangle
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Cache uniform locations
    const uniformLocations = new Map<string, WebGLUniformLocation | null>();
    const getLoc = (name: string) => {
      let loc = uniformLocations.get(name);
      if (loc === undefined) {
        loc = gl.getUniformLocation(program, name);
        uniformLocations.set(name, loc);
      }
      return loc;
    };

    const setUniform = (name: string, value: number | readonly number[]) => {
      const loc = getLoc(name);
      if (!loc) return;
      if (typeof value === 'number') {
        gl.uniform1f(loc, value);
      } else if (value.length === 2) {
        gl.uniform2f(loc, value[0] ?? 0, value[1] ?? 0);
      } else if (value.length === 3) {
        gl.uniform3f(loc, value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
      } else if (value.length === 4) {
        gl.uniform4f(loc, value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 0);
      }
    };

    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = reducedQuery.matches;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    let cssWidth = 0;
    let cssHeight = 0;
    let rafId = 0;
    const startTime = performance.now();
    let lastFrame = startTime;
    let pausedDuration = 0;
    let hiddenAt: number | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      cssWidth = Math.max(1, Math.floor(rect.width));
      cssHeight = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const drawFrame = () => {
      const now = performance.now();
      const time = (now - startTime - pausedDuration) / 1000;
      const delta = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      // Built-in uniforms
      setUniform('uResolution', [canvas.width, canvas.height]);
      setUniform('uTime', time);
      setUniform('uReducedMotion', reducedMotion ? 1 : 0);

      // Caller-supplied uniforms
      const user = uniformsRef.current?.({
        gl,
        program,
        width: cssWidth,
        height: cssHeight,
        time,
        delta,
        reducedMotion,
      });
      if (user) {
        for (const name in user) {
          const value = user[name];
          if (value !== undefined) setUniform(name, value);
        }
      }

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = () => {
      drawFrame();
      rafId = requestAnimationFrame(loop);
    };

    const start = () => {
      cancelAnimationFrame(rafId);
      lastFrame = performance.now();
      if (reducedMotion) {
        drawFrame();
      } else {
        rafId = requestAnimationFrame(loop);
      }
    };

    resize();
    start();

    const ro = new ResizeObserver(() => {
      resize();
      if (reducedMotion) drawFrame();
    });
    ro.observe(canvas);

    const onVis = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        cancelAnimationFrame(rafId);
      } else if (hiddenAt !== null) {
        pausedDuration += performance.now() - hiddenAt;
        hiddenAt = null;
        start();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
      start();
    };
    reducedQuery.addEventListener('change', onMotionChange);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      reducedQuery.removeEventListener('change', onMotionChange);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, deps);

  return canvasRef;
}
