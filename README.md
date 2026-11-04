# Neoplastic Scroll

An endless De Stijl canvas built with [Astro](https://astro.build). Scroll forever through procedurally generated Mondrian-style compositions — click any one to recompose it.

## Run it

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## How it works

- **Grid** — the page is a black canvas; colored planes sit on it and the gaps become the lines.
- **Compositions** — each cell is recursively subdivided into planes, colored with a white-dominant palette of red, blue and yellow.
- **Infinite scroll** — an `IntersectionObserver` sentinel appends new rows ~1200px before you reach the end.

Tweak `PALETTE` and `ROW_PATTERNS` in `src/scripts/feed.ts`, or `--line` in `src/styles/global.css`.
