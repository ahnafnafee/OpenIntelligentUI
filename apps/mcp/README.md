# OpenGenerativeUI MCP Server

A standalone, independently deployable [Model Context Protocol](https://modelcontextprotocol.io) server that exposes OpenGenerativeUI's design system, skills, and document renderer to any MCP-compatible client.

## Features

- **Design System Tool**: `assemble_document` wraps HTML fragments with OpenGenerativeUI's complete CSS design system and bridge JavaScript
- **Component Kit**: `show_process`, `show_model`, `show_simulation`, and `show_parts` turn short JSON specs into interactive visuals that render inline in MCP Apps hosts, with layout computed by the kit
- **Skill Resources**: Browse and read skill instruction documents via `skills://list` and `skills://{name}`
- **Prompt Templates**: Pre-composed prompts for common visualization tasks: `create_widget`, `create_svg_diagram`, `create_visualization`
- **Standalone**: No dependencies on other packages; can be deployed independently
- **Configurable**: Environment variables for port, CORS origins, skills directory, and logging

## Quick Start

### Prerequisites
- Node.js >= 18
- pnpm or npm

### Installation

```bash
# Navigate to the MCP package
cd apps/mcp

# Install dependencies
pnpm install

# Start the development server
pnpm dev
# → MCP server running on http://localhost:3100/mcp

# Health check
curl http://localhost:3100/health
# → {"status":"ok"}
```

### Build for Production

```bash
pnpm build
pnpm start
```

## Configuration

Create a `.env` file in the package root (copy from `.env.example`):

```bash
# Server port (default: 3100)
MCP_PORT=3100

# CORS origins, comma-separated (default: * for development)
ALLOWED_ORIGINS=*

# Skills directory path (default: ./skills)
SKILLS_DIR=./skills

# Log level (default: info)
LOG_LEVEL=info
```

## Usage

### Claude Desktop (stdio)

Claude Desktop uses stdio transport. Build first, then add to your `claude_desktop_config.json`:

```bash
pnpm build
```

```json
{
  "mcpServers": {
    "open-generative-ui": {
      "command": "node",
      "args": ["dist/stdio.js"],
      "cwd": "/absolute/path/to/apps/mcp"
    }
  }
}
```

For development, you can use `tsx` directly:

```json
{
  "mcpServers": {
    "open-generative-ui": {
      "command": "npx",
      "args": ["tsx", "src/stdio.ts"],
      "cwd": "/absolute/path/to/apps/mcp"
    }
  }
}
```

### Claude Code (HTTP)

Add to `.mcp.json`:

```json
{
  "openGenerativeUI": {
    "url": "http://localhost:3100/mcp"
  }
}
```

Then start the HTTP server with `pnpm dev`.

### Any MCP Client

- **stdio**: Run `node dist/stdio.js` (or `pnpm start:stdio`)
- **HTTP**: Connect to `http://localhost:3100/mcp` (start with `pnpm dev` or `pnpm start`)

## API Reference

### Tool: `assemble_document`

Wraps an HTML fragment with the complete OpenGenerativeUI design system.

In [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) hosts such as Claude Desktop, the tool is linked to the `ui://open-generative-ui/document.html` view, so the fragment renders inline in the conversation. The view applies the design system and the host's theme, runs the fragment's scripts in order, and maps `sendPrompt(text)` and `openLink(url)` to the host. The tool result is then a one-line confirmation, which keeps the document out of the model's context. Clients that do not advertise the `io.modelcontextprotocol/ui` extension receive the complete document as shown below.

**Input:**
```typescript
{
  title: string;       // Short title, e.g., "Binary Search Visualization"
  description: string; // One-sentence explanation
  html: string;        // Self-contained HTML fragment (inline <style> and <script> OK)
}
```

**Output:**
```typescript
{
  content: [{
    type: "text",
    text: string  // Complete HTML document, ready to render in iframe
  }]
}
```

**Example:**
```javascript
const result = await client.callTool("assemble_document", {
  title: "Interactive Algorithm Visualizer",
  description: "Step-by-step visualization of the quicksort algorithm",
  html: `
    <div id="viz">
      <p>Click to start visualization</p>
      <script>
        // Your visualization code here
      </script>
    </div>
  `
});

// result.content[0].text is a complete HTML document
// Render in: <iframe sandbox="allow-scripts allow-same-origin" srcdoc={result.content[0].text} />
```

### Component kit tools

Four tools take a short JSON spec and render a finished, interactive visual through their own MCP Apps view, `ui://open-generative-ui/kit/{component}.html`. The model describes the content; the kit does the drawing, so boxes fit their text, connectors are orthogonal with fixed-size arrowheads that stop at box edges, and labels never cover boxes or lines.

| Tool | Draws | Spec highlights |
|------|-------|-----------------|
| `show_process` | A closed cycle or one-way flow the user steps through | `closed`, 2 to 8 `stages` with `detail`, arrow `links`, optional left and right `zones` |
| `show_model` | Sliders, live numbers, and a line or bar chart | `inputs`, `outputs` with formulas, `chart` with an x range that may be a formula |
| `show_simulation` | A repeatable probability experiment that converges on expected rates | `draws` using `rand()` and `randint(a, b)`, `options` with win conditions and `expected` rates |
| `show_parts` | A proportion bar with values and shares, plus a case switcher | `cases` of `parts`, `unit`, `totalLabel` |

Formulas are parsed by a small expression evaluator (arithmetic, comparisons, `&&`, `||`, `?:`, and math functions); nothing is passed to `eval`. The server validates every spec before the view draws it: a spec that references a missing zone or an undefined name returns an error result that names the field to fix. MCP Apps hosts get a one-line confirmation; other clients get a plain-text version (the stages in order, computed outputs, or simulated win counts).

```javascript
await client.callTool("show_process", {
  closed: true,
  stages: [
    { label: "Compressor", detail: "Squeezing the vapor heats it.", tone: "hot" },
    { label: "Condenser coils", detail: "Heat flows into the room.", tone: "warm" },
    { label: "Expansion valve", detail: "The pressure drops and the liquid chills.", tone: "cold" },
    { label: "Evaporator coils", detail: "The refrigerant soaks up heat.", tone: "cold" },
  ],
  links: [{ label: "hot gas" }, { label: "warm liquid" }, { label: "cold mist" }, { label: "cool vapor" }],
});
```

### Resource: `skills://list`

Returns a JSON array of available skill names.

**Example:**
```bash
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "resources/read",
    "params": { "uri": "skills://list" }
  }'
```

### Resource: `skills://{name}`

Retrieve the full text content of a specific skill.

Available skills:
- `master-agent-playbook` — When and how to create interactive HTML widgets
- `svg-diagram-skill` — SVG diagram templates and patterns
- `agent-skills-vol2` — Advanced visualizations, dashboards, simulations

**Example:**
```bash
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "resources/read",
    "params": { "uri": "skills://master-agent-playbook" }
  }'
```

### Prompts

#### `create_widget`
Instructions for creating interactive HTML widgets.

#### `create_svg_diagram`
Instructions for creating inline SVG diagrams with canonical templates.

#### `create_visualization`
Advanced visualization instructions: dashboards, simulations, UI mockups.

## Deployment

### Docker

```bash
# Build image
docker build -t open-intelligent-ui-mcp .

# Run container
docker run -p 3100:3100 open-intelligent-ui-mcp

# With custom port and CORS
docker run \
  -p 3100:3100 \
  -e MCP_PORT=3100 \
  -e ALLOWED_ORIGINS="http://localhost:3000,https://myapp.com" \
  open-intelligent-ui-mcp
```

### Node.js

```bash
# Install globally or locally
npm install -g open-intelligent-ui-mcp

# Run
MCP_PORT=3100 ALLOWED_ORIGINS="*" open-intelligent-ui-mcp

# Or with node
node dist/index.js
```

### Cloud Deployment

The server is a standard Node.js application and can be deployed to:
- **Heroku**: `Procfile: web: node dist/index.js`
- **Railway**: Connect the repo, select Node.js, set `start` script
- **Vercel**: Use serverless function (requires adapter)
- **AWS Lambda**: Package with Node.js runtime
- **Google Cloud Run**: Use Dockerfile

### Cloudflare Workers (claude.ai connector on web, desktop and mobile)

Desktop extensions only run in Claude Desktop and Claude Code. To get the inline views in claude.ai and the Claude mobile apps, host the server at a public URL and add it as a custom connector. `src/worker.ts` is a stateless Workers entry that requires a bearer token and refuses every request until one is configured.

```bash
pnpm build:worker                        # bundles the kit and skills into dist/worker.bundle.js
npx wrangler@4 deploy                    # uses wrangler.jsonc
npx wrangler@4 secret put MCP_TOKEN      # paste a long random token
```

Then in claude.ai, open **Customize > Connectors > Add custom connector**, enter `https://<worker>.workers.dev/mcp`, choose **No sign in**, and add the request header `Authorization: Bearer <token>`. For local testing, put `MCP_TOKEN=...` in `.dev.vars` and run `npx wrangler@4 dev`.

## Development

### Project Structure

```
apps/mcp/
├── package.json         # Standalone package definition
├── tsconfig.json        # TypeScript config
├── .env.example         # Configuration template
├── Dockerfile           # Container definition
├── skills/              # Skill instruction files (copied from source)
├── wrangler.jsonc       # Cloudflare Workers deployment
├── scripts/
│   ├── build-kit.mjs    # Bundles the browser kit into dist/kit.js
│   └── build-worker.mjs # Bundles the Workers entry with the kit and skills inlined
└── src/
    ├── index.ts         # HTTP server entry point (Hono)
    ├── stdio.ts         # stdio transport entry point (Claude Desktop)
    ├── worker.ts        # Cloudflare Workers entry point
    ├── remote.ts        # Bearer-token check and stateless MCP handler for remote hosts
    ├── server.ts        # MCP server construction (shared)
    ├── skills.ts        # Skill file loader
    ├── renderer.ts      # Design system CSS, assembleDocument, MCP Apps views
    └── kit/             # Component kit: specs, layout, formulas, browser components
```

The MCP Apps views inline `dist/kit.js`, so `build`, `dev`, and `test` bundle the kit first; run `pnpm build:kit` after editing `src/kit/browser/` while a server is running.

### Extending Skills

Add new skill files to `skills/` directory as `.txt` files. They'll automatically be available as resources and can be used in prompts.

### Modifying the Design System

Edit `src/renderer.ts` to update:
- `THEME_CSS` — Theme colors and variables
- `SVG_CLASSES_CSS` — Pre-built SVG helper classes
- `FORM_STYLES_CSS` — Form element styling
- `BRIDGE_JS` — Communication bridge between iframe and parent

## License

MIT

## Support

For issues, feature requests, or questions, visit the [OpenGenerativeUI repository](https://github.com/CopilotKit/OpenIntelligentUI).

## Contributing

This is a standalone deployment package. To contribute improvements:

1. Fork the main [OpenGenerativeUI repository](https://github.com/CopilotKit/OpenIntelligentUI)
2. Make changes to `apps/mcp/` (or the source files it's forked from)
3. Submit a pull request

When updating skills or the design system in the main repo, the MCP package should be updated accordingly.
