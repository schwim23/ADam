import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, jsonSchema } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are ADam, an open-source publisher analytics agent built on Google Ad Manager and the Ad Context Protocol (AdCP).
You help publishers and their ops teams understand network performance, diagnose yield issues, track pacing, and forecast inventory.
You work across all campaigns regardless of how they were booked — direct, programmatic, or via AdCP.
When answering questions, always use your tools to fetch live data. Never make up numbers.
Be concise and data-driven. When data would be clearer as a chart, call generate_visualization after fetching it.
For SSP analysis use the "ssp" dimension in get_delivery_summary or get_yield_anomalies.`;

async function getMCPTools() {
  const transport = new StdioClientTransport({
    command: process.env.ADAM_MCP_COMMAND ?? 'node',
    args: [process.env.ADAM_MCP_PATH ?? '../mcp-server/dist/index.js'],
    env: {
      GAM_NETWORK_CODE: process.env.GAM_NETWORK_CODE ?? '',
      GAM_CREDENTIALS_JSON: process.env.GAM_CREDENTIALS_JSON ?? '',
      ADCP_BASE_URL: process.env.ADCP_BASE_URL ?? '',
      ADCP_API_KEY: process.env.ADCP_API_KEY ?? '',
    },
  });

  const mcpClient = new Client({ name: 'adam-web', version: '0.1.0' }, { capabilities: {} });
  await mcpClient.connect(transport);

  const { tools } = await mcpClient.listTools();

  return { mcpClient, tools };
}

function unauthorized() {
  return new Response(
    JSON.stringify({ errors: [{ code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header', recovery: 'Provide a valid Bearer token via the ADAM_WEB_API_KEY env var' }], context: { correlation_id: crypto.randomUUID() } }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}

export async function POST(req: Request) {
  const expectedKey = process.env.ADAM_WEB_API_KEY;
  if (expectedKey) {
    const auth = req.headers.get('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== expectedKey) return unauthorized();
  }

  const { messages } = await req.json();

  const { mcpClient, tools: mcpTools } = await getMCPTools();

  const aiTools = Object.fromEntries(
    mcpTools.map((t) => [
      t.name,
      {
        description: t.description,
        parameters: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
        execute: async (args: Record<string, unknown>) => {
          const result = await mcpClient.callTool({ name: t.name, arguments: args });
          return result.content;
        },
      },
    ])
  );

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM_PROMPT,
    messages,
    tools: aiTools as Parameters<typeof streamText>[0]['tools'],
    maxSteps: 10,
    onFinish: () => mcpClient.close(),
  });

  return result.toDataStreamResponse({
    getErrorMessage: (error) => {
      console.error('[adam] stream error:', error);
      return error instanceof Error ? error.message : 'Unknown error';
    },
  });
}
