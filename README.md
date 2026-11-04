# Infinite Composition

An endless De Stijl canvas built with [Astro](https://astro.build). Scroll forever through generated Mondrian-style compositions. Click any one to recompose it.

## Run it

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static site in dist/
npm test         # unit tests (vitest)
npm run og       # regenerate the social preview image (needs Google Chrome)
```

## Using it

- **Click** a work to recompose it. Its lines slide to new positions.
- **Hover** a work (or tap it on a phone) for buttons to recompose, download a PNG, or copy a link.
- **Keyboard:** Tab to a work, then:

  | Key | Action |
  | --- | --- |
  | ← ↑ → ↓ | Move between works |
  | R, Enter or Space | Recompose |
  | D | Download a 2400px PNG |
  | L | Copy a link to this work |
  | Esc | Leave the grid |

- **Share:** `?seed=123456` reproduces a whole feed, row for row. A work's link (`?seed=…&work=boogie-98765-1.50`) shows that work at the top of the page.

## How it works

| Piece | File |
| --- | --- |
| Seeded randomness (`mulberry32`), row seeds | `src/lib/rng.ts` |
| Classic compositions: subdivision, varied line weights, balance rules | `src/lib/classic.ts` |
| Late styles: Boogie-Woogie and Lozenge (canvas) | `src/lib/late.ts` |
| What goes in each row | `src/lib/plan.ts` |
| Share link format | `src/lib/share.ts` |
| DOM, animation, infinite scroll, keyboard, export | `src/scripts/feed.ts` |
| Social card source (screenshotted to `public/og.png`) | `src/pages/og-card.astro` |

- **Balance rules:** white dominates, primaries cover at most half a work, tiny planes never take a primary, and neighbouring planes never share a colour.
- **Line weights:** most works vary the weight of each line, as Mondrian did. Some keep one even weight.
- **Memory stays flat:** rows more than 4000px from the viewport are emptied and rebuilt exactly when you scroll back. Each row has its own seed, and recomposed works remember their new seed.
- **Late styles:** about one row in five holds a *Boogie-Woogie* or *Lozenge* work. Change `LATE_STYLE_CHANCE` in `plan.ts` to adjust.

Set `site` in `astro.config.mjs` once deployed, so the social preview uses an absolute image URL.
