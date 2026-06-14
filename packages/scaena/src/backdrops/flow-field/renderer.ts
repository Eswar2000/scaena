import { createPrng } from '../../lib/prng';
import type { CanvasFrameContext } from '../../lib/useCanvas';

/* ─────────────────────────────────────────────────────────────────────────
 * flow-field
 *
 * Thousands of particles advected through a slowly-evolving vector field,
 * each leaving a fading trail behind it. Reads as ink curling through water.
 *
 * Composition per frame:
 *   1. Low-alpha bg rect (dims existing trails toward deep navy)
 *   2. For every particle: sample angle = f(x, y, t), advance, and add a
 *      segment from its previous position to the new one into a per-colour
 *      Path2D. Five strokes total (one per palette colour) for ~2400
 *      particles — extremely cheap.
 *
 * The vector field is a sum of four rotating sine waves — smooth in x, y,
 * and t. Not divergence-free (so there are mild sinks/sources), but that's
 * exactly the feel ink-in-water has anyway.
 * ───────────────────────────────────────────────────────────────────────── */

const DEFAULT_PARTICLE_COUNT = 2400;

/* ── Field ── */
const ANGLE_TURNS = 1.5; // how many full rotations across the field's [-1,1] output
const FIELD_TIME_SCALE = 1.0; // multiplier on time passed into the field

/* ── Particle motion ── */
const DEFAULT_SPEED_BASE = 28; // CSS px / sec
const SPEED_VARIANCE = 12; // +/- per particle
const LIFETIME_MIN = 3.0;
const LIFETIME_MAX = 9.0;

/* ── Trail look ── */
const DEFAULT_FADE_ALPHA_CENTER = 0.045; // per-frame fade strength at canvas centre (lower = longer trails)
const FADE_ALPHA_EDGE = 0.44; // per-frame fade strength at the very edge (higher = harder edge vignette)
const EDGE_MARGIN = 90; // px past the canvas a particle can drift before being respawned in the interior
const BG_FADE_RGB = '6, 8, 20';
const DEFAULT_LINE_WIDTH = 1.05;

/* ── Palette ── */
const BG_BASE = '#04050d'; // initial canvas wash before any particles

/** Named ink palettes. Each preset bundles RGB stops + their per-stroke alphas. */
interface InkPalette {
  colors: ReadonlyArray<[number, number, number]>;
  alphas: ReadonlyArray<number>;
}
const INK_PALETTES: Record<'aurora' | 'inferno' | 'ocean', InkPalette> = {
  aurora: {
    // Default — cool dominant with two warm accents for life.
    colors: [
      [120, 220, 255], // cyan
      [180, 130, 255], // violet
      [255, 235, 200], // warm white
      [255, 130, 200], // pink
      [110, 255, 210], // mint
    ],
    alphas: [0.55, 0.5, 0.7, 0.45, 0.5],
  },
  inferno: {
    // Coal-to-ember warm palette — deep red, orange, gold, peach, hot pink.
    colors: [
      [255, 120, 60],
      [255, 80, 100],
      [255, 200, 90],
      [255, 230, 180],
      [255, 60, 160],
    ],
    alphas: [0.55, 0.5, 0.65, 0.7, 0.45],
  },
  ocean: {
    // All-cool blues, teals, and soft greens — like deep current trails.
    colors: [
      [80, 180, 230],
      [60, 220, 200],
      [120, 240, 255],
      [40, 100, 200],
      [180, 250, 240],
    ],
    alphas: [0.55, 0.5, 0.65, 0.45, 0.5],
  },
};

interface Particle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  speed: number;
  age: number;
  lifetime: number;
  colorIdx: number;
}

interface FieldPhases {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface FlowFieldOptions {
  /** Ink palette. Default `'aurora'`. */
  palette?: 'aurora' | 'inferno' | 'ocean';
  /** Total particle count. Default 2400. */
  particleCount?: number;
  /** Particle speed multiplier. Default 1. */
  speed?: number;
  /** Trail persistence (0 = snappy, 1 = very long). Default 0.5. */
  trailLength?: number;
  /** Stroke width in CSS px. Default 1.05. */
  lineWidth?: number;
}

export function createFlowFieldRenderer(seed: number, options: FlowFieldOptions = {}) {
  const rand = createPrng(seed);

  const palette = INK_PALETTES[options.palette ?? 'aurora'] ?? INK_PALETTES.aurora;
  const particleCount = Math.max(50, Math.round(options.particleCount ?? DEFAULT_PARTICLE_COUNT));
  const speedMult = Math.max(0, options.speed ?? 1);
  // Map user-facing trail length (0 longer = longer trails) to internal fade alpha.
  // Default 0.5 → fade ≈ DEFAULT_FADE_ALPHA_CENTER for back-compat with the original look.
  const trailLength = Math.min(1, Math.max(0, options.trailLength ?? 0.5));
  const fadeAlphaCenter = Math.max(0.004, DEFAULT_FADE_ALPHA_CENTER * (1.4 - trailLength * 1.8));
  const fadeAlphaEdge = Math.max(fadeAlphaCenter, FADE_ALPHA_EDGE * (1.2 - trailLength * 0.6));
  const lineWidth = Math.max(0.2, options.lineWidth ?? DEFAULT_LINE_WIDTH);

  // Fixed phase offsets so seeded layouts are reproducible and each instance
  // gets a slightly different field shape.
  const phases: FieldPhases = {
    a: rand() * Math.PI * 2,
    b: rand() * Math.PI * 2,
    c: rand() * Math.PI * 2,
    d: rand() * Math.PI * 2,
  };

  let cssW = 0;
  let cssH = 0;
  let primed = false; // first draw call wipes to BG_BASE so trails build from black
  let fadeSprite: HTMLCanvasElement | null = null; // per-frame fade-to-bg with edge vignette
  const particles: Particle[] = [];

  /** Smooth sum-of-sines field; returns a scalar in ~[-1, 1]. */
  function fieldValue(x: number, y: number, t: number): number {
    const tt = t * FIELD_TIME_SCALE;
    const s1 = Math.sin(x * 0.0042 + y * 0.0019 + tt * 0.21 + phases.a);
    const s2 = Math.sin(x * 0.0021 - y * 0.0033 + tt * 0.13 + phases.b);
    const s3 = Math.sin((x + y) * 0.0028 + tt * 0.17 + phases.c);
    const s4 = Math.sin((x - y) * 0.0038 + tt * 0.09 + phases.d);
    return (s1 + s2 + s3 + s4) * 0.25;
  }

  function angleAt(x: number, y: number, t: number): number {
    return fieldValue(x, y, t) * Math.PI * ANGLE_TURNS;
  }

  function spawnAt(p: Particle, x: number, y: number): void {
    p.x = x;
    p.y = y;
    p.prevX = x;
    p.prevY = y;
    p.age = 0;
    p.lifetime = LIFETIME_MIN + rand() * (LIFETIME_MAX - LIFETIME_MIN);
    // Per-particle speed varies around the base; whole pool then scaled by speedMult.
    p.speed = (DEFAULT_SPEED_BASE + (rand() * 2 - 1) * SPEED_VARIANCE) * speedMult;
    p.colorIdx = Math.floor(rand() * palette.colors.length);
  }

  /** Pick a respawn coordinate distributed across the full canvas with a
   *  mild bias toward the edges. The vignette fade dims edge trails much
   *  faster than centre trails, which — if respawns were uniform or, worse,
   *  insetted — leaves a visible clump of bright trails in the middle. The
   *  bias here compensates: more trails are born near the edges so the
   *  *equilibrium* trail density (births vs. vignette decay) stays roughly
   *  uniform across the canvas. A tiny 2% inset keeps fresh trails from
   *  literally touching the border. */
  function spawnCoord(size: number): number {
    const u = rand();
    // Pull the distance-from-centre toward 1 (the edges). For a value
    // d ∈ [0, 1], d^p with p < 1 maps it closer to 1; with p > 1 it would
    // compress toward 0 (the centre). We want the former.
    const centered = u - 0.5; // [-0.5, 0.5]
    const dist = Math.abs(centered) * 2; // [0, 1] — 0 = centre, 1 = edge
    const stretched = dist ** 0.55; // biased toward 1 (edges)
    const fromCentre = Math.sign(centered) * stretched * 0.5; // [-0.5, 0.5]
    const out = 0.5 + fromCentre; // [0, 1]
    return (0.02 + out * 0.96) * size; // tiny 2% inset off the literal border
  }

  function newRandomParticle(): Particle {
    const p: Particle = {
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      speed: DEFAULT_SPEED_BASE,
      age: 0,
      lifetime: LIFETIME_MIN,
      colorIdx: 0,
    };
    spawnAt(p, rand() * cssW, rand() * cssH);
    // Spread initial ages across the lifetime range so respawns staggered.
    p.age = rand() * p.lifetime;
    return p;
  }

  function setup(frame: Omit<CanvasFrameContext, 'time' | 'delta'>): void {
    cssW = frame.width;
    cssH = frame.height;
    primed = false;
    bakeFadeSprite();
    particles.length = 0;
    for (let i = 0; i < particleCount; i++) {
      particles.push(newRandomParticle());
    }
  }

  /** Bake the per-frame fade-to-bg overlay as a radial gradient so trails
   *  decay much faster near the edges than at the centre. This produces a
   *  soft vignette of "trail darkness" so trails appear to dissolve into the
   *  void instead of clipping at hard borders. */
  function bakeFadeSprite(): void {
    fadeSprite = document.createElement('canvas');
    fadeSprite.width = Math.max(1, Math.round(cssW));
    fadeSprite.height = Math.max(1, Math.round(cssH));
    const g = fadeSprite.getContext('2d');
    if (!g) return;
    const cx = cssW * 0.5;
    const cy = cssH * 0.5;
    const cornerR = Math.hypot(cssW * 0.5, cssH * 0.5);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, cornerR);
    grad.addColorStop(0, `rgba(${BG_FADE_RGB}, ${fadeAlphaCenter})`);
    grad.addColorStop(0.55, `rgba(${BG_FADE_RGB}, ${(fadeAlphaCenter * 1.4).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${BG_FADE_RGB}, ${fadeAlphaEdge})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, cssW, cssH);
  }

  function draw(frame: CanvasFrameContext): void {
    const { ctx, time, delta, reducedMotion } = frame;

    // Prime the canvas with the base background colour on the first draw of
    // each (re)mount, so trails build on a clean dark void.
    if (!primed) {
      ctx.fillStyle = BG_BASE;
      ctx.fillRect(0, 0, cssW, cssH);
      primed = true;
    }

    // Fade existing trails toward the deep navy bg — stronger at the edges
    // (via baked radial-gradient sprite) so trails dissolve naturally into
    // the void instead of clipping at the canvas border.
    if (fadeSprite) {
      ctx.drawImage(fadeSprite, 0, 0, cssW, cssH);
    } else {
      ctx.fillStyle = `rgba(${BG_FADE_RGB}, ${fadeAlphaCenter})`;
      ctx.fillRect(0, 0, cssW, cssH);
    }

    if (reducedMotion) {
      // No motion: draw each particle as a single dim dot at its initial pos.
      ctx.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        const col = palette.colors[p.colorIdx] as [number, number, number];
        ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.35)`;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    // Build one Path2D per palette colour so we can batch into palette.colors.length
    // strokes regardless of particle count.
    const paths: Path2D[] = new Array(palette.colors.length);
    for (let i = 0; i < palette.colors.length; i++) paths[i] = new Path2D();

    const dt = Math.min(delta, 0.05); // safety clamp during long frame stalls

    for (const p of particles) {
      p.age += dt;
      if (p.age >= p.lifetime) {
        // Respawn across the full canvas with a mild edge bias so the
        // vignette doesn't visibly drain density toward the centre.
        spawnAt(p, spawnCoord(cssW), spawnCoord(cssH));
        continue;
      }

      const angle = angleAt(p.x, p.y, time);
      const nx = p.x + Math.cos(angle) * p.speed * dt;
      const ny = p.y + Math.sin(angle) * p.speed * dt;

      // If the particle has drifted well past the canvas (the margin gives
      // trails room to fade out gracefully near the edge before respawn),
      // respawn it instead of wrapping. This avoids the awkward "sudden
      // trail arrives at the opposite edge" effect.
      if (
        nx < -EDGE_MARGIN ||
        nx > cssW + EDGE_MARGIN ||
        ny < -EDGE_MARGIN ||
        ny > cssH + EDGE_MARGIN
      ) {
        spawnAt(p, spawnCoord(cssW), spawnCoord(cssH));
        continue;
      }

      const path = paths[p.colorIdx] as Path2D;
      path.moveTo(p.prevX, p.prevY);
      path.lineTo(nx, ny);

      p.prevX = nx;
      p.prevY = ny;
      p.x = nx;
      p.y = ny;
    }

    // Stroke each palette bucket once, additive so overlapping trails brighten.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    for (let i = 0; i < palette.colors.length; i++) {
      const col = palette.colors[i] as [number, number, number];
      const alpha = palette.alphas[i] ?? 0.5;
      ctx.strokeStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha.toFixed(3)})`;
      ctx.stroke(paths[i] as Path2D);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  return { setup, draw };
}
