import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { listSkills, loadSkill } from "./skills.js";
import {
  assembleDocument,
  CDN_ORIGINS,
  kitViewHtml,
  MCP_APP_MIME_TYPE,
  MCP_APP_VIEW_HTML,
  SDK_ORIGIN,
} from "./renderer.js";
import {
  describeSpec,
  KIT_COMPONENTS,
  modelShape,
  partsShape,
  processShape,
  simulationShape,
  validateSpec,
  type KitComponent,
} from "./kit/spec.js";

const VIEW_URI = "ui://open-generative-ui/document.html";
const UI_EXTENSION = "io.modelcontextprotocol/ui";

const KIT_TOOLS: Record<KitComponent, { shape: z.ZodRawShape; noun: string; description: string }> = {
  process: {
    shape: processShape,
    noun: "process diagram",
    description:
      "Draw an interactive diagram of a process that the user steps through one stage at a time. " +
      "Use it for how something works in stages: a closed cycle that returns to its start (refrigerator, " +
      "water cycle, heartbeat, Krebs cycle) or a one-way flow (how a bill becomes law, what happens when " +
      "you open a web page). Give 2 to 8 short stage labels, one or two sentences of detail per stage, and " +
      "optional labels for the arrows. The kit sizes the boxes, routes the arrows and places every label, " +
      "so never hand-draw these diagrams. Zones split a cycle into a left and a right region, such as " +
      "inside and outside a fridge.",
  },
  model: {
    shape: modelShape,
    noun: "model",
    description:
      "Draw a live model the user can play with: up to 4 sliders, headline numbers computed from formulas, " +
      "and an optional line or bar chart. Use it for what-if questions about a formula: compound interest, " +
      "loan payments, a physics equation, a recipe scaled by servings. Formulas use the input ids, " +
      "+ - * / % ^, comparisons, && || !, cond ? a : b, PI, E, and abs, min, max, pow, sqrt, exp, log, " +
      "log10, round, floor, ceil, sin, cos, tan, clamp. A chart's x range may be a formula over the " +
      "inputs, such as from 0 to years.",
  },
  simulation: {
    shape: simulationShape,
    noun: "simulation",
    description:
      "Run a probability experiment the user can repeat: each trial makes random draws, each option has a " +
      "win condition, and the results converge toward the expected rates as trials pile up. Use it for " +
      "chance questions that intuition gets wrong: Monty Hall, dice sums, coin flips, which of two bets " +
      "wins more often. Draws use rand() for a number in [0, 1) and randint(a, b) for a whole number from " +
      "a to b inclusive, and may use earlier draws. Give each option's theoretical rate as expected so the " +
      "user can watch the results settle on it.",
  },
  parts: {
    shape: partsShape,
    noun: "breakdown",
    description:
      "Show how a whole splits into parts: a proportion bar with each part's value and share, plus a " +
      "switcher when there are up to 4 cases to compare. Use it for composition questions: what makes up " +
      "GDP, where a paycheck goes, a meal's macronutrients, a country's energy mix, a budget before and " +
      "after a change.",
  },
};

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "open-generative-ui",
    version: "0.1.0",
  });

  // MCP Apps hosts draw the view themselves, so the tool result only confirms it.
  const supportsUi = () => {
    const ui = server.server.getClientCapabilities()?.extensions?.[UI_EXTENSION] as
      | { mimeTypes?: string[] }
      | undefined;
    return !!ui?.mimeTypes?.includes(MCP_APP_MIME_TYPE);
  };

  // Resources: list and get skills
  server.registerResource(
    "skills-list",
    "skills://list",
    {
      description: "JSON array of available skill names",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "skills://list",
          mimeType: "application/json",
          text: JSON.stringify(listSkills()),
        },
      ],
    }),
  );

  server.registerResource(
    "skill",
    new ResourceTemplate("skills://{name}", {
      list: async () => ({
        resources: listSkills().map((name) => ({
          uri: `skills://${name}`,
          name,
          mimeType: "text/plain",
        })),
      }),
    }),
    {
      description: "Full text of a skill instruction document",
      mimeType: "text/plain",
    },
    async (uri, { name }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: loadSkill(name as string),
        },
      ],
    }),
  );

  // Prompts: pre-composed skill prompts
  server.registerPrompt(
    "create_widget",
    { description: "Instructions for creating interactive HTML widgets" },
    async () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: loadSkill("master-agent-playbook") },
        },
      ],
    }),
  );

  server.registerPrompt(
    "create_svg_diagram",
    { description: "Instructions for creating inline SVG diagrams" },
    async () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: loadSkill("svg-diagram-skill") },
        },
      ],
    }),
  );

  server.registerPrompt(
    "create_visualization",
    { description: "Advanced visualization instructions" },
    async () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: loadSkill("agent-skills-vol2") },
        },
      ],
    }),
  );

  // MCP Apps view: hosts with the ui extension render assemble_document inline
  server.registerResource(
    "document-view",
    VIEW_URI,
    {
      description: "Renders assemble_document fragments inline in MCP Apps hosts",
      mimeType: MCP_APP_MIME_TYPE,
    },
    async () => ({
      contents: [
        {
          uri: VIEW_URI,
          mimeType: MCP_APP_MIME_TYPE,
          text: MCP_APP_VIEW_HTML,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: { resourceDomains: CDN_ORIGINS, connectDomains: CDN_ORIGINS },
            },
          },
        },
      ],
    }),
  );

  // Tool: render (MCP Apps hosts) or assemble (other clients) a design-system document
  server.registerTool(
    "assemble_document",
    {
      description:
        "Renders an HTML fragment for the user with Open Intelligent UI theme CSS variables, " +
        "SVG c-* classes, form styles, and sendPrompt(text) / openLink(url) globals. " +
        "MCP Apps hosts show it inline; other clients get the complete iframe-ready HTML document.",
      inputSchema: {
        title: z.string().describe("Short title for the visualization"),
        description: z
          .string()
          .describe("One-sentence explanation of what this shows"),
        html: z
          .string()
          .describe(
            "Self-contained HTML fragment with inline <style> and <script>",
          ),
      },
      _meta: { ui: { resourceUri: VIEW_URI }, "ui/resourceUri": VIEW_URI },
    },
    async ({ title, html }) => {
      // The view already shows the fragment, so UI hosts get a one-liner instead of
      // echoing ~12 KB of design-system CSS into the model's context on every call.
      const text = supportsUi()
        ? `Rendered "${title}" inline for the user.`
        : assembleDocument(html);
      return { content: [{ type: "text", text }] };
    },
  );

  // Component kit: short JSON specs in, finished interactive visuals out. The
  // kit owns layout, so the model never places coordinates by hand.
  for (const component of KIT_COMPONENTS) {
    const { shape, noun, description } = KIT_TOOLS[component];
    const uri = `ui://open-generative-ui/kit/${component}.html`;
    server.registerResource(
      `kit-${component}`,
      uri,
      { description: `Renders show_${component} inline in MCP Apps hosts`, mimeType: MCP_APP_MIME_TYPE },
      async () => ({
        contents: [
          {
            uri,
            mimeType: MCP_APP_MIME_TYPE,
            text: kitViewHtml(component),
            _meta: { ui: { prefersBorder: false, csp: { resourceDomains: [SDK_ORIGIN] } } },
          },
        ],
      }),
    );
    server.registerTool(
      `show_${component}`,
      { description, inputSchema: shape, _meta: { ui: { resourceUri: uri }, "ui/resourceUri": uri } },
      async (args) => {
        const problems = validateSpec(component, args);
        if (problems.length) {
          return { isError: true, content: [{ type: "text", text: `Can't draw this ${noun}: ${problems.join("; ")}` }] };
        }
        const text = supportsUi() ? `Rendered the ${noun} for the user.` : describeSpec(component, args);
        return { content: [{ type: "text", text }] };
      },
    );
  }

  return server;
}
