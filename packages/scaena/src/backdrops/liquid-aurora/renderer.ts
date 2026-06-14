import { createPrng } from '../../lib/prng';
import type { CanvasFrameContext } from '../../lib/useCanvas';

/* ─────────────────────────────────────────────────────────────────────────
 * liquid-aurora
 *
 * Deliberately NOT a literal aurora (no curtains, no rays, no ribbons —
 * those always read as "fake aurora"). Instead: a deep, dark canvas
 * painted with several large soft "blobs" of aurora-inspired color
 * (emerald, cyan, indigo, violet, magenta). Each blob:
 *
 *   • drifts on a slow Lissajous path (two slow sinusoids on x/y)
 *   • breathes — its radius oscillates gently
 *   • is slightly stretched into an ellipse with a slow rotation,
 *     so the silhouette morphs rather than just translating
 *
 * Overlapping blobs combine with the 'screen' operator, producing
 * liquid color mixing where they cross and fading to deep night where
 * they don't. The result is a lava-lamp / liquid-metal feel.
 *
 * Per-frame cost: 1 background blit + ~7 drawImage(sprite) + 1 vignette.
 * Sprites are pre-rendered once per palette color → zero radial-gradient
 * work in the hot path.
 * ───────────────────────────────────────────────────────────────────────── */

interface Blob {
  // Drift — position oscillates around (baseX, baseY) by ±(ampX, ampY).
  baseX: number; // 0..1
  baseY: number; // 0..1
  ampX: number; // 0..1
  ampY: number; // 0..1
  freqX: number; // rad/s
  freqY: number; // rad/s
  phaseX: number;
  phaseY: number;
  // Breathing radius.
  baseRadius: number; // CSS px (set from min(width, height) at scene build)
  breathAmp: number; // 0..1 fraction of baseRadius
  breathFreq: number; // rad/s
  breathPhase: number;
  // Ellipse + rotation — gives each blob a morphing silhouette.
  baseScaleX: number;
  baseScaleY: number;
  scaleAmpX: number;
  scaleAmpY: number;
  scaleFreqX: number;
  scaleFreqY: number;
  scalePhaseX: number;
  scalePhaseY: number;
  baseRotation: number;
  rotationSpeed: number; // rad/s — very slow
  // Visual.
  paletteIndex: number;
  alpha: number;
}

// Deep night base — almost black, with a hint of indigo so the screen-blended
// colors above feel like they're emerging from a real sky rather than a panel.
const BG_TOP = '#06081a';
const BG_BOTTOM = '#0a0d24';

// Aurora-inspired jewel tones. NOT a literal aurora palette — picked for the
// way they read against deep night and how they cross-mix under 'screen'.
const AURORA_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [60, 220, 170], // emerald
  [80, 200, 230], // cyan
  [120, 130, 230], // periwinkle / indigo
  [180, 110, 220], // violet
  [220, 110, 190], // magenta-rose
  [90, 230, 200], // mint
];

// Named alternate palettes. Each list is a small set of RGB tuples that
// reads well against the deep-night background under 'screen' blending.
const NAMED_PALETTES: Record<
  'aurora' | 'sunset' | 'oceanic' | 'plasma',
  ReadonlyArray<readonly [number, number, number]>
> = {
  aurora: AURORA_PALETTE,
  sunset: [
    [255, 150, 100], // coral
    [255, 110, 130], // rose
    [240, 90, 180], // magenta
    [180, 90, 220], // violet
    [255, 190, 120], // peach
  ],
  oceanic: [
    [60, 180, 220], // sky-cyan
    [70, 140, 220], // azure
    [40, 220, 200], // teal
    [60, 90, 200], // deep blue
    [110, 220, 240], // ice
  ],
  plasma: [
    [255, 90, 200], // hot pink
    [180, 80, 255], // violet
    [255, 130, 90], // ember
    [120, 90, 255], // electric indigo
    [255, 200, 90], // gold
  ],
};

const BLOB_SPRITE_SIZE = 256;

export interface LiquidAuroraOptions {
  /** Number of color blobs. Default: 6 (4 on viewports under ~480px). */
  blobCount?: number;
  /** Animation speed multiplier (drift, breathing, rotation). Default: 1. */
  speed?: number;
  /** Blob size multiplier — scales radius relative to min(width, height). Default: 1. */
  blobScale?: number;
  /**
   * Palette — a named preset, or a custom array of `[r, g, b]` tuples (0..255).
   * Each blob picks one entry at random; overlapping blobs cross-mix under
   * a `screen` composite operator.
   * Default: `'aurora'`.
   */
  palette?:
    | 'aurora'
    | 'sunset'
    | 'oceanic'
    | 'plasma'
    | ReadonlyArray<readonly [number, number, number]>;
  /** Render the dark radial vignette overlay. Default: true. */
  vignette?: boolean;
}

function resolvePalette(
  palette: LiquidAuroraOptions['palette'],
): ReadonlyArray<readonly [number, number, number]> {
  if (!palette) return AURORA_PALETTE;
  if (typeof palette === 'string') return NAMED_PALETTES[palette] ?? AURORA_PALETTE;
  return palette.length > 0 ? palette : AURORA_PALETTE;
}

/**
 * Pre-render one circular gradient sprite per palette color. The falloff is
 * tuned for a "liquid" feel: bright core, lingering mid-tone (so two blobs
 * still mix visibly where they overlap), then a long soft fade so edges are
 * never crisp. Building these once and blitting per frame is ~20× cheaper
 * than `createRadialGradient` + fill per blob per frame.
 */
function buildBlobSprite(rgb: readonly [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = BLOB_SPRITE_SIZE;
  c.height = BLOB_SPRITE_SIZE;
  const cx = c.getContext('2d');
  if (!cx) return c;
  const center = BLOB_SPRITE_SIZE / 2;
  const [r, g, b] = rgb;
  const grad = cx.createRadialGradient(center, center, 0, center, center, center);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
  grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.55)`);
  grad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.18)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  cx.fillStyle = grad;
  cx.fillRect(0, 0, BLOB_SPRITE_SIZE, BLOB_SPRITE_SIZE);
  return c;
}

// Sprite cache keyed by palette identity. The first time a palette is seen
// we render one sprite per colour; subsequent renderers reusing the same
// palette skip the work entirely.
const spriteCache = new WeakMap<
  ReadonlyArray<readonly [number, number, number]>,
  HTMLCanvasElement[]
>();
function getSprites(
  palette: ReadonlyArray<readonly [number, number, number]>,
): HTMLCanvasElement[] {
  let sprites = spriteCache.get(palette);
  if (!sprites) {
    sprites = palette.map((rgb) => buildBlobSprite(rgb));
    spriteCache.set(palette, sprites);
  }
  return sprites;
}

export interface LiquidAuroraRenderer {
  draw: (frame: CanvasFrameContext) => void;
  setup: (frame: Omit<CanvasFrameContext, 'time' | 'delta'>) => void;
}

export function createLiquidAuroraRenderer(
  seed: number,
  options: LiquidAuroraOptions = {},
): LiquidAuroraRenderer {
  const palette = resolvePalette(options.palette);
  const speedMult = Math.max(0, options.speed ?? 1);
  const scaleMult = Math.max(0.1, options.blobScale ?? 1);
  const showVignette = options.vignette !== false;
  const blobCountOverride = options.blobCount;

  let sprites: HTMLCanvasElement[] = [];
  let blobs: Blob[] = [];
  // Cached background (gradient is identical every frame).
  let cachedBg: HTMLCanvasElement | null = null;
  let cachedBgDpr = 1;
  let cachedW = 0;
  let cachedH = 0;

  /* ───────── scene generation ───────── */

  const buildScene = (width: number, height: number) => {
    // Fresh, deterministic PRNG every call — resize / DPR change won't reshuffle
    // the composition. Same seed → same blob layout, always.
    const srand = createPrng(seed);

    // 6 blobs on desktop, 4 on small viewports — keeps mobile snappy and
    // less visually busy on tiny canvases. Caller can override via `blobCount`.
    const isSmall = Math.min(width, height) < 480;
    const defaultCount = isSmall ? 4 : 6;
    const blobCount = Math.max(
      1,
      Math.floor(blobCountOverride ?? defaultCount),
    );
    const minDim = Math.min(width, height);

    // Seed positions on a loose grid so we get even coverage, then jitter.
    const cols = blobCount <= 4 ? 2 : 3;
    const rows = Math.ceil(blobCount / cols);

    blobs = [];
    for (let i = 0; i < blobCount; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const baseX = (col + 0.5) / cols + (srand() - 0.5) * 0.18;
      const baseY = (row + 0.5) / rows + (srand() - 0.5) * 0.18;

      blobs.push({
        baseX: Math.max(0.05, Math.min(0.95, baseX)),
        baseY: Math.max(0.05, Math.min(0.95, baseY)),
        // Drift up to ~20% of viewport in either axis.
        ampX: 0.1 + srand() * 0.12,
        ampY: 0.1 + srand() * 0.12,
        // Very slow — 0.025..0.08 Hz, so ~12–40 second cycles. Liquid time.
        freqX: (0.025 + srand() * 0.055) * 2 * Math.PI,
        freqY: (0.025 + srand() * 0.055) * 2 * Math.PI,
        phaseX: srand() * Math.PI * 2,
        phaseY: srand() * Math.PI * 2,
        baseRadius: minDim * (0.5 + srand() * 0.35),
        breathAmp: 0.1 + srand() * 0.15,
        breathFreq: (0.04 + srand() * 0.06) * 2 * Math.PI,
        breathPhase: srand() * Math.PI * 2,
        // Ellipse: bias one axis vs the other so the blob isn't a circle.
        baseScaleX: 0.85 + srand() * 0.4,
        baseScaleY: 0.85 + srand() * 0.4,
        scaleAmpX: 0.06 + srand() * 0.1,
        scaleAmpY: 0.06 + srand() * 0.1,
        scaleFreqX: (0.03 + srand() * 0.05) * 2 * Math.PI,
        scaleFreqY: (0.03 + srand() * 0.05) * 2 * Math.PI,
        scalePhaseX: srand() * Math.PI * 2,
        scalePhaseY: srand() * Math.PI * 2,
        baseRotation: srand() * Math.PI * 2,
        // ±0.02..0.05 rad/s — about one rotation every 2–5 minutes. Barely
        // perceptible alone, but combined with the breathing scale it makes
        // the silhouette feel alive.
        rotationSpeed: (srand() < 0.5 ? -1 : 1) * (0.02 + srand() * 0.03),
        paletteIndex: Math.floor(srand() * palette.length),
        // Alpha range chosen so 2–3 overlapping blobs cleanly bloom toward
        // their mixed color without any single one looking like a hotspot.
        alpha: 0.5 + srand() * 0.3,
      });
    }
  };

  /* ───────── draw passes ───────── */

  const drawBackground = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, BG_TOP);
    g.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  };

  const bakeBackground = (width: number, height: number, dpr: number) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(width * dpr));
    c.height = Math.max(1, Math.floor(height * dpr));
    const cctx = c.getContext('2d');
    if (!cctx) {
      cachedBg = null;
      return;
    }
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(cctx, width, height);
    cachedBg = c;
    cachedBgDpr = dpr;
    cachedW = width;
    cachedH = height;
  };

  const drawBlobs = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
  ) => {
    if (sprites.length === 0) return;
    ctx.save();
    // 'screen' is the secret: 1 - (1-a)*(1-b) — bright where blobs overlap,
    // dark elsewhere. Unlike 'lighter' it tops out at 1, so we don't blow
    // to flat white in the middle of the canvas.
    ctx.globalCompositeOperation = 'screen';

    for (const b of blobs) {
      const sprite = sprites[b.paletteIndex];
      if (!sprite) continue;

      const cx =
        (b.baseX + Math.sin(time * b.freqX + b.phaseX) * b.ampX) * width;
      const cy =
        (b.baseY + Math.sin(time * b.freqY + b.phaseY) * b.ampY) * height;

      const r =
        b.baseRadius *
        scaleMult *
        (1 + Math.sin(time * b.breathFreq + b.breathPhase) * b.breathAmp);

      const sx =
        b.baseScaleX +
        Math.sin(time * b.scaleFreqX + b.scalePhaseX) * b.scaleAmpX;
      const sy =
        b.baseScaleY +
        Math.sin(time * b.scaleFreqY + b.scalePhaseY) * b.scaleAmpY;

      const rotation = b.baseRotation + time * b.rotationSpeed;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.scale(sx, sy);
      ctx.globalAlpha = b.alpha;
      ctx.drawImage(sprite, -r, -r, r * 2, r * 2);
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  };

  const drawVignette = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => {
    const cx = width / 2;
    const cy = height / 2;
    const g = ctx.createRadialGradient(
      cx,
      cy,
      Math.min(width, height) * 0.4,
      cx,
      cy,
      Math.max(width, height) * 0.85,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  };

  /* ───────── public API ───────── */

  return {
    setup({ width, height, dpr }) {
      sprites = getSprites(palette);
      buildScene(width, height);
      bakeBackground(width, height, dpr);
    },

    draw({ ctx, width, height, time, dpr, reducedMotion }) {
      if (
        !cachedBg ||
        cachedBgDpr !== dpr ||
        cachedW !== width ||
        cachedH !== height
      ) {
        bakeBackground(width, height, dpr);
      }

      if (cachedBg) {
        ctx.drawImage(cachedBg, 0, 0, width, height);
      } else {
        drawBackground(ctx, width, height);
      }

      // Reduced motion → freeze time so the composition is still beautiful
      // but completely static. The `speed` option scales motion otherwise.
      const t = reducedMotion ? 0 : time * speedMult;
      drawBlobs(ctx, width, height, t);

      if (showVignette) drawVignette(ctx, width, height);
    },
  };
}
