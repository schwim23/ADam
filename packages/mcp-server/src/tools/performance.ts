import { z } from 'zod';
import type { DataClient } from '../data-client.js';

export const performanceSchema = z.object({
  mediaBuyId: z.string().describe('Campaign/media buy ID to report on'),
  startDate: z.string().describe('Report start date (YYYY-MM-DD)'),
  endDate: z.string().describe('Report end date (YYYY-MM-DD)'),
});

export const performanceTool = {
  name: 'get_performance_report',
  description: 'Fetch detailed delivery and performance data for a specific campaign over a date range. Returns impressions, clicks, CTR, spend, and daily pacing.',
  inputSchema: {
    type: 'object' as const,
    required: ['mediaBuyId', 'startDate', 'endDate'],
    properties: {
      mediaBuyId: { type: 'string', description: 'Campaign/media buy ID' },
      startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
      endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    },
  },
};

export async function handleGetPerformanceReport(
  client: DataClient,
  args: z.infer<typeof performanceSchema>
) {
  const reports = await client.getMediaBuyDelivery(args.mediaBuyId, {
    start: args.startDate,
    end: args.endDate,
  });

  const totals = reports.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      spend: acc.spend + r.spend,
    }),
    { impressions: 0, clicks: 0, spend: 0 }
  );

  const ctr = totals.impressions > 0
    ? ((totals.clicks / totals.impressions) * 100).toFixed(2)
    : '0.00';

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            mediaBuyId: args.mediaBuyId,
            period: { start: args.startDate, end: args.endDate },
            totals: { ...totals, ctrPercent: parseFloat(ctr) },
            dailyBreakdown: reports,
          },
          null,
          2
        ),
      },
    ],
  };
}
