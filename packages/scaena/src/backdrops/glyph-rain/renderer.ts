import { createPrng } from '../../lib/prng';
import type { CanvasFrameContext } from '../../lib/useCanvas';

/* ─────────────────────────────────────────────────────────────────────────
 * glyph-rain
 *
 * Matrix-inspired cascading glyphs, deliberately restrained:
 *   - thin monospace, square cell grid
 *   - cool-jade body, near-white head
 *   - sparse columns (not every column is active at once)
 *   - body glyphs occasionally mutate
 *
 * Render model:
 *   1. Per-frame translucent bg rect fades all existing glyphs toward a
 *      near-black tinted base — this is what produces the trail falloff.
 *   2. Each column owns at most one Stream. The Stream advances its head
 *      position in fractional "rows per second"; whenever the head crosses
 *      into a new integer row, the *previous* head row is repainted as a
 *      jade "body" glyph and the new row is painted as a bright "head"
 *      glyph. The body then fades naturally over subsequent frames.
 *   3. When a stream's head falls far enough past the canvas bottom that
 *      its trail is gone, the column waits a randomised delay then spawns
 *      a fresh stream above the top.
 *
 * Cells are cleared (opaque bg rect) before each glyph paint so the new
 * character never overlaps a previous one — crisp at any density.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── Grid ── */
const CELL = 18; // px (square cell — also the row height)
const FONT_SIZE = 15;
const FONT_FAMILY =
  '"Fira Code", "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

/* ── Colours ── */
const BG_BASE = '#040b09'; // near-black with a faint green undertone
const BG_FADE = 'rgba(4, 11, 9, 0.095)'; // per-frame trail decay (higher = shorter trails)
const HEAD_COLOR = 'rgba(232, 255, 240, 0.96)'; // warm cool-white leading glyph
const BODY_COLOR = 'rgba(95, 218, 160, 0.92)'; // jade body
const MUTATE_COLOR = 'rgba(170, 240, 200, 0.85)'; // re-paint on body mutate
const HEAD_GLOW_COLOR = 'rgba(180, 255, 215, 0.65)';
const HEAD_GLOW_BLUR = 10;

/* ── Stream behaviour ── */
const COLUMN_FILL_AT_START = 0.55; // fraction of columns active at setup
const SPEED_MIN = 5; // rows / sec
const SPEED_MAX = 13;
const TAIL_BUFFER_ROWS = 22; // head must fall this far past bottom before respawn
const RESPAWN_DELAY_MIN = 0.4; // seconds before column gets a new stream
const RESPAWN_DELAY_MAX = 3.6;
const HEAD_START_OFFSET_MIN = 1; // rows above the top a new stream's head starts
const HEAD_START_OFFSET_MAX = 14;
const MUTATE_PROB_PER_SEC = 0.45; // per active stream

/* ── Glyph alphabet — half-width katakana with a sprinkle of latin/digits ── */
const GLYPHS: string[] = (() => {
  const list: string[] = [];
  // half-width katakana block (the iconic Matrix characters)
  for (let cc = 0xff66; cc <= 0xff9d; cc++) list.push(String.fromCharCode(cc));
  // a few latin/digits/symbols for variety
  for (const ch of '0123456789ABCDEFXZ:;+=*<>/?'.split('')) list.push(ch);
  return list;
})();

interface Stream {
  alive: boolean;
  headRow: number; // fractional
  prevIntRow: number; // last integer row drawn into
  speed: number; // rows / sec
  nextSpawnAt: number; // absolute time (seconds) when a dead column respawns
}

export function createGlyphRainRenderer(seed: number) {
  const rand = createPrng(seed);

  let cssW = 0;
  let cssH = 0;
  let cols = 0;
  let rows = 0;
  let primed = false;
  let streams: Stream[] = [];

  function pickGlyph(): string {
    return GLYPHS[Math.floor(rand() * GLYPHS.length)] ?? 'X';
  }

  function makeStream(time = 0): Stream {
    const startAbove =
      HEAD_START_OFFSET_MIN +
      rand() * (HEAD_START_OFFSET_MAX - HEAD_START_OFFSET_MIN);
    return {
      alive: true,
      headRow: -startAbove,
      // prevIntRow starts below headRow so the first "advance" detects the
      // initial entry — set to floor(headRow) so no spurious body rows are
      // painted above the canvas before the head arrives.
      prevIntRow: Math.floor(-startAbove),
      speed: SPEED_MIN + rand() * (SPEED_MAX - SPEED_MIN),
      nextSpawnAt: time,
    };
  }

  function paintCell(
    ctx: CanvasRenderingContext2D,
    col: number,
    row: number,
    glyph: string,
    color: string,
  ): void {
    const x = col * CELL;
    const y = row * CELL;
    // Opaque clear so the new glyph never composites over a previous one.
    ctx.fillStyle = BG_BASE;
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = color;
    ctx.fillText(glyph, x + CELL * 0.5, y + 1);
  }

  function paintHead(
    ctx: CanvasRenderingContext2D,
    col: number,
    row: number,
    glyph: string,
  ): void {
    const x = col * CELL;
    const y = row * CELL;
    ctx.fillStyle = BG_BASE;
    ctx.fillRect(x, y, CELL, CELL);
    // Subtle glow to lift the leading glyph above the trail.
    ctx.shadowColor = HEAD_GLOW_COLOR;
    ctx.shadowBlur = HEAD_GLOW_BLUR;
    ctx.fillStyle = HEAD_COLOR;
    ctx.fillText(glyph, x + CELL * 0.5, y + 1);
    ctx.shadowBlur = 0;
  }

  function setup(frame: Omit<CanvasFrameContext, 'time' | 'delta'>): void {
    cssW = frame.width;
    cssH = frame.height;
    cols = Math.max(1, Math.ceil(cssW / CELL));
    rows = Math.max(1, Math.ceil(cssH / CELL));
    primed = false;
    streams = new Array(cols);
    for (let i = 0; i < cols; i++) {
      const s = makeStream(0);
      if (rand() > COLUMN_FILL_AT_START) {
        // Stagger — this column starts dormant and spawns its first stream
        // a bit later, so we don't get a synchronised wall of heads at t=0.
        s.alive = false;
        s.nextSpawnAt = rand() * 4.0;
      }
      streams[i] = s;
    }
  }

  function draw(frame: CanvasFrameContext): void {
    const { ctx, time, delta, reducedMotion } = frame;

    if (!primed) {
      ctx.fillStyle = BG_BASE;
      ctx.fillRect(0, 0, cssW, cssH);
      primed = true;
    }

    // Trail decay — uniform fade toward the bg tint.
    ctx.fillStyle = BG_FADE;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';

    if (reducedMotion) {
      // Single static frame — a scatter of dim glyphs, no motion.
      ctx.fillStyle = BODY_COLOR;
      for (let c = 0; c < cols; c++) {
        const r = (c * 7 + 3) % rows;
        const x = c * CELL + CELL * 0.5;
        const y = r * CELL + 1;
        ctx.fillText(pickGlyph(), x, y);
      }
      return;
    }

    for (let c = 0; c < cols; c++) {
      const s = streams[c];
      if (!s) continue;

      if (!s.alive) {
        if (time >= s.nextSpawnAt) streams[c] = makeStream(time);
        continue;
      }

      s.headRow += s.speed * delta;
      const intRow = Math.floor(s.headRow);

      if (intRow > s.prevIntRow) {
        // Every row the head has *left behind* becomes a body glyph.
        const from = Math.max(s.prevIntRow, 0);
        const to = Math.min(intRow, rows); // exclusive — intRow is the new head
        for (let r = from; r < to; r++) {
          paintCell(ctx, c, r, pickGlyph(), BODY_COLOR);
        }
        // New head (only if it's actually on screen).
        if (intRow >= 0 && intRow < rows) {
          paintHead(ctx, c, intRow, pickGlyph());
        }
        s.prevIntRow = intRow;
      }

      // Body mutation — re-paint a random recent body row with a fresh
      // glyph. Cheap, and gives the stream that "live" Matrix feel.
      if (rand() < MUTATE_PROB_PER_SEC * delta) {
        const visibleTop = Math.max(0, intRow - TAIL_BUFFER_ROWS);
        const visibleBottom = Math.min(rows - 1, intRow - 1);
        if (visibleBottom >= visibleTop) {
          const r =
            visibleTop +
            Math.floor(rand() * (visibleBottom - visibleTop + 1));
          paintCell(ctx, c, r, pickGlyph(), MUTATE_COLOR);
        }
      }

      // Death: head has fallen far enough past the bottom that its trail
      // is fully gone. Schedule a delayed respawn so the column "rests".
      if (intRow > rows + TAIL_BUFFER_ROWS) {
        s.alive = false;
        s.nextSpawnAt =
          time +
          RESPAWN_DELAY_MIN +
          rand() * (RESPAWN_DELAY_MAX - RESPAWN_DELAY_MIN);
      }
    }
  }

  return { setup, draw };
}
