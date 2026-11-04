// Renders the /og-card page into public/og.png (1200×630) with headless Chrome.
// Usage: npm run og     (set CHROME=/path/to/chrome if it isn't in the default macOS location)

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const card = "dist/og-card/index.html";

execFileSync("npx", ["astro", "build"], { stdio: "inherit" });
if (!existsSync(card)) throw new Error(`${card} was not built`);

// The card's styles are inlined, so the built file renders without a server.
execFileSync(chrome, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--window-size=1200,630",
  "--virtual-time-budget=4000",
  "--screenshot=public/og.png",
  pathToFileURL(card).href,
], { stdio: "ignore" });

// Build again so dist/ ships the new image.
execFileSync("npx", ["astro", "build"], { stdio: "ignore" });
console.log("Wrote public/og.png");
