import { z } from 'zod';
import type { DataClient } from '../data-client.js';
import type { MediaBuy, DeliveryReport } from '../adcp/types.js';

export const dealAlertsSchema = z.object({
  pacingThreshold: z.number().min(0).max(1).default(0.8)
    .describe('Flag campaigns pacing below this ratio (0-1, default 0.8 = 80%)'),
  checkGovernance: z.boolean().default(true)
    .describe('Also check for governance violations'),
});

export const dealAlertsTool = {
  name: 'get_deal_alerts',
  description: 'Surface active campaigns that need attention: underdelivering PMPs, pacing issues, and governance violations. Returns prioritized alerts with recommended actions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pacingThreshold: { type: 'number', description: 'Flag campaigns below this pacing ratio (default 0.8)' },
      checkGovernance: { type: 'boolean', description: 'Include governance violation checks (default true)' },
    },
  },
};

interface Alert {
  mediaBuyId: string;
  campaignName: string;
  type: 'underdelivery' | 'governance' | 'overspend';
  severity: 'critical' | 'warning';
  message: string;
  recommendation: string;
}

function buildPacingAlert(mb: MediaBuy, report: DeliveryReport, threshold: number): Alert | null {
  if (report.pacing >= threshold) return null;

  const severity = report.pacing < 0.5 ? 'critical' : 'warning';
  return {
    mediaBuyId: mb.id,
    campaignName: mb.name,
    type: 'underdelivery',
    severity,
    message: `Pacing at ${Math.round(report.pacing * 100)}% of expected delivery`,
    recommendation: report.pacing < 0.5
      ? 'Investigate immediately — consider broadening targeting or increasing bid floor'
      : 'Review targeting constraints and bid competitiveness',
  };
}

function buildBudgetAlert(mb: MediaBuy): Alert | null {
  const spendRatio = mb.spend / mb.budget;
  if (spendRatio <= 0.95) return null;
  return {
    mediaBuyId: mb.id,
    campaignName: mb.name,
    type: 'overspend',
    severity: spendRatio > 1 ? 'critical' : 'warning',
    message: `Spend at ${Math.round(spendRatio * 100)}% of budget`,
    recommendation: 'Pause or reduce bid to avoid budget overrun',
  };
}

export async function handleGetDealAlerts(
  client: DataClient,
  args: z.infer<typeof dealAlertsSchema>
) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const allData = await client.getAllDeliveryReports({ start: yesterday, end: today });
  const alerts: Alert[] = [];

  for (const { mediaBuy, reports } of allData) {
    const latest = reports[reports.length - 1];
    if (latest) {
      const pacingAlert = buildPacingAlert(mediaBuy, latest, args.pacingThreshold);
      if (pacingAlert) alerts.push(pacingAlert);
    }
    const budgetAlert = buildBudgetAlert(mediaBuy);
    if (budgetAlert) alerts.push(budgetAlert);

    if (args.checkGovernance) {
      const gov = await client.checkGovernance(mediaBuy.id);
      for (const violation of gov.violations) {
        alerts.push({
          mediaBuyId: mediaBuy.id,
          campaignName: mediaBuy.name,
          type: 'governance',
          severity: violation.severity === 'error' ? 'critical' : 'warning',
          message: violation.message,
          recommendation: `Resolve ${violation.rule} governance rule before next delivery window`,
        });
      }
    }
  }

  alerts.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ alerts, total: alerts.length, fetchedAt: new Date().toISOString() }, null, 2),
      },
    ],
  };
}
