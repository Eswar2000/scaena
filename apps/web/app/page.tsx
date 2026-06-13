'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Backdrop, type BackdropName } from 'scaena';

type TextTheme = {
  /** color for the small uppercase eyebrow ("scaena · v0.1") */
  eyebrow: string;
  /** gradient stops for the headline (uses bg-clip-text) */
  headlineGradient: string;
  /** body paragraph color */
  body: string;
  /** label next to the dropdown */
  label: string;
  /** drop-shadow filter applied to the whole text column for legibility
   *  — much lighter than a full card, but still rescues us against busy frames */
  shadow: string;
};

/** Styling for the small interactive "chips" — the dropdown trigger, its
 *  popup, and the code snippet. These keep a stronger surface than the text
 *  so they read as UI, but their color temperature is tuned per backdrop. */
type ChipTheme = {
  /** trigger / snippet container — bg + border + text classes */
  surface: string;
  /** trigger text accent (the chevron) */
  accent: string;
  /** the popup panel that appears under the trigger */
  popup: string;
  /** an option inside the popup (default state) */
  option: string;
  /** highlighted option (hover / keyboard) */
  optionActive: string;
  /** currently selected option marker */
  optionSelected: string;
};

type BackdropEntry = {
  name: BackdropName;
  label: string;
  vibe: string;
  text: TextTheme;
  chip: ChipTheme;
};

const BACKDROPS = [
  {
    name: 'midnight-meteor',
    label: 'midnight-meteor',
    vibe: 'A still, dark night sky with softly twinkling stars and occasional meteors.',
    text: {
      eyebrow: 'text-white/60',
      headlineGradient: 'from-white to-white/60',
      body: 'text-white/70',
      label: 'text-white/50',
      // gentle glow — the sky is already dark, so we just lift the text a touch
      shadow: '[filter:drop-shadow(0_2px_12px_rgba(0,0,0,0.55))]',
    },
    chip: {
      // deep indigo-tinted glass — matches the meteor sky
      surface:
        'border-indigo-200/15 bg-slate-950/55 text-slate-100/90 hover:border-indigo-200/30 focus:border-indigo-200/40 focus:ring-indigo-200/20',
      accent: 'text-indigo-200/70',
      popup:
        'border-indigo-200/15 bg-slate-950/90 text-slate-100/90 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.7)] ring-1 ring-indigo-200/10',
      option: 'text-slate-100/85 hover:bg-indigo-400/10',
      optionActive: 'bg-indigo-400/15 text-white',
      optionSelected: 'text-indigo-200',
    },
  },
  {
    name: 'kyoto-petals',
    label: 'kyoto-petals',
    vibe: 'Cherry blossom petals drifting gently on a soft spring breeze.',
    text: {
      eyebrow: 'text-white',
      headlineGradient: 'from-white to-white/70',
      body: 'text-white/85',
      label: 'text-white/70',
      // stronger shadow — petals scene is light/pastel, white text needs a real lift
      shadow:
        '[filter:drop-shadow(0_2px_8px_rgba(0,0,0,0.45))_drop-shadow(0_1px_2px_rgba(0,0,0,0.55))]',
    },
    chip: {
      // warm rose-tinted glass — picks up the petals without competing
      surface:
        'border-rose-100/20 bg-rose-950/45 text-rose-50/95 hover:border-rose-100/35 focus:border-rose-100/45 focus:ring-rose-100/25',
      accent: 'text-rose-100/80',
      popup:
        'border-rose-100/20 bg-rose-950/85 text-rose-50/95 shadow-[0_12px_40px_-10px_rgba(60,10,30,0.55)] ring-1 ring-rose-100/10',
      option: 'text-rose-50/90 hover:bg-rose-300/10',
      optionActive: 'bg-rose-300/15 text-white',
      optionSelected: 'text-rose-200',
    },
  },
  {
    name: 'liquid-aurora',
    label: 'liquid-aurora',
    vibe: 'Liquid ribbons of emerald, cyan and violet drifting across a deep night canvas.',
    text: {
      eyebrow: 'text-white/80',
      headlineGradient: 'from-white to-emerald-100/70',
      body: 'text-white/80',
      label: 'text-white/60',
      // medium shadow — backdrop is dark with bright blobs, so text needs lift only where it crosses a blob
      shadow:
        '[filter:drop-shadow(0_2px_10px_rgba(0,0,0,0.55))_drop-shadow(0_1px_2px_rgba(0,0,0,0.45))]',
    },
    chip: {
      // emerald-tinted glass — the most iconic aurora color, sits well on indigo night
      surface:
        'border-emerald-200/20 bg-slate-950/55 text-emerald-50/95 hover:border-emerald-200/35 focus:border-emerald-200/45 focus:ring-emerald-200/25',
      accent: 'text-emerald-200/80',
      popup:
        'border-emerald-200/20 bg-slate-950/90 text-emerald-50/95 shadow-[0_12px_40px_-10px_rgba(0,30,20,0.7)] ring-1 ring-emerald-200/10',
      option: 'text-emerald-50/90 hover:bg-emerald-300/10',
      optionActive: 'bg-emerald-300/15 text-white',
      optionSelected: 'text-emerald-200',
    },
  },
  {
    name: 'tidal-drift',
    label: 'tidal-drift',
    vibe: 'Open ocean from above — slow parallel swells rolling beneath a scatter of sun glints.',
    text: {
      eyebrow: 'text-white/75',
      headlineGradient: 'from-white to-cyan-100/70',
      body: 'text-white/80',
      label: 'text-white/55',
      // medium shadow — dark background with bright moving glints; text needs a soft halo
      shadow:
        '[filter:drop-shadow(0_2px_10px_rgba(0,0,0,0.55))_drop-shadow(0_1px_2px_rgba(0,0,0,0.45))]',
    },
    chip: {
      // teal-tinted glass — calm, restrained, matches the open-Atlantic palette
      surface:
        'border-cyan-200/20 bg-slate-950/55 text-cyan-50/95 hover:border-cyan-200/35 focus:border-cyan-200/45 focus:ring-cyan-200/25',
      accent: 'text-cyan-200/80',
      popup:
        'border-cyan-200/20 bg-slate-950/90 text-cyan-50/95 shadow-[0_12px_40px_-10px_rgba(0,20,40,0.7)] ring-1 ring-cyan-200/10',
      option: 'text-cyan-50/90 hover:bg-cyan-300/10',
      optionActive: 'bg-cyan-300/15 text-white',
      optionSelected: 'text-cyan-200',
    },
  },
  {
    name: 'wire-mesa',
    label: 'wire-mesa',
    vibe: 'Sci-fi wireframe terrain rushing past — endless cyan ridges scrolling into a glowing horizon.',
    text: {
      eyebrow: 'text-cyan-100/80',
      headlineGradient: 'from-white to-cyan-100/70',
      body: 'text-cyan-50/85',
      label: 'text-cyan-100/55',
      // medium shadow — dark sky with bright cyan grid lines; text needs a soft lift
      shadow:
        '[filter:drop-shadow(0_2px_10px_rgba(0,4,16,0.65))_drop-shadow(0_1px_2px_rgba(0,4,16,0.55))]',
    },
    chip: {
      // cyan-tinted glass — picks up the wireframe grid colour
      surface:
        'border-cyan-200/25 bg-slate-950/60 text-cyan-50/95 hover:border-cyan-200/40 focus:border-cyan-200/50 focus:ring-cyan-200/25',
      accent: 'text-cyan-200/85',
      popup:
        'border-cyan-200/25 bg-slate-950/90 text-cyan-50/95 shadow-[0_12px_40px_-10px_rgba(0,10,30,0.75)] ring-1 ring-cyan-200/15',
      option: 'text-cyan-50/90 hover:bg-cyan-300/10',
      optionActive: 'bg-cyan-300/15 text-white',
      optionSelected: 'text-cyan-200',
    },
  },
  {
    name: 'flow-field',
    label: 'flow-field',
    vibe: 'Inky tendrils curling through a deep-navy void — thousands of particles drifting on a living vector field.',
    text: {
      eyebrow: 'text-violet-100/80',
      headlineGradient: 'from-white to-violet-100/70',
      body: 'text-violet-50/85',
      label: 'text-violet-100/55',
      // medium shadow — dark void with bright snaking trails; text needs a soft lift
      shadow:
        '[filter:drop-shadow(0_2px_10px_rgba(2,4,12,0.7))_drop-shadow(0_1px_2px_rgba(2,4,12,0.55))]',
    },
    chip: {
      // violet-tinted glass — sits between the cyan and pink trails
      surface:
        'border-violet-200/25 bg-slate-950/60 text-violet-50/95 hover:border-violet-200/40 focus:border-violet-200/50 focus:ring-violet-200/25',
      accent: 'text-violet-200/85',
      popup:
        'border-violet-200/25 bg-slate-950/90 text-violet-50/95 shadow-[0_12px_40px_-10px_rgba(20,8,40,0.75)] ring-1 ring-violet-200/15',
      option: 'text-violet-50/90 hover:bg-violet-300/10',
      optionActive: 'bg-violet-300/15 text-white',
      optionSelected: 'text-violet-200',
    },
  },
  {
    name: 'glyph-rain',
    label: 'glyph-rain',
    vibe: 'Cascading jade glyphs falling through a dark terminal void — code rain, restrained and cinematic.',
    text: {
      eyebrow: 'text-emerald-100/80',
      headlineGradient: 'from-white to-emerald-100/75',
      body: 'text-emerald-50/85',
      label: 'text-emerald-100/55',
      // medium shadow — dark backdrop with bright moving glyphs; text needs a soft lift
      shadow:
        '[filter:drop-shadow(0_2px_10px_rgba(2,10,8,0.7))_drop-shadow(0_1px_2px_rgba(2,10,8,0.55))]',
    },
    chip: {
      // jade-tinted glass — picks up the leading-glyph colour, terminal vibe
      surface:
        'border-emerald-300/25 bg-emerald-950/55 text-emerald-50/95 hover:border-emerald-300/40 focus:border-emerald-300/50 focus:ring-emerald-300/25',
      accent: 'text-emerald-300/85',
      popup:
        'border-emerald-300/25 bg-slate-950/90 text-emerald-50/95 shadow-[0_12px_40px_-10px_rgba(0,30,15,0.75)] ring-1 ring-emerald-300/15',
      option: 'text-emerald-50/90 hover:bg-emerald-300/10',
      optionActive: 'bg-emerald-300/15 text-white',
      optionSelected: 'text-emerald-200',
    },
  },
] as const satisfies readonly BackdropEntry[];

const DEFAULT_BACKDROP: BackdropName = 'kyoto-petals';

export default function HomePage() {
  const [active, setActive] = useState<BackdropName>(DEFAULT_BACKDROP);
  const current = BACKDROPS.find((b) => b.name === active) ?? BACKDROPS[0];
  const t = current.text;
  const c = current.chip;

  return (
    <main>
      <section className="relative isolate flex min-h-screen w-full items-center justify-center overflow-hidden py-16">
        <Backdrop name={active} />
        <div
          className={`relative z-10 mx-auto w-full max-w-3xl px-6 text-center ${t.shadow}`}
        >
          <p className={`mb-4 text-xs uppercase tracking-[0.3em] ${t.eyebrow}`}>
            scaena · v0.1
          </p>
          <h1
            className={`bg-gradient-to-b ${t.headlineGradient} bg-clip-text pb-3 text-5xl font-semibold leading-[1.25] text-transparent sm:text-7xl sm:leading-[1.2]`}
          >
            Lucide for backgrounds.
          </h1>
          <p className={`mx-auto mt-5 max-w-xl text-base sm:text-lg ${t.body}`}>
            Drop-in scenic, animated backdrops for your hero sections. One line of code,
            beautiful out of the box.
          </p>

          <div className="mx-auto mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <span className={`text-xs uppercase tracking-[0.2em] ${t.label}`}>
              Try a backdrop
            </span>
            <BackdropPicker value={active} onChange={setActive} chip={c} />
          </div>

          <pre
            className={`mx-auto mt-5 inline-block rounded-lg border px-5 py-3 text-left text-sm backdrop-blur ${c.surface}`}
          >
            <code>{`<Backdrop name="${active}" />`}</code>
          </pre>
        </div>
      </section>
    </main>
  );
}

/** Custom listbox so the popup is fully themable (native <select> popups
 *  ignore most styling on macOS/Safari). Keyboard + click-outside aware. */
function BackdropPicker({
  value,
  onChange,
  chip,
}: {
  value: BackdropName;
  onChange: (next: BackdropName) => void;
  chip: ChipTheme;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(0, BACKDROPS.findIndex((b) => b.name === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = BACKDROPS.find((b) => b.name === value) ?? BACKDROPS[0];

  // Sync highlighted option to the current value whenever the popup opens.
  useEffect(() => {
    if (!open) return;
    setActiveIdx(Math.max(0, BACKDROPS.findIndex((b) => b.name === value)));
  }, [open, value]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const commit = (idx: number) => {
    const next = BACKDROPS[idx];
    if (!next) return;
    onChange(next.name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIdx((i) => (i + 1) % BACKDROPS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIdx((i) => (i - 1 + BACKDROPS.length) % BACKDROPS.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) commit(activeIdx);
      else setOpen(true);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === 'Home') {
      if (open) {
        e.preventDefault();
        setActiveIdx(0);
      }
    } else if (e.key === 'End') {
      if (open) {
        e.preventDefault();
        setActiveIdx(BACKDROPS.length - 1);
      }
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`flex items-center gap-2 rounded-lg border py-2 pl-4 pr-3 text-sm backdrop-blur transition focus:outline-none focus:ring-2 ${chip.surface}`}
      >
        <span>{selected.label}</span>
        <span aria-hidden className={chip.accent}>
          ▾
        </span>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          className={`absolute left-1/2 z-20 mt-2 w-56 -translate-x-1/2 overflow-hidden rounded-lg border p-1 backdrop-blur ${chip.popup}`}
        >
          {BACKDROPS.map((b, i) => {
            const isSelected = b.name === value;
            const isActive = i === activeIdx;
            return (
              <li
                key={b.name}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => {
                  // prevent the button losing focus before click fires
                  e.preventDefault();
                  commit(i);
                }}
                className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition ${chip.option} ${
                  isActive ? chip.optionActive : ''
                } ${isSelected ? chip.optionSelected : ''}`}
              >
                <span>{b.label}</span>
                {isSelected && (
                  <span aria-hidden className="text-xs">
                    ✓
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
