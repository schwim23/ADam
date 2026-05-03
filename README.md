# ADam

**Agentic publisher analytics — open source, built on [AdCP](https://adcontextprotocol.org).**

ADam is a yield analytics agent that connects to your ad server and lets you ask natural-language questions about network performance, eCPM trends, pacing, SSP mix, and inventory. It is architected as an **MCP server** — the core intelligence layer — with a Next.js web UI and a CLI shipped as reference client implementations.

> Inspired by closed-source tools like [Geoff](https://www.linkedin.com/posts/jeremyvarner_excited-to-introduce-our-newest-team-member-share-7455978439947354112-31rW). Built to be open.

---

## What it does

| Ask ADam | What happens |
|---|---|
| "Give me this morning's briefing" | Network totals: impressions, revenue, eCPM, fill rate + SSP breakdown |
| "Which ad units dropped eCPM this week?" | Detects yield anomalies by ad unit with inferred causes |
| "Compare revenue WoW by SSP" | Side-by-side comparison across any two date ranges |
| "Forecast available impressions for homepage" | Projects inventory from 30-day delivery history |
| "Show pacing alerts" | Surfaces line items that are under- or over-pacing against their goals |
| "Chart impressions vs eCPM this week" | Fetches live data and renders an inline chart |

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
        │  • get_delivery_summary       │
        │  • get_pacing_alerts          │
        │  • get_morning_briefing       │
        │  • get_yield_anomalies        │
        │  • get_inventory_forecast     │
        │  • compare_periods            │
        │  • get_plan_audit_logs        │
        │  • generate_visualization     │
        │                               │
        │  Cache: stale-while-revalidate│
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
| `packages/mcp-server` | Core — publisher analytics tools over MCP (stdio transport) |
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
ANTHROPIC_API_KEY=sk-ant-...
```
See [Setting up GAM credentials](#setting-up-gam-credentials) — OAuth2/ADC is recommended and requires no key file.

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

ADam supports two auth methods. **Option A (OAuth2/ADC) is recommended** — no key file or secret management needed.

### Option A — OAuth2 via Application Default Credentials (recommended)

1. **Authenticate** (one-time setup):
   ```bash
   gcloud auth application-default login \
     --scopes=https://www.googleapis.com/auth/dfp,https://www.googleapis.com/auth/cloud-platform
   ```
   Sign in with the Google account that has access to your GAM network.

2. **Grant GAM access**: In GAM → Admin → Global settings → API access, add the email you authenticated with.

3. Set only `GAM_NETWORK_CODE` in `.env` — no credentials env var needed.

### Option B — Service account JSON key

If you can't use ADC (CI/CD, production deployment without a logged-in user):

1. Create a service account in Google Cloud Console → IAM & Admin → Service Accounts
2. Download the JSON key
3. Add the service account email to GAM Admin → Global settings → API access
4. Set `GAM_CREDENTIALS_JSON` in `.env` with the full JSON key contents (single line)

> **Note on performance:** GAM report jobs take 30 seconds to 2 minutes to run. ADam caches results automatically and refreshes them every 30 minutes in the background. The first request after a cold start will be slow; subsequent requests return instantly from cache.

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
        "GAM_NETWORK_CODE": "123456789"
      }
    }
  }
}
```

If using a service account key instead of ADC, add `"GAM_CREDENTIALS_JSON": "{...}"` to the `env` block.

Once added, all 8 ADam tools are available directly in Claude Desktop.

---

## MCP tools

| Tool | Description |
|---|---|
| `get_delivery_summary` | Flexible delivery report: impressions, clicks, revenue, eCPM, fill rate across any dimensions (date, ad unit, SSP, device, country, etc.) |
| `get_pacing_alerts` | Surface line items that are under- or over-pacing against their delivery goals |
| `get_morning_briefing` | Daily digest: network totals, top ad units by revenue, SSP breakdown |
| `get_yield_anomalies` | Detect eCPM or fill rate drops vs. the prior period, with inferred causes |
| `get_inventory_forecast` | Project available impressions for an ad unit over a future date range |
| `compare_periods` | Side-by-side metric comparison across any two date ranges (WoW, MoM, YoY, custom) |
| `get_plan_audit_logs` | Retrieve the decision audit trail (AdCP mode only) |
| `generate_visualization` | Turn any data result into an inline chart (web UI only) |

---

## Visualizations

The web UI renders charts inline when you ask for them. ADam automatically chooses the right chart type, or you can specify:

- **Line** — trends over time (impressions, eCPM, CTR)
- **Area** — cumulative delivery
- **Bar** — ad unit or SSP comparisons
- **Pie** — revenue mix by SSP or format

Charts are generated by calling `generate_visualization` after a data tool, using [Recharts](https://recharts.org) for rendering.

---

## Data backend

ADam uses a `DataClient` interface. Both backends implement the same interface, so all tools work identically regardless of which you're connected to.

| | GAM mode | AdCP mode |
|---|---|---|
| Delivery reporting | `ReportService` (SOAP) with flexible dimensions | `/v1/media-buys/{id}/delivery` |
| Line items | `LineItemService` (SOAP) | `/v1/media-buys` |
| Inventory | `InventoryService` (SOAP) | `/v1/products` |
| Governance | Creative approval status | `/v1/governance/check` |
| Audit logs | Not available (GAM limitation) | `/v1/audit-logs` |

To add a new backend (DV360, Xandr, etc.), implement the `DataClient` interface in `packages/mcp-server/src/` and add it to the factory in `index.ts`.

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

ADam is a **publisher-side analytics agent** built on the [Ad Context Protocol](https://github.com/adcontextprotocol/adcp). It connects to your ad server to surface yield analytics — eCPM trends, fill rates, pacing, SSP mix — using natural language.

AdCP is open source (Apache 2.0) and governed by [AgenticAdvertising.Org](https://adcontextprotocol.org). ADam aims to be a community reference implementation for publisher-side analytics on AdCP.

---

## License

Apache 2.0 — same as AdCP.
