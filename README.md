# ADam

**Agentic advertising operations — open source, built on [AdCP](https://adcontextprotocol.org).**

ADam is a reporting and analytics agent that connects to your ad server and lets you ask natural-language questions about campaign performance, pacing, deal alerts, and inventory. It is architected as an **MCP server** — the core intelligence layer — with a Next.js web UI and a CLI shipped as reference client implementations.

> Inspired by closed-source tools like [Geoff](https://www.linkedin.com/posts/jeremyvarner_excited-to-introduce-our-newest-team-member-share-7455978439947354112-31rW). Built to be open.

---

## What it does

| Ask ADam | What happens |
|---|---|
| "Give me this morning's briefing" | Aggregates delivery, spend, CTR, and pacing for all active campaigns |
| "Any deals that need attention?" | Surfaces underdelivering, overspending, and governance-violating line items |
| "Chart impressions vs spend this week" | Fetches live data and renders an inline chart |
| "Show me campaign pacing as a bar chart" | Same — ADam picks the right chart type |
| "What's the delivery on line item 12345?" | Pulls daily breakdown with pacing calculation |
| "Show available 300x250 inventory" | Queries your ad server's inventory |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 MCP Clients                      │
│   Web UI (Next.js)    CLI (Node)   Claude Desktop│
└───────────────┬──────────────┬──────────────────┘
                │    MCP       │
        ┌───────▼──────────────▼───────┐
        │       ADam MCP Server         │
        │                               │
        │  Tools:                       │
        │  • get_campaign_status        │
        │  • get_deal_alerts            │
        │  • get_morning_briefing       │
        │  • get_performance_report     │
        │  • discover_inventory         │
        │  • get_plan_audit_logs        │
        │  • generate_visualization     │
        │                               │
        │  Cache: ~/.adam/cache/        │
        │  (30-min background refresh)  │
        └───────────┬───────────────────┘
                    │
        ┌───────────▼───────────────────┐
        │   Data Backend (pick one)     │
        │                               │
        │  GAM mode   │  AdCP mode      │
        │  (SOAP API) │  (HTTP/JSON)    │
        └───────────────────────────────┘
```

The MCP server is the only thing that knows your ad server credentials. The web UI and CLI are stateless — they connect to Claude via the Anthropic API and route tool calls through the MCP server.

---

## Packages

| Package | Description |
|---|---|
| `packages/mcp-server` | Core — AdCP tools over MCP (stdio transport) |
| `packages/web` | Next.js chat UI (reference implementation) |
| `packages/cli` | Terminal REPL (reference implementation) |

---

## Quickstart

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- An Anthropic API key
- A Google Ad Manager account **or** an AdCP-compliant server

### 1. Install

```bash
git clone https://github.com/schwim23/ADam.git
cd ADam
pnpm install
pnpm build
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

**GAM mode** (connect to Google Ad Manager directly):
```env
GAM_NETWORK_CODE=123456789
GAM_CREDENTIALS_JSON={"type":"service_account","client_email":"...","private_key":"..."}
ANTHROPIC_API_KEY=sk-ant-...
```

**AdCP mode** (connect to any AdCP-compliant server):
```env
ADCP_BASE_URL=https://your-adcp-server.example.com
ADCP_API_KEY=your_api_key
ANTHROPIC_API_KEY=sk-ant-...
```

ADam auto-detects which mode to use: if `GAM_NETWORK_CODE` is set it uses GAM, otherwise AdCP.

### 3. Run

**Web UI:**
```bash
cd packages/web
pnpm dev
# Open http://localhost:3000
```

**CLI:**
```bash
cd packages/cli
pnpm start
```

**MCP server standalone** (for Claude Desktop or any MCP client):
```bash
cd packages/mcp-server
pnpm start
```

---

## Setting up GAM credentials

1. **Create a service account** in [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts. Download the JSON key.
2. **Grant access in GAM**: Admin → Global settings → API access → Service account access. Add the service account email.
3. Set `GAM_NETWORK_CODE` (found in GAM Admin → Global settings) and paste the JSON key contents into `GAM_CREDENTIALS_JSON`.

> **Note:** GAM report jobs take 30 seconds to 2 minutes to run. ADam caches results automatically and refreshes them every 30 minutes in the background. The first request after a cold start will be slow; subsequent requests return instantly from cache.

---

## Claude Desktop integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "adam": {
      "command": "node",
      "args": ["/path/to/ADam/packages/mcp-server/dist/index.js"],
      "env": {
        "GAM_NETWORK_CODE": "123456789",
        "GAM_CREDENTIALS_JSON": "{...}"
      }
    }
  }
}
```

Once added, all 7 ADam tools are available directly in Claude Desktop.

---

## MCP tools

| Tool | Description |
|---|---|
| `get_campaign_status` | List campaigns with delivery status and 7-day pacing |
| `get_deal_alerts` | Surface underdelivery, overspend, and governance issues |
| `get_morning_briefing` | Daily digest: impressions, CTR, spend, pacing summary |
| `get_performance_report` | Daily breakdown for a specific campaign over a date range |
| `discover_inventory` | Query available ad units / inventory products |
| `get_plan_audit_logs` | Retrieve the decision audit trail (AdCP mode only) |
| `generate_visualization` | Turn any data result into an inline chart (web UI only) |

---

## Visualizations

The web UI renders charts inline when you ask for them. ADam automatically chooses the right chart type, or you can specify:

- **Line** — trends over time (impressions, spend, CTR)
- **Area** — cumulative delivery
- **Bar** — campaign comparisons
- **Pie** — budget or format mix

Charts are generated by calling `generate_visualization` after a data tool, using [Recharts](https://recharts.org) for rendering.

---

## Data backend

ADam uses a `DataClient` interface. Both backends implement the same interface, so all tools work identically regardless of which you're connected to.

| | GAM mode | AdCP mode |
|---|---|---|
| Line items | `LineItemService` (SOAP) | `/v1/media-buys` |
| Delivery | `ReportService` (SOAP) | `/v1/media-buys/{id}/delivery` |
| Inventory | `InventoryService` (SOAP) | `/v1/products` |
| Governance | Creative approval status | `/v1/governance/check` |
| Audit logs | Not available (GAM limitation) | `/v1/audit-logs` |

To add a new backend (DV360, TTD, Xandr, etc.), implement the `DataClient` interface in `packages/mcp-server/src/` and add it to the factory in `index.ts`.

---

## Development

```bash
pnpm install       # install all workspaces
pnpm build         # build all packages
pnpm typecheck     # typecheck all packages
pnpm dev           # watch mode (all packages in parallel)
```

The project is a [pnpm workspace](https://pnpm.io/workspaces) monorepo with TypeScript throughout.

---

## Relationship to AdCP

ADam is a **buyer-side reporting agent** built on the [Ad Context Protocol](https://github.com/adcontextprotocol/adcp). It consumes AdCP endpoints for read-only analytics — no spend-committing operations, no request signing required.

AdCP is open source (Apache 2.0) and governed by [AgenticAdvertising.Org](https://adcontextprotocol.org). ADam aims to be a community reference implementation for buyer-side analytics on AdCP.

---

## License

Apache 2.0 — same as AdCP.
