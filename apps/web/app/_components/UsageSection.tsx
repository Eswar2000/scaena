'use client';

import { useMemo } from 'react';
import { type BackdropId, getBackdrop } from '../_lib/backdrops';
import {
  formatPropsLiteral,
  pruneDefaults,
  type PropsValues,
} from '../_lib/backdropPropsSchema';
import { CopyButton } from './CopyButton';

type Props = {
  active: BackdropId;
  /** Same raw values the Hero is using — so the snippet stays in sync. */
  propsValues: PropsValues;
};

const INSTALL = `npm install scaena`;

/** Renders the `<Backdrop ... />` line with whatever props are non-default. */
function backdropTag(name: BackdropId, props: PropsValues): string {
  const literal = formatPropsLiteral(props, '      ');
  if (!literal) return `<Backdrop name="${name}" />`;
  return `<Backdrop name="${name}" props={${literal}} />`;
}

const USAGE = (name: BackdropId, props: PropsValues) =>
  `import { Backdrop } from 'scaena';

export default function Hero() {
  return (
    <section className="relative h-screen">
      ${backdropTag(name, props)}
      <h1 className="relative z-10">Welcome</h1>
    </section>
  );
}`;

/**
 * Install / usage code section. The usage snippet automatically reflects
 * whatever backdrop is currently active in the hero — including any
 * customizations the user dialed in from the Customize panel — so the
 * docs and the demo always stay in sync.
 */
export function UsageSection({ active, propsValues }: Props) {
  const current = getBackdrop(active);
  const liveProps = useMemo(
    () => pruneDefaults(active, propsValues),
    [active, propsValues],
  );
  const usage = useMemo(() => USAGE(active, liveProps), [active, liveProps]);

  return (
    <section
      id="usage"
      className="relative w-full px-6 py-24 sm:py-32"
      aria-labelledby="usage-heading"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">
            Install
          </p>
          <h2
            id="usage-heading"
            className="mt-2 bg-gradient-to-b from-white to-white/60 bg-clip-text text-3xl font-semibold leading-tight text-transparent sm:text-4xl"
          >
            One line. Beautiful out of the box.
          </h2>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Install — narrow column */}
          <div className="lg:col-span-2">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 p-5 backdrop-blur">
              <div className="noise-overlay rounded-2xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                    package
                  </p>
                  <pre className="mt-2 overflow-x-auto text-sm text-white/90">
                    <code>{INSTALL}</code>
                  </pre>
                </div>
                <CopyButton
                  value={INSTALL}
                  className="border-white/15 bg-white/[0.04] text-white/80 hover:border-white/30 focus:ring-white/20"
                  accentClassName="text-emerald-300"
                  compact
                />
              </div>

              <div className="shimmer-line my-5 h-px w-full" />

              <ul className="space-y-2 text-sm text-white/75">
                <li className="flex gap-2">
                  <span aria-hidden className="text-white/40">
                    →
                  </span>
                  Zero peer dependencies beyond React 18+.
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="text-white/40">
                    →
                  </span>
                  Pauses when the tab is hidden, respects reduced motion.
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="text-white/40">
                    →
                  </span>
                  Deterministic seeds — same input, same picture.
                </li>
              </ul>
            </div>
          </div>

          {/* Usage — wider column */}
          <div className="lg:col-span-3">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                  </span>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                    hero.tsx
                  </p>
                  <span
                    className={`hidden rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] sm:inline ${current.chip.surface}`}
                  >
                    {current.tag}
                  </span>
                </div>
                <CopyButton
                  value={usage}
                  className={current.chip.surface}
                  accentClassName={current.chip.optionSelected}
                  compact
                />
              </div>
              <pre className="overflow-x-auto px-5 py-5 text-sm leading-relaxed text-white/90">
                <code>{usage}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
