import { createPrng } from '../../lib/prng';
import type { CanvasFrameContext } from '../../lib/useCanvas';

/* ─────────────────────────────────────────────────────────────────────────
 * deep-ocean
 *
 * Open ocean from a bird's-eye view — like a satellite shot or the view
 * from a small plane at cruise altitude. No horizon, no land, no boats.
 * Just water, layered and slowly rolling.
 *
 * Composition (back to front):
 *   1. Radial background — slightly lighter teal in the middle, deepening
 *      to ink-blue at the edges (light scatters more directly below you
 *      when looking straight down).
 *   2. Wave bands — 4 long, soft, slightly-diagonal stripes drifting
 *      perpendicular to their own length, looping infinitely.
 *   3. Crest haze — a few wider, very low-opacity bands at different
 *      angles for "depth" (suggests multiple swell systems).
 *   4. Sun glints — tiny short-lived diamond highlights scattered across
 *      the surface, like sun catching the water from a plane.
 *   5. Vignette — gentle darkening at the corners (like a real aerial lens).
 *
 * Per-frame cost: 1 background blit + ~6 transformed drawImage(band) +
 * ~30–50 glint arcs + 1 vignette. Sprites pre-baked once.
 *
 * Calibrated NOT to look like:
 *   - a swimming pool (too pure-blue, too saturated)
 *   - a tropical lagoon (too cyan, too cheerful)
 *   - painted stripes (bands at perfectly parallel angles)
 * Calibrated to feel like:
 *   - the opening shot of a nature documentary about the open Atlantic
 * ───────────────────────────────────────────────────────────────────────── */

interface Band {
  /** Tilt in radians — small, ±5° from horizontal. */
  angle: number;
  /** Drift speed perpendicular to the band (CSS px/sec). */
  speed: number;
  /** Half-width of the soft band in CSS px (the sprite is stretched to this). */
  halfWidth: number;
  /** Offset along the perpendicular axis — cycled mod (2 * traverse) for infinite scroll. */
  offset: number;
  /** Spacing of repeats so the band tiles cleanly across the canvas. */
  spacing: number;
  /** 0..1 — overall opacity of this band layer. */
  alpha: number;
  /** Light blue used to render the band sprite (selected at sprite-build time). */
  paletteIndex: number;
}

interface Glint {
  /** 0..1 position. */
  x: number;
  y: number;
  /** Seconds remaining before this glint dies. */
  life: number;
  /** Total lifetime — used to compute fade alpha. */
  lifetime: number;
  /** Peak radius in CSS px. */
  size: number;
}

// Deep base — almost navy with a green undertone. Pure blue reads as "pool".
const BG_DEEP = '#06192e';
const BG_MID = '#0a2540';
const BG_CENTER = '#0e3b5c';

// Band tints — each layer picks one. Cool and restrained, not tropical.
const BAND_TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [120, 200, 220], // pale cyan crest
  [80, 165, 195], // mid teal
  [60, 140, 175], // deep teal
  [150, 220, 230], // bright crest highlight (sparingly used)
];

// Sun glint — warm-white. The sun isn't blue.
const GLINT_RGB = '255, 250, 230';

const BAND_SPRITE_W = 512; // long axis — stretched per band
const BAND_SPRITE_H = 64; // soft falloff axis

const MAX_GLINTS = 50;
const GLINT_SPAWN_PER_SEC = 22;

/* ───────── sprites ───────── */

/**
 * A single horizontal "band" sprite — bright in the middle, soft falloff
 * on both sides. We render this once per palette tint, then per frame
 * stretch + rotate + translate it via drawImage. Massively cheaper than
 * rebuilding a gradient each frame.
 */
function buildBandSprite(rgb: readonly [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = BAND_SPRITE_W;
  c.height = BAND_SPRITE_H;
  const cx = c.getContext('2d');
  if (!cx) return c;
  const [r, g, b] = rgb;
  // Vertical gradient — soft on top, bright at center, soft on bottom.
  const grad = cx.createLinearGradient(0, 0, 0, BAND_SPRITE_H);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
  grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 1)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  cx.fillStyle = grad;
  cx.fillRect(0, 0, BAND_SPRITE_W, BAND_SPRITE_H);
  return c;
}

let bandSprites: HTMLCanvasElement[] | null = null;
function ensureSprites() {
  if (bandSprites) return;
  bandSprites = BAND_TINTS.map((rgb) => buildBandSprite(rgb));
}

/* ───────── renderer ───────── */

export interface OceanRenderer {
  draw: (frame: CanvasFrameContext) => void;
  setup: (frame: Omit<CanvasFrameContext, 'time' | 'delta'>) => void;
}

export function createDeepOceanRenderer(seed: number): OceanRenderer {
  // Stateful PRNG for transient glints; scene PRNG is rebuilt fresh in buildScene
  // so resize / DPR change never reshuffles the wave layout.
  const rand = createPrng(seed);
  let bands: Band[] = [];
  /** Pre-computed traverse distance per band — the perpendicular distance
   *  the band has to travel before it wraps. Picked so a band always covers
   *  the canvas even when rotated. */
  let traverse = 0;

  const glints: Glint[] = [];
  let glintSpawnAccum = 0;

  // Cached static layers: background + vignette (everything that never animates).
  let cachedBg: HTMLCanvasElement | null = null;
  let cachedBgDpr = 1;
  let cachedW = 0;
  let cachedH = 0;

  /* ── scene generation ── */

  const buildScene = (width: number, height: number) => {
    const srand = createPrng(seed);

    // Traverse: hypot(w, h) + a margin, so a band rotated by ±5° still wraps
    // off-canvas cleanly without ever showing its edge inside the frame.
    traverse = Math.hypot(width, height) * 1.4;

    // 4 hero bands + 2 wider "haze" bands. The hero bands are the visible
    // swells; the haze bands sit behind at low opacity to suggest depth.
    bands = [];

    // Hero bands — narrow-ish, brighter, faster.
    for (let i = 0; i < 4; i += 1) {
      // Angles between -7° and +7°. Pick each band's angle as a small offset
      // from a "base swell direction" so they look correlated, like real
      // wind-driven waves, rather than random.
      const angle = (-7 + (i * 14) / 3 + (srand() - 0.5) * 4) * (Math.PI / 180);
      bands.push({
        angle,
        // Direction matters less than consistency — all bands drift the same
        // way (positive = "down-right" perpendicular to band axis).
        speed: 6 + srand() * 5, // 6–11 px/sec. Glacial = good.
        halfWidth: Math.max(width, height) * (0.025 + srand() * 0.02),
        offset: srand() * traverse,
        spacing: Math.max(width, height) * (0.15 + srand() * 0.06),
        alpha: 0.18 + srand() * 0.08,
        paletteIndex: i % 3, // pale, mid, deep
      });
    }

    // Haze bands — wider, slower, more transparent, at slightly different angles
    // so the composition has multiple "swell systems" interfering.
    for (let i = 0; i < 2; i += 1) {
      const angle = ((i === 0 ? -18 : 22) + (srand() - 0.5) * 6) * (Math.PI / 180);
      bands.push({
        angle,
        speed: 3 + srand() * 2.5,
        halfWidth: Math.max(width, height) * (0.06 + srand() * 0.03),
        offset: srand() * traverse,
        spacing: Math.max(width, height) * (0.3 + srand() * 0.1),
        alpha: 0.07 + srand() * 0.04,
        paletteIndex: 1, // mid teal
      });
    }
  };

  /* ── static layer cache ── */

  const drawBackground = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => {
    // Radial: brighter center, deeper edges. NOT top-to-bottom — we have no
    // horizon. This is what "looking straight down at open water" looks like.
    const cx = width / 2;
    const cy = height / 2;
    const inner = Math.min(width, height) * 0.15;
    const outer = Math.hypot(width, height) * 0.6;
    const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    g.addColorStop(0, BG_CENTER);
    g.addColorStop(0.6, BG_MID);
    g.addColorStop(1, BG_DEEP);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
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
      Math.min(width, height) * 0.45,
      cx,
      cy,
      Math.hypot(width, height) * 0.7,
    );
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  };

  const bakeStatic = (width: number, height: number, dpr: number) => {
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
    // Note: vignette is drawn LAST every frame, on top of bands+glints,
    // so it's NOT part of the static cache.
    cachedBg = c;
    cachedBgDpr = dpr;
    cachedW = width;
    cachedH = height;
  };

  /* ── band rendering ── */

  /**
   * Render one tilted band layer. Conceptually: an infinite ladder of
   * parallel stripes, drifting perpendicular to their own axis. We
   * rotate the canvas to the band's angle, then loop a sprite-blit
   * across the perpendicular axis with `spacing` between copies.
   */
  const drawBand = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    band: Band,
    time: number,
  ) => {
    const sprite = bandSprites?.[band.paletteIndex];
    if (!sprite) return;

    // Perpendicular offset for this frame, wrapped to one spacing period.
    const drift = (band.offset + band.speed * time) % band.spacing;

    ctx.save();
    // Pivot around the canvas center, rotate, then draw stripes in local space.
    ctx.translate(width / 2, height / 2);
    ctx.rotate(band.angle);
    ctx.globalAlpha = band.alpha;

    // We draw stripes from y = -traverse/2 to +traverse/2 stepped by spacing.
    // Adding `drift` shifts the whole ladder.
    const half = traverse / 2;
    const stripeLen = traverse; // long enough that ends never appear after rotation
    const w = band.halfWidth * 2;

    for (let y = -half + drift; y <= half; y += band.spacing) {
      // drawImage(sprite, dx, dy, dw, dh) — center at (0, y), height = w (the
      // band's perpendicular thickness), width = stripeLen.
      ctx.drawImage(sprite, -stripeLen / 2, y - w / 2, stripeLen, w);
    }
    // Wrap-around: also draw one period BEFORE the start so we never see a gap.
    for (let y = -half + drift - band.spacing; y >= -half - band.spacing; y -= band.spacing) {
      ctx.drawImage(sprite, -stripeLen / 2, y - w / 2, stripeLen, w);
    }

    ctx.restore();
  };

  /* ── glint rendering ── */

  /**
   * Spawn fresh glints up to MAX_GLINTS at a rate of GLINT_SPAWN_PER_SEC.
   * Each glint lives 0.8–1.8s and fades in/out via a sin envelope.
   */
  const updateGlints = (delta: number, width: number, height: number) => {
    glintSpawnAccum += delta * GLINT_SPAWN_PER_SEC;
    while (glintSpawnAccum >= 1 && glints.length < MAX_GLINTS) {
      glintSpawnAccum -= 1;
      const lifetime = 0.8 + rand() * 1.0;
      glints.push({
        x: rand(),
        y: rand(),
        life: lifetime,
        lifetime,
        // Most glints are tiny; ~10% are slightly larger for visual rhythm.
        size: rand() < 0.1 ? 1.6 + rand() * 0.8 : 0.6 + rand() * 0.6,
      });
    }
    // Suppress fractional accumulator if we're at the cap.
    if (glints.length >= MAX_GLINTS) glintSpawnAccum = Math.min(glintSpawnAccum, 1);

    for (let i = glints.length - 1; i >= 0; i -= 1) {
      const g = glints[i];
      if (!g) continue;
      g.life -= delta;
      if (g.life <= 0) glints.splice(i, 1);
    }

    // Silence "unused width/height" — kept for symmetry with other update fns
    // and in case we later want viewport-aware spawn biasing.
    void width;
    void height;
  };

  const drawGlints = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => {
    if (glints.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of glints) {
      // Sin envelope: 0 → 1 → 0 over the glint's lifetime. Squared for
      // a sharper peak, so glints feel like "flashes" not "blobs".
      const t = 1 - g.life / g.lifetime;
      const env = Math.sin(t * Math.PI);
      const alpha = env * env * 0.9;
      if (alpha < 0.02) continue;
      const px = g.x * width;
      const py = g.y * height;
      const r = g.size;
      ctx.fillStyle = `rgba(${GLINT_RGB}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  /* ── public API ── */

  return {
    setup({ width, height, dpr }) {
      ensureSprites();
      buildScene(width, height);
      bakeStatic(width, height, dpr);
      // Reset transient state on (re)setup.
      glints.length = 0;
      glintSpawnAccum = 0;
    },

    draw({ ctx, width, height, time, delta, dpr, reducedMotion }) {
      if (
        !cachedBg ||
        cachedBgDpr !== dpr ||
        cachedW !== width ||
        cachedH !== height
      ) {
        bakeStatic(width, height, dpr);
      }

      // 1. Static background
      if (cachedBg) {
        ctx.drawImage(cachedBg, 0, 0, width, height);
      } else {
        drawBackground(ctx, width, height);
      }

      // Reduced-motion: freeze time so the bands & glints are static, but
      // still draw a complete frame (they're beautiful at rest).
      const t = reducedMotion ? 0 : time;

      // 2. Wave bands (and haze bands) — drawn back-to-front; haze last so it
      //    sits on top of crisper bands as atmospheric "softening".
      //    Our order: hero bands first (indices 0–3), then haze (indices 4–5).
      //    That matches a natural "background swells over foreground crests"
      //    reading because haze is much lower opacity and slower.
      for (const band of bands) {
        drawBand(ctx, width, height, band, t);
      }

      // 3. Sun glints — disabled. Kept code path for easy re-enable.
      // if (!reducedMotion) updateGlints(delta, width, height);
      // drawGlints(ctx, width, height);
      void delta;

      // 4. Vignette (always last)
      drawVignette(ctx, width, height);
    },
  };
}
