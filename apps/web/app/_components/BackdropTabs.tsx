'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BACKDROPS, type BackdropId } from '../_lib/backdrops';

type Indicator = { left: number; width: number };

type Props = {
  value: BackdropId;
  onChange: (next: BackdropId) => void;
  /** glow color used for the sliding pill (from the active theme) */
  glow: string;
  /** Tailwind classes for the outer chip-style container */
  containerClassName?: string;
  /** Tailwind classes for inactive tab text */
  inactiveTextClassName?: string;
};

/**
 * Segmented tab switcher with a sliding indicator that interpolates between
 * the currently-active tab's bounding box. The indicator owns the colour of
 * the active backdrop's glow, so switching themes feels alive.
 */
export function BackdropTabs({
  value,
  onChange,
  glow,
  containerClassName = '',
  inactiveTextClassName = 'text-white/60 hover:text-white',
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  const activeIdx = Math.max(
    0,
    BACKDROPS.findIndex((b) => b.name === value),
  );

  // Recompute indicator position whenever the active tab or layout changes.
  useLayoutEffect(() => {
    const recompute = () => {
      const list = listRef.current;
      const tab = tabRefs.current[activeIdx];
      if (!list || !tab) return;
      const listRect = list.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      setIndicator({
        left: tabRect.left - listRect.left,
        width: tabRect.width,
      });
    };
    recompute();
    // Also recompute on resize so the indicator stays glued under its tab
    // when the container wraps to a different number of columns.
    const ro = new ResizeObserver(recompute);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [activeIdx]);

  // Keyboard: ←/→ to cycle. Only intercept when focus is inside the tablist.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const onKey = (e: KeyboardEvent) => {
      if (!list.contains(document.activeElement)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIdx = (activeIdx + 1) % BACKDROPS.length;
        const next = BACKDROPS[nextIdx];
        if (!next) return;
        onChange(next.name);
        tabRefs.current[nextIdx]?.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevIdx = (activeIdx - 1 + BACKDROPS.length) % BACKDROPS.length;
        const prev = BACKDROPS[prevIdx];
        if (!prev) return;
        onChange(prev.name);
        tabRefs.current[prevIdx]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        const first = BACKDROPS[0];
        if (!first) return;
        onChange(first.name);
        tabRefs.current[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        const lastIdx = BACKDROPS.length - 1;
        const last = BACKDROPS[lastIdx];
        if (!last) return;
        onChange(last.name);
        tabRefs.current[lastIdx]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, onChange]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Backdrop"
      className={`relative inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border p-1 backdrop-blur ${containerClassName}`}
    >
      {/* The sliding indicator. Sits behind the labels (z-0). Pointer-events
          off so it never eats clicks. */}
      {indicator && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-1 z-0 rounded-full transition-[transform,width,background-color] duration-[420ms] ease-[cubic-bezier(0.4,0.05,0.2,1)] will-change-transform"
          style={{
            transform: `translateX(${indicator.left - 4}px)`,
            width: indicator.width,
            // soft fill + colored border tinted with the active theme glow
            background: 'rgba(255,255,255,0.08)',
            boxShadow: `0 0 0 1px ${glow}, 0 6px 24px -8px ${glow}`,
          }}
        />
      )}

      {BACKDROPS.map((b, i) => {
        const selected = b.name === value;
        return (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: stable, fixed-length list
            key={b.name}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(b.name)}
            className={`relative z-10 rounded-full px-3.5 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
              selected ? 'text-white' : inactiveTextClassName
            }`}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
