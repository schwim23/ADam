#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const SYSTEM_PROMPT = `You are ADam, an AI advertising operations agent built on the Ad Context Protocol (AdCP).
You help advertising teams monitor campaigns, surface deal alerts, discover inventory, and generate performance briefings.
When answering questions, always use your tools to fetch live data rather than making assumptions.
Be concise and data-driven.`;

async function main() {
  const mcpServerPath = process.env.ADAM_MCP_PATH
    ?? new URL('../../mcp-server/dist/index.js', import.meta.url).pathname;

  const transport = new StdioClientTransport({
    command: 'node',
    args: [mcpServerPath],
    env: {
      ADCP_BASE_URL: process.env.ADCP_BASE_URL ?? '',
      ADCP_API_KEY: process.env.ADCP_API_KEY ?? '',
    },
  });

  const mcpClient = new Client({ name: 'adam-cli', version: '0.1.0' }, { capabilities: {} });
  await mcpClient.connect(transport);

  const { tools: mcpTools } = await mcpClient.listTools();

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const tools: Anthropic.Tool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }));

  const messages: Anthropic.MessageParam[] = [];

  const rl = readline.createInterface({ input, output });

  process.stdout.write('\nADam · Agentic Ad Operations (AdCP)\nType your question or "exit" to quit.\n\n');

  async function runTurn(userMessage: string) {
    messages.push({ role: 'user', content: userMessage });

    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
      if (textBlocks.length > 0) {
        process.stdout.write(`\nADam: ${textBlocks.map((b) => b.text).join('\n')}\n\n`);
      }

      if (response.stop_reason !== 'tool_use') break;

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        process.stdout.write(`  [calling ${toolUse.name}...]\n`);
        const result = await mcpClient.callTool({
          name: toolUse.name,
          arguments: toolUse.input as Record<string, unknown>,
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result.content),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  while (true) {
    const userInput = await rl.question('You: ');
    if (userInput.toLowerCase() === 'exit') break;
    if (!userInput.trim()) continue;
    await runTurn(userInput);
  }

  rl.close();
  await mcpClient.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
