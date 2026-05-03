import type { MediaBuy, DeliveryReport, GovernanceResult, InventoryProduct, AuditLogEntry } from './adcp/types.js';

export interface DataClient {
  listMediaBuys(filters?: { status?: string; publisherId?: string }): Promise<MediaBuy[]>;
  getMediaBuyDelivery(mediaBuyId: string, dateRange?: { start: string; end: string }): Promise<DeliveryReport[]>;
  checkGovernance(mediaBuyId: string): Promise<GovernanceResult>;
  getProducts(params: { publisherId?: string; format?: string; brief?: string }): Promise<InventoryProduct[]>;
  getPlanAuditLogs(params: { mediaBuyId?: string; planId?: string; startDate?: string; endDate?: string; limit?: number }): Promise<AuditLogEntry[]>;
  getAllDeliveryReports(dateRange?: { start: string; end: string }): Promise<{ mediaBuy: MediaBuy; reports: DeliveryReport[] }[]>;
}
