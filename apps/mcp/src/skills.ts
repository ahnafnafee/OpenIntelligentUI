import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Hosts without a filesystem (Cloudflare Workers) register the skill texts at startup.
let bundled: Record<string, string> | undefined;

export function useBundledSkills(texts: Record<string, string> | undefined) {
  bundled = texts;
}

const skillsDir = () =>
  process.env.SKILLS_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../skills");

export function listSkills(): string[] {
  if (bundled) return Object.keys(bundled).sort();
  return readdirSync(skillsDir())
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.replace(".txt", ""))
    .sort();
}

export function loadSkill(name: string): string {
  if (bundled) {
    if (!Object.hasOwn(bundled, name)) throw new Error(`Invalid skill name: ${name}`);
    return bundled[name];
  }
  const dir = skillsDir();
  const resolved = resolve(dir, `${name}.txt`);
  if (!resolved.startsWith(resolve(dir) + sep)) {
    throw new Error(`Invalid skill name: ${name}`);
  }
  return readFileSync(resolved, "utf-8");
}
