'use client';

import { Backdrop } from 'scaena';

export default function HomePage() {
  return (
    <main>
      <section className="relative isolate flex h-screen w-full items-center justify-center overflow-hidden">
        <Backdrop name="kyoto-petals" />
        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <p className="mb-4 text-xs uppercase tracking-[0.3em] text-white/50">
            scaena · v0.1
          </p>
          <h1 className="bg-gradient-to-b from-white to-white/60 bg-clip-text pb-2 text-5xl font-semibold leading-[1.15] text-transparent sm:text-7xl">
            Lucide for backgrounds.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-white/70 sm:text-lg">
            Drop-in scenic, animated backdrops for your hero sections. One line of code,
            beautiful out of the box.
          </p>
          <pre className="mx-auto mt-10 inline-block rounded-lg border border-white/10 bg-black/40 px-5 py-3 text-left text-sm text-white/80 backdrop-blur">
            <code>{'<Backdrop name="midnight-meteor" />'}</code>
          </pre>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="text-2xl font-semibold">Available backdrops</h2>
        <p className="mt-2 text-white/60">
          A small, curated set. Every one is polished, performant, and respects reduced motion.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <BackdropCard name="midnight-meteor" label="midnight-meteor" />
          <BackdropCard name="kyoto-petals" label="kyoto-petals" />
          <ComingSoonCard label="aurora" />
          <ComingSoonCard label="deep-ocean" />
        </div>
      </section>
    </main>
  );
}

function BackdropCard({
  name,
  label,
}: {
  name: 'midnight-meteor' | 'kyoto-petals';
  label: string;
}) {
  return (
    <div className="relative h-56 overflow-hidden rounded-xl border border-white/10">
      <Backdrop name={name} />
      <div className="absolute bottom-3 left-3 z-10 rounded-md bg-black/40 px-2 py-1 text-xs text-white/80 backdrop-blur">
        {label}
      </div>
    </div>
  );
}

function ComingSoonCard({ label }: { label: string }) {
  return (
    <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/10 text-white/40">
      <span className="text-sm">{label} — coming soon</span>
    </div>
  );
}
