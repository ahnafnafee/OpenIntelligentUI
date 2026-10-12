// Request handler for a remote deployment (claude.ai custom connector): a
// stateless MCP server per request, behind a bearer token.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./server.js";

const encoder = new TextEncoder();

// Takes the same time wherever the two strings first differ.
function sameSecret(a: string, b: string) {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function handle(request: Request, token: string | undefined): Promise<Response> {
  if (new URL(request.url).pathname !== "/mcp") return new Response("Not found", { status: 404 });
  // Fail closed: with no token configured the server answers nobody.
  if (!token) return new Response("MCP_TOKEN is not configured", { status: 503 });
  if (!sameSecret(request.headers.get("authorization") ?? "", `Bearer ${token}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  // A fresh server per request, so concurrent clients never share one.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await createMcpServer().connect(transport);
  return transport.handleRequest(request);
}
