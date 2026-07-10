# SINGULARITY INC — project guide for Claude

Idle/incremental AI-lab tycoon (TypeScript · React · Vite · Zustand · Capacitor/iOS).
It is **live in the App Store**, so every change ships to real players — correctness,
numeric safety, and a calm, premium feel are non-negotiable.

## Design rules (hard)

- **NEVER use a left-edge vertical accent bar on cards.** No colored `border-left`, and
  no `::before`/`::after` strip pinned to the left edge of a card to mark it
  "recommended" / "active" / "hero" / "in-progress" — in **any** color, in CSS or inline
  styles. The owner rejected this pattern outright (2026-07); do not reintroduce it
  anywhere. Signal emphasis another way instead: a full-card tint or border, a **progress
  ring on the icon**, a badge/tag, a size bump, or a soft glow.
- **No emoji in the UI — use SVG line icons.** Every glyph the player sees comes from the
  `Icons.tsx` family (`currentColor` line icons), never a color emoji (🎁🔒🎯…). Add a new
  icon to `Icons.tsx` and, for icons named by pure balance data, a key in `iconRegistry`.
  Don't bake emoji into engine/label strings either — the tone icon or text carries it.
  (Monochrome typographic marks like ✓ ✗ ★ are fine.)
- **Clean, not noisy.** Bias toward AMBIENT, wordless aliveness — motion, a ring filling,
  a gentle glow — over adding text, popups, toasts, or badges. When in doubt, remove
  noise rather than add a label. Every animation must respect `prefers-reduced-motion`
  and the in-app reduce-motion toggle (degrade to a static end state).

## Engine invariants (hard)

- **Deterministic pure engine.** `tick`/`derive` are pure; never call `Date.now()` or
  `Math.random()` in engine code. The UI/store own the wall clock and id minting.
- **Curve-safe additions.** The balance sim only buys research/racks and ships `deploy`.
  It never hires/assigns staff, picks non-default ship modes, funds Grand Challenges,
  claims Objectives/Contracts, publishes preprints, or enables Automation — so anything
  gated behind those player-only actions cannot move the tuned curve. Keep new rewards
  temporary, meta, or claim-gated to stay curve-safe.
- **Saves are hostile input: filter, don't wipe.** `deserialize`→`migrate`→sanitize
  clamps/dedupes/known-id-filters rather than discarding a save. Bump `SAVE_VERSION` and
  add a migration for every new persisted field.

## Verify before commit

`npx tsc --noEmit` and `npx vitest run` must both be green. For any UI change, drive the
built app (Playwright smoke, seed a save via localStorage) and confirm **zero console
errors** before committing.
