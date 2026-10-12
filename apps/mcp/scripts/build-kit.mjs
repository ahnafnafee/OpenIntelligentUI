// Bundles the browser kit into dist/kit.js, which the MCP App views inline.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
  absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
  entryPoints: ["src/kit/browser/main.ts"],
  outfile: "dist/kit.js",
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  legalComments: "none",
});
