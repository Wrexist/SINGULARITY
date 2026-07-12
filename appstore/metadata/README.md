# App Store metadata — all locales

Every directory here is one App Store Connect localization in Fastlane `deliver` layout
(six files: `name.txt`, `subtitle.txt`, `keywords.txt`, `description.txt`,
`promotional_text.txt`, `release_notes.txt`). `en-US` is the master; the other 49 are
**transcreations** (native copy + per-market keyword research), not literal translations —
each was written by a native-language pass and reviewed by an independent native-editor
pass. Together they cover **every locale App Store Connect supports**.

## Guarantees (enforced by `npm run validate:store`)

- App Store Connect limits: name/subtitle ≤ 30 chars, keywords ≤ 100, promotional
  text ≤ 170, description/what's-new ≤ 4000 (counted in code points, as ASC does).
- Every `name.txt` starts with the Latin brand `Singularity Inc.` — never translated.
- Keyword fields: single line, no space after commas, no duplicates, and no term that
  already appears in that locale's name/subtitle (Apple indexes all three together, so a
  repeat is a wasted slot).
- No pictographic emoji in name/subtitle/keywords.

Run it before every metadata push:

```
npm run validate:store           # all locales
npm run validate:store de-DE ja  # specific ones
```

## ASO strategy per locale (mirrors `appstore/METADATA.md`)

Apple weights **Name → Subtitle → Keywords**. So each locale's name carries the market's
single highest-traffic genre phrase (English "Idle Tycoon" where locals genuinely type
English — most of Europe — or the native genre term where they don't: 放置/経営 in Japan,
방치형/타이쿤 in Korea, 放置/挂机 in China…), the subtitle carries the next tier
(AI / empire / data-center / management, localized), and the keyword field is filled to
~100 chars with non-overlapping extra terms locals actually search.

Descriptions are **conversion copy** (not indexed for search in most locales): they mirror
the en-US structure — hook, THE LOOP, A WORLD THAT GROWS, the dark-web data section,
HONEST BY DESIGN, WHO IT'S FOR, closing joke — with the humor adapted per language.
Because the game's interface is currently English-only, every non-English description
says so in one line inside the honesty section (protects ratings; fits the brand).

## Uploading

There's no Fastlane `Deliverfile` in-repo yet; either:

- **Fastlane:** `fastlane deliver --skip-binary-upload --skip-screenshots
  --metadata_path appstore/metadata` (with the app's App Store Connect credentials), or
- **Manual:** paste per locale in App Store Connect → App Information / version page.

Notes:
- **Name & subtitle** changes go live with the next app-version review; **promotional
  text** can be changed any time without review; **keywords** ship with a version.
- `release_notes.txt` describes the current update (Grand Challenges, Lab Objectives,
  Automation, research forks) — refresh all locales each release.
- Screenshots are not localized yet; captions are baked into the en images. Localized
  caption bands on the first two screenshots are the highest-conversion follow-up.
- Keyword lists are best-practice head/mid-tail terms per market. True volume data needs
  App Store Connect → Analytics → Search Terms (post-launch) or an ASO tool
  (AppTweak/Astro/Sensor Tower) — swap the weakest terms every few weeks per
  `METADATA.md §11`.
