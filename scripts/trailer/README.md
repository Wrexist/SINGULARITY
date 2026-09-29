# Trailer pipeline

Builds the Singularity Inc. trailer from the real game — every shot is the built app,
driven by engine-made saves, recorded frame by frame.

Outputs (committed in `appstore/trailer/`):

| File | Format | Use |
|---|---|---|
| `singularity-trailer-1080p.mp4` | 1920x1080, 30 fps, 42 s, H.264 + AAC, -14 LUFS | Website, YouTube, press, socials |
| `singularity-trailer-vertical.mp4` | 886x1920, 30 fps, 30 s | TikTok / Reels / Shorts |

The vertical cut is **not** the App Store app preview: it places hall footage over a
composited background, which App Review's 2.3.4 (screen captures only) may reject.
`appstore/preview.mp4` (from `scripts/store-preview-video.mjs`) stays the preview.
Neither video mentions price (2.3.7).

## Rebuild

```sh
npm run build                                   # the app the footage is captured from
npx tsx scripts/trailer/seeds.ts /tmp/trailer/seeds
node scripts/trailer/capture.mjs /tmp/trailer/seeds /tmp/trailer/cap      # ~15 min
node scripts/trailer/score.mjs /tmp/trailer/score.wav
node scripts/trailer/compose.mjs /tmp/trailer/cap /tmp/trailer/score.wav appstore/trailer/singularity-trailer-1080p.mp4
node scripts/trailer/compose.mjs /tmp/trailer/cap /tmp/trailer/score.wav appstore/trailer/singularity-trailer-vertical.mp4 --format portrait
```

`compose.mjs --stills 6,24.5,38` renders single frames for review. Requires ffmpeg.

## How it works

- `seeds.ts` — saves at each stage of a lab's life (one-rack closet → 330-rack
  post-singularity campus, a product portfolio and crew grown by the engine, a
  ship-ready lab, a fresh generation), all built with engine actions.
- `capture.mjs` — opens each save in the built app (Dark appearance), pauses
  Playwright's clock and advances it exactly 1/30 s per screenshot, so motion is
  smooth. Stage shots give the hall canvas the full 1920x1080 frame.
- `score.mjs` — an original 42 s cue (100 BPM, A minor) synthesised from scratch;
  deterministic, no samples, no licences. Cuts land on its bars (2.4 s).
- `compose.mjs` — an HTML stage lays out each frame (footage, floating app screens,
  word-by-word Inter type, bloom on the hits, grain, vignette); ffmpeg encodes it with
  the score, normalised to -14 LUFS.
- `assets/` — Inter (SIL Open Font License, see `Inter-OFL.txt`).
