export function SiteFooter() {
  return (
    <footer className="relative w-full border-t border-white/5 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-white/85">scaena</p>
          <p className="mt-1 text-xs text-white/45">
            Latin for "stage / scene" — pronounced{' '}
            <span className="text-white/65">SKAY-nuh</span>.
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/55"
        >
          <a className="transition hover:text-white" href="#hero">
            Top
          </a>
          <a className="transition hover:text-white" href="#gallery">
            Gallery
          </a>
          <a className="transition hover:text-white" href="#usage">
            Usage
          </a>
          <span aria-hidden className="h-3 w-px bg-white/10" />
          <span className="text-white/35">MIT licensed</span>
        </nav>
      </div>
    </footer>
  );
}
