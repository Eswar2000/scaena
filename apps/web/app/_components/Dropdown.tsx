'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export type DropdownOption = {
  value: string;
  label: string;
};

type Props = {
  /** id forwarded to the trigger button for `<label htmlFor>` pairing. */
  id?: string;
  value: string;
  options: ReadonlyArray<DropdownOption>;
  onChange: (next: string) => void;
  /** Accessible label when the surrounding field doesn't already provide one. */
  ariaLabel?: string;
};

/**
 * A small accessible single-select dropdown. Renders a themed trigger button
 * and a floating listbox so we can fully style options (native `<option>`
 * elements ignore CSS in most browsers). Implements the WAI-ARIA listbox
 * keyboard contract: ↑/↓ to move, Enter/Space to select, Esc to close,
 * Home/End to jump, type-ahead by first character.
 */
export function Dropdown({ id, value, options, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  // Index that's currently focused inside the listbox while open.
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const listboxId = useId();

  const selectedIdx = options.findIndex((o) => o.value === value);
  const selectedLabel = options[selectedIdx]?.label ?? value;

  // Keep activeIdx synced with value when the popover (re)opens.
  useLayoutEffect(() => {
    if (open) {
      setActiveIdx(Math.max(0, selectedIdx));
    }
  }, [open, selectedIdx]);

  // Scroll the active option into view while navigating.
  useLayoutEffect(() => {
    if (!open) return;
    itemRefs.current[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIdx]);

  // Close on outside click / Esc when not focused inside the trigger.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        listRef.current?.contains(t) ||
        triggerRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const commit = useCallback(
    (idx: number) => {
      const opt = options[idx];
      if (!opt) return;
      onChange(opt.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange, options],
  );

  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIdx(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(activeIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type-ahead — jump to the next option whose label starts with this char.
      const ch = e.key.toLowerCase();
      const start = (activeIdx + 1) % options.length;
      for (let i = 0; i < options.length; i++) {
        const idx = (start + i) % options.length;
        const opt = options[idx];
        if (!opt) continue;
        if (opt.label.toLowerCase().startsWith(ch)) {
          setActiveIdx(idx);
          break;
        }
      }
    }
  };

  return (
    <div className="relative w-full">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-xs text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/30 ${
          open
            ? 'border-white/35 bg-black/50'
            : 'border-white/15 bg-black/40 hover:border-white/25'
        }`}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 shrink-0 text-white/55 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-activedescendant={`${listboxId}-opt-${activeIdx}`}
          tabIndex={-1}
          onKeyDown={onListKey}
          // Auto-focus the listbox so keyboard navigation works immediately.
          ref={(el) => {
            listRef.current = el;
            el?.focus();
          }}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-white/15 bg-slate-950/95 p-1 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.75)] backdrop-blur focus:outline-none"
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIdx;
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: stable options list
                key={opt.value}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => {
                  // Prevent the listbox losing focus before the click registers.
                  e.preventDefault();
                  commit(i);
                }}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-xs transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-white/85'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-white/85"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
