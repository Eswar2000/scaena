import { createPrng } from '../../lib/prng';
import type { CanvasFrameContext } from '../../lib/useCanvas';

/* ─────────────────────────────────────────────────────────────────────────
 * tidal-drift
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
 *      perpendicular to their own length, looping infinitely. Each band
 *      "breathes" — its opacity swells and ebbs on a ~15–25s cycle, like
 *      real wave sets passing through.
 *   3. Crest haze — a few wider, very low-opacity bands at different
 *      angles for "depth" (suggests multiple swell systems).
 *   4. Cloud shadows — 4 huge, very soft dark ellipses drifting on slow
 *      Lissajous paths overhead, dimming the water below them like
 *      broken-cloud shadows seen from a plane. The eye latches onto
 *      these the way it used to latch onto the sun glints.
 *   5. Vignette — gentle darkening at the corners (like a real aerial lens).
 *
 * Per-frame cost: 1 background blit + ~6 transformed drawImage(band) +
 * 4 transformed drawImage(cloud) + 1 vignette. Sprites pre-baked once.
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
  /** 0..1 — baseline opacity of this band layer (before breath modulation). */
  alpha: number;
  /** Light blue used to render the band sprite (selected at sprite-build time). */
  paletteIndex: number;
  /** Hz — frequency of the slow swell-set breathing (typically 0.04–0.08). */
  breathFreq: number;
  /** Radians — phase offset so bands don't all breathe in unison. */
  breathPhase: number;
  /** 0..1 — fractional amplitude of the breath; final alpha = base * (1 + amp * sin(...)). */
  breathAmp: number;
}

interface Cloud {
  /** 0..1 — center of the orbit, in canvas-fraction coords. */
  baseX: number;
  baseY: number;
  /** Ellipse half-extents in CSS px. */
  radiusX: number;
  radiusY: number;
  /** Rotation of the ellipse, radians. */
  rotation: number;
  /** Lissajous orbit amplitudes (fraction of canvas dim) and frequencies (Hz). */
  ampX: number;
  ampY: number;
  freqX: number;
  freqY: number;
  phaseX: number;
  phaseY: number;
  /** Peak opacity of the darkening (0..1). */
  alpha: number;
  /** Slow opacity breath so clouds feel like they're thickening / thinning. */
  alphaFreq: number;
  alphaPhase: number;
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

/** Named ocean presets. Each preset packages a background gradient + matching
 *  band tints so changing it repaints both layers cohesively. */
interface OceanPalette {
  bgDeep: string;
  bgMid: string;
  bgCenter: string;
  bandTints: ReadonlyArray<readonly [number, number, number]>;
}
const OCEAN_PALETTES: Record<'atlantic' | 'tropical' | 'storm', OceanPalette> = {
  atlantic: {
    bgDeep: BG_DEEP,
    bgMid: BG_MID,
    bgCenter: BG_CENTER,
    bandTints: BAND_TINTS,
  },
  tropical: {
    // Warm teal-cyan that reads as "Caribbean shallows seen from a seaplane".
    bgDeep: '#053644',
    bgMid: '#0a6680',
    bgCenter: '#13a0b8',
    bandTints: [
      [180, 245, 240],
      [120, 220, 220],
      [80, 180, 200],
      [210, 250, 240],
    ],
  },
  storm: {
    // Slate-grey-blue with steel-tinted crests — like the North Sea on a grey day.
    bgDeep: '#0a1620',
    bgMid: '#162935',
    bgCenter: '#21424f',
    bandTints: [
      [165, 185, 195],
      [110, 140, 160],
      [70, 100, 125],
      [185, 205, 215],
    ],
  },
};

const BAND_SPRITE_W = 512; // long axis — stretched per band
const BAND_SPRITE_H = 64; // soft falloff axis

// Cloud shadow sprite — one shared circular soft-dark blob, stretched per cloud.
const CLOUD_SPRITE_SIZE = 256;
// Peak alpha *inside the sprite itself*; each cloud further modulates with
// its own `alpha` and the breath envelope.
const CLOUD_SPRITE_PEAK = 0.55;

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

/**
 * A soft circular dark blob used as the cloud-shadow sprite. Built once,
 * stretched/rotated per cloud each frame via `drawImage`. Default `source-over`
 * composite means this just darkens the water beneath it — exactly what a
 * broken-cloud shadow does in real life.
 */
function buildCloudSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CLOUD_SPRITE_SIZE;
  c.height = CLOUD_SPRITE_SIZE;
  const cx = c.getContext('2d');
  if (!cx) return c;
  const half = CLOUD_SPRITE_SIZE / 2;
  const g = cx.createRadialGradient(half, half, 0, half, half, half);
  // Quadratic-ish falloff — broad soft center, long fade. No hard edge.
  g.addColorStop(0, `rgba(0, 0, 0, ${CLOUD_SPRITE_PEAK})`);
  g.addColorStop(0.45, `rgba(0, 0, 0, ${CLOUD_SPRITE_PEAK * 0.45})`);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, CLOUD_SPRITE_SIZE, CLOUD_SPRITE_SIZE);
  return c;
}

let bandSpritesDefault: HTMLCanvasElement[] | null = null;
let cloudSprite: HTMLCanvasElement | null = null;

/** Cache band sprites per palette identity so swapping `palette` doesn't
 *  re-bake the sprites every frame, but custom palettes still get fresh art. */
const bandSpriteCache = new WeakMap<OceanPalette, HTMLCanvasElement[]>();

function ensureCloudSprite() {
  if (!cloudSprite) cloudSprite = buildCloudSprite();
}

function getBandSprites(palette: OceanPalette): HTMLCanvasElement[] {
  // Default palette path also seeds the module-level fallback used to be
  // shared with the legacy single-palette codepath.
  if (palette === OCEAN_PALETTES.atlantic) {
    if (!bandSpritesDefault) {
      bandSpritesDefault = palette.bandTints.map((rgb) => buildBandSprite(rgb));
      bandSpriteCache.set(palette, bandSpritesDefault);
    }
    return bandSpritesDefault;
  }
  const cached = bandSpriteCache.get(palette);
  if (cached) return cached;
  const next = palette.bandTints.map((rgb) => buildBandSprite(rgb));
  bandSpriteCache.set(palette, next);
  return next;
}

/* ───────── renderer ───────── */

export interface TidalDriftRenderer {
  draw: (frame: CanvasFrameContext) => void;
  setup: (frame: Omit<CanvasFrameContext, 'time' | 'delta'>) => void;
}

export interface TidalDriftOptions {
  /** Ocean colour preset (background + matching band tints). */
  palette?: 'atlantic' | 'tropical' | 'storm';
  /** Multiplier on wave-band drift speed. 0 = frozen waves. Default 1. */
  waveSpeed?: number;
  /** Multiplier on cloud-shadow darkness. 0 = clear sky. Default 1. */
  cloudOpacity?: number;
  /** Soft corner darkening overlay. Default true. */
  vignette?: boolean;
}

export function createTidalDriftRenderer(
  seed: number,
  options: TidalDriftOptions = {},
): TidalDriftRenderer {
  const palette = OCEAN_PALETTES[options.palette ?? 'atlantic'] ?? OCEAN_PALETTES.atlantic;
  const waveSpeedMult = Math.max(0, options.waveSpeed ?? 1);
  const cloudOpacityMult = Math.max(0, options.cloudOpacity ?? 1);
  const showVignette = options.vignette ?? true;
  // Scene PRNG is rebuilt fresh in buildScene so resize / DPR change never
  // reshuffles the wave or cloud layout. We don't need a long-lived stateful
  // PRNG anymore — there's no per-frame randomness now that glints are gone.
  let bands: Band[] = [];
  let clouds: Cloud[] = [];
  /** Pre-computed traverse distance per band — the perpendicular distance
   *  the band has to travel before it wraps. Picked so a band always covers
   *  the canvas even when rotated. */
  let traverse = 0;

  // Cached static layers: background (everything that never animates).
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
    // Breath: hero bands share a base phase clustered within ~π so they tend
    // to swell together, like a wave set rolling through.
    const heroBreathBase = srand() * Math.PI * 2;
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
        // ~14–22s period. Clustered phase so the set feels coherent.
        breathFreq: 0.045 + srand() * 0.025,
        breathPhase: heroBreathBase + (srand() - 0.5) * Math.PI * 0.6,
        breathAmp: 0.28 + srand() * 0.12,
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
        // Slower, fully independent phase — these are "another swell system".
        breathFreq: 0.025 + srand() * 0.02,
        breathPhase: srand() * Math.PI * 2,
        breathAmp: 0.35 + srand() * 0.15,
      });
    }

    // Cloud shadows — 4 huge soft dark ellipses on slow Lissajous orbits,
    // overhead. Their job is to give the eye something to track (the role
    // the sun glints used to play) without the "sparkly" feel.
    clouds = [];
    const shortDim = Math.min(width, height);
    const longDim = Math.max(width, height);
    for (let i = 0; i < 4; i += 1) {
      // Spread base positions so clouds don't pile up in one spot.
      const baseX = 0.2 + (i % 2) * 0.6 + (srand() - 0.5) * 0.2;
      const baseY = 0.25 + Math.floor(i / 2) * 0.5 + (srand() - 0.5) * 0.2;
      // Big — each cloud covers a real chunk of the frame. They're meant to
      // read as ambient dimming, not as discrete objects you can outline.
      const radiusBase = shortDim * (0.45 + srand() * 0.25);
      // Stretch one axis so clouds look like elongated cells, not perfect discs.
      const stretch = 1.2 + srand() * 0.6;
      const radiusX = radiusBase * stretch;
      const radiusY = radiusBase;
      clouds.push({
        baseX,
        baseY,
        radiusX,
        radiusY,
        rotation: (srand() - 0.5) * Math.PI, // any tilt
        // Drift amplitude as fraction of long dim — small, so the orbit is a
        // slow wander, not a racetrack.
        ampX: (0.12 + srand() * 0.1) * (longDim / width),
        ampY: (0.12 + srand() * 0.1) * (longDim / height),
        // Periods between ~80s and ~180s. Different freqX/freqY makes the orbit
        // a proper Lissajous figure that never quite repeats visually.
        freqX: 0.0055 + srand() * 0.007,
        freqY: 0.0055 + srand() * 0.007,
        phaseX: srand() * Math.PI * 2,
        phaseY: srand() * Math.PI * 2,
        // Peak darkening per cloud — kept modest so they read as shadows, not
        // ink stains. The sprite already has a 0.55 internal peak.
        alpha: 0.35 + srand() * 0.2,
        // Cloud thickening/thinning, ~25–50s period.
        alphaFreq: 0.02 + srand() * 0.02,
        alphaPhase: srand() * Math.PI * 2,
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
    g.addColorStop(0, palette.bgCenter);
    g.addColorStop(0.6, palette.bgMid);
    g.addColorStop(1, palette.bgDeep);
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
    // Note: vignette is drawn LAST every frame, on top of bands+clouds,
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
    const sprites = getBandSprites(palette);
    const sprite = sprites[band.paletteIndex];
    if (!sprite) return;

    // Perpendicular offset for this frame, wrapped to one spacing period.
    const drift = (band.offset + band.speed * time) % band.spacing;

    // Swell breathing — modulate this band's opacity on its own slow cycle.
    // Hero bands share a clustered phase so a swell set tends to crest in
    // unison; haze bands have independent phases for that "two seas" feel.
    const breath =
      1 + band.breathAmp * Math.sin(2 * Math.PI * band.breathFreq * time + band.breathPhase);
    const effectiveAlpha = Math.max(0, band.alpha * breath);

    ctx.save();
    // Pivot around the canvas center, rotate, then draw stripes in local space.
    ctx.translate(width / 2, height / 2);
    ctx.rotate(band.angle);
    ctx.globalAlpha = effectiveAlpha;

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

  /* ── cloud-shadow rendering ── */

  /**
   * Draw the cloud shadows. Each cloud orbits on a Lissajous figure (slightly
   * different X and Y frequencies → orbit never quite repeats) and pulses its
   * own opacity on yet another slow cycle. Composited normally so the dark
   * sprite just *dims* the water beneath it — same as a real cloud shadow.
   */
  const drawClouds = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    opacityMult: number,
  ) => {
    if (!cloudSprite || clouds.length === 0) return;
    ctx.save();
    for (const cloud of clouds) {
      const cx =
        (cloud.baseX + cloud.ampX * Math.sin(2 * Math.PI * cloud.freqX * time + cloud.phaseX)) *
        width;
      const cy =
        (cloud.baseY + cloud.ampY * Math.sin(2 * Math.PI * cloud.freqY * time + cloud.phaseY)) *
        height;
      // Breath: oscillate around 0.7 ± 0.3 so the cloud never fully disappears
      // but does noticeably thicken and thin.
      const breath =
        0.7 +
        0.3 * Math.sin(2 * Math.PI * cloud.alphaFreq * time + cloud.alphaPhase);
      const alpha = cloud.alpha * breath * opacityMult;
      if (alpha < 0.01) continue;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.setTransform(1, 0, 0, 1, cx, cy);
      ctx.rotate(cloud.rotation);
      ctx.drawImage(
        cloudSprite,
        -cloud.radiusX,
        -cloud.radiusY,
        cloud.radiusX * 2,
        cloud.radiusY * 2,
      );
    }
    ctx.restore();
  };

  /* ── public API ── */

  return {
    setup({ width, height, dpr }) {
      ensureCloudSprite();
      // Warm the band sprite cache for the active palette.
      getBandSprites(palette);
      buildScene(width, height);
      bakeStatic(width, height, dpr);
    },

    draw({ ctx, width, height, time, dpr, reducedMotion }) {
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

      // Reduced-motion: freeze time so bands & clouds are static, but still
      // draw a complete frame (the scene is beautiful at rest).
      const t = reducedMotion ? 0 : time * waveSpeedMult;

      // 2. Wave bands (and haze bands) — drawn back-to-front; haze last so it
      //    sits on top of crisper bands as atmospheric "softening".
      //    Each band's drift + breathing is scaled by `waveSpeed` via `t`.
      for (const band of bands) {
        drawBand(ctx, width, height, band, t);
      }

      // 3. Cloud shadows — large soft dark cells drifting overhead. Drawn
      //    on top of the water so they actually dim the bands & background.
      //    `cloudOpacity` scales their darkening; 0 hides them entirely.
      if (cloudOpacityMult > 0) {
        drawClouds(ctx, width, height, t, cloudOpacityMult);
      }

      // 4. Vignette (always last) — optional.
      if (showVignette) {
        drawVignette(ctx, width, height);
      }
    },
  };
}
