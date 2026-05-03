#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPublisherAnalyticsServer, CacheScheduler } from 'publisher-analytics-agent';
import { createGAMClient } from './gam/client.js';

const dataClient = createGAMClient();
new CacheScheduler(dataClient).start();

const transport = (process.env.ADAM_TRANSPORT ?? 'stdio') as 'stdio' | 'http';
const agent = { id: 'adam', name: 'ADam (GAM-backed publisher analytics)', version: '0.1.0' };

if (transport === 'http') {
  const port = process.env.PORT ? Number(process.env.PORT) : 7000;
  await createPublisherAnalyticsServer({
    transport: 'http',
    dataClient,
    agent,
    port,
    host: process.env.HOST,
    bearerToken: process.env.ADAM_BEARER,
    wellKnownAdagents: readJsonOrUndefined(process.env.ADAM_ADAGENTS_PATH),
    wellKnownBrand: readJsonOrUndefined(process.env.ADAM_BRAND_PATH),
  });
} else {
  await createPublisherAnalyticsServer({ transport: 'stdio', dataClient, agent });
}

function readJsonOrUndefined(path?: string): unknown {
  if (!path) return undefined;
  return JSON.parse(readFileSync(resolve(path), 'utf-8'));
}
