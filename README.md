# scaena

> Drop-in scenic, animated backdrops for your hero sections. One line of code, beautiful out of the box.
>
> *Latin for “stage / scene” — pronounced **SKAY-nuh**.*

```tsx
import { Backdrop } from 'scaena';

export default function Hero() {
  return (
    <section className="relative h-screen">
      <Backdrop name="midnight-meteor" />
      <h1 className="relative z-10">Welcome</h1>
    </section>
  );
}
```

## Motion philosophy

- **Ambient**: Slow, breathing motion. Never distracting.
- **Respectful**: Auto-honors `prefers-reduced-motion` — renders a beautiful static frame.
- **Battery-friendly**: Pauses when the tab is hidden.
- **Mobile-aware**: Automatically reduces particle counts on small screens.

## Repo layout

```
packages/scaena   # the npm library
apps/web          # the docs / demo site (Next.js)
```

## Develop

```bash
npm install
npm run dev          # starts the docs site
npm run build:lib    # builds the library
```
