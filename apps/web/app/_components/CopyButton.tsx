'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  /** Text that should be copied. */
  value: string;
  /** Classes applied to the button surface (the chip styling). */
  className?: string;
  /** Optional accent color for the check-mark on success. */
  accentClassName?: string;
  /** Render compact (icon-only). Default: false. */
  compact?: boolean;
  /** aria-label fallback when no children are rendered. */
  ariaLabel?: string;
};

/**
 * Tiny clipboard button. The icon morphs from a clipboard glyph to a check
 * mark on success, then fades back after a short delay. Keyboard-operable.
 */
export function CopyButton({
  value,
  className = '',
  accentClassName = 'text-emerald-300',
  compact = false,
  ariaLabel = 'Copy to clipboard',
}: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers / iframe sandboxes — fall back to a transient textarea.
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* swallow — UI will not flip to "copied" */
        return;
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1400);
  }, [value]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? 'Copied' : ariaLabel}
      className={`group inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition active:scale-[0.97] focus:outline-none focus:ring-2 ${className}`}
    >
      <span className="relative inline-block h-3.5 w-3.5">
        {/* Clipboard icon — fades out when copied */}
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`absolute inset-0 h-full w-full transition-all duration-200 ${
            copied ? 'scale-75 opacity-0' : 'scale-100 opacity-90'
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="8" y="3" width="8" height="4" rx="1" />
          <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
        </svg>
        {/* Check icon — fades in when copied */}
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`absolute inset-0 h-full w-full transition-all duration-200 ${
            copied
              ? `scale-100 opacity-100 ${accentClassName}`
              : 'scale-75 opacity-0'
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5 10 17.5 19 7.5" />
        </svg>
      </span>
      {!compact && (
        <span className="tabular-nums">{copied ? 'Copied' : 'Copy'}</span>
      )}
    </button>
  );
}
