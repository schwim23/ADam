#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools, handleToolCall } from './tools/index.js';
import type { DataClient } from './data-client.js';

async function createClient(): Promise<DataClient> {
  if (process.env.GAM_NETWORK_CODE) {
    const { createGAMClient } = await import('./gam/client.js');
    const { GAMScheduler } = await import('./cache/scheduler.js');
    const gamClient = createGAMClient();
    new GAMScheduler(gamClient).start();
    return gamClient;
  }
  const { createAdCPClient } = await import('./adcp/client.js');
  return createAdCPClient();
}

const client = await createClient();

const server = new Server(
  { name: 'adam-adcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    return await handleToolCall(client, name, args as Record<string, unknown>);
  } catch (err) {
    const correlationId = crypto.randomUUID();
    const message = err instanceof Error ? err.message : String(err);
    const code = message.startsWith('AdCP 401') ? 'UNAUTHORIZED'
      : message.startsWith('AdCP 403') ? 'FORBIDDEN'
      : message.startsWith('AdCP 404') ? 'NOT_FOUND'
      : message.startsWith('AdCP 429') ? 'RATE_LIMITED'
      : 'INTERNAL_ERROR';
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          errors: [{ code, message, recovery: code === 'RATE_LIMITED' ? 'Retry after backoff' : 'Check server logs' }],
          context: { correlation_id: correlationId },
        }),
      }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
