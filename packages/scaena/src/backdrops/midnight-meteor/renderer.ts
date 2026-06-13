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

const SKY_TOP = '#020310';
const SKY_BOTTOM = '#070a1c';

// Nebula palette — deep, low-saturation tones that read as "atmospheric depth"
const NEBULA_COLORS = ['62, 38, 110', '32, 60, 110', '110, 38, 80', '40, 80, 130', '80, 30, 90'];

const MAX_METEORS = 5;
const TRAIL_MAX_POINTS = 64;
const TRAIL_SAMPLE_INTERVAL = 1 / 120; // sample more often → smoother ribbon at any framerate
const SPAWN_MARGIN = 80;
const HALO_SPRITE_SIZE = 64;

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

export function createMidnightMeteorRenderer(seed: number): MeteorRenderer {
  // Two independent PRNGs:
  //   - `rand` (stateful) drives transient stuff: meteor spawn properties, timing.
  //   - `buildScene` creates a FRESH scene PRNG from `seed` on every rebuild,
  //     so resize → re-bake produces the IDENTICAL starfield. Without this,
  //     ResizeObserver firing 2-3 times during initial layout (or any real
  //     resize) reshuffles all stars and looks like the sky is blinking.
  const rand = createPrng(seed);
  let nebulas: NebulaCloud[] = [];
  let stars: Star[] = [];
  const meteors: Meteor[] = [];
  let timeToNextMeteor = 1.0 + rand() * 1.5;
  let timeSinceTrailSample = 0;

  // Offscreen canvas holding the pre-rendered static layers (sky, nebulas, milky way,
  // hero star outer bloom, vignette). Re-baked only on setup/resize — not every frame.
  // This is the single biggest perf win in the renderer: instead of recreating ~6 radial
  // gradients + filling rect-sized regions every frame, we just blit one bitmap.
  let staticCache: HTMLCanvasElement | null = null;
  let staticCacheDpr = 1;

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
    for (let i = 0; i < nebulaCount; i += 1) {
      nebulas.push({
        cx: 0.15 + srand() * 0.7,
        cy: 0.15 + srand() * 0.7,
        radius: Math.max(width, height) * (0.35 + srand() * 0.4),
        color: NEBULA_COLORS[Math.floor(srand() * NEBULA_COLORS.length)] ?? NEBULA_COLORS[0]!,
        alpha: 0.18 + srand() * 0.18,
      });
    }

    // ── Milky way: diagonal band across the canvas
    mwAngle = (srand() - 0.5) * 0.6 + Math.PI * 0.18; // ~10°..30° from horizontal, mostly tilted up-right
    mwOffset = (srand() - 0.5) * height * 0.3 + height * 0.45; // band crosses near vertical center
    mwThickness = Math.min(width, height) * (0.22 + srand() * 0.08);

    // ── Stars: density scales with area. Capped at 320 — high enough for a dense
    //    sky, low enough to leave plenty of frame budget for meteors + post-FX.
    const area = width * height;
    const total = Math.min(320, Math.floor(area / 3600));

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
      });
    }
    // Sort so dim stars draw first, hero stars on top (avoids halo-cutoff artifacts)
    next.sort((a, b) => (a.hero === b.hero ? a.coreRadius - b.coreRadius : a.hero ? 1 : -1));
    stars = next;
  };

  /* ──────── draw passes ──────── */

  const drawSky = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
  };

  const drawNebulas = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
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
      ctx.fillRect(0, 0, width, height);
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
    // Stars draw ONCE into the static cache — no per-frame star work at all.
    // Twinkle was barely perceptible on a backdrop the user is reading text over,
    // and removing the per-frame star loop is the single biggest fluidity win:
    // every frame goes from ~640 ops down to 1 drawImage + a handful for meteors.
    const spriteCool = haloSpriteCool;
    const spriteWarm = haloSpriteWarm;

    // ── Pass A: inner halos via pre-rendered sprites + flare crosses
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const star of stars) {
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
    const vignette = ctx.createRadialGradient(
      cx,
      cy,
      Math.min(width, height) * 0.35,
      cx,
      cy,
      Math.max(width, height) * 0.8,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
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

  /* ──────── static layer cache ──────── */

  // Re-bake the offscreen "backplate" containing everything that never changes:
  // sky gradient, nebula clouds, milky way glow, the full starfield, vignette.
  //
  // Per-frame cost after baking is 1 drawImage + meteor work — that's it.
  // No per-frame star loops, no per-frame gradient creation. This restores
  // the v1-level fluidity of meteor motion while keeping all v2 visual richness.
  const bakeStaticCache = (width: number, height: number, dpr: number) => {
    const cache = document.createElement('canvas');
    cache.width = Math.max(1, Math.floor(width * dpr));
    cache.height = Math.max(1, Math.floor(height * dpr));
    const cctx = cache.getContext('2d');
    if (!cctx) {
      staticCache = null;
      return;
    }
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawSky(cctx, width, height);
    drawNebulas(cctx, width, height);
    drawMilkyWayGlow(cctx, width, height);

    // Hero star OUTER bloom (large soft glow under the regular halo)
    cctx.save();
    cctx.globalCompositeOperation = 'lighter';
    for (const star of stars) {
      if (!star.hero) continue;
      const px = star.x * width;
      const py = star.y * height;
      const bloomRadius = star.coreRadius * star.haloScale * 2.4;
      const tint = lerpRgb(STAR_COOL, STAR_WARM, star.warmth);
      const bloom = cctx.createRadialGradient(px, py, 0, px, py, bloomRadius);
      bloom.addColorStop(0, `rgba(${tint}, ${star.baseAlpha * 0.25})`);
      bloom.addColorStop(1, `rgba(${tint}, 0)`);
      cctx.fillStyle = bloom;
      cctx.beginPath();
      cctx.arc(px, py, bloomRadius, 0, Math.PI * 2);
      cctx.fill();
    }
    cctx.restore();

    // Full starfield (halos + cores + flares) — baked once, blitted forever.
    drawStars(cctx, width, height);

    drawVignette(cctx, width, height);

    staticCache = cache;
    staticCacheDpr = dpr;
  };

  /* ──────── public API ──────── */

  return {
    setup({ width, height, dpr }) {
      ensureHaloSprites();
      buildScene(width, height);
      bakeStaticCache(width, height, dpr);
    },

    draw({ ctx, width, height, delta, reducedMotion, dpr }) {
      // Re-bake if the active DPR changed (e.g. window moved to a different display).
      if (staticCache && staticCacheDpr !== dpr) bakeStaticCache(width, height, dpr);

      // 1. Blit the pre-rendered static backplate (one drawImage call → GPU-fast).
      // Contains: sky + nebulas + milky way + full starfield + vignette.
      if (staticCache) {
        ctx.drawImage(staticCache, 0, 0, width, height);
      } else {
        // Fallback if the cache failed to allocate — draw live.
        drawSky(ctx, width, height);
        drawNebulas(ctx, width, height);
        drawMilkyWayGlow(ctx, width, height);
        drawStars(ctx, width, height);
      }

      if (reducedMotion) return;

      // 2. Spawn meteors
      timeToNextMeteor -= delta;
      if (timeToNextMeteor <= 0 && meteors.length < MAX_METEORS) {
        meteors.push(spawnMeteor(width, height, rand));
        timeToNextMeteor = 2.0 + rand() * 3.0;
      }

      // 3. Update + draw meteors
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
