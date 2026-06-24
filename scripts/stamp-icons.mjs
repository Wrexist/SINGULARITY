// Stamp the app icon (Logo 1 — the glowing server rack) and launch splash into
// the freshly-scaffolded native iOS project. Zero dependencies: it copies the
// pre-rendered, opaque PNGs in `assets/` over the placeholder images Capacitor
// generates in `ios/`, so there's no `sharp`/`capacitor-assets` toolchain to
// install (and nothing to break `npm ci`). `ios/` is gitignored and recreated
// on every CI run, so this must run after `cap add ios`, before `cap sync`.
//
// Apple requires the 1024 store icon to be opaque with NO alpha — assets/icon.png
// is authored that way (RGB, no alpha), so a straight copy is safe.
import { existsSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ICON_SRC = "assets/icon.png"; // 1024×1024, opaque
const SPLASH_SRC = "assets/splash.png"; // 2732×2732, dark #0d1124 bg
const ICONSET = "ios/App/App/Assets.xcassets/AppIcon.appiconset";
const SPLASHSET = "ios/App/App/Assets.xcassets/Splash.imageset";

function stamp(dir, src, label) {
  if (!existsSync(dir)) {
    console.error(`✗ ${label}: ${dir} not found — run \`npx cap add ios\` first.`);
    process.exit(1);
  }
  if (!existsSync(src)) {
    console.error(`✗ ${label}: source ${src} missing.`);
    process.exit(1);
  }
  const pngs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png"));
  if (pngs.length === 0) {
    console.error(`✗ ${label}: no PNG placeholders in ${dir}.`);
    process.exit(1);
  }
  for (const f of pngs) {
    const dest = join(dir, f);
    if (statSync(dest).isFile()) copyFileSync(src, dest);
  }
  console.log(`✓ ${label}: stamped ${pngs.length} image(s) from ${src}`);
}

stamp(ICONSET, ICON_SRC, "App icon");
stamp(SPLASHSET, SPLASH_SRC, "Launch splash");
