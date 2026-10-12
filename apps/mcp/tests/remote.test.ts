import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handle } from "../src/remote";

const TOKEN = "test-token-7f3a";
const ENDPOINT = "https://worker.test/mcp";

const post = (headers: Record<string, string> = {}, url = ENDPOINT) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });

async function connect(token: string) {
  const client = new Client({ name: "remote-test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    fetch: (url, init) => handle(new Request(url, init), TOKEN),
  }));
  return client;
}

describe("remote MCP handler", () => {
  it("refuses every request while no server token is configured", async () => {
    expect((await handle(post({ authorization: `Bearer ${TOKEN}` }), undefined)).status).toBe(503);
    expect((await handle(post({ authorization: "Bearer " }), "")).status).toBe(503);
  });

  it("rejects a missing, wrong, or unprefixed token", async () => {
    for (const authorization of [undefined, "Bearer wrong-token-7f3a", TOKEN, `bearer ${TOKEN}x`]) {
      const res = await handle(post(authorization ? { authorization } : {}), TOKEN);
      expect(res.status, String(authorization)).toBe(401);
    }
  });

  it("only answers on /mcp", async () => {
    expect((await handle(post({ authorization: `Bearer ${TOKEN}` }, "https://worker.test/"), TOKEN)).status).toBe(404);
  });

  it("serves the kit tools and views to an authorized client", async () => {
    const client = await connect(TOKEN);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["show_process", "show_simulation"]));
    const view = await client.readResource({ uri: "ui://open-generative-ui/kit/simulation.html" });
    expect((view.contents[0] as { text: string }).text).toContain('OGUIKit.render("simulation"');
    const result = await client.callTool({
      name: "show_simulation",
      arguments: {
        trial: "flip",
        draws: [{ id: "coin", formula: "randint(0, 1)" }],
        options: [{ label: "Heads", wins: "coin == 1", expected: 0.5 }],
        runSize: 200,
      },
    });
    expect((result.content as { text: string }[])[0].text).toMatch(/Heads won [\d,]+ of 200 flips/);
    await client.close();
  });
});
