# scaena

> Drop-in scenic, animated React backdrops for hero sections. One line of code, beautiful out of the box.
>
> *Latin for “stage / scene” — pronounced **SKAY-nuh**.*

## Install

```bash
npm install scaena
```

## Use

```tsx
import { Backdrop } from 'scaena';

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
| `kyoto-petals` | Cherry blossom petals drifting gently on a soft spring breeze |
| `aurora` | Liquid ribbons of emerald, cyan and violet drifting across a deep night canvas |
| `deep-ocean` | Open ocean from above — slow parallel swells rolling beneath a scatter of sun glints |

More on the way.

## Props

| prop | type | default | notes |
| --- | --- | --- | --- |
| `name` | `BackdropName` | required | which backdrop to render |
| `className` | `string` | — | optional class on the container |
| `style` | `CSSProperties` | — | optional inline styles on the container |
| `seed` | `number` | random | deterministic seed for reproducible layouts |

## Built-in respect

- Honors `prefers-reduced-motion` automatically — renders a beautiful static frame.
- Pauses rendering when the tab is hidden.
- Uses `devicePixelRatio` for crisp rendering on retina screens.
- Automatically reduces particle counts on small screens.
