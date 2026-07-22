/**
 * Build script for the compiled binary.
 *
 * This script processes the frontend with bun-plugin-tailwind (so @apply,
 * @theme, @utility etc. are all resolved) and writes a *single* self-contained
 * HTML file to dist/binary/index.html with everything inlined.
 *
 * The binary entry point (src/index.binary.ts) then imports that file and
 * hands it to createAppServer(), so the binary always serves properly
 * styled output.
 */

import tailwind from "bun-plugin-tailwind";
import { rm, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const outdir = path.join(process.cwd(), "dist", "binary");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

// Copy the SVG logo so dist/binary/logo.svg is available for the HTML reference
await copyFile(
  path.join(process.cwd(), "src", "logo.svg"),
  path.join(outdir, "logo.svg")
);

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  sourcemap: "none",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

for (const output of result.outputs) {
  console.log(` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
