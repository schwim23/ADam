import type {
  AdCPConfig,
  MediaBuy,
  DeliveryReport,
  GovernanceResult,
  InventoryProduct,
  AuditLogEntry,
} from './types.js';
import type { DataClient } from '../data-client.js';

export class AdCPClient implements DataClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: AdCPConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AdCP ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async listMediaBuys(filters?: { status?: string; publisherId?: string }): Promise<MediaBuy[]> {
    const params = new URLSearchParams(filters as Record<string, string>);
    return this.request<MediaBuy[]>(`/v1/media-buys?${params}`);
  }

  async getMediaBuyDelivery(mediaBuyId: string, dateRange?: { start: string; end: string }): Promise<DeliveryReport[]> {
    const params = new URLSearchParams(dateRange as Record<string, string>);
    return this.request<DeliveryReport[]>(`/v1/media-buys/${mediaBuyId}/delivery?${params}`);
  }

  async checkGovernance(mediaBuyId: string): Promise<GovernanceResult> {
    return this.request<GovernanceResult>(`/v1/governance/check`, {
      method: 'POST',
      body: JSON.stringify({ media_buy_id: mediaBuyId }),
    });
  }

  async getProducts(params: {
    publisherId?: string;
    format?: string;
    brief?: string;
  }): Promise<InventoryProduct[]> {
    const qs = new URLSearchParams(params as Record<string, string>);
    return this.request<InventoryProduct[]>(`/v1/products?${qs}`);
  }

  async getPlanAuditLogs(params: {
    mediaBuyId?: string;
    planId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    );
    return this.request<AuditLogEntry[]>(`/v1/audit-logs?${qs}`);
  }

  async getDeliveryReport(query: import('../data-client.js').DeliveryQuery): Promise<import('../adcp/types.js').DeliveryRow[]> {
    // AdCP mode: get_media_buy_delivery returns line-item data; map to DeliveryRow
    const mediaBuys = await this.listMediaBuys({ status: 'active' });
    const results: import('../adcp/types.js').DeliveryRow[] = [];
    for (const mb of mediaBuys) {
      const reports = await this.getMediaBuyDelivery(mb.id, { start: query.startDate, end: query.endDate });
      for (const r of reports) {
        results.push({
          dimensions: { date: r.date, line_item: mb.name },
          impressions: r.impressions,
          clicks: r.clicks,
          revenue: r.spend,
          ecpm: r.impressions > 0 ? (r.spend / r.impressions) * 1000 : 0,
          ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
          totalRequests: r.impressions,
          fillRate: 1,
        });
      }
    }
    return results;
  }

  async getAllDeliveryReports(dateRange?: { start: string; end: string }): Promise<{ mediaBuy: MediaBuy; reports: DeliveryReport[] }[]> {
    const mediaBuys = await this.listMediaBuys({ status: 'active' });
    return Promise.all(
      mediaBuys.map(async (mb) => ({
        mediaBuy: mb,
        reports: await this.getMediaBuyDelivery(mb.id, dateRange),
      }))
    );
  }
}

export function createAdCPClient(): AdCPClient {
  const baseUrl = process.env.ADCP_BASE_URL;
  const apiKey = process.env.ADCP_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('ADCP_BASE_URL and ADCP_API_KEY environment variables are required');
  }
  return new AdCPClient({ baseUrl, apiKey });
}
