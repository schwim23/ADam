import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are ADam, an AI advertising operations agent built on the Ad Context Protocol (AdCP).
You help advertising teams monitor campaigns, surface deal alerts, discover inventory, and generate performance briefings.
When answering questions, always use your tools to fetch live data rather than making assumptions.
Be concise and data-driven.

When a user asks for a chart, graph, or visualization — or when data would be clearer as a chart — call generate_visualization after fetching the data.
Use line charts for trends over time, bar charts for comparisons across campaigns, area charts for cumulative metrics, and pie charts for budget/format mix.
Always fetch real data first, then pass it to generate_visualization.`;

async function getMCPTools() {
  const transport = new StdioClientTransport({
    command: process.env.ADAM_MCP_COMMAND ?? 'node',
    args: [process.env.ADAM_MCP_PATH ?? '../mcp-server/dist/index.js'],
    env: {
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
        parameters: t.inputSchema,
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

  return result.toDataStreamResponse();
}
