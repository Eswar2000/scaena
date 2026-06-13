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

const BLOB_SPRITE_SIZE = 256;

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

let blobSprites: HTMLCanvasElement[] | null = null;
function ensureSprites() {
  if (blobSprites) return;
  blobSprites = AURORA_PALETTE.map((rgb) => buildBlobSprite(rgb));
}

export interface LiquidAuroraRenderer {
  draw: (frame: CanvasFrameContext) => void;
  setup: (frame: Omit<CanvasFrameContext, 'time' | 'delta'>) => void;
}

export function createLiquidAuroraRenderer(seed: number): LiquidAuroraRenderer {
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
    // less visually busy on tiny canvases.
    const isSmall = Math.min(width, height) < 480;
    const blobCount = isSmall ? 4 : 6;
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
        paletteIndex: Math.floor(srand() * AURORA_PALETTE.length),
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
    if (!blobSprites) return;
    ctx.save();
    // 'screen' is the secret: 1 - (1-a)*(1-b) — bright where blobs overlap,
    // dark elsewhere. Unlike 'lighter' it tops out at 1, so we don't blow
    // to flat white in the middle of the canvas.
    ctx.globalCompositeOperation = 'screen';

    for (const b of blobs) {
      const sprite = blobSprites[b.paletteIndex];
      if (!sprite) continue;

      const cx =
        (b.baseX + Math.sin(time * b.freqX + b.phaseX) * b.ampX) * width;
      const cy =
        (b.baseY + Math.sin(time * b.freqY + b.phaseY) * b.ampY) * height;

      const r =
        b.baseRadius *
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
      ensureSprites();
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
      // but completely static. No early-return: we still want the colors.
      const t = reducedMotion ? 0 : time;
      drawBlobs(ctx, width, height, t);

      drawVignette(ctx, width, height);
    },
  };
}
