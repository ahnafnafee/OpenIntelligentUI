// Cloudflare Workers entry. Workers have no filesystem, so scripts/build-worker.mjs
// inlines the skill texts and the browser kit as the virtual:assets module.

import { kit, skills } from "virtual:assets";
import { handle } from "./remote.js";
import { useBundledKit } from "./renderer.js";
import { useBundledSkills } from "./skills.js";

useBundledSkills(skills);
useBundledKit(kit);

export default {
  fetch: (request: Request, env: { MCP_TOKEN?: string }) => handle(request, env.MCP_TOKEN),
};
