# Portable pamphlet generator (Astro / Vite)

Self-contained client module for embedding the pamphlet editor in another **Vite-powered Astro** app on a dedicated route, inside your existing layout.

The stable Vite app at the repo root is **not** used by this package; this folder is the drop-in copy.

## What you get

- `mountPamphletGenerator(host)` — injects UI into a DOM node and wires all behavior
- `handle.destroy()` — removes listeners and clears the host
- Scoped styles under `.pamphlet-app` (won’t reset the whole Astro site)
- Icons resolved via Vite `?url` imports (no need to copy SVGs into `public/`)

## Install into the Astro repo

1. Copy this folder to the host, e.g.:

   `src/lib/pamphlet-generator/`

2. Add dependencies from [`package.snippet.json`](./package.snippet.json) to the host `package.json`, then `npm i`.

3. Create a route page (see [`examples/PanfletoPage.astro`](./examples/PanfletoPage.astro)):

```astro
---
import Layout from "../layouts/Layout.astro";
---
<Layout>
  <div id="pamphlet-root"></div>
</Layout>

<script>
  import { mountPamphletGenerator } from "../lib/pamphlet-generator/src/index.ts";

  const host = document.getElementById("pamphlet-root");
  if (host) {
    const handle = mountPamphletGenerator(host);
    document.addEventListener("astro:before-swap", () => handle.destroy(), { once: true });
  }
</script>
```

4. Open that route in **Chrome or Edge** (File System Access API).

## API

```ts
import { mountPamphletGenerator } from "./src/index";

const handle = mountPamphletGenerator(document.getElementById("pamphlet-root")!);
// ...
handle.destroy();
```

## Notes

- Client-only: do not SSR-render the editor logic.
- Print uses `window.print()`; on a dedicated route, hide layout chrome with your own `@media print` if needed.
- Keep developing the root app as usual; refresh this portable copy when you want to re-export a snapshot.
