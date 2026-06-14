'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Backdrop } from 'scaena';
import { type BackdropId, getBackdrop } from '../_lib/backdrops';
import {
  formatPropsLiteral,
  pruneDefaults,
  type PropsValues,
} from '../_lib/backdropPropsSchema';
import { BackdropTabs } from './BackdropTabs';
import { CopyButton } from './CopyButton';
import { PropsPanel } from './PropsPanel';

type Props = {
  /** Currently active backdrop. */
  active: BackdropId;
  /** Fired when the user picks a different backdrop. */
  onActiveChange: (next: BackdropId) => void;
  /** Current raw values for the active backdrop's props panel. */
  propsValues: PropsValues;
  /** Fired when the user tweaks any control in the props panel. */
  onPropsChange: (next: PropsValues) => void;
  /** Reset the active backdrop's props to library defaults. */
  onPropsReset: () => void;
};

/**
 * The hero. Holds the live backdrop, the headline, and a small reactive
 * control row (tab switcher + customize panel + copy snippet). Theme
 * classes are sourced from the active backdrop entry so the hero re-tints
 * itself the moment the user picks a new scene.
 */
export function Hero({
  active,
  onActiveChange,
  propsValues,
  onPropsChange,
  onPropsReset,
}: Props) {
  const current = useMemo(() => getBackdrop(active), [active]);
  const t = current.text;
  const c = current.chip;

  // Stable seed per backdrop. Without this, omitting `seed` makes the
  // renderer fall back to `Math.random()` inside its `useMemo`, and since
  // that `useMemo` also depends on the option props, every slider tweak
  // would re-roll the whole scene. Pinning a seed per backdrop keeps the
  // layout consistent while editing — picking a different backdrop still
  // gives a fresh, randomised look the first time you visit it.
  const seedsRef = useRef<Partial<Record<BackdropId, number>>>({});
  if (seedsRef.current[active] === undefined) {
    seedsRef.current[active] = Math.floor(Math.random() * 2 ** 31);
  }
  const seed = seedsRef.current[active] as number;

  // Strip values that match library defaults so we don't pass redundant
  // props to the backdrop or render them in the snippet.
  const liveProps = useMemo(
    () => pruneDefaults(active, propsValues),
    [active, propsValues],
  );

  const snippet = useMemo(() => {
    const literal = formatPropsLiteral(liveProps, '');
    return literal
      ? `<Backdrop name="${active}" props={${literal}} />`
      : `<Backdrop name="${active}" />`;
  }, [active, liveProps]);

  // Track whether the user has scrolled past the fold — hide the scroll
  // cue once they're clearly engaged.
  const [showCue, setShowCue] = useState(true);
  useEffect(() => {
    const onScroll = () => setShowCue(window.scrollY < 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <section
      id="hero"
      className="relative isolate flex min-h-[100svh] w-full items-center justify-center overflow-hidden py-20"
    >
      {/* `as never` here: the Backdrop union narrows `props` per `name`, but
          our schema-driven values are typed loosely as `Record<string, unknown>`.
          The schema guarantees keys are valid for the active backdrop. */}
      <Backdrop name={active} seed={seed} props={liveProps as never} />

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

          <PropsPanel
            active={active}
            values={propsValues}
            onChange={onPropsChange}
            onReset={onPropsReset}
          />

          <pre
            className={`inline-flex max-w-full items-start gap-3 overflow-x-auto rounded-lg border px-3.5 py-2 text-left text-sm backdrop-blur ${c.surface}`}
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
