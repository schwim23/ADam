import { z } from 'zod';
import type { DataClient } from '../data-client.js';

export const campaignMonitorSchema = z.object({
  status: z.enum(['active', 'paused', 'completed', 'pending']).optional()
    .describe('Filter by campaign status (default: active)'),
  publisherId: z.string().optional()
    .describe('Filter by publisher/SSP ID'),
});

export const campaignMonitorTool = {
  name: 'get_campaign_status',
  description: 'List active campaigns and their current delivery status, spend, and pacing across all AdCP-connected publishers.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: { type: 'string', enum: ['active', 'paused', 'completed', 'pending'], description: 'Filter by status (default: active)' },
      publisherId: { type: 'string', description: 'Filter by publisher ID' },
    },
  },
};

export async function handleGetCampaignStatus(
  client: DataClient,
  args: z.infer<typeof campaignMonitorSchema>
) {
  const mediaBuys = await client.listMediaBuys({
    status: args.status ?? 'active',
    publisherId: args.publisherId,
  });

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const withDelivery = await Promise.all(
    mediaBuys.map(async (mb) => {
      const reports = await client.getMediaBuyDelivery(mb.id, { start: weekAgo, end: today });
      const latest = reports[reports.length - 1];
      return { ...mb, latestDelivery: latest ?? null };
    })
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ campaigns: withDelivery, fetchedAt: new Date().toISOString() }, null, 2),
      },
    ],
  };
}
