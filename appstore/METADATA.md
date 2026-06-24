# App Store metadata — Singularity Inc.
*Complete, ASO-optimized App Store Connect listing. Paste-ready; the short fields also live as
individual files in `appstore/metadata/en-US/` (Fastlane `deliver` layout) for future automation.*

> **Why these choices:** Apple's search index weights, in order, **App Name → Subtitle → Keywords**.
> So the highest-traffic genre terms go in the *name/subtitle*, and the keyword field is filled with
> **non-duplicate** terms (Apple combines words across all three). Description is **not** indexed for
> search in most locales — it's a *conversion* asset, so it's written to sell, not to stuff keywords.

---

## 1. Text fields (with exact counts)

| Field | Limit | Count | Value |
|---|---|---|---|
| **Name** | 30 | 29 | `Singularity Inc.: Idle Tycoon` |
| **Subtitle** | 30 | 29 | `AI Data-Center Empire Builder` |
| **Keywords** | 100 | 99 | `incremental,clicker,management,simulation,prestige,capitalist,startup,gpu,sci-fi,magnate,automation` |
| **Promotional text** | 170 | 166 | *(editable anytime without review — see `promotional_text.txt`)* |
| **Description** | 4000 | ~2.0k | *(see `description.txt`)* |
| **What's New** | 4000 | — | *(see `release_notes.txt`)* |

**Keyword notes:** comma-separated, **no spaces** (saves characters — Apple ignores them), all
**singular** (Apple matches plurals automatically), and deliberately **avoiding words already in the
name/subtitle** (singularity, inc, idle, tycoon, ai, data, center, empire, builder) so no slot is
wasted. After launch, mine App Store Connect's *Search* analytics and swap the weakest terms.

---

## 2. Categories
- **Primary:** Games → **Simulation**  *(idle/management games rank well here)*
- **Secondary:** Games → **Strategy**

## 3. Age rating (questionnaire answers → expect **12+**)
All "Frequency" answers below; everything not listed = **None**.
- Cartoon/Fantasy Violence: **None**
- Profanity or Crude Humor: **Infrequent/Mild** (satire)
- Mature/Suggestive Themes: **Infrequent/Mild** (AI-industry/corporate satire, "dark-web" jokes)
- Horror/Fear, Sexual Content, Alcohol/Tobacco/Drugs, Medical/Treatment: **None**
- **Simulated Gambling: None.** *(Judgment call — flag for review:* the dark-web "Bazaar" is a
  risk-based **purchase** with a chance of a poor-quality batch; it is **not** casino/lottery/betting
  and pays no winnings, so it isn't "simulated gambling." Answer honestly; if Apple disagrees, it
  becomes 17+. Keep the framing clearly satirical/fictional.*)
- Unrestricted Web Access: **No**.  Contests: **No**.

## 4. Privacy ("nutrition label") — a selling point
- The game is **100% local**: no accounts, no servers, no analytics, no tracking, no ads SDKs.
- App Store Connect → App Privacy → **"Data Not Collected"** (the cleanest possible label).
- A **Privacy Policy URL is still required**. Host `appstore/privacy-policy.md` (e.g. GitHub Pages)
  and point both the App Privacy field and the in-app Settings link at it.

## 5. URLs

| Field | Value (host on GitHub Pages — reuse the Silicon setup) |
|---|---|
| Privacy Policy URL | `https://wrexist.github.io/singularity/privacy` |
| Support URL | `https://wrexist.github.io/singularity/support` (or a GitHub Issues link) |
| Marketing URL *(optional)* | `https://wrexist.github.io/singularity/` |

## 6. In-App Purchase (the Premium unlock)
- **Type:** Non-Consumable. **Product ID:** `com.wrexist.singularityinc.premium`
- **Reference Name (internal):** Premium Unlock
- **Display Name (≤30):** `Premium Unlock`
- **Description (≤45):** `24h offline cap, Founder status & themes`
- **Price tier:** ~$6.99 (Tier 7). Quality-of-life + cosmetic: a longer offline-earnings cap, Founder
  status, future hall themes. No consumables and nothing competitive/pay-to-win — the offline cap is a
  convenience that extends idle accrual, not a way to buy resources or progress directly (App Store is
  fine with this; it's also the GDD promise). Provide a screenshot of the Settings premium card for IAP review.

---

## 7. Screenshots (bake them from the game — GDD §8)
Required: **6.7"/6.5" iPhone** (1284×2778 — accepted for both display slots). Add **iPad 12.9"**
only if you ship universal. Use `npm run shot` states as the source frames, add a short bold caption
band per shot. Order = the conversion funnel (hook → depth → payoff):

1. **The hall, alive** — caption: *"Watch your AI empire physically grow."*  (`--rich`)
2. **Tap-to-expand** — caption: *"Buy floor space. The room grows with you."*  (`--expand` confirm)
3. **Research tree** — caption: *"Climb an absurd AI tech tree."*  (`--full`, research panel)
4. **Ship the Model** — caption: *"Ship a model. Reset. Get permanently stronger."*  (`--celebrate`)
5. **Dark-web Data Market** — caption: *"Buy data… legally, or not."*  (`--market`)
6. **Era transition** — caption: *"From garage closet to planet-scale lab."*  (`--era`)
7. *(optional)* **World event** — caption: *"A dozen+ satirical events keep it spicy."*

App Preview video (optional, big conversion lift): 15–30s screen capture of the loop → a rack
manifesting → an era transition. Portrait, ≤500MB.

## 8. App icon (1024×1024, no alpha, square — Apple masks the corners)
Starter concept in `appstore/icon-concept.svg` (parametric, on-brand): a glowing isometric server
rack on the dark "hall" gradient with the coral accent spark. Render it to a 1024 PNG (e.g.
`rsvg-convert`/Figma/any SVG→PNG) and refine. Keep it **simple and legible at 60px** — one bold
shape, high contrast, no text. (Generate the full icon set with `npx capacitor-assets generate`.)

## 9. App Review notes (paste into "Notes for Review")
> Singularity Inc. is a single-player, offline idle/tycoon game. **No login or account is required**
> — open and play. All data is stored locally on device; nothing is collected or transmitted.
>
> **In-App Purchase:** one non-consumable "Premium Unlock" (cosmetic + quality-of-life only: a longer
> offline-earnings cap and a "Founder" badge; it grants no competitive/gameplay advantage). Test it
> with a sandbox account from Settings → Premium → Unlock.
>
> The in-game "dark-web data market" is **fiction/satire** of the AI industry's data-sourcing
> debates. It is a risk-based in-game purchase using in-game currency with no real-world money, no
> prizes, and no casino/betting mechanics.

## 10. Localization
Ship **English (U.S.)** first. The copy is written to translate cleanly; high-value next locales for
idle games: **German, French, Spanish (LatAm), Portuguese (Brazil), Japanese, Korean, Simplified
Chinese**. Re-do the keyword research per locale (don't machine-translate the keyword field).

## 11. Post-launch ASO loop (keep iterating)
- **Promotional text** is editable without a review — rotate it for events/updates.
- A/B test the **icon** and **first screenshot** via Product Page Optimization (biggest conversion levers).
- Every ~2 weeks, read App Store Connect → Analytics → *Search Terms* and swap the lowest-impression
  keywords for terms you're actually being found (or want to be found) for.
- Ask happy players for ratings via `SKStoreReviewController` at a genuine high point (e.g. just after
  a satisfying "Ship the Model") — never mid-task.
