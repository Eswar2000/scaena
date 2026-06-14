'use client';

import { useCallback, useState } from 'react';
import { Gallery } from './_components/Gallery';
import { Hero } from './_components/Hero';
import { SiteFooter } from './_components/SiteFooter';
import { UsageSection } from './_components/UsageSection';
import { type BackdropId, DEFAULT_BACKDROP } from './_lib/backdrops';

export default function HomePage() {
  const [active, setActive] = useState<BackdropId>(DEFAULT_BACKDROP);

  const pickBackdrop = useCallback((next: BackdropId) => {
    setActive(next);
  }, []);

  return (
    <main className="relative w-full">
      <Hero active={active} onActiveChange={pickBackdrop} />
      <Gallery active={active} onPick={pickBackdrop} />
      <UsageSection active={active} />
      <SiteFooter />
    </main>
  );
}
