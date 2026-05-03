import { z } from 'zod';
import type { DataClient } from '../data-client.js';

export const morningBriefingSchema = z.object({
  lookbackDays: z.number().int().min(1).max(30).default(1)
    .describe('Number of days to include in the briefing (default: 1 = yesterday)'),
});

export const morningBriefingTool = {
  name: 'get_morning_briefing',
  description: 'Generate a morning briefing summarizing campaign performance, budget pacing, top deals, and alerts from the prior period. Designed for daily team standup or exec digest.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      lookbackDays: { type: 'number', description: 'Days to include (default: 1 = yesterday)' },
    },
  },
};

export async function handleGetMorningBriefing(
  client: DataClient,
  args: z.infer<typeof morningBriefingSchema>
) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - args.lookbackDays * 86400000);

  const dateRange = {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };

  const allData = await client.getAllDeliveryReports(dateRange);

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalSpend = 0;
  let totalBudget = 0;
  const underperforming: string[] = [];
  const topPerformers: string[] = [];

  for (const { mediaBuy, reports } of allData) {
    totalBudget += mediaBuy.budget;
    for (const r of reports) {
      totalImpressions += r.impressions;
      totalClicks += r.clicks;
      totalSpend += r.spend;
    }
    const latest = reports[reports.length - 1];
    if (latest) {
      if (latest.pacing < 0.8) underperforming.push(mediaBuy.name);
      if (latest.pacing >= 1.0) topPerformers.push(mediaBuy.name);
    }
  }

  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';
  const budgetUtilization = totalBudget > 0 ? ((totalSpend / totalBudget) * 100).toFixed(1) : '0.0';

  const briefing = {
    period: dateRange,
    summary: {
      activeCampaigns: allData.length,
      totalImpressions,
      totalClicks,
      ctrPercent: parseFloat(ctr),
      totalSpend,
      budgetUtilization: parseFloat(budgetUtilization),
    },
    attention: {
      underperformingCampaigns: underperforming,
      topPerformers,
    },
    generatedAt: new Date().toISOString(),
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(briefing, null, 2),
      },
    ],
  };
}
