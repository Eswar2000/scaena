'use client';

import { Backdrop } from 'scaena';
import { BACKDROPS, type BackdropId } from '../_lib/backdrops';

type Props = {
  active: BackdropId;
  onPick: (next: BackdropId) => void;
};

/**
 * A responsive grid of live, miniature backdrop previews. Each tile is a
 * real `<Backdrop />` instance scaled into a small card, so what you see
 * is exactly what you'll ship. Click a tile to promote it into the hero.
 *
 * Performance notes: every tile runs its own `requestAnimationFrame` loop,
 * but the canvases are tiny (~140-220px tall) and `useCanvas` already
 * pauses when the tab is hidden, so the cost stays modest.
 */
export function Gallery({ active, onPick }: Props) {
  return (
    <section
      id="gallery"
      className="relative w-full px-6 py-24 sm:py-32"
      aria-labelledby="gallery-heading"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/45">
              Gallery
            </p>
            <h2
              id="gallery-heading"
              className="mt-2 bg-gradient-to-b from-white to-white/60 bg-clip-text text-3xl font-semibold leading-tight text-transparent sm:text-4xl"
            >
              Every backdrop, live.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/60">
              These previews are the actual components running in your
              browser — exactly what you'll see when you drop one into your
              own hero. Tap a tile to spotlight it above.
            </p>
          </div>
          <span className="text-xs uppercase tracking-[0.18em] text-white/40">
            {BACKDROPS.length} scenes
          </span>
        </header>

        <ul
          role="list"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {BACKDROPS.map((b) => {
            const isActive = b.name === active;
            return (
              <li key={b.name}>
                <button
                  type="button"
                  onClick={() => onPick(b.name)}
                  aria-label={`Use ${b.label} as the hero backdrop`}
                  className={`group block w-full overflow-hidden rounded-2xl border bg-slate-950/40 text-left backdrop-blur transition-colors duration-200 hover:border-white/20 focus:outline-none focus-visible:ring-2 ${
                    isActive
                      ? `border-white/25 ring-2 ${b.chip.ring}`
                      : 'border-white/10'
                  }`}
                >
                  {/* Live preview. The aspect ratio gives every tile the
                      same canvas height so motion patterns are comparable. */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden">
                    <Backdrop name={b.name} />
                    {/* Soft gradient at the bottom so the label always reads. */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 via-black/25 to-transparent" />
                    {isActive && (
                      <span className="absolute right-2 top-2 z-10 rounded-full border border-white/20 bg-black/55 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/90 backdrop-blur">
                        Live
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {b.label}
                      </p>
                      <p className="truncate text-xs text-white/55">{b.tag}</p>
                    </div>
                    <span
                      aria-hidden
                      className="inline-flex items-center gap-1 text-xs text-white/60 transition-colors group-hover:text-white"
                    >
                      Use
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14" />
                        <path d="M13 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
