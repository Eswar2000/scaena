import type { BackdropName } from 'scaena';

/** Visual theme for the per-backdrop text column (eyebrow / headline / body). */
export type TextTheme = {
  eyebrow: string;
  headlineGradient: string;
  body: string;
  label: string;
  /** drop-shadow filter applied to the text column for legibility on busy frames. */
  shadow: string;
};

/** Visual theme for small interactive "chips" (tabs, snippets, popups). */
export type ChipTheme = {
  surface: string;
  accent: string;
  popup: string;
  option: string;
  optionActive: string;
  optionSelected: string;
  /** color used for the sliding tab indicator + the spotlight glow on cards */
  glow: string;
  /** ring color used on tile focus */
  ring: string;
};

export type BackdropEntry = {
  name: BackdropName;
  label: string;
  /** one-liner describing the mood */
  vibe: string;
  /** for the small typo tag in the tab and the hero badge */
  tag: string;
  text: TextTheme;
  chip: ChipTheme;
};

export const BACKDROPS = [
  {
    name: 'midnight-meteor',
    label: 'midnight-meteor',
    tag: 'night',
    vibe: 'A still, dark night sky with softly twinkling stars and occasional meteors.',
    text: {
      eyebrow: 'text-white/60',
      headlineGradient: 'from-white to-white/60',
      body: 'text-white/70',
      label: 'text-white/50',
      shadow: '[filter:drop-shadow(0_2px_12px_rgba(0,0,0,0.55))]',
    },
    chip: {
      surface:
        'border-indigo-200/15 bg-slate-950/55 text-slate-100/90 hover:border-indigo-200/30 focus:border-indigo-200/40 focus:ring-indigo-200/20',
      accent: 'text-indigo-200/70',
      popup:
        'border-indigo-200/15 bg-slate-950/90 text-slate-100/90 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.7)] ring-1 ring-indigo-200/10',
      option: 'text-slate-100/85 hover:bg-indigo-400/10',
      optionActive: 'bg-indigo-400/15 text-white',
      optionSelected: 'text-indigo-200',
      glow: 'rgba(165,180,252,0.55)',
      ring: 'ring-indigo-300/40',
    },
  },
  {
    name: 'kyoto-petals',
    label: 'kyoto-petals',
    tag: 'spring',
    vibe: 'Cherry blossom petals drifting gently on a soft spring breeze.',
    text: {
      eyebrow: 'text-white',
      headlineGradient: 'from-white to-white/70',
      body: 'text-white/85',
      label: 'text-white/70',
      shadow:
        '[filter:drop-shadow(0_2px_8px_rgba(0,0,0,0.45))_drop-shadow(0_1px_2px_rgba(0,0,0,0.55))]',
    },
    chip: {
      surface:
        'border-rose-100/20 bg-rose-950/45 text-rose-50/95 hover:border-rose-100/35 focus:border-rose-100/45 focus:ring-rose-100/25',
      accent: 'text-rose-100/80',
      popup:
        'border-rose-100/20 bg-rose-950/85 text-rose-50/95 shadow-[0_12px_40px_-10px_rgba(60,10,30,0.55)] ring-1 ring-rose-100/10',
      option: 'text-rose-50/90 hover:bg-rose-300/10',
      optionActive: 'bg-rose-300/15 text-white',
      optionSelected: 'text-rose-200',
      glow: 'rgba(254,205,211,0.55)',
      ring: 'ring-rose-300/40',
    },
  },
  {
    name: 'liquid-aurora',
    label: 'liquid-aurora',
    tag: 'aurora',
    vibe: 'Liquid ribbons of emerald, cyan and violet drifting across a deep night canvas.',
    text: {
      eyebrow: 'text-white/80',
      headlineGradient: 'from-white to-emerald-100/70',
      body: 'text-white/80',
      label: 'text-white/60',
      shadow:
        '[filter:drop-shadow(0_2px_10px_rgba(0,0,0,0.55))_drop-shadow(0_1px_2px_rgba(0,0,0,0.45))]',
    },
    chip: {
      surface:
        'border-emerald-200/20 bg-slate-950/55 text-emerald-50/95 hover:border-emerald-200/35 focus:border-emerald-200/45 focus:ring-emerald-200/25',
      accent: 'text-emerald-200/80',
      popup:
        'border-emerald-200/20 bg-slate-950/90 text-emerald-50/95 shadow-[0_12px_40px_-10px_rgba(0,30,20,0.7)] ring-1 ring-emerald-200/10',
      option: 'text-emerald-50/90 hover:bg-emerald-300/10',
      optionActive: 'bg-emerald-300/15 text-white',
      optionSelected: 'text-emerald-200',
      glow: 'rgba(167,243,208,0.55)',
      ring: 'ring-emerald-300/40',
    },
  },
  {
    name: 'tidal-drift',
    label: 'tidal-drift',
    tag: 'ocean',
    vibe: 'Open ocean from above — slow parallel swells rolling beneath a scatter of sun glints.',
    text: {
      eyebrow: 'text-white/75',
      headlineGradient: 'from-white to-cyan-100/70',
      body: 'text-white/80',
      label: 'text-white/55',
      shadow:
        '[filter:drop-shadow(0_2px_10px_rgba(0,0,0,0.55))_drop-shadow(0_1px_2px_rgba(0,0,0,0.45))]',
    },
    chip: {
      surface:
        'border-cyan-200/20 bg-slate-950/55 text-cyan-50/95 hover:border-cyan-200/35 focus:border-cyan-200/45 focus:ring-cyan-200/25',
      accent: 'text-cyan-200/80',
      popup:
        'border-cyan-200/20 bg-slate-950/90 text-cyan-50/95 shadow-[0_12px_40px_-10px_rgba(0,20,40,0.7)] ring-1 ring-cyan-200/10',
      option: 'text-cyan-50/90 hover:bg-cyan-300/10',
      optionActive: 'bg-cyan-300/15 text-white',
      optionSelected: 'text-cyan-200',
      glow: 'rgba(165,243,252,0.55)',
      ring: 'ring-cyan-300/40',
    },
  },
  {
    name: 'wire-mesa',
    label: 'wire-mesa',
    tag: 'retro',
    vibe: 'Sci-fi wireframe terrain rushing past — endless cyan ridges scrolling into a glowing horizon.',
    text: {
      eyebrow: 'text-cyan-100/80',
      headlineGradient: 'from-white to-cyan-100/70',
      body: 'text-cyan-50/85',
      label: 'text-cyan-100/55',
      shadow:
        '[filter:drop-shadow(0_2px_10px_rgba(0,4,16,0.65))_drop-shadow(0_1px_2px_rgba(0,4,16,0.55))]',
    },
    chip: {
      surface:
        'border-cyan-200/25 bg-slate-950/60 text-cyan-50/95 hover:border-cyan-200/40 focus:border-cyan-200/50 focus:ring-cyan-200/25',
      accent: 'text-cyan-200/85',
      popup:
        'border-cyan-200/25 bg-slate-950/90 text-cyan-50/95 shadow-[0_12px_40px_-10px_rgba(0,10,30,0.75)] ring-1 ring-cyan-200/15',
      option: 'text-cyan-50/90 hover:bg-cyan-300/10',
      optionActive: 'bg-cyan-300/15 text-white',
      optionSelected: 'text-cyan-200',
      glow: 'rgba(103,232,249,0.6)',
      ring: 'ring-cyan-300/40',
    },
  },
  {
    name: 'flow-field',
    label: 'flow-field',
    tag: 'particles',
    vibe: 'Inky tendrils curling through a deep-navy void — thousands of particles drifting on a living vector field.',
    text: {
      eyebrow: 'text-violet-100/80',
      headlineGradient: 'from-white to-violet-100/70',
      body: 'text-violet-50/85',
      label: 'text-violet-100/55',
      shadow:
        '[filter:drop-shadow(0_2px_10px_rgba(2,4,12,0.7))_drop-shadow(0_1px_2px_rgba(2,4,12,0.55))]',
    },
    chip: {
      surface:
        'border-violet-200/25 bg-slate-950/60 text-violet-50/95 hover:border-violet-200/40 focus:border-violet-200/50 focus:ring-violet-200/25',
      accent: 'text-violet-200/85',
      popup:
        'border-violet-200/25 bg-slate-950/90 text-violet-50/95 shadow-[0_12px_40px_-10px_rgba(20,8,40,0.75)] ring-1 ring-violet-200/15',
      option: 'text-violet-50/90 hover:bg-violet-300/10',
      optionActive: 'bg-violet-300/15 text-white',
      optionSelected: 'text-violet-200',
      glow: 'rgba(196,181,253,0.55)',
      ring: 'ring-violet-300/40',
    },
  },
  {
    name: 'glyph-rain',
    label: 'glyph-rain',
    tag: 'terminal',
    vibe: 'Cascading jade glyphs falling through a dark terminal void — code rain, restrained and cinematic.',
    text: {
      eyebrow: 'text-emerald-100/80',
      headlineGradient: 'from-white to-emerald-100/75',
      body: 'text-emerald-50/85',
      label: 'text-emerald-100/55',
      shadow:
        '[filter:drop-shadow(0_2px_10px_rgba(2,10,8,0.7))_drop-shadow(0_1px_2px_rgba(2,10,8,0.55))]',
    },
    chip: {
      surface:
        'border-emerald-300/25 bg-emerald-950/55 text-emerald-50/95 hover:border-emerald-300/40 focus:border-emerald-300/50 focus:ring-emerald-300/25',
      accent: 'text-emerald-300/85',
      popup:
        'border-emerald-300/25 bg-slate-950/90 text-emerald-50/95 shadow-[0_12px_40px_-10px_rgba(0,30,15,0.75)] ring-1 ring-emerald-300/15',
      option: 'text-emerald-50/90 hover:bg-emerald-300/10',
      optionActive: 'bg-emerald-300/15 text-white',
      optionSelected: 'text-emerald-200',
      glow: 'rgba(110,231,183,0.55)',
      ring: 'ring-emerald-300/40',
    },
  },
] as const satisfies readonly BackdropEntry[];

export type BackdropId = (typeof BACKDROPS)[number]['name'];

export const DEFAULT_BACKDROP: BackdropId = 'kyoto-petals';

export function getBackdrop(name: BackdropId): BackdropEntry {
  return BACKDROPS.find((b) => b.name === name) ?? BACKDROPS[0];
}
