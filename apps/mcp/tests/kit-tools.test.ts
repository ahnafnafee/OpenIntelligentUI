import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ClientCapabilities } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../src/server";

const COMPONENTS = ["process", "model", "simulation", "parts"] as const;
const UI_HOST: ClientCapabilities = {
  extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } },
};

async function connect(capabilities: ClientCapabilities = {}) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer().connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities });
  await client.connect(clientSide);
  return client;
}

async function call(name: string, args: Record<string, unknown>, capabilities?: ClientCapabilities) {
  const result = await (await connect(capabilities)).callTool({ name, arguments: args });
  return { isError: !!result.isError, text: (result.content as { text: string }[])[0].text };
}

export const FRIDGE = {
  closed: true,
  zones: [{ label: "Inside the fridge", sublabel: "about 4°C", tone: "cold" }, { label: "Your kitchen", sublabel: "about 22°C", tone: "warm" }],
  stages: [
    { label: "Compressor", sublabel: "squeezes the vapor", detail: "Squeezing the vapor heats it to about 50°C.", tone: "hot" },
    { label: "Condenser coils", sublabel: "on the back", detail: "Heat flows into the room and the gas condenses.", zone: 1, tone: "warm" },
    { label: "Expansion valve", sublabel: "drops the pressure", detail: "The pressure drops and the liquid chills.", tone: "cold" },
    { label: "Evaporator coils", sublabel: "inside the fridge", detail: "The refrigerant boils and soaks up heat.", zone: 0, tone: "cold" },
  ],
  links: [
    { label: "hot gas", sublabel: "high pressure", tone: "hot" },
    { label: "warm liquid", sublabel: "high pressure", tone: "warm" },
    { label: "cold mist", sublabel: "low pressure", tone: "cold" },
    { label: "cool vapor", sublabel: "low pressure", tone: "cool" },
  ],
};

export const MONTY = {
  question: "Does switching beat staying?",
  trial: "game",
  draws: [{ id: "car", formula: "randint(1, 3)" }, { id: "pick", formula: "randint(1, 3)" }],
  options: [
    { label: "Stay", wins: "pick == car", expected: 1 / 3, expectedLabel: "1/3" },
    { label: "Switch", wins: "pick != car", expected: 2 / 3, expectedLabel: "2/3" },
  ],
  runSize: 3000,
};

export const COMPOUND = {
  inputs: [
    { id: "start", label: "Starting amount", min: 100, max: 10000, step: 100, value: 1000, format: "currency" },
    { id: "rate", label: "Annual rate", min: 1, max: 12, step: 0.5, value: 7, format: "percent" },
    { id: "years", label: "Years", min: 1, max: 40, step: 1, value: 30, format: "integer" },
  ],
  outputs: [
    { label: "Balance", formula: "start * (1 + rate/100)^years", format: "currency", emphasis: true },
    { label: "Interest earned", formula: "start * (1 + rate/100)^years - start", format: "currency" },
  ],
  chart: {
    type: "line",
    x: { id: "t", label: "Year", from: 0, to: "years", step: 1, format: "integer" },
    series: [
      { label: "Compound", formula: "start * (1 + rate/100)^t" },
      { label: "Simple", formula: "start * (1 + rate/100 * t)" },
    ],
  },
  note: "Example numbers. Interest compounds once a year.",
};

export const GDP = {
  cases: [
    { label: "Shopper economy", parts: [{ label: "Consumption", value: 700 }, { label: "Investment", value: 170 }, { label: "Government", value: 180 }, { label: "Net exports", value: 50 }] },
    { label: "Builder economy", parts: [{ label: "Consumption", value: 450 }, { label: "Investment", value: 400 }, { label: "Government", value: 170 }, { label: "Net exports", value: 80 }] },
  ],
  unit: "$bn",
  totalLabel: "GDP",
};

describe("kit tools", () => {
  it("lists one MCP App tool per component, each linked to its own view", async () => {
    const { tools } = await (await connect()).listTools();
    for (const c of COMPONENTS) {
      const tool = tools.find((t) => t.name === `show_${c}`);
      expect(tool?._meta, c).toMatchObject({ ui: { resourceUri: `ui://open-generative-ui/kit/${c}.html` } });
    }
  });

  it("serves each kit view with the kit runtime, its component, and no border", async () => {
    const client = await connect();
    for (const c of COMPONENTS) {
      const { contents } = await client.readResource({ uri: `ui://open-generative-ui/kit/${c}.html` });
      const view = contents[0] as { mimeType?: string; text?: string; _meta?: unknown };
      expect(view.mimeType).toBe("text/html;profile=mcp-app");
      expect(view.text).toContain("OGUIKit");
      expect(view.text).toContain(`OGUIKit.render("${c}"`);
      expect(view._meta).toMatchObject({ ui: { prefersBorder: false } });
    }
  });

  it("draws arrowheads at a fixed size regardless of line weight", async () => {
    const { contents } = await (await connect()).readResource({ uri: "ui://open-generative-ui/kit/process.html" });
    expect((contents[0] as { text: string }).text).toContain("userSpaceOnUse");
  });

  it("confirms rendering to MCP Apps hosts in one line", async () => {
    for (const [c, spec] of [["process", FRIDGE], ["model", COMPOUND], ["simulation", MONTY], ["parts", GDP]] as const) {
      const { isError, text } = await call(`show_${c}`, spec, UI_HOST);
      expect(isError, c).toBe(false);
      expect(text, c).toMatch(/^Rendered/);
      expect(text.length, c).toBeLessThan(120);
    }
  });

  it("describes the process in text for other clients", async () => {
    const { text } = await call("show_process", FRIDGE);
    expect(text).toContain("returning to stage 1");
    expect(text).toContain("1. Compressor (squeezes the vapor)");
    expect(text.indexOf("Condenser coils")).toBeLessThan(text.indexOf("Expansion valve"));
  });

  it("runs the simulation for clients without UI", async () => {
    const { text } = await call("show_simulation", MONTY);
    const stay = Number(/Stay won ([\d,]+)/.exec(text)![1].replace(/,/g, ""));
    const swap = Number(/Switch won ([\d,]+)/.exec(text)![1].replace(/,/g, ""));
    expect(stay + swap).toBe(3000);
    expect(stay / 3000).toBeGreaterThan(0.28);
    expect(stay / 3000).toBeLessThan(0.39);
  });

  it("computes model outputs and part shares in text for other clients", async () => {
    expect((await call("show_model", COMPOUND)).text).toContain("Balance: 7,612.26");
    expect((await call("show_parts", GDP)).text).toContain("Consumption: 700 $bn (64%)");
  });

  it("rejects specs that reference missing zones or undefined names", async () => {
    const badZone = await call("show_process", { ...FRIDGE, stages: FRIDGE.stages.map((s) => ({ ...s, zone: 3 })) });
    expect(badZone.isError).toBe(true);
    expect(badZone.text).toMatch(/zone/);
    const badFormula = await call("show_model", { ...COMPOUND, outputs: [{ label: "Oops", formula: "start * growth" }] });
    expect(badFormula.isError).toBe(true);
    expect(badFormula.text).toMatch(/growth/);
  });
});
