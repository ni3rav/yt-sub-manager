/**
 * Entry point for the compiled binary.
 *
 * Unlike `index.ts` (which uses `import index from "./index.html"` and lets
 * Bun re-bundle the frontend at compile time — without the Tailwind plugin),
 * this entry point imports the *pre-built* artefacts from `dist/binary/` so
 * that CSS has already been processed by bun-plugin-tailwind before embedding.
 *
 * Build sequence (handled automatically by `bun run build:binary`):
 *   1. bun run build.binary.ts   ← processes Tailwind, writes dist/binary/
 *   2. bun build src/index.binary.ts --compile --outfile yt-sub-manager
 */

import { createAppServer } from "./server";
import indexHtml from "../dist/binary/index.html";

// The compiled binary has no NODE_ENV set by default, which would make
// Bun.serve run in development mode (HMR watcher + console streaming) and
// burn CPU for nothing. Force production before the server starts.
process.env.NODE_ENV = "production";

const server = createAppServer({
  port: 0,
  hostname: "127.0.0.1",
  autoOpenBrowser: process.env.NODE_ENV !== "test",
  indexHtml,
});

console.log(`🚀 YouTube Subscription Manager running at ${server.url}`);
