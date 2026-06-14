'use client';

import { useCallback, useState } from 'react';
import { Gallery } from './_components/Gallery';
import { Hero } from './_components/Hero';
import { SiteFooter } from './_components/SiteFooter';
import { UsageSection } from './_components/UsageSection';
import { type BackdropId, DEFAULT_BACKDROP } from './_lib/backdrops';
import type { PropsValues } from './_lib/backdropPropsSchema';

type PropsByBackdrop = Partial<Record<BackdropId, PropsValues>>;

export default function HomePage() {
  const [active, setActive] = useState<BackdropId>(DEFAULT_BACKDROP);
  // Per-backdrop tweaks. Keyed by backdrop id so each scene remembers your
  // edits while you flip between them in the same session.
  const [propsByBackdrop, setPropsByBackdrop] = useState<PropsByBackdrop>({});

  const pickBackdrop = useCallback((next: BackdropId) => {
    setActive(next);
  }, []);

  const setActiveProps = useCallback(
    (values: PropsValues) => {
      setPropsByBackdrop((prev) => ({ ...prev, [active]: values }));
    },
    [active],
  );

  const resetActiveProps = useCallback(() => {
    setPropsByBackdrop((prev) => {
      if (!(active in prev)) return prev;
      const { [active]: _drop, ...rest } = prev;
      return rest;
    });
  }, [active]);

  const activeValues = propsByBackdrop[active] ?? {};

  return (
    <main className="relative w-full">
      <Hero
        active={active}
        onActiveChange={pickBackdrop}
        propsValues={activeValues}
        onPropsChange={setActiveProps}
        onPropsReset={resetActiveProps}
      />
      <Gallery active={active} onPick={pickBackdrop} />
      <UsageSection active={active} propsValues={activeValues} />
      <SiteFooter />
    </main>
  );
}
