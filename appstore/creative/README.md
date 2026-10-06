# App Store creative assets (header + search results)

Apple's new placements (App Store Connect → your app → **Header and Search Results**,
managed in the Asset Library). Regenerate with `node scripts/store-creative-assets.mjs`.

| File | Slot | Spec (Apple) |
|---|---|---|
| `header-3840x1646.jpg` | **Product page header** (21:9) | 3840×1646, JPEG/PNG, no alpha |
| `search-3840x2560.jpg` | **Search results** (3:2) | 1920×1280 – 3840×2560, JPEG/PNG, no alpha |
| `universal-5244x2950.png` | **Universal** (16:9, both slots) | 5244×2950, PNG only, no alpha |

**Which to upload:** use the dedicated pair (header + search). The universal file is a
fallback if you'd rather manage one asset — it's wordless and centred, because Apple
crops it to fit both slots.

## Design choices
- **Header is wordless.** The App Store overlays your name, icon and Get button, and a
  text-free image works in every locale. The focal art (the AGI core orb + rack floor)
  sits inside Apple's centred art-safe area (template: x 1097–2743, y 493–1154), so iPhone
  / iPad / Mac crops never clip it. The flanks fade into ambient night for wide displays.
- **Search asset "states the obvious".** One line of copy, the actual hall, and the real
  compute / data / money bar so it reads as an idle tycoon in half a second.
- **Real game art, not a mock-up.** The hall is painted by the game's own renderer
  (`src/render/hallRenderer.ts`) at 4× in an era-5 (post-Singularity) lab — the in-app
  canvas caps DPR at 2, which would be soft at 3840px.
- **Review-safe:** no prices (expansion "+$cost" markers are removed), no URLs, no awards,
  no Apple marks, nothing above a 4+ rating.
