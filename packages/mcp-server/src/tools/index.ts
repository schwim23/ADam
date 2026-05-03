import type { DataClient } from '../data-client.js';
import { campaignMonitorTool, campaignMonitorSchema, handleGetCampaignStatus } from './campaign-monitor.js';
import { dealAlertsTool, dealAlertsSchema, handleGetDealAlerts } from './deal-alerts.js';
import { morningBriefingTool, morningBriefingSchema, handleGetMorningBriefing } from './morning-briefing.js';
import { inventoryTool, inventorySchema, handleDiscoverInventory } from './inventory.js';
import { performanceTool, performanceSchema, handleGetPerformanceReport } from './performance.js';
import { auditLogsTool, auditLogsSchema, handleGetPlanAuditLogs } from './audit-logs.js';
import { visualizationTool, visualizationSchema, handleGenerateVisualization } from './visualization.js';

export const tools = [
  campaignMonitorTool,
  dealAlertsTool,
  morningBriefingTool,
  inventoryTool,
  performanceTool,
  auditLogsTool,
  visualizationTool,
];

export async function handleToolCall(
  client: DataClient,
  name: string,
  args: Record<string, unknown>
) {
  switch (name) {
    case 'get_campaign_status':
      return handleGetCampaignStatus(client, campaignMonitorSchema.parse(args));
    case 'get_deal_alerts':
      return handleGetDealAlerts(client, dealAlertsSchema.parse(args));
    case 'get_morning_briefing':
      return handleGetMorningBriefing(client, morningBriefingSchema.parse(args));
    case 'discover_inventory':
      return handleDiscoverInventory(client, inventorySchema.parse(args));
    case 'get_performance_report':
      return handleGetPerformanceReport(client, performanceSchema.parse(args));
    case 'get_plan_audit_logs':
      return handleGetPlanAuditLogs(client, auditLogsSchema.parse(args));
    case 'generate_visualization':
      return handleGenerateVisualization(visualizationSchema.parse(args));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
