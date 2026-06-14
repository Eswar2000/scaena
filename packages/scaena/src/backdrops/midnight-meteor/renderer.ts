import { createPrng } from '../../lib/prng';
import type { CanvasFrameContext } from '../../lib/useCanvas';

/* ─────────────────────────────────────────────────────────────────────────
 * midnight-meteor v2
 *
 * Composition (back to front):
 *   1. Deep navy gradient sky
 *   2. Nebula clouds — large soft radial gradients (purple / teal) for depth
 *   3. Milky way band — a soft diagonal glow
 *   4. Stars (clustered, atmospheric perspective, halo + bloom for bright)
 *   5. Vignette
 *   6. Meteors (additive head bloom + curved gravity-free arc)
 * ───────────────────────────────────────────────────────────────────────── */

interface NebulaCloud {
  cx: number; // 0..1 fraction of width
  cy: number; // 0..1 fraction of height
  radius: number; // CSS px (resolved at setup)
  color: string; // 'r,g,b'
  alpha: number;
}

interface Star {
  x: number; // 0..1
  y: number; // 0..1
  coreRadius: number;
  haloScale: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  /** 0=cool blue-white, 1=warm cream-white — used for atmospheric perspective tint */
  warmth: number;
  /** True for the brightest ~3% of stars — get a much larger bloom pass */
  hero: boolean;
  /** True for ~1% — get a 4-point diffraction spike */
  flare: boolean;
  /** Independent slow sine phases used for hero-star sub-pixel parallax drift.
   *  Cheap to carry on every star; only consumed by the hero per-frame pass. */
  driftPhaseX: number;
  driftPhaseY: number;
  driftSpeedX: number;
  driftSpeedY: number;
}

interface TrailPoint {
  x: number;
  y: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Angular velocity in rad/s — bends the trajectory regardless of direction. */
  curl: number;
  trail: TrailPoint[];
  age: number;
  lifetime: number;
}

// Deep indigo sky gradient — the nebulae brighten this additively, so the
// sky itself needs enough violet/blue chroma to read as "deep space" even
// in regions no nebula sits over (top edge, corners). Previously these were
// near-black (#020310 / #070a1c) which produced a hard black band at the top.
const SKY_TOP = '#0a0824';
const SKY_BOTTOM = '#0d0b2e';

// Nebula palette — deep, low-saturation tones that read as "atmospheric depth"
const NEBULA_COLORS = ['62, 38, 110', '32, 60, 110', '110, 38, 80', '40, 80, 130', '80, 30, 90'];

/** Named sky presets. Each one packages a sky gradient + matching nebula tints
 *  so changing `sky` repaints the whole scene cohesively (sky + drift layer). */
interface SkyPreset {
  top: string;
  bottom: string;
  /** Per-cloud rgb tints for the additive nebula pass. */
  nebulaColors: ReadonlyArray<string>;
}
const SKY_PRESETS: Record<'midnight' | 'abyss' | 'storm', SkyPreset> = {
  midnight: {
    top: SKY_TOP,
    bottom: SKY_BOTTOM,
    nebulaColors: NEBULA_COLORS,
  },
  abyss: {
    // Almost black sky with deep violet undertone — for that pitch-dark space feel.
    top: '#04030f',
    bottom: '#070514',
    nebulaColors: ['90, 30, 140', '40, 20, 100', '120, 30, 90', '30, 30, 130', '70, 20, 110'],
  },
  storm: {
    // Cooler, steelier blues — like a moonless winter night above the ocean.
    top: '#06121f',
    bottom: '#0a1830',
    nebulaColors: ['40, 90, 150', '20, 70, 130', '60, 100, 170', '30, 60, 110', '80, 110, 160'],
  },
};

const MAX_METEORS = 5;
const TRAIL_MAX_POINTS = 64;
const TRAIL_SAMPLE_INTERVAL = 1 / 120; // sample more often → smoother ribbon at any framerate
const SPAWN_MARGIN = 80;
const HALO_SPRITE_SIZE = 64;

/* ── Ambient-motion tuning ──
 * The midnight-meteor sky used to be ONE giant pre-baked bitmap blitted unchanged
 * every frame, so the canvas felt completely static between meteor crossings.
 * Three very cheap motion sources now layer on top of the bake:
 *   1. The nebula + milky-way glow plate drifts on a slow Lissajous (≤ ±NEBULA_DRIFT_AMP px).
 *   2. Hero stars float on independent sub-pixel sines (≤ ±HERO_PARALLAX_AMP px).
 *   3. A larger pool of bright stars twinkles per-frame.
 * Padding on the drift cache prevents the screen blend from ever exposing transparent
 * edges as the bitmap translates. */
const NEBULA_DRIFT_PADDING = 36; // px of bleed on each side of the drift cache
const NEBULA_DRIFT_AMP = 14; // peak drift amplitude in CSS px (< padding, with headroom)
const HERO_PARALLAX_AMP = 1.3; // peak hero-star sub-pixel drift (CSS px)
const TWINKLE_POOL_SIZE = 80; // brightest non-hero, non-flare stars that twinkle per-frame

/* ───────────────────────── helpers ───────────────────────── */

/** Box-Muller — standard normal sample. Used for star clustering. */
function gaussian(rand: () => number): number {
  const u1 = Math.max(1e-9, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Linear interpolation between two RGB strings, returns 'r,g,b'. */
function lerpRgb(aRgb: [number, number, number], bRgb: [number, number, number], t: number): string {
  const r = Math.round(aRgb[0] + (bRgb[0] - aRgb[0]) * t);
  const g = Math.round(aRgb[1] + (bRgb[1] - aRgb[1]) * t);
  const b = Math.round(aRgb[2] + (bRgb[2] - aRgb[2]) * t);
  return `${r}, ${g}, ${b}`;
}

const STAR_COOL: [number, number, number] = [220, 232, 255]; // cool blue-white
const STAR_WARM: [number, number, number] = [255, 232, 200]; // warm cream-white

/**
 * Pre-rendered halo sprite — drawn once at module init and re-used for every star
 * via `drawImage`. This replaces the 520+ `createRadialGradient` calls per frame
 * that were tanking the framerate. `drawImage` is GPU-accelerated and ~20× faster
 * than rebuilding a gradient + filling an arc per star.
 *
 * Two sprites: cool and warm. We pick by `star.warmth > 0.5` — visually
 * indistinguishable from the previous per-star lerp at typical halo alpha.
 */
function buildHaloSprite(tintRgb: [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = HALO_SPRITE_SIZE;
  c.height = HALO_SPRITE_SIZE;
  const cx = c.getContext('2d');
  if (!cx) return c;
  const center = HALO_SPRITE_SIZE / 2;
  const [r, g, b] = tintRgb;
  const grad = cx.createRadialGradient(center, center, 0, center, center, center);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
  grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.35)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  cx.fillStyle = grad;
  cx.fillRect(0, 0, HALO_SPRITE_SIZE, HALO_SPRITE_SIZE);
  return c;
}

let haloSpriteCool: HTMLCanvasElement | null = null;
let haloSpriteWarm: HTMLCanvasElement | null = null;

function ensureHaloSprites() {
  if (!haloSpriteCool) haloSpriteCool = buildHaloSprite(STAR_COOL);
  if (!haloSpriteWarm) haloSpriteWarm = buildHaloSprite(STAR_WARM);
}

function spawnMeteor(width: number, height: number, rand: () => number): Meteor {
  // Random edge entry: 0=top, 1=right, 2=bottom, 3=left
  const edge = Math.floor(rand() * 4);
  let x: number;
  let y: number;
  let targetX: number;
  let targetY: number;
  switch (edge) {
    case 0: // top edge → aim toward the bottom region (full traversal)
      x = rand() * width;
      y = -SPAWN_MARGIN;
      targetX = rand() * width;
      targetY = height * (0.85 + rand() * 0.3); // past the bottom edge
      break;
    case 1: // right edge → aim toward the left region
      x = width + SPAWN_MARGIN;
      y = rand() * height;
      targetX = -width * (rand() * 0.3); // past the left edge
      targetY = rand() * height;
      break;
    case 2: // bottom edge → aim toward the top region
      x = rand() * width;
      y = height + SPAWN_MARGIN;
      targetX = rand() * width;
      targetY = -height * (rand() * 0.3); // past the top edge
      break;
    default: // left edge → aim toward the right region
      x = -SPAWN_MARGIN;
      y = rand() * height;
      targetX = width * (1.15 + rand() * 0.3); // past the right edge
      targetY = rand() * height;
  }

  const dx = targetX - x;
  const dy = targetY - y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = 540 + rand() * 320;

  return {
    x,
    y,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    // Very subtle bend — just enough to break the perfect-straight-line look.
    // Range ±0.20..±0.50 rad/s (was ±1.0..±2.2).
    curl: (rand() < 0.5 ? -1 : 1) * (0.2 + rand() * 0.3),
    trail: [],
    age: 0,
    lifetime: 1.6 + rand() * 0.9,
  };
}

/* ───────────────────────── renderer ───────────────────────── */

export interface MeteorRenderer {
  draw: (frame: CanvasFrameContext) => void;
  setup: (frame: Omit<CanvasFrameContext, 'time' | 'delta'>) => void;
}

export interface MidnightMeteorOptions {
  /** Sky + matching nebula preset. */
  sky?: 'midnight' | 'abyss' | 'storm';
  /** Multiplier on the procedural star count. Default 1 (≈320 stars max). */
  starDensity?: number;
  /** Meteor spawn-rate multiplier. 0 = no new meteors. Default 1. */
  meteorRate?: number;
  /** Show drifting nebula clouds + Milky-Way glow. Default true. */
  nebula?: boolean;
  /** Soft corner-darkening overlay. Default true. */
  vignette?: boolean;
}

export function createMidnightMeteorRenderer(
  seed: number,
  options: MidnightMeteorOptions = {},
): MeteorRenderer {
  const skyPreset = SKY_PRESETS[options.sky ?? 'midnight'] ?? SKY_PRESETS.midnight;
  const starDensity = Math.max(0.05, options.starDensity ?? 1);
  const meteorRate = Math.max(0, options.meteorRate ?? 1);
  const showNebula = options.nebula ?? true;
  const showVignette = options.vignette ?? true;
  // Two independent PRNGs:
  //   - `rand` (stateful) drives transient stuff: meteor spawn properties, timing.
  //   - `buildScene` creates a FRESH scene PRNG from `seed` on every rebuild,
  //     so resize → re-bake produces the IDENTICAL starfield. Without this,
  //     ResizeObserver firing 2-3 times during initial layout (or any real
  //     resize) reshuffles all stars and looks like the sky is blinking.
  const rand = createPrng(seed);
  let nebulas: NebulaCloud[] = [];
  let stars: Star[] = [];
  /** Small subset of the brightest non-flare stars that get a per-frame twinkle overlay.
   *  Cheap: ~24 additive arcs per frame, modulated by sin(time). Restores the
   *  "softly twinkling" promise without re-introducing the per-frame loop over all stars. */
  let twinkleStars: Star[] = [];
  const meteors: Meteor[] = [];
  let timeToNextMeteor = 1.0 + rand() * 1.5;
  let timeSinceTrailSample = 0;

  // Offscreen caches, re-baked only on setup/resize.
  //
  // The renderer used to bake EVERYTHING (sky + nebulas + milky way + stars +
  // vignette) into a single bitmap that was blitted unchanged every frame. That
  // gave great fluidity but made the backdrop feel completely static. The bake
  // is now split into three layers so a couple of cheap motion effects can
  // animate without sacrificing the perf win:
  //
  //   backplateCache  — sky gradient + the WHOLE non-hero starfield. Static.
  //   driftCache      — nebulas + milky-way glow on a TRANSPARENT, oversized
  //                     canvas. Blitted with `screen` blend at a slow Lissajous
  //                     offset every frame, simulating drifting cosmic dust.
  //   vignetteCache   — corner-darken overlay. Drawn last (over hero stars +
  //                     twinkle) but BEFORE meteors, matching the original z-order.
  //
  // Hero stars are no longer baked — they're drawn live each frame with sub-pixel
  // parallax so the brightest points of light "float" against the static field.
  let backplateCache: HTMLCanvasElement | null = null;
  let driftCache: HTMLCanvasElement | null = null;
  let vignetteCache: HTMLCanvasElement | null = null;
  let cacheDpr = 1;
  let cacheWidth = 0;
  let cacheHeight = 0;

  // Milky way band — defined as a line from (mwX1, mwY1) → (mwX2, mwY2) in
  // normalized [0..1] space, with a thickness in pixels resolved per frame.
  let mwAngle = 0;
  let mwOffset = 0;
  let mwThickness = 0;

  /* ──────── scene generation ──────── */

  const buildScene = (width: number, height: number) => {
    // Fresh, deterministic PRNG every call → same seed always yields the
    // same starfield. Critical: this prevents the starfield from reshuffling
    // on resize / DPR change / Strict-Mode double-mount.
    const srand = createPrng(seed);

    // ── Nebulas: 4–6 large soft clouds, biased away from the corners so the
    //    composition has visible color but doesn't feel busy.
    const nebulaCount = 4 + Math.floor(srand() * 3);
    nebulas = [];
    const nebulaPalette = skyPreset.nebulaColors;
    for (let i = 0; i < nebulaCount; i += 1) {
      nebulas.push({
        cx: 0.15 + srand() * 0.7,
        cy: 0.15 + srand() * 0.7,
        radius: Math.max(width, height) * (0.35 + srand() * 0.4),
        color:
          nebulaPalette[Math.floor(srand() * nebulaPalette.length)] ??
          nebulaPalette[0] ??
          NEBULA_COLORS[0]!,
        alpha: 0.18 + srand() * 0.18,
      });
    }

    // ── Milky way: diagonal band across the canvas
    mwAngle = (srand() - 0.5) * 0.6 + Math.PI * 0.18; // ~10°..30° from horizontal, mostly tilted up-right
    mwOffset = (srand() - 0.5) * height * 0.3 + height * 0.45; // band crosses near vertical center
    mwThickness = Math.min(width, height) * (0.22 + srand() * 0.08);

    // ── Stars: density scales with area. Capped at 320 × starDensity —
    //    high enough for a dense sky, low enough to leave plenty of frame
    //    budget for meteors + post-FX. `starDensity` scales both the cap
    //    and the per-area count so dialling it up keeps proportions sane.
    const area = width * height;
    const total = Math.min(
      Math.round(320 * starDensity),
      Math.floor((area / 3600) * starDensity),
    );

    // 8 cluster centers for "star clusters" (60% of stars are clustered)
    const clusters: Array<{ cx: number; cy: number; spread: number }> = [];
    for (let i = 0; i < 8; i += 1) {
      clusters.push({
        cx: srand(),
        cy: srand(),
        spread: 0.04 + srand() * 0.06,
      });
    }

    const next: Star[] = [];
    for (let i = 0; i < total; i += 1) {
      let x: number;
      let y: number;
      let isMilkyWay = false;

      const placement = srand();
      if (placement < 0.45) {
        // Clustered
        const c = clusters[Math.floor(srand() * clusters.length)]!;
        x = c.cx + gaussian(srand) * c.spread;
        y = c.cy + gaussian(srand) * c.spread;
      } else if (placement < 0.75) {
        // Milky way band — sample along the band line then perturb perpendicular
        const t = srand();
        const cosA = Math.cos(mwAngle);
        const sinA = Math.sin(mwAngle);
        const px = t * width;
        const py = mwOffset + (px - width / 2) * Math.tan(mwAngle);
        // Perpendicular jitter — gaussian for soft fade at edges
        const perp = gaussian(srand) * mwThickness * 0.4;
        x = (px - sinA * perp) / width;
        y = (py + cosA * perp) / height;
        isMilkyWay = true;
      } else {
        // Uniform sky filler
        x = srand();
        y = srand();
      }

      // Clamp inside the canvas
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));

      // Atmospheric perspective: stars near horizon (high y) tilt warm
      const warmth = y * 0.9;

      // Size distribution — Milky-way stars are mostly tiny dust, but a few
      // bright ones still appear. Cluster/uniform get the usual mix.
      const sizeRoll = srand();
      const coreRadius = isMilkyWay
        ? sizeRoll < 0.92
          ? 0.35 + srand() * 0.45
          : 0.7 + srand() * 0.6
        : sizeRoll < 0.78
          ? 0.45 + srand() * 0.55
          : sizeRoll < 0.97
            ? 0.85 + srand() * 0.7
            : 1.4 + srand() * 0.9; // hero stars

      const hero = !isMilkyWay && sizeRoll >= 0.97;
      const flare = hero && srand() < 0.35; // ~1% of all stars flare

      next.push({
        x,
        y,
        coreRadius,
        haloScale: hero ? 4.5 + srand() * 2.5 : 2.6 + srand() * 1.8,
        baseAlpha: isMilkyWay ? 0.45 + srand() * 0.35 : 0.7 + srand() * 0.3,
        twinkleSpeed: 0.5 + srand() * 1.6,
        twinklePhase: srand() * Math.PI * 2,
        warmth,
        hero,
        flare,
        // Hero parallax uses two very slow independent sines (period ~15–40 s) so no two
        // hero stars drift in lock-step — the cumulative effect reads as "the camera is
        // breathing" rather than "the whole star layer is sliding".
        driftPhaseX: srand() * Math.PI * 2,
        driftPhaseY: srand() * Math.PI * 2,
        driftSpeedX: 0.12 + srand() * 0.18,
        driftSpeedY: 0.10 + srand() * 0.18,
      });
    }
    // Sort so dim stars draw first, hero stars on top (avoids halo-cutoff artifacts)
    next.sort((a, b) => (a.hero === b.hero ? a.coreRadius - b.coreRadius : a.hero ? 1 : -1));
    stars = next;

    // Pick a generous slice of the brightest non-hero, non-flare stars for the
    // per-frame twinkle overlay. Heroes drive their own per-frame draw now (with
    // intrinsic alpha modulation), and flare stars already read as "sparkling"
    // thanks to their diffraction cross — so excluding both avoids double-emphasis.
    // Cost: ~TWINKLE_POOL_SIZE radial fills per frame — still well under a single
    // meteor's ribbon-build cost.
    twinkleStars = [...next]
      .filter((s) => !s.flare && !s.hero)
      .sort((a, b) => b.coreRadius * b.baseAlpha - a.coreRadius * a.baseAlpha)
      .slice(0, TWINKLE_POOL_SIZE);
  };

  /* ──────── draw passes ──────── */

  const drawSky = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, skyPreset.top);
    sky.addColorStop(1, skyPreset.bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
  };

  const drawNebulas = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    bleed = 0,
  ) => {
    // `bleed` lets the drift cache extend the radial gradient fill into its
    // padding ring. Without it, the cache's outer padding rows stay fully
    // transparent, and when the drift offset shifts the cache by even a few
    // pixels you see a hard band at the screen edge where nebula coverage
    // abruptly starts. Passing `bleed = NEBULA_DRIFT_PADDING` from the bake
    // ensures the gradients paint across the entire cache canvas.
    ctx.save();
    ctx.globalCompositeOperation = 'screen'; // brighten the dark sky → soft cloud effect
    for (const n of nebulas) {
      const px = n.cx * width;
      const py = n.cy * height;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, n.radius);
      grad.addColorStop(0, `rgba(${n.color}, ${n.alpha})`);
      grad.addColorStop(0.5, `rgba(${n.color}, ${n.alpha * 0.4})`);
      grad.addColorStop(1, `rgba(${n.color}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(-bleed, -bleed, width + bleed * 2, height + bleed * 2);
    }
    ctx.restore();
  };

  const drawMilkyWayGlow = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // A soft, very faint glow along the milky way line — sells the "river of light"
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const cx = width / 2;
    const cy = mwOffset;
    // Use a rotated linear gradient by drawing along the band direction
    const ux = Math.cos(mwAngle);
    const uy = Math.sin(mwAngle);
    const nx = -uy;
    const ny = ux;
    const len = Math.max(width, height) * 1.4;
    const x1 = cx - nx * mwThickness * 0.9;
    const y1 = cy - ny * mwThickness * 0.9;
    const x2 = cx + nx * mwThickness * 0.9;
    const y2 = cy + ny * mwThickness * 0.9;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, 'rgba(120, 140, 200, 0)');
    grad.addColorStop(0.5, 'rgba(160, 180, 220, 0.08)');
    grad.addColorStop(1, 'rgba(120, 140, 200, 0)');
    ctx.fillStyle = grad;
    // Draw a fat rectangle along the band — easier than rotating canvas state
    ctx.translate(cx, cy);
    ctx.rotate(mwAngle);
    ctx.fillRect(-len / 2, -mwThickness, len, mwThickness * 2);
    ctx.restore();
  };

  const drawStars = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => {
    // Bakes only the NON-HERO starfield into the destination ctx (typically the
    // backplate cache). Hero stars are excluded because they're drawn live each
    // frame with sub-pixel parallax — see `drawHeroStarsLive`. Without skipping
    // heroes here we'd render them twice (once static, once moving).
    const spriteCool = haloSpriteCool;
    const spriteWarm = haloSpriteWarm;

    // ── Pass A: inner halos via pre-rendered sprites + flare crosses
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const star of stars) {
      if (star.hero) continue;
      const px = star.x * width;
      const py = star.y * height;
      const haloRadius = star.coreRadius * star.haloScale;
      const sprite = star.warmth > 0.5 ? spriteWarm : spriteCool;
      if (sprite) {
        ctx.globalAlpha = Math.min(1, star.baseAlpha * 0.85);
        ctx.drawImage(
          sprite,
          px - haloRadius,
          py - haloRadius,
          haloRadius * 2,
          haloRadius * 2,
        );
      }

      if (star.flare) {
        const tint = lerpRgb(STAR_COOL, STAR_WARM, star.warmth);
        const flareLen = haloRadius * 2.2;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(${tint}, ${star.baseAlpha * 0.45})`;
        ctx.lineWidth = 0.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px - flareLen, py);
        ctx.lineTo(px + flareLen, py);
        ctx.moveTo(px, py - flareLen);
        ctx.lineTo(px, py + flareLen);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Pass B: crisp bright cores
    ctx.save();
    for (const star of stars) {
      if (star.hero) continue;
      const tint = lerpRgb(STAR_COOL, STAR_WARM, star.warmth);
      ctx.fillStyle = `rgba(${tint}, ${Math.min(1, star.baseAlpha * 1.1)})`;
      ctx.beginPath();
      ctx.arc(star.x * width, star.y * height, star.coreRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const drawVignette = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const cx = width / 2;
    const cy = height / 2;
    // Tint the vignette toward a deep indigo (same hue family as the nebulae)
    // rather than pure black, so corners read as "more deep sky" instead of a
    // hard black halo that fights the violet/teal nebula tones. Inner radius
    // pushed outward so the darkening only takes effect in the true corners.
    const vignette = ctx.createRadialGradient(
      cx,
      cy,
      Math.min(width, height) * 0.55,
      cx,
      cy,
      Math.max(width, height) * 0.85,
    );
    vignette.addColorStop(0, 'rgba(10, 8, 26, 0)');
    vignette.addColorStop(0.6, 'rgba(10, 8, 26, 0.15)');
    vignette.addColorStop(1, 'rgba(8, 6, 22, 0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  };

  /**
   * Per-frame twinkle overlay. Loops the brightest `TWINKLE_POOL_SIZE` non-hero,
   * non-flare stars and adds an additive halo whose alpha is modulated by
   * sin(time). Because the underlying star is already baked at full intensity
   * we can only ever *brighten* it — which happens to match how stars actually
   * twinkle to the naked eye (they appear to flicker brighter, not dim).
   *
   * Cost: ~TWINKLE_POOL_SIZE radial-gradient fills per frame, ~80 by default.
   * That's still an order of magnitude cheaper than a single meteor's ribbon.
   */
  const drawTwinkle = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
  ) => {
    if (twinkleStars.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const star of twinkleStars) {
      const wave = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinklePhase);
      // Quartic ease keeps the pool mostly quiet but lets occasional stars flare hard,
      // so the sky reads as "a few stars happen to be twinkling RIGHT NOW" rather than
      // "every bright star is wobbling on a metronome". The 0.95 cap is the visible
      // brightness boost: previously 0.55 (barely perceptible), now strong enough to
      // notice without becoming distracting.
      const intensity = wave * wave * wave * wave * 0.95;
      if (intensity < 0.01) continue;
      const tint = lerpRgb(STAR_COOL, STAR_WARM, star.warmth);
      const px = star.x * width;
      const py = star.y * height;
      const radius = star.coreRadius * 1.9;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
      grad.addColorStop(0, `rgba(${tint}, ${Math.min(1, star.baseAlpha * intensity)})`);
      grad.addColorStop(1, `rgba(${tint}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  /**
   * Per-frame hero-star pass. Each hero gets:
   *   1. A slow sub-pixel parallax offset on two independent sines — makes the
   *      brightest points of the sky feel like they're floating, even though the
   *      drift is < HERO_PARALLAX_AMP px.
   *   2. The outer bloom + inner halo + crisp core stack that the bake used to
   *      handle, now drawn at the parallaxed position.
   *   3. Intrinsic twinkle on the core alpha (hero stars don't go through the
   *      drawTwinkle pool — they twinkle here as part of their normal draw).
   *   4. If `flare`, an animated diffraction cross whose alpha and tint pulse
   *      slowly warm ↔ cool, so the brightest stars in the sky never feel inert.
   *
   * Hero stars are typically ~10 per scene, so this pass costs roughly:
   *   ~10 radial gradients (outer bloom) + 10 sprite blits (halo) + 10 fills (core)
   *   + a couple of strokes for flares. Trivial on top of meteor work.
   */
  const drawHeroStarsLive = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
  ) => {
    const spriteCool = haloSpriteCool;
    const spriteWarm = haloSpriteWarm;

    // ── Pass A: outer bloom + inner halo (additive)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const star of stars) {
      if (!star.hero) continue;

      const dx = Math.sin(time * star.driftSpeedX + star.driftPhaseX) * HERO_PARALLAX_AMP;
      const dy = Math.sin(time * star.driftSpeedY + star.driftPhaseY) * HERO_PARALLAX_AMP;
      const px = star.x * width + dx;
      const py = star.y * height + dy;
      const tint = lerpRgb(STAR_COOL, STAR_WARM, star.warmth);

      // Outer soft bloom (was previously baked) — follows the parallax.
      const bloomRadius = star.coreRadius * star.haloScale * 2.4;
      const bloom = ctx.createRadialGradient(px, py, 0, px, py, bloomRadius);
      bloom.addColorStop(0, `rgba(${tint}, ${star.baseAlpha * 0.25})`);
      bloom.addColorStop(1, `rgba(${tint}, 0)`);
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(px, py, bloomRadius, 0, Math.PI * 2);
      ctx.fill();

      // Inner halo via the cached sprite.
      const haloRadius = star.coreRadius * star.haloScale;
      const sprite = star.warmth > 0.5 ? spriteWarm : spriteCool;
      if (sprite) {
        ctx.globalAlpha = Math.min(1, star.baseAlpha * 0.85);
        ctx.drawImage(sprite, px - haloRadius, py - haloRadius, haloRadius * 2, haloRadius * 2);
        ctx.globalAlpha = 1;
      }

      // Flare cross with a slow warm↔cool pulse on alpha + tint.
      if (star.flare) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 0.9 + star.twinklePhase);
        const flareLen = haloRadius * 2.2;
        const warmShift = Math.min(1, Math.max(0, star.warmth + (pulse - 0.5) * 0.6));
        const flareTint = lerpRgb(STAR_COOL, STAR_WARM, warmShift);
        ctx.strokeStyle = `rgba(${flareTint}, ${star.baseAlpha * (0.32 + 0.28 * pulse)})`;
        ctx.lineWidth = 0.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px - flareLen, py);
        ctx.lineTo(px + flareLen, py);
        ctx.moveTo(px, py - flareLen);
        ctx.lineTo(px, py + flareLen);
        ctx.stroke();
      }
    }
    ctx.restore();

    // ── Pass B: crisp cores with intrinsic twinkle on alpha (source-over)
    ctx.save();
    for (const star of stars) {
      if (!star.hero) continue;
      const dx = Math.sin(time * star.driftSpeedX + star.driftPhaseX) * HERO_PARALLAX_AMP;
      const dy = Math.sin(time * star.driftSpeedY + star.driftPhaseY) * HERO_PARALLAX_AMP;
      const wave = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinklePhase);
      const coreAlpha = Math.min(1, star.baseAlpha * (0.85 + 0.25 * wave));
      const tint = lerpRgb(STAR_COOL, STAR_WARM, star.warmth);
      ctx.fillStyle = `rgba(${tint}, ${coreAlpha})`;
      ctx.beginPath();
      ctx.arc(star.x * width + dx, star.y * height + dy, star.coreRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  /**
   * Build a tapered ribbon polygon along `points`.
   * `widthAt(t)` returns the half-width (in CSS px) of the ribbon at
   * normalized position `t` ∈ [0, 1] (0 = tail, 1 = head).
   *
   * This replaces the old "stroke each segment" approach, which produced
   * visible round-cap "beads" at every joint where lineWidth changed.
   * One filled polygon → no joints → no beads.
   */
  const buildRibbonPath = (
    ctx: CanvasRenderingContext2D,
    points: TrailPoint[],
    widthAt: (t: number) => number,
  ) => {
    const n = points.length;
    if (n < 2) return;

    // Left edge: traverse tail → head with +perpendicular offset.
    // Right edge: traverse head → tail with −perpendicular offset.
    // Result is a closed polygon resembling a tapered teardrop.
    ctx.beginPath();

    // Tangent at point i — use the neighbor difference (central-difference for interior points).
    const getTangent = (i: number): [number, number] => {
      const prev = points[Math.max(0, i - 1)]!;
      const next = points[Math.min(n - 1, i + 1)]!;
      let dx = next.x - prev.x;
      let dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      return [dx, dy];
    };

    // Walk forward (tail → head) on the LEFT side
    for (let i = 0; i < n; i += 1) {
      const p = points[i]!;
      const t = i / (n - 1);
      const w = widthAt(t);
      const [tx, ty] = getTangent(i);
      // Perpendicular = (-ty, tx)
      const lx = p.x - ty * w;
      const ly = p.y + tx * w;
      if (i === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }

    // Walk backward (head → tail) on the RIGHT side
    for (let i = n - 1; i >= 0; i -= 1) {
      const p = points[i]!;
      const t = i / (n - 1);
      const w = widthAt(t);
      const [tx, ty] = getTangent(i);
      const rx = p.x + ty * w;
      const ry = p.y - tx * w;
      ctx.lineTo(rx, ry);
    }

    ctx.closePath();
  };

  const drawMeteor = (ctx: CanvasRenderingContext2D, m: Meteor, fade: number) => {
    const points = m.trail;
    if (points.length < 2) return;

    ctx.save();

    // Single linear gradient from tail (transparent) to head (full) used by both passes.
    const tail = points[0]!;
    const head = points[points.length - 1]!;

    // Pass A — wide soft additive halo (the bloom around the trail)
    ctx.globalCompositeOperation = 'lighter';
    const haloGrad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    haloGrad.addColorStop(0, 'rgba(170, 200, 255, 0)');
    haloGrad.addColorStop(0.7, `rgba(170, 200, 255, ${fade * 0.18})`);
    haloGrad.addColorStop(1, `rgba(170, 200, 255, ${fade * 0.45})`);
    buildRibbonPath(ctx, points, (t) => 0.75 + 2.5 * t);
    ctx.fillStyle = haloGrad;
    ctx.fill();

    // Pass B — sharp inner trail
    const coreGrad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    coreGrad.addColorStop(0, 'rgba(230, 240, 255, 0)');
    coreGrad.addColorStop(0.6, `rgba(230, 240, 255, ${fade * 0.35})`);
    coreGrad.addColorStop(1, `rgba(255, 255, 255, ${fade * 0.95})`);
    buildRibbonPath(ctx, points, (t) => 0.2 + 0.85 * t);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // Head bloom — three concentric falloffs (outer, mid, hot core)
    const outer = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 22);
    outer.addColorStop(0, `rgba(170, 200, 255, ${fade * 0.55})`);
    outer.addColorStop(1, 'rgba(170, 200, 255, 0)');
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 22, 0, Math.PI * 2);
    ctx.fill();

    const mid = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 9);
    mid.addColorStop(0, `rgba(255, 255, 255, ${fade * 0.95})`);
    mid.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
    ctx.fill();

    // Crisp core
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  /* ──────── static layer caches ──────── */

  /** Build the **backplate** cache: sky gradient + the entire NON-HERO starfield.
   *  This is the bulk of the pixel cost — and it never changes, so the per-frame
   *  cost stays at one drawImage. Hero stars + vignette are intentionally absent;
   *  they're handled separately so animation can layer on top correctly. */
  const bakeBackplate = (width: number, height: number, dpr: number) => {
    const cache = document.createElement('canvas');
    cache.width = Math.max(1, Math.floor(width * dpr));
    cache.height = Math.max(1, Math.floor(height * dpr));
    const cctx = cache.getContext('2d');
    if (!cctx) {
      backplateCache = null;
      return;
    }
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(cctx, width, height);
    drawStars(cctx, width, height);
    backplateCache = cache;
  };

  /** Build the **drift** cache: nebulas + milky-way glow on a TRANSPARENT canvas,
   *  oversized by `NEBULA_DRIFT_PADDING` on every side so the bitmap can translate
   *  freely each frame without ever exposing a transparent edge inside the visible
   *  canvas. Drawn with `screen` blend over the backplate every frame at a slow
   *  Lissajous offset — that's the "drifting cosmic dust" effect.
   *  Skipped entirely when `options.nebula` is false. */
  const bakeDriftLayer = (width: number, height: number, dpr: number) => {
    if (!showNebula) {
      driftCache = null;
      return;
    }
    const padded = NEBULA_DRIFT_PADDING * 2;
    const cache = document.createElement('canvas');
    cache.width = Math.max(1, Math.floor((width + padded) * dpr));
    cache.height = Math.max(1, Math.floor((height + padded) * dpr));
    const cctx = cache.getContext('2d');
    if (!cctx) {
      driftCache = null;
      return;
    }
    // Translate so (0,0) in the helper functions still lines up with the
    // top-left of the *visible* canvas region, leaving the padding as bleed.
    cctx.setTransform(dpr, 0, 0, dpr, NEBULA_DRIFT_PADDING * dpr, NEBULA_DRIFT_PADDING * dpr);
    // Bleed the nebula gradients across the full cache including the padding
    // ring — otherwise the drift offset can expose transparent rows at the
    // screen edge as a hard band where nebula coverage abruptly starts.
    drawNebulas(cctx, width, height, NEBULA_DRIFT_PADDING);
    drawMilkyWayGlow(cctx, width, height);
    driftCache = cache;
  };

  /** Build the **vignette** cache: corner-darken overlay on a TRANSPARENT canvas.
   *  Blitted over the animated layers (sky → drift → hero stars → twinkle) but
   *  UNDER meteors, matching the original z-order so meteor heads still glow
   *  brightly even in the darkened corners. Skipped when `options.vignette` is false. */
  const bakeVignette = (width: number, height: number, dpr: number) => {
    if (!showVignette) {
      vignetteCache = null;
      return;
    }
    const cache = document.createElement('canvas');
    cache.width = Math.max(1, Math.floor(width * dpr));
    cache.height = Math.max(1, Math.floor(height * dpr));
    const cctx = cache.getContext('2d');
    if (!cctx) {
      vignetteCache = null;
      return;
    }
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVignette(cctx, width, height);
    vignetteCache = cache;
  };

  const bakeAllCaches = (width: number, height: number, dpr: number) => {
    bakeBackplate(width, height, dpr);
    bakeDriftLayer(width, height, dpr);
    bakeVignette(width, height, dpr);
    cacheDpr = dpr;
    cacheWidth = width;
    cacheHeight = height;
  };

  /* ──────── public API ──────── */

  return {
    setup({ width, height, dpr }) {
      ensureHaloSprites();
      buildScene(width, height);
      bakeAllCaches(width, height, dpr);
    },

    draw({ ctx, width, height, time, delta, reducedMotion, dpr }) {
      // Re-bake on DPR change (window moved between displays) or any size mismatch.
      if (
        backplateCache &&
        (cacheDpr !== dpr || cacheWidth !== width || cacheHeight !== height)
      ) {
        bakeAllCaches(width, height, dpr);
      }

      // 1. Backplate: sky + non-hero starfield. Static.
      if (backplateCache) {
        ctx.drawImage(backplateCache, 0, 0, width, height);
      } else {
        drawSky(ctx, width, height);
        drawStars(ctx, width, height);
      }

      // 2. Drift layer: nebulas + milky-way glow, blitted with `screen` blend at
      //    a slow Lissajous offset. Two sines of different periods on each axis
      //    keep the motion from ever exactly repeating, so the sky never settles.
      //    In reduced-motion mode the offset is pinned to 0 — still composited so
      //    the colour pallete is preserved, just frozen in place.
      const driftX = reducedMotion
        ? 0
        : (Math.sin(time * 0.07) * 0.6 + Math.cos(time * 0.11) * 0.4) * NEBULA_DRIFT_AMP;
      const driftY = reducedMotion
        ? 0
        : (Math.sin(time * 0.05) * 0.6 + Math.cos(time * 0.09) * 0.4) * NEBULA_DRIFT_AMP;
      if (driftCache) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(
          driftCache,
          -NEBULA_DRIFT_PADDING + driftX,
          -NEBULA_DRIFT_PADDING + driftY,
          width + NEBULA_DRIFT_PADDING * 2,
          height + NEBULA_DRIFT_PADDING * 2,
        );
        ctx.restore();
      } else if (showNebula) {
        // Cache missed (and the user wants nebula) — fall back to live draw.
        drawNebulas(ctx, width, height);
        drawMilkyWayGlow(ctx, width, height);
      }

      // 3. Hero stars live (parallax + intrinsic twinkle + pulsing flare crosses).
      //    Drawn AFTER drift so they always sit in front of the moving dust clouds.
      //    In reduced-motion mode `time` is effectively frozen at 0 for the offsets
      //    by short-circuiting here — we still draw heroes so the bright stars are
      //    present, just stationary.
      drawHeroStarsLive(ctx, width, height, reducedMotion ? 0 : time);

      // 4. Vignette over everything except meteors. Skipped when disabled.
      if (vignetteCache) {
        ctx.drawImage(vignetteCache, 0, 0, width, height);
      } else if (showVignette) {
        drawVignette(ctx, width, height);
      }

      if (reducedMotion) return;

      // 5. Twinkle overlay — bumped to TWINKLE_POOL_SIZE stars with a stronger
      //    intensity curve so the sky reads as alive between meteor crossings.
      //    Drawn before meteors so meteor head bloom always renders on top.
      drawTwinkle(ctx, width, height, time);

      // 6. Spawn meteors. `meteorRate` scales spawn frequency — 0 disables
      //    new spawns entirely (existing ones still finish their arc).
      if (meteorRate > 0) {
        timeToNextMeteor -= delta * meteorRate;
        if (timeToNextMeteor <= 0 && meteors.length < MAX_METEORS) {
          meteors.push(spawnMeteor(width, height, rand));
          timeToNextMeteor = 2.0 + rand() * 3.0;
        }
      }

      // 7. Update + draw meteors
      timeSinceTrailSample += delta;
      const shouldSample = timeSinceTrailSample >= TRAIL_SAMPLE_INTERVAL;
      if (shouldSample) timeSinceTrailSample = 0;

      for (let i = meteors.length - 1; i >= 0; i -= 1) {
        const m = meteors[i];
        if (!m) continue;
        m.age += delta;
        const cos = Math.cos(m.curl * delta);
        const sin = Math.sin(m.curl * delta);
        const rvx = m.vx * cos - m.vy * sin;
        const rvy = m.vx * sin + m.vy * cos;
        m.vx = rvx;
        m.vy = rvy;
        m.x += m.vx * delta;
        m.y += m.vy * delta;

        if (shouldSample) {
          m.trail.push({ x: m.x, y: m.y });
          if (m.trail.length > TRAIL_MAX_POINTS) m.trail.shift();
        }

        const fade =
          m.age < 0.15
            ? m.age / 0.15
            : m.age > m.lifetime
              ? Math.max(0, 1 - (m.age - m.lifetime) / 0.4)
              : 1;

        drawMeteor(ctx, m, fade);

        const farOutside = m.x > width + 240 || m.x < -240 || m.y > height + 240 || m.y < -240;
        if ((farOutside && m.age > 0.4) || fade <= 0) meteors.splice(i, 1);
      }
    },
  };
}
