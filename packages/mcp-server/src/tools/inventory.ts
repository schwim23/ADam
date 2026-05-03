import { z } from 'zod';
import type { DataClient } from '../data-client.js';

export const inventorySchema = z.object({
  publisherId: z.string().optional().describe('Filter by publisher/SSP ID'),
  format: z.string().optional().describe('Ad format (e.g. display, video, native, CTV)'),
  brief: z.string().optional().describe('Natural language brief to match inventory against'),
});

export const inventoryTool = {
  name: 'discover_inventory',
  description: 'Discover available ad inventory across AdCP-connected publishers. Optionally filter by publisher, format, or describe your campaign brief to find matching products.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      publisherId: { type: 'string', description: 'Publisher/SSP ID' },
      format: { type: 'string', description: 'Ad format (display, video, native, CTV)' },
      brief: { type: 'string', description: 'Campaign brief to match inventory against' },
    },
  },
};

export async function handleDiscoverInventory(
  client: DataClient,
  args: z.infer<typeof inventorySchema>
) {
  const products = await client.getProducts({
    publisherId: args.publisherId,
    format: args.format,
    brief: args.brief,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ products, total: products.length, fetchedAt: new Date().toISOString() }, null, 2),
      },
    ],
  };
}
