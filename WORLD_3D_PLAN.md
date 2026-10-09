# The 3D World — research, audits, and a working spike (2026-10)

Owner brief: *"How do we use this technology to update our 3D world for our iOS game?
Make several high audits and deep research — make it the perfect game that's fully
immersive and 3D like these."* References: a "GPT‑6 Astra vs Opus 5.5" clip (both models
generating a 3D airport digital twin), Dominik Scholz's three.js agent office
(x.com/dom_scholz/status/2107489040782004255, reposted by @threejs), and Stephen
(@srotimi_ui)'s isometric logistics dashboard (x.com/srotimi_ui/status/2107067022588961032).

**TL;DR**
- **Yes, and the codebase is unusually ready for it.** The hall is already split into a
  pure view-model (`buildHallModel`) and a dumb painter (`hallRenderer.ts`). A three.js
  renderer is just a *second painter* of the same model, so the engine, saves, balance
  and curve are untouched.
- **I built that painter as an opt-in spike** (off for every player). It is real 3D:
  orthographic iso camera, real light and soft shadows, cutaway walls, instanced racks,
  staff at desks with monitors, product beams, day/night, and a full-screen **explore
  mode** with pan, pinch, orbit, tap-to-focus and Ralv-style name labels.
- **Measured cost:** a lazy 150 KB-gzip chunk that never loads unless the flag is on
  (main bundle +2 KB). A late-game wing is **63 draw calls / 53k triangles**; an early
  lab is 46 / 11k; an empty garage is 13 / 176.
- **Recommendation:** ship it in phases behind a "Lab view: Classic / 3D (beta)" toggle,
  keep the 2D canvas as the permanent fallback, and gate each phase on **real-device
  numbers** (cold start, p10 fps, heat, battery). Details in §8.
- **This is a design-spine change** (DEV.md: "Clean 2.5D hall", "no image assets") and it
  pulls work forward from the active R8 wave. Both need your explicit call. See §9.

---

## Round 5 (2026-10-09): every system shows up in the world

**Owner:** *"continue, make the game better."* With the detail and motion passes done,
the biggest gap was **parity**. Four things the 2D hall shows were still missing in 3D,
so in the 3D lab buying them, or having them happen, changed nothing on screen. They're
all built now, all wordless, all driven by the same `HallModel` fields as 2D:

- **Ops bot (auto-train).**
  - A small white hover bot with a dark visor band, a mint eye and light ring, and a
    blinking antenna.
  - It glides along the front row of racks, stops at each to sweep a mint scan line up
    and down the rack face, then patrols back.
  - Under reduced motion it waits, parked, at the end of its lane.
  - `botPose` is pure and tested: one lane, and every front-row rack gets scanned.
- **Crowd at the lip (good events).** Onlookers stand on the ground below the plinth and
  peer over it into the lab. Every third one cheers, and phone cameras flash now and then
  (motion only). They use the staff instancing (slots after staff), so no extra draws,
  and they can't be picked.
- **Delivery crate (Rig Bay buys).** A taped crate on a dolly fades in at the plinth's
  right edge, rolls along the walkway and fades out (1.8 s). It uses the same trigger as
  2D: the owned-copy count grew.
- **Incident storm.**
  - The sky goes overcast and the sun dims.
  - Rain falls around, never into, the open-top diorama.
  - The 2D lightning strobe flashes the sky and fill light.
  - Under reduced motion it stays overcast only, the 2D rule.
- **Smaller cues.**
  - When a payout is ready, every rack's LEDs breathe together in one slow heartbeat.
  - Training packets speed up with the Batch Scheduler (the plan's "speed follows the
    run").
- **Budget.** The bot draws in 3 meshes plus its glow, shadow and scan line; the crate
  in 1. A lab with everything on is at 76 draws. Era 5 alone is 79, so the worst case
  is about 88, against a budget of 100.

---

## Round 4 (2026-10-09): detail, motion, smoothness

**Owner:** *"make it more detailed and smooth and clean, professional, make everything work
and immersive; also add motion and animation."*

Every addition is wordless and ambient (CLAUDE.md "clean, not noisy"), renderer-only, and
degrades to a static end state under reduced motion.

- **Detail**
  - Faces: two eyes per head, turning with the head.
  - A mug on every other desk.
  - Vent grilles on rack tops (pods keep their glowing caps).
  - Monitors show slowly scrolling code (texture offset; still under reduced motion).
  - Rack LED bars in two interleaved sets that blink out of phase.
  - Lamp pools and beam nodes now use a white glow texture. The old black blob was
    invisible under additive blending.
- **Motion**
  - A bought rack drops in and bounces to rest: 700 ms, staggered 55 ms per rack, its
    contact shadow tightening as it lands. A dust puff spreads where it touches down, and
    its LEDs power on with a flicker.
  - New hires walk in from the bay door to their desk (2.6 s, eased). Hiring happens on
    the Team tab, so the stage remembers how many staff you've seen across mounts.
  - Walkers ease to a stop at each end and face the camera mid-turn; their stride scales
    with speed (no moonwalking).
  - Seated staff glance aside now and then (at most ~35°).
  - A claim sends 48 glowing data cubes up off the racks and flares the product beams.
  - A live training run sends data packets along the cable trays to the ops bay.
- **Smoothness**
  - The card camera glides to a new framing (new floor, era or wing) instead of cutting.
  - A wing or era swap dips the canvas softly.
  - The lab fades in on its first frame.
  - Explore flies in from 1.35× distance.
  - 60 fps only while the camera moves (touch, glide, refit); 30 fps otherwise.
- **UI**
  - Status labels and the training callout fade and spring rather than pop.
  - HUD rates roll toward new values.
  - A one-time gesture hint appears in explore, gone after ~4 s or on the first touch.
  - People are tappable within ~22 px of the thumb.
  - The plot "+" is turned 45° so it no longer reads as "×".
- **Budget:** 39 draw calls on a busy lab (seeded smoke), 18 on a fresh one; the gate is ≤100.

---

## Round 3 (2026-10-09): owner decisions, eras as architecture, Rig Bay, battery

**Owner:** *"do what's best for the game in everything, but it should be free or coded."*

**Decisions taken on that basis:**
1. **Assets: 100% code-built.**
   - Free, no licences to track, and a tiny bundle.
   - Every object can carry live state, and the art stays in one style.
   - CC0 kits remain allowed later if a specific need appears (characters are the likely
     candidate), but nothing needs them now.
2. **Priority: visible depth first.** Each era looks different, and every purchase is
   visible: the Rig Bay parts that the 2D hall barely showed (IDEAS hard truth #2).
3. **Battery is a feature.** An idle game stays open for hours, so the 3D Lab gets
   cheaper on slow devices and stops repainting when the player asked for stillness.

**What shipped:**
- **Eras as architecture** (§7 #9):
  - *Garage Closet:* concrete floor, a roller door, a pegboard of tools, a shelf of boxes,
    and a mattress in the corner ("founded in a garage, rented hourly").
  - *Funded Startup:* sticky notes on the whiteboard, beanbags.
  - *Scale-Up:* cable ladder trays with coloured cables along both walls, and a tiled
    data-hall floor.
  - *Frontier:* a hyperboloid cooling tower, steaming, behind the building.
  - *Hyperscaler:* a second tower, plus transmission pylons marching to the horizon,
    wired into the lab.
  - *Post-Singularity:* glowing floor seams, and an iridescent halo ring over the lab
    with motes spiralling up through it (the 2D vortex, in the round).
- **Rig Bay on the racks:** a socket per slot on each rack's left face, matching the 2D
  "Bare Metal" rules.
  - An empty socket is a dark hole.
  - Accelerators grow glowing heatsink fins.
  - Cooling parts spin a fan.
  - Interconnects run a lit cable to the floor with a packet travelling down it.
  - Each part glows in its grade's colour (standard warm white, enterprise cyan,
    prototype violet).
- **Batching:** all decor draws as one matte batch and one glowing batch. Rugs and beams
  are instanced too. A late-game Post-Singularity wing went from 84 to **65 draw calls**
  while gaining all of the above.
- **Battery guards** (`render3d/quality.ts`, tested):
  - **Adaptive resolution:** if a device can't hold ~30fps over 90 frames, the pixel
    ratio steps down 2 → 1.75 → 1.5 → 1.25. It never steps back up in a session.
  - **Still lab:** under reduced motion the card repaints only when something changed,
    or at most twice a second.

---

## Round 2 (2026-10-09, later): the "Lab Diorama" pass

Owner follow-up: *"continue — make it look like the ones I sent, good UI and a great 3D
world."* That settles three §9 calls: go Ralv-style, use a perspective camera, and make it
playable on a device. What changed:

- **Camera:**
  - A low-FOV (24°) **perspective** camera at about 40° elevation, slightly off 45° so the
    two walls light differently.
  - It frames the building automatically.
  - A portrait screen tilts more top-down so the lab fills it.
- **Building:**
  - The whole lab stands on a bevelled **cream plinth**, with warm off-white walls and
    bevelled caps.
  - Ambient occlusion where the walls meet the floor.
  - Wood floors (concrete in the Garage, white ceramic after the Singularity).
  - **Colour-blocked rugs per room** (the Ralv signature).
  - Lit aisles with low **glass rails**.
- **Contact shadows:** under every rack, desk, plant and person, from a canvas-drawn soft
  blob. These sit on top of the frozen soft sun shadows.
- **The ops bay, Ralv-style:**
  - **Desks in facing pairs** with a **planter strip** between them; the back row faces
    the camera.
  - Colourful office chairs, keyboards, monitors glowing in the team colour.
  - Potted plants in the corners, and a floor lamp that pools warm light at night.
- **Walls:** a whiteboard over the bay, the **charter banner**, and the **Legacy trophy
  shelf** (one gold trophy per shipped generation; its core is sized by banked Legacy).
- **People:** chibi with **arms and legs**. Seated staff type; roamers walk with a leg and
  arm swing; Supervisor Chen walks her patrol.
- **Explore UI:**
  - **Glass HUD:** era, wing, and live Compute/Data/Money rates with the line icons.
  - **Training-run callout** pinned in the world over the racks (Acme): a progress ring, a
    Start → Train → Claim stepper, and the one live action (Start run / Claim payout).
  - **Ralv status cards** once you pinch in: name, a Working / Training / In the lab chip,
    and role · product. These are collision-culled, and the callout and floor lettering
    give way to them (level of detail).
  - **Floor lettering** at overview: "WING A · 120 RACKS", "OPS · 12 STAFF".
- **Settings → "3D Lab (beta)":**
  - Default **off**, and sanitized: only a stored `true` turns it on.
  - Flips live between the 2D and 3D halls.
  - Any 3D failure (no WebGL2, a context that stays lost, *any exception while building or
    drawing a frame*) drops that session back to 2D.
- **Budget, late-game wing:**
  - 84 draw calls / 63k triangles (early lab 67 / 18k).
  - Everything repeated is instanced: racks, people and limbs, furniture, leaves, windows,
    rails, trophies, skyline, coolers, fans.
  - Chunk 153 KB gzip.

The **Garage Closet** still needs its own props (roller door, workbench, one tower PC) —
that's the next "eras as architecture" item (§7 #9).

---

## 1. What the references actually are

| Ref | What it is | How it's built (evidence) | What to take |
|---|---|---|---|
| **Your clip** — GPT‑6 Astra vs Opus 5.5 "WareTrack" | Each model generated a single-file three.js app: a light, isometric digital twin of an airport, gates, a cutaway terminal, a suburb, then **night mode**, under glass KPI cards and a pinned "Flight BA‑284 · Boarding" callout. | AI-written three.js scenes follow one recipe: no assets, procedural primitives (bevelled boxes), instancing, emissive windows, soft shadows and fog, a DOM HUD over the canvas, scripted camera shots. | **Procedural geometry can look premium.** That matches our "parametric, no image assets" rule exactly. Night mode is the money shot. |
| **Dominik Scholz — "Ralv"** (ralv.ai, "the home for your agents") | A live 3D office for coding agents: every project is a room, every agent a desk, each with a floating status card. Built with three.js; he calls the current build "Ralv3". | No source is public. From the official 1920×1200 frame: a **low-FOV perspective** camera (ground cells shrink with depth), back walls only, warm off-white walls on a cream plinth, wood floors, **colour only in rugs and emissives**, soft "evening" key-light shadows, AO-like corners, **no outlines**. Name cards are near-black and skew with perspective (in-world). Most likely three.js + R3F/drei, NeutralTone/ACES. | **Our game is literally this:** an AI lab whose agents sit at desks. Rooms = wings and eras, desks = staff, the card = their tap card. |
| **Stephen (@srotimi_ui) — "Acme"** | An isometric warehouse diorama (blue racks, boxes, trucks at docks) under frosted-glass cards. One pinned callout has a **72% progress ring** and a Gate in → Unload → Sort → Gate out stepper. | A high-quality render (Blender or Spline class) plus DOM cards. | The **pinned callout with a progress ring** is a CLAUDE.md-approved emphasis pattern. It fits a training run or a product launch. |

Similar 2025–26 open projects confirm the techniques: `geovane-gc/agent-hq` (R3F + Blender-scripted glTF), `Gaurav2693/ai-office` (raw three.js, procedural people, 24h light cycle), `regisBafutwabo/agent-office` (auto day/night), `AgentSystemLabs/agent-office` (a `/lite` 2D fallback for phones), and `pablodelucca/pixel-agents` (Canvas 2D).

---

## 2. How we use this technology here (the architecture)

```
GameState ──buildHallModel()──► HallModel ──┬──► hallRenderer.ts  (shipped 2D canvas, unchanged)
 (engine, pure)   (view-model, pure)        │
                                            └──► layout3d.ts ──► hallScene3d.ts (three.js)
                                                 (pure: tiles→world)   (instanced, procedural)
```

- **Nothing in `src/engine/` changed.** No save field, no `SAVE_VERSION` bump, no balance
  value, no sim change. The flag lives in its own localStorage key, outside the save.
- **One source of truth for "did the lab change?"** I extracted the 2D loop's cache
  signature into `hallModelSig()`, which both loops now call. The string is identical,
  so the 2D path's behaviour is unchanged.
- **Same rack, same tile, same tap.** `layout3d` places rack *i* on `rackTileOrder(model)[i]`,
  the list the 2D painter and hit-test use. A tap on a 3D rack opens the same card, and
  "work the incident" fires the same `doWorkProblem`.
- **Stack choice: vanilla three.js `WebGLRenderer`, pinned `three@0.186.1`.**
  - **Not WebGPURenderer:** about 2× CPU per frame, a 5–10× slower first frame, and no
    context-loss recovery. iOS drops the GL context on every backgrounding.
  - **Not React Three Fiber:** R3F 8 is the React 18 line. It has been frozen since
    Feb 2025, pulls a deprecated BVH dependency and a second zustand, logs `Clock`
    deprecation warnings on r183+, and costs about +97 KB gzip. R3F 9 needs React 19,
    which would mean a framework migration on a live app.
  - **Babylon.js** is the credible second choice (built-in context restore), at a heavier
    bundle and a second programming model.
  - **Native SceneKit/RealityKit** would duplicate the renderer in Swift and break the web
    and Playwright workflow. SceneKit was also soft-deprecated at WWDC25.

---

## 3. What the spike is (and how to see it)

**Files**
- `src/render3d/layout3d.ts`: pure placements and poses. 11 tests in `layout3d.test.ts`.
- `src/render3d/hallScene3d.ts`: the three.js scene.
- `src/render3d/flag.ts`: the opt-in flag.
- `src/ui/HallStage3D.tsx`: loop, picking, labels, watchdog.
- `src/ui/HallCanvas.tsx`: mode switch, shared tap cards, the explore overlay.
- Styles: the `.hall3d-*` block in `styles.css`.
- `scripts/smoke.mjs --hall3d`: drives the spike in CI-style smoke runs.

**Turn it on**
- **Web/dev:** open `/?hall3d=1`. Turn it off with `/?hall3d=0`.
- **Device:** in Safari Web Inspector run
  `localStorage.setItem("singularity.hall3d.v1","1")`, then reload.

**What it draws**

| Area | What you see |
|---|---|
| Camera | Orthographic true-isometric. A barely-there sway (±2.6° over about 90 s), off under reduce motion. |
| Light | Hemisphere + one soft-shadow sun with NeutralToneMapping. Shadows are re-rendered only when the room changes. |
| Building | Cutaway back walls with clerestory windows. Warm off-white walls, cream plinth, era-tinted room floors per partition, lit aisles. |
| Racks | Instanced, one draw each for chassis, glass panel, LED bars and TPU caps. Tiers read by **shape** as well as colour: slim tower, standard blade, broad pod with a glowing cap. That makes them colour-blind safe. |
| Rack behaviour | Racks power on with an ease-out when bought. LEDs breathe while busy and a **training-run wave** sweeps the floor. Overclock and thermal load warm the LEDs. |
| Ops bay | Wood floor with an era-coloured rug. Staff assigned to a product sit at desks (glowing team-colour monitors) in that product's column. Unassigned staff stroll the aisle. A 10× hire wears gold. |
| Crowd behaviour | Incidents pull roamers toward the smoking rack. Everyone hops when a run is ready to claim. |
| Products | Uplink beams with rising pulses: batching makes them faster, monetize gilds them, launch buzz surges them. |
| Lab details | Cooling units with spinning fans, data motes, incidents (warn light + smoke), Heat crates by the entrance. |
| Events and skyline | The inspector (Supervisor Chen) patrols. A claim burst ring. The hazy rival skyline, with your tower lit. |
| Expansion | Expansion plots as ghost lots with a "+"; tap to buy, same confirm as 2D. |
| Day / night | The same 4-minute cycle as 2D. At night the windows glow warm and the LEDs carry the room. |
| Explore | The expand button opens the lab full screen: one-finger pan, pinch to zoom, two-finger orbit inside the front quadrant, tap to glide to a rack or person. Names appear only once you pinch in, with collision-culled labels (front-most wins). Escape or × closes. |

**Measured** (headless Chromium + SwiftShader, `renderer.info`)

| Save | Draw calls | Triangles | JS heap |
|---|---|---|---|
| Fresh (empty garage) | 13 | 176 | — |
| Early (12 racks, 5 staff, 2 products) | 46 | 11k | 10 MB |
| Late (120-rack wing, 12 staff, 4 products) | **63** | **53k** | 11 MB |

- Bundle: `hallScene3d` chunk **587 KB min / 150 KB gzip**, loaded only when the flag is
  on. Main bundle 244.4 → 246.9 KB gzip.
- An earlier draft drew 83 calls / 113k triangles. Single-segment bevels, flat LED quads
  and instanced windows got it to 63 / 53k with no visible difference.
- SwiftShader timings say nothing about an iPhone. Frame time, heat and battery **must**
  be measured on devices (§8 Phase 0 gate).

---

## 4. The audits

### A. Current hall (2D canvas) audit
| Finding | Evidence | Consequence for 3D |
|---|---|---|
| **The world is a 292 px banner** (372 px on iPad split) on one tab | `.hall { height: 292px }`; IDEAS.md "hard truth" #1 | Immersion is capped by the frame, not the renderer. **Explore mode (full screen) is the single biggest immersion win**, and it works for 2D too. |
| A late wing reads as a **field of boxes** | Baseline shot: 120 identical boxes, no people visible at that scale | The references feel alive because rooms have **purpose and people**. The spike adds the ops bay with desks, and rooms colour-blocked per partition. |
| Staff are 3–4 px figures | `agentSpots` size `max(3.2, tileW·0.1)` | In 3D they are chibi figures at desks. With explore + pinch they are tappable people with names. |
| Rig Bay parts barely manifest | IDEAS.md hard truth #2 | Parity work: distinct part silhouettes on the 3D racks (§7 #3). |
| The 2D painter is ~1,400 canvas calls/frame late-game and was already optimised hard | 2026‑09 perf audit note in `HallCanvas.tsx` | The GPU path moves that cost off the main thread. Instanced draws total 63 calls at late game. |
| **The architecture is excellent** | `HallModel` is pure; the hit-test and painter share `rackTileOrder` | This is what made a second renderer a few days of work, not a rewrite. |

### B. Platform feasibility audit (iOS / WKWebView)
- **WebGL2: everywhere we ship.** It has been in WKWebView since iOS 15 and runs on ANGLE
  over Metal. It is the baseline.
- **WebGPU:**
  - Ships in Safari 26.
  - WKWebView *probably* has it on iOS 26 (forum statements, not Apple docs).
  - About 17% of iPhones were still below iOS 26 in June 2026.
  - Treat it as a later upgrade, and probe it on a device with `navigator.gpu?.requestAdapter()`.
- **Context loss is the #1 risk.**
  - WKWebView drops WebGL contexts on backgrounding.
  - iOS can also kill the GPU process *silently*, so no `webglcontextlost` fires.
  - The spike `preventDefault`s the loss so three.js restores itself, re-renders the
    frozen shadow map on restore, and polls `isContextLost()`. It **falls back to 2D only
    if the context stays lost about 6 s** while visible.
- **Memory:** WebContent jetsam limits are not fixed or documented. The spike has 3
  textures and about 11 MB of JS heap. Keep it texture-light (see budget).
- **Frame rate:**
  - WKWebView rAF is capped at 60 Hz, and drops to 30 in Low Power Mode.
  - The stage caps at 30 fps and pauses when hidden or scrolled away (same as 2D).
- **Headless testing:** Chrome M139+ no longer silently falls back to SwiftShader. The
  smoke harness now passes `--use-angle=swiftshader --enable-unsafe-swiftshader` under
  `--hall3d`.

### C. Performance budget audit (targets for shipping)
| Budget | Target | Spike today |
|---|---|---|
| Draw calls | ≤ 60, hard cap 100 (asserted in smoke) | 13–63 |
| Triangles | ≤ ~120k | ≤ 53k |
| GPU texture memory | ≤ 32 MB | ~0 (procedural, 3 tiny textures) |
| 3D JS chunk | ≤ 200 KB gzip | 150 KB |
| Pixel ratio | `min(dpr, 2)`, adaptive to 1.5 when hot or idle | `min(dpr, 2)` |
| Frame rate | 0 static · 30 ambient · 60 while touching | 30 cap; pauses off-screen |
| Shadows | 1 caster, 1024², frozen when static | ✓ |
| Post-processing | none beyond MSAA (bloom ≈ 3 ms/frame on mobile) | none |
| Frame time | ≤ 10 ms on an iPhone 12-class device | **unmeasured — device gate** |

### D. Design-rules compliance audit (CLAUDE.md / DEV.md)
- **No left-edge accent bars:** none anywhere. Labels and cards are full-tint dark pills.
- **No emoji:** the expand control uses the existing `ExpandIcon`; × is a typographic mark.
- **Clean, not noisy:**
  - No labels in the card view.
  - People's names appear only after the player pinches in, in explore mode, and overlaps
    cull.
  - Everything else is wordless: light, motion, beams.
- **Reduce motion (in-app toggle or OS setting):**
  - Camera sway off.
  - Training wave, pulses, motes, flicker and fans static.
  - Spawn and claim burst skip to their end state.
  - People stand still.
  - Explore fade and label fade are instant.
  - Damping is off in explore.
- **Deterministic:** every pose is a pure function of (model, clock), tested. No
  `Math.random`. The engine never sees the renderer.
- **DEV.md "parametric, no image assets":** held. Zero meshes, zero textures, all
  procedural.
- **DEV.md "clean 2.5D hall":** the spike keeps the 2.5D *read* (orthographic iso). Moving
  to a perspective camera (Ralv) or free orbit by default **is** a spine change; owner
  call (§9).

### E. Accessibility audit
- **Canvas:** stays `aria-hidden`. Every fact on it lives in the accessible panels, same
  as 2D.
- **Explore overlay:** a real dialog. It uses `useDialog`: focus moves in, Escape closes,
  focus returns.
- **Colour-blind safety:** tiers differ by shape, not only green/blue/violet. Blue and
  violet are a common confusion pair.
- **Labels:** DOM, 11 px minimum, crisp at any zoom; never text baked into the scene.
- **Still to do before shipping:** Dynamic Type for labels; 44 pt hit targets for people
  (the spike's proxy is 0.46 × 0.66 world units, which is fine in explore but small in the
  card); "Still lab" mode tied to Low Power Mode.

### F. Engine, save and curve safety audit
- **Renderer-only.** No engine import changed behaviour; `hallModelSig` is a verbatim
  extraction.
- **No new persisted game field**, so no migration. The flag is a dev-only localStorage
  key, read in try/catch, and absent or garbled reads as off.
- **The sim is untouched** (it never renders).
- **Every existing test passes:** 2,182 across 264 files. 11 are new.

### G. Risk audit
| Risk | Severity | Mitigation |
|---|---|---|
| Battery and heat in long idle sessions (App Store 2.4.2) | High | 30 fps cap; pause off-screen; frozen shadows; no post; adaptive DPR; "Still lab" under Low Power Mode or serious thermal state |
| Silent GPU-process kill / context loss | High | Restore path + 6 s watchdog → 2D fallback (built) |
| Scope creep / art inconsistency | High | **Manifestation rule:** every 3D thing maps to a HallModel field. One parametric kit; no set-dressing sprints |
| Cold-start cost on 5 short sessions a day | Medium | Lazy chunk after first paint; 2D paints first and crossfades to 3D |
| Weak evidence that 3D *itself* lifts retention | Medium | No public study isolates it. What works is **visible, spatial progression**. Measure 3D vs 2D cohorts; A/B the App Store screenshots first (cheap) |
| three.js breaks something every release | Low | Exact pin; read the migration guide per bump (r186 *removed* `PCFSoftShadowMap`, which would warn at runtime) |

---

## 5. Parity matrix (2D → 3D spike)

| 2D feature | 3D spike | Notes |
|---|---|---|
| Racks by tier / density / skin | ✓ | Shape + colour; skins via the same `skinTint` |
| Spawn (power-on) on buy | ✓ | Same `spawnFromOnChange` rule (wing switch does not replay) |
| Partitions / rooms / walkways | ✓ | Rooms colour-blocked |
| Wings | ✓ | Same wing switcher drives it |
| Expansion markers (tap → confirm) | ✓ | Ghost lots; no price text in-scene (the confirm shows it) |
| Staff (identity, team, 10×) | ✓ | Desks for the assigned, aisle for roamers |
| Supervisor Chen | ✓ | Patrol + tap card |
| Product beams / buzz / batching / monetize | ✓ | |
| Incidents (work the problem) | ✓ | Warn light + smoke; first tap works it |
| Heat crates, cooling fans, data motes, overclock, thermal | ✓ | |
| Claim burst, day/night, skyline, alignment tint | ✓ | |
| Rack tap flash + cards | ✓ | Shared cards with 2D |
| Hall themes (CSS filter) | ✓ | Applied to the GL canvas |
| Charter banner, Legacy Wall trophies | ✓ | Round 2: banner on the back wall; trophy shelf on the left wall |
| Storm / lightning weather, singularity vortex | ✓ | Round 5: overcast sky, rain around (never into) the open-top room, lightning strobe; era 5 spiral motes |
| Component delivery crate, ops bot, crowd at the lip | ✓ | Round 5: crate dolly on the walkway; hover bot scanning racks; onlookers peering over the plinth |
| Rig Bay part silhouettes | ✓ | Round 3 |

---

## 6. Style bible — "Lab Diorama"

- **Palette.**
  - Neutral architecture: walls `#efe4da`, plinth `#dcc6b6`, wood `#a06441`.
  - Deep ground per era.
  - **Colour lives only in rugs and emissives**, one hue per room function.
  - The era sets the temperature: tungsten garage → cyan hyperscaler → iridescent
    post-singularity.
- **Camera.**
  - Keep orthographic iso in the card (the 2.5D read).
  - Explore mode could move to a low-FOV (≈26°) perspective camera for real depth when
    dollying into a room (what Ralv does). Owner call.
- **Light.**
  - Hemisphere + one warm key with frozen soft shadows; NeutralToneMapping ≈1.05.
  - No ambient (it flattens AO).
  - Night: a cool moon at about 0.35, with windows, LEDs and monitors carrying the room.
- **Materials.**
  - Matte Standard (roughness 0.5–0.9), bevelled boxes, no outlines.
  - Emissive for anything that is "on".
  - Glass is transparent at about 0.25; no transmission on mobile.
- **People.**
  - Chibi (big head), at desks; status is **wordless** (monitor glow, posture).
  - Names only on pinch-in or tap.
- **Labels and callouts.**
  - DOM over the canvas, projected per frame, collision-culled.
  - Emphasis by full tint, **progress ring**, badge or glow. **Never a left-edge bar.**
- **Motion.** Ambient only: LEDs breathe, fans spin, people fidget. Every effect has a
  static reduce-motion end state.

---

## 7. Immersive moments backlog (ranked impact ÷ effort; all wordless, all reduce-motion safe)

1. **Full-screen world, panels slide over it.** Retires the banner; the biggest single lift. (H/M)
2. **Rack delivery and power-on cascade**: LEDs wake row by row. (H/S, half built)
3. **Rig Bay parts as silhouettes** on the racks; empty sockets read as open. (H/M)
4. **Tap-to-inspect glide** (≤250 ms) with the card sliding up; cut instead under reduce motion. (H/M, built in explore)
5. **Three zoom snaps** — Campus / Floor / Desk — each with its own level of detail. (H/M)
6. **Training run as light**: one packet travels the cable trays; speed follows the run rate. (H/S, wave built)
7. **Shipping a model**: a core rises through a skylight, one sky beam, about 2 s. (H/M)
8. **"While you were away" as a ≤3 s time-lapse** of what arrived, replacing a popup. (H/M)
9. **Eras as architecture**:
   - Garage: roller door, workbench, one tower PC.
   - Startup: loft with a glass meeting room.
   - Frontier: atrium and cooling yard.
   - Hyperscaler: pull back to a campus site plan.
   - Post-singularity: white-ceramic monoliths. (H/L)
10. **Night: windows lit per occupied desk**; empty desks stay dark. (M/S)
11. **Grand Challenge as an outdoor scaffold** that fills as you fund it, then becomes a landmark. (M/M)
12. **Photo mode** (UI hidden, gentle tilt-shift), which doubles as App Store screenshots. (M/S)
13. **Pinned training callout** with a progress ring (the "Acme" pattern), at desk zoom only. (M/S)
14. **Contracts as trucks at a loading dock**; the auto-train ops bot roams. (L/S)

**Cosmetics that become meaningful in 3D** (no stats; curve-safe; sold directly, never
randomised): rack skins and hall themes (exist), desk décor, staff outfits, a lab
robot/pet, seasonal décor, exterior façades.

---

## 8. Phased roadmap with gates

| Phase | Scope | Exit gate |
|---|---|---|
| **0 — Spike** (this branch) | 3D painter of `HallModel` behind a dev flag; explore mode; context watchdog; smoke `--hall3d` | **On devices** (iPhone 11 / SE2 / 12, plus an iPad): cold-start delta ≤ 0.5 s; p10 fps ≥ 28; thermal state after 15 min ≤ "fair"; battery %/10 min within 1.3× of 2D. **In parallel:** A/B App Store screenshots of the 3D lab (Product Page Optimization) |
| **1 — Parity** (4–6 wks) | Fill §5's ✗ rows; Settings toggle "Lab view: Classic / 3D (beta)"; auto-fallback (no WebGL2, Low Power Mode, serious thermal, 2 losses); 2D paints first, 3D crossfades in; Dynamic Type labels; "Still lab" | Crash-free ≥ 2D; context-loss rate tracked by telemetry (R8); opt-out rate < 20% |
| **2 — Life** (4–6 wks) | Moments #1–#8; full-screen world with sliding panels; zoom snaps; Rig Bay silhouettes | D1/D7 of 3D cohort ≥ 2D; world taps/session rising; reviews mentioning "hot"/"battery" flat |
| **3 — Spectacle** | Eras as architecture, ship sequence, photo mode, 3D cosmetics line | Cosmetic attach rate; store conversion |

Rollout like RuneScape NXT or Minecraft Vibrant Visuals: opt-in beta → default on newer
devices (A14+) → staged percentage. Keep **Classic** forever, the way Dwarf Fortress did.

---

## 9. Decisions only the owner can make

1. **Approve the spine change?** DEV.md's "Clean 2.5D hall" becomes "a 2.5D-read 3D hall,
   with Classic kept". The parametric, no-assets rule can stay as it is.
2. **Phase priority:** run Phase 0 device benchmarks now, or after the R8 Platform &
   LiveOps wave? R8 telemetry is what makes the Phase 1 gates measurable, so I'd lean
   R8-telemetry first, then Phase 0 on devices.
3. **Explore camera:** keep orthographic (on-brand with today), or a low-FOV perspective
   (Ralv's depth when zooming)?
4. ~~**Assets**~~ — **decided (Round 3): 100% code-built.** CC0 kits stay allowed if a
   specific need appears. Avoid Hunyuan3D (licence excludes EU/UK/KR). Synty would need
   written confirmation for GLBs inside a web bundle.

---

## Sources

- **References:**
  - x.com/dom_scholz/status/2107489040782004255
  - x.com/threejs/status/2107719932360396850
  - x.com/srotimi_ui/status/2107067022588961032
  - ralv.ai
  - x.com/dom_scholz/status/2010503500782878762 ("Starcraft for Agents")
  - x.com/dom_scholz/status/2105689755619045464 (Ralv3)
- **Similar projects:**
  - github.com/geovane-gc/agent-hq
  - github.com/Gaurav2693/ai-office
  - github.com/regisBafutwabo/agent-office
  - github.com/AgentSystemLabs/agent-office
  - github.com/pablodelucca/pixel-agents
- **Platform:**
  - webkit.org/blog/17333/webkit-features-in-safari-26-0/
  - webkit.org/blog/18325/webkit-features-for-safari-27-0/
  - bugs.webkit.org/show_bug.cgi?id=261331 (context lost on backgrounding)
  - bugs.webkit.org/show_bug.cgi?id=215745 (Low Power Mode rAF)
  - bugs.webkit.org/show_bug.cgi?id=299237
  - developer.apple.com/forums/thread/770862 · /822200 · /823061 · /773222
  - nevermeant.dev/handling-blank-wkwebviews/
  - macrumors.com/2026/06/09/ios-26-adoption-stats-wwdc/
- **three.js / renderers:**
  - github.com/mrdoob/three.js/releases/tag/r186
  - github.com/mrdoob/three.js/wiki/Migration-Guide
  - discourse.threejs.org/t/…/91904 (WebGPURenderer CPU and first-frame benchmark)
  - r3f.docs.pmnd.rs/getting-started/installation
  - r3f.docs.pmnd.rs/advanced/scaling-performance
  - drei.docs.pmnd.rs/performances/bake-shadows
  - discoverthreejs.com/tips-and-tricks/
  - developer.arm.com (post-processing on mobile)
  - developer.apple.com/documentation/metal (TBDR)
  - khronos.org (PBR Neutral tone mapper)
  - github.com/yomotsu/camera-controls
- **Testing:**
  - groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM (SwiftShader fallback removal)
- **Design and evidence:**
  - mobilefreetoplay.com/gdc-2019-deconstructing-idle-miner-tycoon/
  - gameanalytics.com/blog/how-to-keep-players-engaged-and-coming-back-to-your-idle-game
  - kolibrigames.com/blog/big-works-on-small-screens
  - pocketgamer.biz (Eatventure analysis; Tiny Tower making-of)
  - gamerefinery.com (renovation metas)
  - gamedeveloper.com (Townscaper; Dorfromantik)
  - developer.apple.com/design/human-interface-guidelines/motion
  - developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria
  - developer.apple.com/app-store/review/guidelines/ (2.4.2, 2.5.2)
  - splitmetrics.com (screenshot A/B cases)
  - runescape.wiki/w/NXT
  - kitfoxgames.itch.io/dwarf-fortress/devlog/467052
- **Assets:**
  - kenney.nl/assets/furniture-kit
  - kaylousberg.itch.io (KayKit)
  - quaternius.com
  - syntystore.com/pages/end-user-licence-agreement
  - huggingface.co/tencent/Hunyuan3D-2 (licence)
  - docs.meshy.ai (pricing)
  - tripo3d.ai/blog/commercial-use-ai-3d-models

*Caveat: most market numbers are third-party estimates from 2019–2024. No public data
isolates the effect of 3D vs 2D on idle-game retention. The evidence supports visible,
spatial progression, and 3D is a strong way to deliver that.*
