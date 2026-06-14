'use client';

import { useEffect, useMemo, useState } from 'react';
import { Backdrop } from 'scaena';
import { type BackdropId, getBackdrop } from '../_lib/backdrops';
import { BackdropTabs } from './BackdropTabs';
import { CopyButton } from './CopyButton';

type Props = {
  /** Currently active backdrop. */
  active: BackdropId;
  /** Fired when the user picks a different backdrop. */
  onActiveChange: (next: BackdropId) => void;
};

/**
 * The hero. Holds the live backdrop, the headline, and a small reactive
 * control row (tab switcher + copy snippet). Theme classes are sourced
 * from the active backdrop entry so the hero re-tints itself the moment
 * the user picks a new scene.
 */
export function Hero({ active, onActiveChange }: Props) {
  const current = useMemo(() => getBackdrop(active), [active]);
  const t = current.text;
  const c = current.chip;

  // Track whether the user has scrolled past the fold — hide the scroll
  // cue once they're clearly engaged.
  const [showCue, setShowCue] = useState(true);
  useEffect(() => {
    const onScroll = () => setShowCue(window.scrollY < 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const snippet = `<Backdrop name="${active}" />`;

  return (
    <section
      id="hero"
      className="relative isolate flex min-h-[100svh] w-full items-center justify-center overflow-hidden py-20"
    >
      <Backdrop name={active} />

      <div
        key={active}
        className={`rise-in relative z-10 mx-auto w-full max-w-3xl px-6 text-center ${t.shadow}`}
      >
        <div className="mb-4 inline-flex items-center gap-2">
          <span className={`text-xs uppercase tracking-[0.3em] ${t.eyebrow}`}>
            scaena · v0.1
          </span>
          <span
            className={`hidden rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] sm:inline ${c.surface}`}
          >
            {current.tag}
          </span>
        </div>

        <h1
          className={`bg-gradient-to-b ${t.headlineGradient} bg-clip-text pb-3 text-5xl font-semibold leading-[1.25] text-transparent sm:text-7xl sm:leading-[1.2]`}
        >
          Lucide for backgrounds.
        </h1>

        <p className={`mx-auto mt-5 max-w-xl text-base sm:text-lg ${t.body}`}>
          Drop-in scenic, animated backdrops for your hero sections. One line of code,
          beautiful out of the box.
        </p>

        <p
          className={`mx-auto mt-3 max-w-md text-xs italic ${t.label}`}
          aria-live="polite"
        >
          {current.vibe}
        </p>

        <div className="mx-auto mt-8 flex flex-col items-center gap-4">
          <BackdropTabs
            value={active}
            onChange={onActiveChange}
            glow={c.glow}
            containerClassName={c.surface}
          />

          <pre
            className={`inline-flex items-center gap-3 rounded-lg border px-3.5 py-2 text-left text-sm backdrop-blur ${c.surface}`}
          >
            <code className="whitespace-pre">{snippet}</code>
            <CopyButton
              value={snippet}
              className={c.surface}
              accentClassName={c.optionSelected}
              compact
            />
          </pre>
        </div>
      </div>

      {/* Scroll cue — anchored to the bottom of the hero. Theme-tinted via
          the same text color so it disappears gracefully on light frames. */}
      <a
        href="#gallery"
        aria-label="Scroll to the backdrop gallery"
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.3em] transition-opacity ${t.label} ${
          showCue ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <span className="scroll-cue inline-flex flex-col items-center gap-1">
          <span>scroll</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </a>

      {/* invisible status region — used for SR users when the active
          backdrop name changes. */}
      <span aria-live="polite" className="sr-only">
        {`${current.label} backdrop`}
      </span>
    </section>
  );
}
