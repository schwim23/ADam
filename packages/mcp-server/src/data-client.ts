import type { MediaBuy, DeliveryReport, GovernanceResult, InventoryProduct, AuditLogEntry, DeliveryRow } from './adcp/types.js';

export type GamDimension = 'date' | 'ad_unit' | 'order' | 'line_item' | 'device' | 'country' | 'ssp';

export interface DeliveryQuery {
  startDate: string;
  endDate: string;
  dimensions: GamDimension[];
  filter?: string;
}

export interface DataClient {
  // Primary publisher analytics method — flexible multi-dimensional delivery data
  getDeliveryReport(query: DeliveryQuery): Promise<DeliveryRow[]>;
  // Kept for pacing alerts and AdCP compatibility
  listMediaBuys(filters?: { status?: string; publisherId?: string }): Promise<MediaBuy[]>;
  getMediaBuyDelivery(mediaBuyId: string, dateRange?: { start: string; end: string }): Promise<DeliveryReport[]>;
  checkGovernance(mediaBuyId: string): Promise<GovernanceResult>;
  getProducts(params: { publisherId?: string; format?: string; brief?: string }): Promise<InventoryProduct[]>;
  getPlanAuditLogs(params: { mediaBuyId?: string; planId?: string; startDate?: string; endDate?: string; limit?: number }): Promise<AuditLogEntry[]>;
  getAllDeliveryReports(dateRange?: { start: string; end: string }): Promise<{ mediaBuy: MediaBuy; reports: DeliveryReport[] }[]>;
}
