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
| `liquid-aurora` | Liquid ribbons of emerald, cyan and violet drifting across a deep night canvas |
| `tidal-drift` | Open ocean from above — slow parallel swells rolling beneath a scatter of sun glints |
| `wire-mesa` | A slow-rolling wireframe terrain receding into night fog |
| `flow-field` | Ink-on-rice-paper strokes tracing a soft, evolving vector field |
| `glyph-rain` | Cascading green glyphs, but tuned to feel ambient rather than busy |

More on the way.

## Common props

Every backdrop accepts the same envelope:

| prop | type | default | notes |
| --- | --- | --- | --- |
| `name` | `BackdropName` | required | which backdrop to render |
| `props` | per-backdrop options | `{}` | typed knobs — narrows to the selected backdrop |
| `className` | `string` | — | optional class on the container |
| `style` | `CSSProperties` | — | optional inline styles on the container |
| `seed` | `number` | random | deterministic seed for reproducible layouts |

```tsx
// `props` autocompletes & type-checks against the chosen `name`:
<Backdrop name="liquid-aurora" props={{ palette: 'sunset', blobCount: 8 }} />
```

Each backdrop is also exported as its own component with options as flat props,
if you'd rather skip the discriminated union:

```tsx
import { LiquidAurora } from 'scaena';

<LiquidAurora palette="sunset" blobCount={8} />
```

## Per-backdrop options

Every option is **optional**; omit `props` entirely and you get the
original out-of-the-box look.

### `liquid-aurora`

| option | type | default | notes |
| --- | --- | --- | --- |
| `palette` | `'aurora' \| 'sunset' \| 'oceanic' \| 'plasma' \| string[]` | `'aurora'` | named preset or an array of 4+ hex colors used for the blob gradients |
| `blobCount` | `number` | auto (5–7, density-aware) | how many aurora blobs drift on screen |
| `blobScale` | `number` | `1` | multiplier on each blob's radius — `0.5` → half size, `2` → twice |
| `speed` | `number` | `1` | global animation speed multiplier |
| `vignette` | `boolean` | `true` | dark radial vignette around the edges |

```tsx
<Backdrop
  name="liquid-aurora"
  props={{ palette: 'plasma', blobCount: 9, speed: 0.6, vignette: false }}
/>
```

### `kyoto-petals`

| option | type | default | notes |
| --- | --- | --- | --- |
| `sky` | `'kyoto' \| 'twilight' \| 'midnight'` | `'kyoto'` | sky gradient, sun glow, and atmospheric mist preset |
| `palette` | `string[]` | pink/coral preset | array of 4+ hex colors used for petal gradients |
| `density` | `number` | `1` | particle-count multiplier (caps at 250 on-screen petals) |
| `wind` | `number` | `1` | horizontal drift multiplier |
| `fallSpeed` | `number` | `1` | vertical fall-speed multiplier |

```tsx
<Backdrop
  name="kyoto-petals"
  props={{ sky: 'twilight', density: 1.4, wind: 0.6 }}
/>
```

### `glyph-rain`

| option | type | default | notes |
| --- | --- | --- | --- |
| `glyphs` | `string` | Japanese half-width katakana + digits | character set drawn in each column — pass any string |
| `cellSize` | `number` | `18` | size in pixels of each character cell (also scales font) |
| `density` | `number` | `0.55` | fraction of columns that have a running stream (0…1) |
| `speedRange` | `[number, number]` | `[5, 13]` | min/max cells-per-second per column |
| `trailLength` | `number` | `0.55` | trail persistence — `0` snappy, `1` very long fading streaks (0…1) |
| `headColor` | `string` | `'#d8ffe6'` | color of the leading glyph in each column |
| `bodyColor` | `string` | `'#22e26b'` | color of the trailing body glyphs |

```tsx
<Backdrop
  name="glyph-rain"
  props={{
    glyphs: '01',
    cellSize: 14,
    density: 0.7,
    trailLength: 0.85,
    headColor: '#fff',
    bodyColor: '#7af',
  }}
/>
```

### Other backdrops

`midnight-meteor`, `tidal-drift`, `wire-mesa`, and `flow-field` accept the
common props above but **don't yet expose any options** — pass `props={{}}`
or simply omit it. Customization for these is on the roadmap.

## Built-in respect

- Honors `prefers-reduced-motion` automatically — renders a beautiful static frame.
- Pauses rendering when the tab is hidden.
- Uses `devicePixelRatio` for crisp rendering on retina screens.
- Automatically reduces particle counts on small screens.
