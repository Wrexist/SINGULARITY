# App Store creative assets (header + search results)

Apple's placements: App Store Connect → your app → version → **Header and Search
Results** (assets live in the Asset Library).

## Current set: real app, light UI, A/B variants (2026-10-11)

Regenerate with `node scripts/store-header-assets.mjs` (builds the app, captures three
light-mode screens from a seeded late-game save at iPhone @3x, then composites).
`node scripts/store-header-assets.mjs compose` re-composes from the saved captures in
`src/`.

| File | Slot | Headline |
|---|---|---|
| `header-3840x1646-A.png` | **Product page header** (21:9) | From one GPU to a planet-sized lab. |
| `header-3840x1646-B.png` | Header, variant B | Your lab keeps earning while you sleep. |
| `search-3840x2560-A.png` | **Search results** (3:2) | From one GPU to a planet-sized lab. |
| `search-3840x2560-B.png` | Search results, variant B | Your lab keeps earning while you sleep. |

- **A** = three phones (Products, Lab, Team). **B** = one Lab phone with a real team
  member card and product card pulled out of the UI.
- All PNG, RGB with no alpha (App Store Connect rejects alpha).
- **Header safe area:** the copy and phones sit inside Apple's centred art-safe box
  (x 1097–2743, y 493–1154). The flanks are background only, so iPhone, iPad and Mac
  crops keep the message.
- **Search:** at least 250 px clear on every edge.
- **Review-safe:** no prices (the hall's "+$cost" markers are gone because expansions are
  maxed), no "AI" wording in the copy, no Apple marks, and only real screens from the
  app. The "people" are the game's own staff cards with in-game avatars; there are no
  stock photos, because store art has to show the real app.
- **Testing:** use Product Page Optimization, or assign the B pair to a custom product
  page, and compare conversion after two weeks.

## Older wordless set

`header-3840x1646.jpg`, `search-3840x2560.jpg` and `universal-5244x2950.png` come from
`scripts/store-creative-assets.mjs`. They're the dark, text-free hall render, kept as a
third option.
