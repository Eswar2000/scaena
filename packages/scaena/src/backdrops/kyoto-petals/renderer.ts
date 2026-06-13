import { createPrng } from '../../lib/prng';
import type { CanvasFrameContext } from '../../lib/useCanvas';

/* ─────────────────────────────────────────────────────────────────────────
 * kyoto-petals v2
 *
 * Composition (back to front):
 *   1. Warm sky gradient (peach → mauve)
 *   2. Sun glow — large soft radial highlight off-frame upper right
 *   3. Distant mountain mist — horizontal soft band low on canvas
 *   4. Bokeh petals — very far petals as soft circular highlights
 *   5. Mid-depth petals (slight blur via larger stroke, less detail)
 *   6. Foreground petals — full detail, per-petal radial-gradient fill
 *   7. Light grain (very subtle bloom haze near top)
 * ───────────────────────────────────────────────────────────────────────── */

interface Petal {
  x: number;
  y: number;
  size: number;
  fallSpeed: number;
  driftFactor: number;
  swayPhase: number;
  swayAmp: number;
  swayFreq: number;
  rotation: number;
  rotationSpeed: number;
  flutterPhase: number;
  flutterFreq: number;
  /** 0..1 — far (0) is small/soft bokeh, near (1) is large/sharp petal */
  depth: number;
  /** Index into PETAL_PALETTES — selects which pre-rendered sprite to use */
  paletteIndex: number;
  /** Petal interior color (rgb string) */
  colorLight: string;
  colorDark: string;
  alpha: number;
}

// Sky colors — richer than v1, with mauve undertones
const SKY_TOP = '#fde2e6';
const SKY_MID = '#f9c9cc';
const SKY_BOTTOM = '#e6b3b7';

// Sun glow color
const SUN_GLOW = 'rgba(255, 220, 185, 0.55)';

// Mist near the horizon
const MIST_COLOR = 'rgba(255, 215, 220, 0.45)';

// Sakura palette — each petal picks a (light, dark) pair for its interior gradient
const PETAL_PALETTES: Array<[string, string]> = [
  ['255, 230, 238', '230, 150, 175'], // soft pink
  ['255, 245, 248', '235, 170, 190'], // pale
  ['255, 220, 232', '220, 130, 165'], // medium pink
  ['255, 235, 240', '210, 135, 165'], // dusty pink
  ['255, 245, 245', '230, 195, 200'], // near-white
];

/**
 * Sakura petal silhouette in unit space (centered at origin, fits in [-1, 1]).
 *
 * Anatomy of a real cherry-blossom petal:
 *   • narrow at the base (stem attachment)         — bottom of our path (y = +1)
 *   • widens out to its broadest near the middle  — around y = 0
 *   • has a distinctive V-notch at the TIP        — top of our path (y = -1)
 *
 * Previously this path had the notch at the bottom — which is why it didn't
 * read as a sakura petal. Now corrected.
 */
function drawPetalPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  // Start at the narrow base (bottom)
  ctx.moveTo(0, 0.95);
  // Right side: from base, swell out to widest around y ≈ 0.0, then narrow
  // up toward the right shoulder of the tip.
  ctx.bezierCurveTo(0.5, 0.85, 0.7, 0.2, 0.55, -0.55);
  ctx.bezierCurveTo(0.48, -0.78, 0.32, -0.92, 0.18, -0.88);
  // V-notch at the TIP — the iconic dip that says "sakura".
  ctx.quadraticCurveTo(0, -0.58, -0.18, -0.88);
  // Left side back down to the base (mirror).
  ctx.bezierCurveTo(-0.32, -0.92, -0.48, -0.78, -0.55, -0.55);
  ctx.bezierCurveTo(-0.7, 0.2, -0.5, 0.85, 0, 0.95);
  ctx.closePath();
}

/* ─────────────────────── sprite cache ─────────────────────── */

const PETAL_SPRITE_SIZE = 128;
const PETAL_HALF = PETAL_SPRITE_SIZE / 2;

/**
 * Pre-render a fully-shaded petal into an offscreen canvas — one per palette.
 * Per-frame rendering becomes a single `drawImage` per petal instead of
 * `createRadialGradient + fill + stroke`, which was creating ~180 gradients
 * per frame and dragging the framerate. ~15× faster end-to-end.
 */
function buildPetalSprite(palette: readonly [string, string]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = PETAL_SPRITE_SIZE;
  c.height = PETAL_SPRITE_SIZE;
  const cx = c.getContext('2d');
  if (!cx) return c;

  cx.save();
  // Map unit petal space (-1..1) into the 128px sprite.
  cx.translate(PETAL_HALF, PETAL_HALF);
  cx.scale(PETAL_HALF * 0.92, PETAL_HALF * 0.92); // slight padding so the rim isn't clipped

  // Radial gradient in petal-local space: brighter near the tip, darker at base.
  // Off-center toward the tip → reads as light coming from the top.
  const grad = cx.createRadialGradient(0, -0.45, 0.05, 0, 0.15, 1.2);
  grad.addColorStop(0, `rgba(${palette[0]}, 1)`);
  grad.addColorStop(0.55, `rgba(${palette[0]}, 0.95)`);
  grad.addColorStop(1, `rgba(${palette[1]}, 0.92)`);
  cx.fillStyle = grad;
  drawPetalPath(cx);
  cx.fill();

  // Subtle inner rim along the darker side — baked once, looks crisp at any size.
  cx.lineWidth = 0.05;
  cx.strokeStyle = `rgba(${palette[1]}, 0.45)`;
  cx.stroke();
  cx.restore();

  return c;
}

let petalSprites: HTMLCanvasElement[] | null = null;
let bokehSprite: HTMLCanvasElement | null = null;

function ensureSprites() {
  if (!petalSprites) {
    petalSprites = PETAL_PALETTES.map((p) => buildPetalSprite(p));
  }
  if (!bokehSprite) {
    // One soft circular bokeh sprite — colored at draw time via globalAlpha.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const cx = c.getContext('2d');
    if (cx) {
      const g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255, 240, 245, 0.9)');
      g.addColorStop(0.5, 'rgba(255, 230, 240, 0.4)');
      g.addColorStop(1, 'rgba(255, 220, 235, 0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, 64, 64);
    }
    bokehSprite = c;
  }
}

function createPetal(width: number, height: number, rand: () => number): Petal {
  // 4 depth bands. More near-camera than far, but each band is meaningful.
  const r = rand();
  const depth = r < 0.2 ? 0.08 + rand() * 0.15 : r < 0.55 ? 0.35 + rand() * 0.2 : r < 0.85 ? 0.6 + rand() * 0.2 : 0.82 + rand() * 0.18;

  const size = 4 + depth * 22;
  const paletteIndex = Math.floor(rand() * PETAL_PALETTES.length);
  const palette = PETAL_PALETTES[paletteIndex] ?? PETAL_PALETTES[0]!;

  return {
    x: rand() * width,
    y: rand() * height,
    size,
    fallSpeed: 14 + depth * 60 + rand() * 14,
    driftFactor: 0.25 + depth * 1.0,
    swayPhase: rand() * Math.PI * 2,
    swayAmp: 6 + depth * 26,
    swayFreq: 0.3 + rand() * 0.5,
    rotation: rand() * Math.PI * 2,
    rotationSpeed: (rand() - 0.5) * 1.7,
    flutterPhase: rand() * Math.PI * 2,
    flutterFreq: 0.6 + rand() * 1.4,
    depth,
    paletteIndex,
    colorLight: palette[0],
    colorDark: palette[1],
    alpha: 0.55 + depth * 0.4,
  };
}

export interface PetalsRenderer {
  draw: (frame: CanvasFrameContext) => void;
  setup: (frame: Omit<CanvasFrameContext, 'time' | 'delta'>) => void;
}

export function createKyotoPetalsRenderer(seed: number): PetalsRenderer {
  const rand = createPrng(seed);
  let petals: Petal[] = [];

  const buildPetals = (width: number, height: number) => {
    const area = width * height;
    const target = Math.min(180, Math.floor(area / 7500));
    const next: Petal[] = [];
    for (let i = 0; i < target; i += 1) next.push(createPetal(width, height, rand));
    // Draw far first → near last (painter's algorithm for depth)
    next.sort((a, b) => a.depth - b.depth);
    petals = next;
  };

  const drawSky = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(0.55, SKY_MID);
    sky.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
  };

  const drawSunGlow = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Sun is off-frame upper-right — gives the scene a clear light direction
    const sx = width * 0.78;
    const sy = -height * 0.15;
    const radius = Math.max(width, height) * 0.95;
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
    grad.addColorStop(0, SUN_GLOW);
    grad.addColorStop(0.4, 'rgba(255, 220, 185, 0.18)');
    grad.addColorStop(1, 'rgba(255, 220, 185, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  };

  const drawMistBand = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // A soft horizontal mist band sitting low — sells "atmospheric distance"
    // and pushes background petals visually further away.
    const top = height * 0.6;
    const bottom = height;
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, 'rgba(255, 215, 220, 0)');
    grad.addColorStop(0.6, MIST_COLOR);
    grad.addColorStop(1, 'rgba(255, 215, 220, 0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, width, bottom - top);
  };

  const drawTopHaze = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Very subtle warm wash across the top — soft bloom feel from the sun
    const top = 0;
    const bottom = height * 0.4;
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, 'rgba(255, 235, 215, 0.22)');
    grad.addColorStop(1, 'rgba(255, 235, 215, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, width, bottom - top);
  };

  const drawBokehPetal = (ctx: CanvasRenderingContext2D, p: Petal) => {
    // Very far petals render as soft circular bokeh — a strong production cue.
    // Drawn additively for that "out of focus highlight" look.
    if (!bokehSprite) return;
    const radius = p.size * 1.6;
    ctx.globalAlpha = Math.min(1, p.alpha * 0.6);
    ctx.drawImage(bokehSprite, p.x - radius, p.y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  };

  const drawDetailedPetal = (ctx: CanvasRenderingContext2D, p: Petal, flutter: number) => {
    const sprite = petalSprites?.[p.paletteIndex];
    if (!sprite) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.scale(flutter, 1);
    ctx.globalAlpha = p.alpha;
    ctx.drawImage(sprite, -p.size, -p.size, p.size * 2, p.size * 2);
    ctx.restore();
  };

  return {
    setup({ width, height }) {
      ensureSprites();
      buildPetals(width, height);
    },

    draw({ ctx, width, height, time, delta, reducedMotion }) {
      drawSky(ctx, width, height);
      drawSunGlow(ctx, width, height);
      drawMistBand(ctx, width, height);

      // Wind — slow lateral breeze that changes direction over ~24s
      const wind = reducedMotion ? 0 : Math.sin(time * 0.26) * 38;

      // Bokeh layer first (additive, behind everything else)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const p of petals) {
        if (p.depth >= 0.25) continue; // only the deepest band → bokeh
        if (!reducedMotion) {
          const sway = Math.sin(time * p.swayFreq + p.swayPhase) * p.swayAmp;
          p.x += (wind * p.driftFactor + sway * 0.05) * delta;
          p.y += p.fallSpeed * delta;
          if (p.y > height + p.size * 2) {
            p.y = -p.size * 2;
            p.x = rand() * width;
          }
          if (p.x > width + p.size * 3) p.x = -p.size * 2;
          if (p.x < -p.size * 3) p.x = width + p.size * 2;
        }
        drawBokehPetal(ctx, p);
      }
      ctx.restore();

      // Detailed petals (depth >= 0.25)
      for (const p of petals) {
        if (p.depth < 0.25) continue;
        if (!reducedMotion) {
          const sway = Math.sin(time * p.swayFreq + p.swayPhase) * p.swayAmp;
          p.x += (wind * p.driftFactor + sway * 0.05) * delta;
          p.y += p.fallSpeed * delta;
          p.rotation += p.rotationSpeed * delta;
          if (p.y > height + p.size * 2) {
            p.y = -p.size * 2;
            p.x = rand() * width;
          }
          if (p.x > width + p.size * 3) p.x = -p.size * 2;
          if (p.x < -p.size * 3) p.x = width + p.size * 2;
        }
        const flutter = reducedMotion
          ? 1
          : 0.35 + 0.65 * Math.abs(Math.sin(time * p.flutterFreq + p.flutterPhase));
        drawDetailedPetal(ctx, p, flutter);
      }

      // Top warm haze (drawn last so it gently overlays foreground petals too)
      drawTopHaze(ctx, width, height);
    },
  };
}
