# ADam

**The GAM-backed deployment of [`publisher-analytics-agent`](https://github.com/schwim23/publisher-analytics-agent) — built on [AdCP](https://adcontextprotocol.org).**

ADam is a yield analytics agent that connects to Google Ad Manager and lets you ask natural-language questions about network performance, eCPM trends, pacing, SSP mix, and inventory. The analytics surface (tools, schemas, AdCP server) lives upstream in the generic [`publisher-analytics-agent`](https://github.com/schwim23/publisher-analytics-agent) package; this repo contributes the **GAM SOAP backend** and ships a Next.js web UI and CLI as reference clients.

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
                │    MCP (stdio or HTTP)
        ┌───────▼──────────────▼───────┐
        │   publisher-analytics-agent   │  ← upstream package
        │                               │
        │  Tools, AdCP server, caching, │
        │  capabilities, .well-known/*  │
        └───────────┬───────────────────┘
                    │ DataClient interface
        ┌───────────▼───────────────────┐
        │   ADam GAM Backend            │  ← this repo
        │   (SOAP API)                  │
        └───────────────────────────────┘
```

The MCP server is the only thing that knows your ad server credentials. The web UI and CLI are stateless — they connect to Claude via the Anthropic API and route tool calls through the MCP server.

---

## Packages

| Package | Description |
|---|---|
| `packages/mcp-server` | GAM SOAP backend + a thin shim that mounts `publisher-analytics-agent` |
| `packages/web` | Next.js chat UI (reference implementation) |
| `packages/cli` | Terminal REPL (reference implementation) |

---

## Quickstart

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- An Anthropic API key (only required for the web UI and CLI; not Claude Desktop)
- A Google Ad Manager account

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

```env
GAM_NETWORK_CODE=123456789
ANTHROPIC_API_KEY=sk-ant-...
```
See [Setting up GAM credentials](#setting-up-gam-credentials) — OAuth2/ADC is recommended and requires no key file.

> Need a non-GAM backend? `publisher-analytics-agent` accepts any [`DataClient`](https://github.com/schwim23/publisher-analytics-agent) implementation — fork ADam's `packages/mcp-server/src/index.ts` and swap `createGAMClient()` for your own. The upstream package also ships an `AdCPBuyerClient` you can use directly to read from any AdCP-conformant server.

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

The analytics surface (tools, schemas, AdCP server, caching) lives in [`publisher-analytics-agent`](https://github.com/schwim23/publisher-analytics-agent). It exposes a `DataClient` interface; ADam implements it on top of GAM's SOAP API.

| | What ADam provides |
|---|---|
| Delivery reporting | `ReportService` (SOAP) with flexible dimensions |
| Line items | `LineItemService` (SOAP) |
| Inventory | `InventoryService` (SOAP) |
| Governance | Creative approval status |
| Audit logs | Not available (GAM limitation) |

To add a backend for another ad server (DV360, Xandr, etc.), implement `DataClient` from `publisher-analytics-agent` in your own deployment package — ADam is a worked example. AdCP-spec'd servers can be reached out-of-the-box via `AdCPBuyerClient` from the same package.

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

[AdCP](https://adcontextprotocol.org) is the open standard governing this work. The split between this repo and `publisher-analytics-agent` mirrors how AdCP itself is structured: the spec lives in [`adcontextprotocol/adcp`](https://github.com/adcontextprotocol/adcp), the SDK in [`adcontextprotocol/adcp-client`](https://github.com/adcontextprotocol/adcp-client), and individual agent implementations are separate.

- [`publisher-analytics-agent`](https://github.com/schwim23/publisher-analytics-agent) is the **reference implementation** of the publisher-side analytics agent type, intended as a template any ad-server vendor can deploy.
- ADam is the **GAM-backed deployment** of that reference, plus a Next.js UI and CLI.

A forthcoming RFC at `adcontextprotocol/adcp` will propose an `analytics` protocol with a `publisher-analytics` specialism. Until that lands, the agent declares its surface via the `x-publisher-analytics` vendor extension on `getAdcpCapabilities`.

## AdCP HTTP transport

In addition to stdio MCP (Claude Desktop), ADam can run as a network-callable AdCP agent:

```bash
ADAM_TRANSPORT=http \
  PORT=7000 \
  ADAM_BEARER=your-secret-token \
  ADAM_ADAGENTS_PATH=./config/adagents.json \
  ADAM_BRAND_PATH=./config/brand.json \
  pnpm --filter @adam/mcp-server start
```

This serves:

- `POST /mcp/` — MCP-over-HTTP. Bearer token required in `x-adcp-auth` header.
- `GET /.well-known/adagents.json` — your publisher's authorized-agents manifest.
- `GET /.well-known/brand.json` — your brand's named agents (including the `analytics_agent` field).
- `GET /healthz` — health check.

See `config/adagents.example.json` and `config/brand.example.json` for templates.

---

## License

Apache 2.0 — same as AdCP.
