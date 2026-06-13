# backdrops

> Lucide for backgrounds. Drop-in scenic, animated React backdrops.

## Install

```bash
npm install backdrops
```

## Use

```tsx
import { Backdrop } from 'backdrops';

export default function Hero() {
  return (
    <section style={{ position: 'relative', height: '100vh' }}>
      <Backdrop name="midnight-meteor" />
      <h1 style={{ position: 'relative', zIndex: 1 }}>Welcome</h1>
    </section>
  );
}
```

The `<Backdrop />` fills its nearest positioned ancestor. Wrap it in a `position: relative` container.

## Available backdrops

| name | vibe |
| --- | --- |
| `midnight-meteor` | A still, dark night sky with softly twinkling stars and occasional meteors |

More on the way.

## Props

| prop | type | default | notes |
| --- | --- | --- | --- |
| `name` | `BackdropName` | required | which backdrop to render |
| `className` | `string` | — | optional class on the container |
| `style` | `CSSProperties` | — | optional inline styles on the container |
| `seed` | `number` | random | deterministic seed for reproducible layouts |

## Built-in respect

- Honors `prefers-reduced-motion` automatically.
- Pauses rendering when the tab is hidden.
- Uses `devicePixelRatio` for crisp rendering on retina screens.
