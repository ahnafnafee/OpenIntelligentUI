// Bundles the Cloudflare Workers entry into dist/worker.bundle.js. The skills
// directory and dist/kit.js become the virtual:assets module, so the directory
// stays the only list of skills.
import { build } from "esbuild";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

const assets = {
  name: "assets",
  setup(b) {
    b.onResolve({ filter: /^virtual:assets$/ }, () => ({ path: "assets", namespace: "assets" }));
    b.onLoad({ filter: /.*/, namespace: "assets" }, () => {
      const dir = join(root, "skills");
      const skills = Object.fromEntries(
        readdirSync(dir).filter((f) => f.endsWith(".txt")).map((f) => [f.slice(0, -4), readFileSync(join(dir, f), "utf8")]),
      );
      const kit = readFileSync(join(root, "dist", "kit.js"), "utf8");
      return { contents: `export const skills = ${JSON.stringify(skills)};\nexport const kit = ${JSON.stringify(kit)};`, loader: "js" };
    });
  },
};

await build({
  absWorkingDir: root,
  entryPoints: ["src/worker.ts"],
  outfile: "dist/worker.bundle.js",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  conditions: ["workerd", "worker", "browser", "import"],
  mainFields: ["module", "main"],
  external: ["node:*"],
  plugins: [assets],
  legalComments: "none",
});
