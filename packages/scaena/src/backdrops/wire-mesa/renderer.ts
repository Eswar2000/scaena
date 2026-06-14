import { createPrng } from '../../lib/prng';
import type { CanvasFrameContext } from '../../lib/useCanvas';

/* ─────────────────────────────────────────────────────────────────────────
 * wire-mesa
 *
 * Sci-fi wireframe terrain seen from a pilot's-eye view: deep navy sky,
 * cyan horizon glow, and a procedurally-displaced grid that scrolls toward
 * the camera so the viewer feels as if they're flying forward over endless
 * mesas and ridges. Pure Canvas 2D — pinhole-style projection, no WebGL.
 *
 * Composition (back to front):
 *   1. Sky gradient + horizon glow band (baked once per resize)
 *   2. Ground gradient + vignette
 *   3. Far→near wireframe grid (rows = lat lines, cols = lon lines)
 *      drawn in alpha buckets so we get smooth atmospheric falloff in
 *      under a dozen stroke calls per frame.
 *
 * Forward motion trick: the heightmap is anchored in world space. Each
 * frame we advance a virtual camera Z, sample terrain at the world-fixed
 * grid intersections in front of the camera, and project them with a
 * tiny pinhole model. Grid lines slide toward the viewer continuously;
 * when the camera crosses a row boundary, the closest row "snaps back" to
 * the far end of the frustum — invisibly, because the far rows fade into
 * fog.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── Grid topology ── */
const COLS = 41; // odd so x=0 is centered
const HALF_COLS = (COLS - 1) / 2;
const ROWS = 38; // visible rows from near to far
const SPACING = 0.75; // world units per grid cell (smaller = tighter visual cells)

/* ── Camera ──
 * The camera flies forward over an evolving heightmap. To avoid clipping
 * INTO the terrain when a tall ridge passes underneath, we sample the peak
 * height in a near window ahead of the camera every frame and float the
 * camera Y to `peak + CAM_CLEARANCE`, with exponential smoothing so the
 * follow never feels jerky. CAM_BASE_HEIGHT is a floor — over flat terrain
 * the camera settles to it instead of dropping to ground level. */
const CAM_BASE_HEIGHT = 1.35; // minimum world-Y above ground plane
const CAM_CLEARANCE = 0.85; // world units of headroom above the local peak
const CAM_FOLLOW_TAU = 0.55; // seconds of smoothing on the follow (lower = snappier)
const CAM_SAMPLE_AHEAD_NEAR = 0.5; // start sampling this far ahead of camera
const CAM_SAMPLE_AHEAD_FAR = 6; // stop sampling here (anything farther is too soft to clip)
const CAM_SAMPLE_Z_SLICES = 5;
const BOB_AMP = 0.05; // gentle vertical bob — keeps the scene alive
const BOB_FREQ = 0.16; // Hz
const SCROLL_SPEED = 2.4; // world units per second (forward)

/* ── Terrain heightmap ── */
const HEIGHT_SCALE = 1.55;

/* ── Atmospheric fog ──
 * FOG_FAR sits a touch beyond the farthest row distance (ROWS * SPACING)
 * so newly-spawning back rows truly start at alpha 0 and ease in, instead
 * of popping at a non-zero alpha. */
const FOG_NEAR = 4; // distance where fade begins
const FOG_FAR = 32; // distance where lines vanish completely (> ROWS*SPACING = 28.5)

/* ── Camera framing ── */
const HORIZON_RATIO = 0.42; // horizon screen-Y as fraction of canvas height
const FOCAL_RATIO = 0.95; // focal length relative to canvas height (FOV control)

/* ── Palette ── */
const SKY_TOP = '#020310';
const SKY_HORIZON = '#070b1c';
const GROUND_MID = '#040614';
const GROUND_FLOOR = '#01020a';
const GRID_NEAR_RGB: [number, number, number] = [150, 230, 255];
const GRID_FAR_RGB: [number, number, number] = [55, 110, 175];
const HORIZON_GLOW_CYAN = '110, 200, 255';
const HORIZON_GLOW_VIOLET = '170, 90, 220';

/* ── Alpha buckets (column segments only) ──
 * Column SEGMENTS are bucketed because there are hundreds of them — fewer
 * stroke calls means tighter perf. Rows are stroked individually with their
 * exact fog alpha (only ~ROWS+1 strokes/frame), so the farthest row eases
 * in continuously from 0 instead of snapping at a bucket boundary. */
const COL_BUCKET_COUNT = 12;

interface TerrainPhases {
  p0: number;
  p1: number;
  p2: number;
  p3: number;
}

// biome-ignore lint/complexity/noBannedTypes: deliberate placeholder — will gain keys later
export interface WireMesaOptions {}

export function createWireMesaRenderer(seed: number) {
  const rand = createPrng(seed);
  const phases: TerrainPhases = {
    p0: rand() * Math.PI * 2,
    p1: rand() * Math.PI * 2,
    p2: rand() * Math.PI * 2,
    p3: rand() * Math.PI * 2,
  };

  let cssW = 0;
  let cssH = 0;
  let horizonY = 0;
  let focal = 0;
  let cx = 0;
  let bgCache: HTMLCanvasElement | null = null;
  // Persists across draws so the follow camera has memory between frames.
  let camYSmoothed = CAM_BASE_HEIGHT;

  // Reusable per-frame vertex storage (flat typed arrays for speed).
  // Layout: idx = r * COLS + c
  let vx: Float32Array | null = null;
  let vy: Float32Array | null = null;
  let vd: Float32Array | null = null;
  let valid: Uint8Array | null = null;

  /** Layered ridge + detail noise. Anchored in world space. */
  function heightAt(x: number, z: number): number {
    // Big sweeping ridges along x — these read as mountain spines
    const ridgeA = Math.abs(Math.sin(x * 0.14 + z * 0.05 + phases.p0));
    // Cross-grain ridges for variety
    const ridgeB = Math.abs(Math.sin(x * 0.31 - z * 0.09 + phases.p1));
    // Higher-frequency surface detail
    const detail = Math.sin(x * 0.62 + z * 0.41 + phases.p2) * 0.35;
    // Bands of taller / shorter terrain along z give "mountain ranges"
    const zBand = 0.55 + 0.45 * Math.sin(z * 0.08 + phases.p3);
    // Mountains grow taller in the distance (foreground stays gentler)
    const distScale = 0.4 + 0.6 * Math.min(1, z / 18);
    return ((ridgeA * 0.95 + ridgeB * 0.55) * zBand + detail) * distScale * HEIGHT_SCALE;
  }

  function bakeBackground(): void {
    bgCache = document.createElement('canvas');
    bgCache.width = Math.max(1, Math.round(cssW));
    bgCache.height = Math.max(1, Math.round(cssH));
    const g = bgCache.getContext('2d');
    if (!g) return;

    // Sky band: top → horizon
    const sky = g.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(1, SKY_HORIZON);
    g.fillStyle = sky;
    g.fillRect(0, 0, cssW, horizonY + 1);

    // Ground band: horizon → bottom
    const ground = g.createLinearGradient(0, horizonY, 0, cssH);
    ground.addColorStop(0, SKY_HORIZON);
    ground.addColorStop(0.5, GROUND_MID);
    ground.addColorStop(1, GROUND_FLOOR);
    g.fillStyle = ground;
    g.fillRect(0, horizonY - 1, cssW, cssH - horizonY + 2);

    // Horizon glow band — soft cyan halo across the seam
    const glowH = Math.max(40, cssH * 0.09);
    const glow = g.createLinearGradient(0, horizonY - glowH * 0.5, 0, horizonY + glowH * 0.5);
    glow.addColorStop(0, `rgba(${HORIZON_GLOW_CYAN}, 0)`);
    glow.addColorStop(0.5, `rgba(${HORIZON_GLOW_CYAN}, 0.32)`);
    glow.addColorStop(1, `rgba(${HORIZON_GLOW_CYAN}, 0)`);
    g.fillStyle = glow;
    g.fillRect(0, horizonY - glowH * 0.5, cssW, glowH);

    // Wide violet radial at the horizon for color depth (additive)
    const radial = g.createRadialGradient(
      cssW / 2,
      horizonY,
      10,
      cssW / 2,
      horizonY,
      cssW * 0.65,
    );
    radial.addColorStop(0, `rgba(${HORIZON_GLOW_VIOLET}, 0.12)`);
    radial.addColorStop(0.5, `rgba(${HORIZON_GLOW_VIOLET}, 0.04)`);
    radial.addColorStop(1, `rgba(${HORIZON_GLOW_VIOLET}, 0)`);
    g.globalCompositeOperation = 'screen';
    g.fillStyle = radial;
    g.fillRect(0, 0, cssW, cssH);
    g.globalCompositeOperation = 'source-over';

    // Vignette — corners pulled toward black to focus the eye
    const vignette = g.createRadialGradient(
      cssW / 2,
      cssH / 2,
      Math.min(cssW, cssH) * 0.45,
      cssW / 2,
      cssH / 2,
      Math.max(cssW, cssH) * 0.78,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vignette;
    g.fillRect(0, 0, cssW, cssH);
  }

  function setup(frame: Omit<CanvasFrameContext, 'time' | 'delta'>): void {
    cssW = frame.width;
    cssH = frame.height;
    horizonY = Math.round(cssH * HORIZON_RATIO);
    focal = cssH * FOCAL_RATIO;
    cx = cssW * 0.5;
    const n = (ROWS + 1) * COLS;
    vx = new Float32Array(n);
    vy = new Float32Array(n);
    vd = new Float32Array(n);
    valid = new Uint8Array(n);
    // Prime the follow camera with the actual starting peak so the very first
    // frame doesn't clip through a ridge at scroll=0.
    camYSmoothed = computeTargetCamY(0);
    bakeBackground();
  }

  /** Maximum terrain height across the near window in front of the camera,
   *  plus a clearance margin. Used as the follow camera's target Y. */
  function computeTargetCamY(scroll: number): number {
    let peak = -Infinity;
    for (let zi = 0; zi < CAM_SAMPLE_Z_SLICES; zi++) {
      const t = zi / (CAM_SAMPLE_Z_SLICES - 1);
      const worldZ = scroll + CAM_SAMPLE_AHEAD_NEAR + t * (CAM_SAMPLE_AHEAD_FAR - CAM_SAMPLE_AHEAD_NEAR);
      for (let c = 0; c < COLS; c++) {
        const worldX = (c - HALF_COLS) * SPACING;
        const h = heightAt(worldX, worldZ);
        if (h > peak) peak = h;
      }
    }
    if (!Number.isFinite(peak)) peak = 0;
    return Math.max(CAM_BASE_HEIGHT, peak + CAM_CLEARANCE);
  }

  /** Smooth fog falloff: 1 at FOG_NEAR, 0 at FOG_FAR, ease-out in between. */
  function fogAlpha(z: number): number {
    if (z <= FOG_NEAR) return 1;
    if (z >= FOG_FAR) return 0;
    const t = (z - FOG_NEAR) / (FOG_FAR - FOG_NEAR);
    return 1 - t * t;
  }

  /** Map continuous fog alpha to a column-segment bucket index (0 = brightest). */
  function colBucketFor(z: number): number {
    const a = fogAlpha(z);
    if (a <= 0) return -1;
    // Bucket index 0..(COL_BUCKET_COUNT-1), brightest = 0.
    const idx = Math.floor((1 - a) * COL_BUCKET_COUNT);
    return Math.min(COL_BUCKET_COUNT - 1, Math.max(0, idx));
  }

  /** Representative alpha for a column-segment bucket index. */
  function colBucketAlpha(bucketIdx: number): number {
    // Sample at the bucket centre for visually correct midpoint colour.
    return Math.max(0, 1 - (bucketIdx + 0.5) / COL_BUCKET_COUNT);
  }

  /** Bucket stroke colour: cool cyan→deep blue gradient along distance. */
  function bucketStrokeColor(bucketIdx: number, alpha: number): string {
    const t = bucketIdx / (COL_BUCKET_COUNT - 1);
    const r = Math.round(GRID_NEAR_RGB[0] + (GRID_FAR_RGB[0] - GRID_NEAR_RGB[0]) * t);
    const g = Math.round(GRID_NEAR_RGB[1] + (GRID_FAR_RGB[1] - GRID_NEAR_RGB[1]) * t);
    const b = Math.round(GRID_NEAR_RGB[2] + (GRID_FAR_RGB[2] - GRID_NEAR_RGB[2]) * t);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }

  /** Per-row stroke colour with continuous alpha and distance-based RGB blend. */
  function rowStrokeColor(distNorm: number, alpha: number): string {
    const t = Math.min(1, Math.max(0, distNorm));
    const r = Math.round(GRID_NEAR_RGB[0] + (GRID_FAR_RGB[0] - GRID_NEAR_RGB[0]) * t);
    const g = Math.round(GRID_NEAR_RGB[1] + (GRID_FAR_RGB[1] - GRID_NEAR_RGB[1]) * t);
    const b = Math.round(GRID_NEAR_RGB[2] + (GRID_FAR_RGB[2] - GRID_NEAR_RGB[2]) * t);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }

  function draw(frame: CanvasFrameContext): void {
    const { ctx, time, delta, reducedMotion } = frame;
    if (!vx || !vy || !vd || !valid) return;

    // Background blit
    if (bgCache) ctx.drawImage(bgCache, 0, 0, cssW, cssH);

    const scroll = reducedMotion ? 0 : time * SCROLL_SPEED;

    // Follow camera: target the local peak + clearance, exp-smoothed toward it.
    // Frame-rate-independent decay: alpha = 1 - exp(-dt / tau).
    const targetCamY = computeTargetCamY(scroll);
    if (reducedMotion) {
      camYSmoothed = targetCamY;
    } else {
      const alpha = 1 - Math.exp(-delta / CAM_FOLLOW_TAU);
      camYSmoothed += (targetCamY - camYSmoothed) * alpha;
    }
    const camY = camYSmoothed + (reducedMotion ? 0 : Math.sin(time * BOB_FREQ * Math.PI * 2) * BOB_AMP);
    const scrollFloor = Math.floor(scroll / SPACING) * SPACING;
    const scrollFrac = scroll - scrollFloor;

    // Project every grid vertex into screen space
    for (let r = 0; r <= ROWS; r++) {
      const dist = (r + 1) * SPACING - scrollFrac;
      const worldZ = scrollFloor + (r + 1) * SPACING;
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (dist <= 0.08) {
          valid[idx] = 0;
          continue;
        }
        const worldX = (c - HALF_COLS) * SPACING;
        const worldY = heightAt(worldX, worldZ);
        const invDist = 1 / dist;
        vx[idx] = cx + worldX * focal * invDist;
        vy[idx] = horizonY + (camY - worldY) * focal * invDist;
        vd[idx] = dist;
        valid[idx] = 1;
      }
    }

    // Path accumulators:
    //   - One Path2D per ROW — each row gets its own continuous-alpha stroke
    //     so newly-spawning back rows ease in from alpha 0 with no popping.
    //   - One Path2D per COLUMN BUCKET — column segments are many, so we
    //     bucket them by midpoint distance for stroke-call economy.
    const rowPaths: Path2D[] = new Array(ROWS + 1);
    const rowDistNorm: number[] = new Array(ROWS + 1);
    const rowAlpha: number[] = new Array(ROWS + 1);
    for (let r = 0; r <= ROWS; r++) {
      rowPaths[r] = new Path2D();
      rowDistNorm[r] = 0;
      rowAlpha[r] = 0;
    }
    const colPaths: Path2D[] = new Array(COL_BUCKET_COUNT);
    for (let b = 0; b < COL_BUCKET_COUNT; b++) {
      colPaths[b] = new Path2D();
    }

    // Rows: build polylines and capture each row's exact fog alpha.
    for (let r = 0; r <= ROWS; r++) {
      const dist = (r + 1) * SPACING - scrollFrac;
      const a = fogAlpha(dist);
      if (a <= 0) continue;
      rowAlpha[r] = a;
      // Normalised distance ∈ [0,1] across the visible depth, for RGB blend.
      rowDistNorm[r] = Math.min(1, Math.max(0, (dist - FOG_NEAR) / (FOG_FAR - FOG_NEAR)));
      const path = rowPaths[r] as Path2D;
      let started = false;
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (!valid[idx]) {
          started = false;
          continue;
        }
        const x = vx[idx] as number;
        const y = vy[idx] as number;
        if (!started) {
          path.moveTo(x, y);
          started = true;
        } else {
          path.lineTo(x, y);
        }
      }
    }

    // Cols: per-segment, bucketed by midpoint distance into COL_BUCKET_COUNT bands.
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const a = r * COLS + c;
        const bIdx = (r + 1) * COLS + c;
        if (!valid[a] || !valid[bIdx]) continue;
        const da = vd[a] as number;
        const db = vd[bIdx] as number;
        const midDist = (da + db) * 0.5;
        const bucket = colBucketFor(midDist);
        if (bucket < 0) continue;
        const path = colPaths[bucket] as Path2D;
        path.moveTo(vx[a] as number, vy[a] as number);
        path.lineTo(vx[bIdx] as number, vy[bIdx] as number);
      }
    }

    // Stroke back-to-front so foreground sits on top.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Column-segment buckets first (back→front).
    for (let b = COL_BUCKET_COUNT - 1; b >= 0; b--) {
      const alpha = colBucketAlpha(b);
      if (alpha <= 0) continue;
      ctx.strokeStyle = bucketStrokeColor(b, alpha);
      ctx.lineWidth = b === 0 ? 1.35 : 1;
      ctx.stroke(colPaths[b] as Path2D);
    }
    // Rows back→front — each with its own continuous alpha.
    for (let r = ROWS; r >= 0; r--) {
      const alpha = rowAlpha[r];
      if (alpha === undefined || alpha <= 0) continue;
      ctx.strokeStyle = rowStrokeColor(rowDistNorm[r] as number, alpha);
      // Match the brightest column-bucket weight for the closest few rows.
      ctx.lineWidth = alpha > 0.85 ? 1.35 : 1;
      ctx.stroke(rowPaths[r] as Path2D);
    }
  }

  return { setup, draw };
}
