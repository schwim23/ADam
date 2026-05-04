# ADam

**The GAM-backed deployment of [`publisher-analytics-agent`](https://github.com/schwim23/publisher-analytics-agent) — built on [AdCP](https://adcontextprotocol.org).**

ADam is a yield-analytics agent for publishers. Ask it natural-language questions about network performance, eCPM trends, pacing, SSP mix, and inventory; it fetches live data through MCP tools and explains it inline. The analytics surface (tools, schemas, AdCP server, caching) lives upstream in [`publisher-analytics-agent`](https://github.com/schwim23/publisher-analytics-agent); this repo contributes the **GAM SOAP backend** plus a Next.js web UI and a CLI as reference clients.

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
        │   Tools · AdCP server · cache │
        └───────────┬───────────────────┘
                    │ DataClient interface
        ┌───────────▼───────────────────┐
        │   Backend  (pick one)         │
        │   • GAM SOAP (this repo)      │
        │   • AdCP HTTP (built-in)      │
        │   • Stub (built-in, demo)     │
        │   • Your own DataClient impl  │
        └───────────────────────────────┘
```

Backends and clients are independent — any client can talk to any backend. Pick a row from each section below and combine them.

---

## Quickstart

**Prerequisites:** Node.js 20+, [pnpm](https://pnpm.io/) (`npm install -g pnpm`), and (for the web UI / CLI) an Anthropic API key.

```bash
git clone https://github.com/schwim23/ADam.git
cd ADam
pnpm install
pnpm build
cp .env.example .env
```

Now pick a **backend** (where ADam reads data from) and a **client** (how you talk to ADam):

| Backend | Setup time | Use it for |
|---|---|---|
| [**Stub**](#backend-1-stub-zero-credentials-demo) | 30 sec | Demos, dev without GAM creds |
| [**GAM**](#backend-2-gam-google-ad-manager-production) | ~5 min | Production publisher analytics |
| [**AdCP server**](#backend-3-adcp-conformant-server) | ~1 min | Any AdCP-spec'd ad server |
| [**Custom**](#backend-4-your-own-ad-server) | varies | DV360, Xandr, FreeWheel, SSP APIs, etc. |

| Client | Use it for |
|---|---|
| [**Web UI**](#client-1-web-ui) | Friendly chat in a browser, with inline charts |
| [**CLI**](#client-2-cli) | Terminal REPL — fastest for ops/script workflows |
| [**Claude Desktop**](#client-3-claude-desktop) | Use ADam through your existing Claude subscription |

---

## Backend 1: Stub (zero credentials, demo)

The upstream package ships an in-memory `DataClient` that returns deterministic synthetic data. No GAM, no AdCP server, no API keys needed. Useful for screenshots, demos, and dev work on the UI.

```bash
# Build the upstream package's stub once:
cd ../
git clone https://github.com/schwim23/publisher-analytics-agent.git
cd publisher-analytics-agent
pnpm install
pnpm build

# Point ADam's web UI / CLI at the stub via .env in the ADam repo:
cd ../ADam
echo "ADAM_MCP_PATH=$(realpath ../publisher-analytics-agent)/dist/examples/stub-backend/index.js" >> .env
```

Now any client (web, CLI, Claude Desktop) will spawn the stub instead of ADam's GAM backend. Synthetic data covers four ad units (`Homepage_Top`, `Homepage_Sidebar`, `Article_Inline`, `Footer_Banner`) and four SSPs (`google_adx`, `pubmatic`, `magnite`, `index`). Numbers are pseudo-random but bounded to plausible ranges (impressions 1k–51k, eCPM $1–9, fill rate 60–95%).

**To switch back** to the real GAM backend, comment out the `ADAM_MCP_PATH` line in `.env` and restart the client.

---

## Backend 2: GAM (Google Ad Manager, production)

This is what ADam was built for. Edit `.env`:

```env
GAM_NETWORK_CODE=123456789       # GAM Admin → Global settings → Network code
ANTHROPIC_API_KEY=sk-ant-...     # only needed for web UI / CLI clients
```

### Authentication — pick one

**Option A — Application Default Credentials (recommended).** No key file or secret management.

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/dfp,https://www.googleapis.com/auth/cloud-platform
```

Then in **GAM → Admin → Global settings → API access**, add the email you authenticated with. That's it — no `GAM_CREDENTIALS_*` env var needed.

**Option B — Service account JSON key.** For CI/CD or production deployments without an interactive user.

1. Create a service account in **Google Cloud Console → IAM & Admin → Service Accounts**, download the JSON key.
2. Add the service account email to **GAM Admin → Global settings → API access**.
3. Set `GAM_CREDENTIALS_JSON` in `.env` to the JSON key contents on a single line.

> **Performance note.** GAM report jobs take 30s–2min to run. The upstream package warms a disk cache on startup and refreshes it every 30 minutes in the background. The first request after a cold start is slow; subsequent requests return instantly from cache.

---

## Backend 3: AdCP-conformant server

If your ad server already speaks the AdCP HTTP/JSON spec (`/v1/media-buys`, `/v1/products`, `/v1/audit-logs`, etc.), the upstream package ships an `AdCPBuyerClient` that implements `DataClient` against it. You'd write a small shim that swaps `createGAMClient()` for `new AdCPBuyerClient({...})` in `packages/mcp-server/src/index.ts` (or fork that file into your own package).

```ts
import { createPublisherAnalyticsServer, AdCPBuyerClient } from 'publisher-analytics-agent';

const dataClient = new AdCPBuyerClient({
  baseUrl: process.env.ADCP_BASE_URL!,   // e.g. https://adcp.your-vendor.com
  apiKey: process.env.ADCP_API_KEY!,
});

await createPublisherAnalyticsServer({
  transport: 'stdio',
  dataClient,
  agent: { id: 'my-pub', name: 'My Publisher Analytics', version: '0.1.0' },
});
```

To exercise this without provisioning your own server, the [Prebid `salesagent`](https://github.com/adcontextprotocol/salesagent) repo ships a Dockerized mock AdCP server you can run locally.

---

## Backend 4: Your own ad server

For DV360, Xandr, FreeWheel, Magnite/PubMatic/Index reporting APIs, or anything custom: implement the `DataClient` interface from [`publisher-analytics-agent`](https://github.com/schwim23/publisher-analytics-agent/blob/main/src/data-client.ts):

```ts
interface DataClient {
  getDeliveryReport(query): Promise<DeliveryRow[]>;
  listMediaBuys(filters?): Promise<MediaBuy[]>;
  getMediaBuyDelivery(id, range?): Promise<DeliveryReport[]>;
  checkGovernance(id): Promise<GovernanceResult>;
  getProducts(params): Promise<InventoryProduct[]>;
  getPlanAuditLogs(params): Promise<AuditLogEntry[]>;
  getAllDeliveryReports(range?): Promise<{ mediaBuy; reports }[]>;
  refreshDeliveryCache?(range): Promise<void>;   // optional
}
```

ADam's `packages/mcp-server/src/gam/client.ts` is a worked example. Write your implementation, mount it via `createPublisherAnalyticsServer({ dataClient: new YourClient(...) })`, and you get all eight analytic tools for free.

---

## Client 1: Web UI

A Next.js chat interface with inline charts. Uses the Anthropic API to drive Claude through the tools.

```bash
# In .env:
#   ANTHROPIC_API_KEY=sk-ant-...
#   GAM_NETWORK_CODE=123456789   (or ADAM_MCP_PATH=... to point at the stub)

cd packages/web
pnpm dev
# Open http://localhost:3000
```

The UI streams responses, renders Markdown tables, and shows inline charts whenever Claude calls `generate_visualization`.

### Branding

The UI defaults to a generic "Publisher Analytics" brand. To re-brand for ADam (or any deployment), set in `.env`:

```env
NEXT_PUBLIC_AGENT_NAME=ADam
NEXT_PUBLIC_AGENT_TAGLINE=Yield analytics on AdCP
NEXT_PUBLIC_AGENT_INITIAL=A
```

### Auth

The `/api/chat` route is open by default (fine for local dev). For deployment, set `ADAM_WEB_API_KEY` in `.env`; clients must then send `Authorization: Bearer <token>`.

---

## Client 2: CLI

A terminal REPL — fastest path for ops workflows or scripted use.

```bash
# In .env:
#   ANTHROPIC_API_KEY=sk-ant-...
#   GAM_NETWORK_CODE=123456789   (or ADAM_MCP_PATH=... for the stub)

cd packages/cli
pnpm start
```

Type a question at the prompt, press Enter. Tool calls and responses stream to your terminal. Press `Ctrl+C` to exit.

---

## Client 3: Claude Desktop

Use ADam directly through your Claude subscription — no Anthropic API key needed (Claude Desktop handles LLM auth).

Add to your `claude_desktop_config.json`:

**For GAM:**
```json
{
  "mcpServers": {
    "adam": {
      "command": "node",
      "args": ["/absolute/path/to/ADam/packages/mcp-server/dist/index.js"],
      "env": {
        "GAM_NETWORK_CODE": "123456789"
      }
    }
  }
}
```

If using Option B (service account), add `"GAM_CREDENTIALS_JSON": "{...}"` to the `env` block (escape the JSON contents).

**For the stub** (no credentials):
```json
{
  "mcpServers": {
    "adam-stub": {
      "command": "node",
      "args": ["/absolute/path/to/publisher-analytics-agent/dist/examples/stub-backend/index.js"]
    }
  }
}
```

**For an AdCP-conformant server**: same shape as GAM, but `args` points at your AdCPBuyerClient-shimmed entry script and `env` includes `ADCP_BASE_URL` and `ADCP_API_KEY`.

After editing the config, restart Claude Desktop. All eight ADam tools (delivery, pacing, briefing, anomalies, forecast, periods, audit, charts) appear inline.

---

## AdCP HTTP transport

In addition to stdio MCP, ADam can run as a **network-callable AdCP agent** so other AdCP agents (or HTTP clients) can call into it.

```bash
ADAM_TRANSPORT=http \
  PORT=7000 \
  ADAM_BEARER=your-secret-token \
  ADAM_ADAGENTS_PATH=./config/adagents.json \
  ADAM_BRAND_PATH=./config/brand.json \
  pnpm --filter @adam/mcp-server start
```

This serves:

| Endpoint | What it does |
|---|---|
| `POST /mcp/` | MCP-over-HTTP. Bearer token required in `x-adcp-auth` header. |
| `GET /.well-known/adagents.json` | Your publisher's authorized-agents manifest. |
| `GET /.well-known/brand.json` | Your brand's named agents (incl. the `analytics_agent` field). |
| `GET /healthz` | Health check, no auth. |

Templates: `config/adagents.example.json`, `config/brand.example.json`.

> Run TLS termination in front of this in production. The bearer-token check protects `/mcp/` but doesn't encrypt traffic.

---

## MCP tools

| Tool | Description |
|---|---|
| `get_delivery_summary` | Multi-dimensional delivery report (date / ad unit / SSP / device / country / order / line item). |
| `get_pacing_alerts` | Line items pacing under- or over- their goals. |
| `get_morning_briefing` | Network revenue, eCPM, fill rate, top units, SSP breakdown. |
| `get_yield_anomalies` | eCPM and fill drops vs. baseline period, with inferred causes. |
| `get_inventory_forecast` | Project available impressions for an ad unit over a future range. |
| `compare_periods` | WoW / MoM / YoY / custom-range comparisons. |
| `get_plan_audit_logs` | AdCP plan and decision audit trail (returns empty in GAM mode — GAM doesn't expose this). |
| `generate_visualization` | Turn a tool result into a chart spec the UI renders inline. |
| `get_adcp_capabilities` | AdCP capability envelope for this agent. |

---

## Visualizations

The web UI renders charts inline whenever Claude calls `generate_visualization`. Supported chart types:

- **Line** — trends over time (impressions, eCPM, CTR)
- **Area** — cumulative delivery
- **Bar** — ad unit or SSP comparisons
- **Pie** — revenue mix by SSP or format

Powered by [Recharts](https://recharts.org).

---

## Development

```bash
pnpm install     # install all workspaces
pnpm build       # build all packages
pnpm typecheck   # typecheck all packages
pnpm dev         # watch mode (all packages in parallel)
```

[pnpm workspace](https://pnpm.io/workspaces) monorepo with TypeScript throughout.

---

## Relationship to AdCP

[AdCP](https://adcontextprotocol.org) is the open standard governing this work. The split between this repo and `publisher-analytics-agent` mirrors how AdCP itself is structured: the spec lives in [`adcontextprotocol/adcp`](https://github.com/adcontextprotocol/adcp), the SDK in [`adcontextprotocol/adcp-client`](https://github.com/adcontextprotocol/adcp-client), and individual agent implementations are separate.

- [`publisher-analytics-agent`](https://github.com/schwim23/publisher-analytics-agent) is the **reference implementation** of the publisher-side analytics agent type, intended as a template any ad-server vendor can deploy.
- ADam is the **GAM-backed deployment** of that reference, plus a Next.js UI and CLI.

A forthcoming RFC at `adcontextprotocol/adcp` will propose an `analytics` protocol with a `publisher-analytics` specialism. Until that lands, the agent declares its surface via the `x-publisher-analytics` vendor extension on `getAdcpCapabilities`.

---

## License

Apache 2.0 — same as AdCP.
