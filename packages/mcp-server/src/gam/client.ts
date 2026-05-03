import type * as soap from 'soap';
import { makeAuth, createSoapClient, soapCall, type GamAuth } from './soap.js';
import { runDeliveryReport, toDeliveryReports, runReport } from './reports.js';
import {
  ReportCache,
  deliveryTTL,
  type DataClient,
  type DeliveryQuery,
  type MediaBuy,
  type DeliveryReport,
  type GovernanceResult,
  type InventoryProduct,
  type AuditLogEntry,
  type DeliveryRow,
} from 'publisher-analytics-agent';

export interface GAMConfig {
  networkCode: string;
  // Optional — if omitted, Application Default Credentials are used
  credentials?: { client_email: string; private_key: string };
}

function gamStatusToAdamStatus(s: string): MediaBuy['status'] {
  switch (s) {
    case 'DELIVERING': return 'active';
    case 'READY': case 'NEEDS_CREATIVES': return 'pending';
    case 'PAUSED': case 'PAUSED_INVENTORY_RELEASED': return 'paused';
    case 'COMPLETED': case 'DELIVERED': case 'INACTIVE': return 'completed';
    default: return 'pending';
  }
}

function parseGamDate(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLineItem(item: any): MediaBuy & { unitsBought: number } {
  const microToUnit = (v: unknown) => Number(v ?? 0) / 1_000_000;
  return {
    id: String(item.id),
    name: item.name,
    status: gamStatusToAdamStatus(item.status),
    budget: microToUnit(item.budget?.microAmount ?? item.costPerUnit?.microAmount),
    spend: microToUnit(item.stats?.costInMoney?.microAmount),
    impressions: Number(item.stats?.impressionsDelivered ?? 0),
    clicks: Number(item.stats?.clicksDelivered ?? 0),
    startDate: parseGamDate(item.startDateTime.date),
    endDate: item.endDateTime ? parseGamDate(item.endDateTime.date) : '',
    publisherId: String(item.orderId),
    unitsBought: Number(item.unitsBought ?? 0),
  };
}

export class GAMClient implements DataClient {
  private config: GAMConfig;
  private auth: GamAuth;
  private soapCache = new Map<string, soap.Client>();
  readonly cache: ReportCache;

  constructor(config: GAMConfig) {
    this.config = config;
    this.auth = makeAuth(config.credentials);
    this.cache = new ReportCache();
  }

  private deliveryCacheKey(start: string, end: string): string {
    return `delivery-${this.config.networkCode}-${start}-${end}`;
  }

  /** Called by GAMScheduler to force-refresh a date range into the cache. */
  async refreshDeliveryCache(dateRange: { start: string; end: string }): Promise<void> {
    const data = await this.fetchAllDeliveryReportsFromGAM(dateRange);
    this.cache.set(this.deliveryCacheKey(dateRange.start, dateRange.end), data, deliveryTTL(dateRange.end));
  }

  private async call<T>(service: string, method: string, args: unknown): Promise<T> {
    const client = await createSoapClient(service, this.config.networkCode, this.auth, this.soapCache);
    return soapCall<T>(client, method, args);
  }

  async listMediaBuys(filters?: { status?: string }): Promise<MediaBuy[]> {
    const statusMap: Record<string, string> = {
      active: 'DELIVERING',
      pending: 'READY',
      paused: 'PAUSED',
      completed: 'COMPLETED',
    };
    const gamStatus = filters?.status ? (statusMap[filters.status] ?? 'DELIVERING') : 'DELIVERING';
    const query = `WHERE status = '${gamStatus}' ORDER BY id LIMIT 500`;

    const res = await this.call<{ rval?: { results?: unknown[] } }>(
      'LineItemService',
      'getLineItemsByStatement',
      { filterStatement: { query } }
    );

    return (res?.rval?.results ?? []).map(mapLineItem);
  }

  async getMediaBuyDelivery(
    mediaBuyId: string,
    dateRange?: { start: string; end: string }
  ): Promise<DeliveryReport[]> {
    const end = dateRange?.end ?? new Date().toISOString().split('T')[0];
    const start = dateRange?.start ?? new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];

    // Fetch the line item to get goal + flight dates for pacing calc
    const res = await this.call<{ rval?: { results?: unknown[] } }>(
      'LineItemService',
      'getLineItemsByStatement',
      { filterStatement: { query: `WHERE id = ${mediaBuyId} LIMIT 1` } }
    );
    const item = mapLineItem((res?.rval?.results ?? [])[0] ?? {});

    const reportData = await runDeliveryReport(
      this.config.networkCode,
      this.auth,
      this.soapCache,
      { startDate: start, endDate: end, lineItemIds: [mediaBuyId] }
    );

    const rows = reportData.get(mediaBuyId) ?? [];
    return toDeliveryReports(rows, mediaBuyId, item.unitsBought, item.startDate, item.endDate || end);
  }

  private async fetchAllDeliveryReportsFromGAM(
    dateRange: { start: string; end: string }
  ): Promise<{ mediaBuy: MediaBuy; reports: DeliveryReport[] }[]> {
    const { start, end } = dateRange;
    const mediaBuys = await this.listMediaBuys({ status: 'active' });
    if (mediaBuys.length === 0) return [];

    // Single report job for all active line items — much faster than N individual jobs
    const reportData = await runDeliveryReport(
      this.config.networkCode,
      this.auth,
      this.soapCache,
      { startDate: start, endDate: end }
    );

    return mediaBuys.map((mb) => {
      const rows = reportData.get(mb.id) ?? [];
      const unitsBought = (mb as MediaBuy & { unitsBought?: number }).unitsBought ?? 0;
      return {
        mediaBuy: mb,
        reports: toDeliveryReports(rows, mb.id, unitsBought, mb.startDate, mb.endDate || end),
      };
    });
  }

  async getAllDeliveryReports(
    dateRange?: { start: string; end: string }
  ): Promise<{ mediaBuy: MediaBuy; reports: DeliveryReport[] }[]> {
    const end = dateRange?.end ?? new Date().toISOString().split('T')[0];
    const start = dateRange?.start ?? new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
    const key = this.deliveryCacheKey(start, end);

    const cached = this.cache.get<{ mediaBuy: MediaBuy; reports: DeliveryReport[] }[]>(key);

    if (cached && !cached.isStale) {
      return cached.data;
    }

    if (cached?.isStale) {
      // Return stale data immediately — kick off a background refresh for next call
      setImmediate(() =>
        this.refreshDeliveryCache({ start, end }).catch((e) =>
          process.stderr.write(`[ADam cache] Background refresh failed: ${e.message}\n`)
        )
      );
      return cached.data;
    }

    // Cache miss (cold start) — fetch synchronously, store, return
    const fresh = await this.fetchAllDeliveryReportsFromGAM({ start, end });
    this.cache.set(key, fresh, deliveryTTL(end));
    return fresh;
  }

  async getDeliveryReport(query: DeliveryQuery): Promise<DeliveryRow[]> {
    const cacheKey = `report-${this.config.networkCode}-${query.startDate}-${query.endDate}-${query.dimensions.join('_')}`;
    const cached = this.cache.get<DeliveryRow[]>(cacheKey);
    if (cached && !cached.isStale) return cached.data;

    if (cached?.isStale) {
      setImmediate(() =>
        runReport(this.config.networkCode, this.auth, this.soapCache, query)
          .then((data) => this.cache.set(cacheKey, data, deliveryTTL(query.endDate)))
          .catch((e) => process.stderr.write(`[ADam cache] Background refresh failed: ${e.message}\n`))
      );
      return cached.data;
    }

    const data = await runReport(this.config.networkCode, this.auth, this.soapCache, query);
    this.cache.set(cacheKey, data, deliveryTTL(query.endDate));
    return data;
  }

  async checkGovernance(mediaBuyId: string): Promise<GovernanceResult> {
    const res = await this.call<{ rval?: { results?: unknown[] } }>(
      'LineItemService',
      'getLineItemsByStatement',
      { filterStatement: { query: `WHERE id = ${mediaBuyId} LIMIT 1` } }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = (res?.rval?.results ?? [])[0] as any;
    const violations: GovernanceResult['violations'] = [];

    if (!item) {
      violations.push({ rule: 'existence', severity: 'error', message: `Line item ${mediaBuyId} not found` });
    } else {
      if (!item.creativePlaceholders || item.creativePlaceholders.length === 0) {
        violations.push({ rule: 'creative_assignment', severity: 'error', message: 'No creative placeholders assigned' });
      }
      if (item.status === 'NEEDS_CREATIVES') {
        violations.push({ rule: 'creative_approval', severity: 'error', message: 'Awaiting creative approval' });
      }
      if (item.endDateTime && new Date(parseGamDate(item.endDateTime.date)) < new Date()) {
        violations.push({ rule: 'flight_dates', severity: 'warning', message: 'End date has passed' });
      }
    }

    return { mediaBuyId, passed: violations.length === 0, violations };
  }

  async getProducts(params: { format?: string }): Promise<InventoryProduct[]> {
    const sizeFilter = params.format
      ? ` AND adUnitSizes.size.width || 'x' || adUnitSizes.size.height = '${params.format}'`
      : '';
    const query = `WHERE status = 'ACTIVE'${sizeFilter} ORDER BY id LIMIT 200`;

    const res = await this.call<{ rval?: { results?: unknown[] } }>(
      'InventoryService',
      'getAdUnitsByStatement',
      { filterStatement: { query } }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res?.rval?.results ?? []).map((unit: any) => {
      const size = unit.adUnitSizes?.[0]?.size;
      return {
        id: String(unit.id),
        name: unit.name,
        publisherId: this.config.networkCode,
        publisherName: `GAM Network ${this.config.networkCode}`,
        format: size ? `${size.width}x${size.height}` : 'unknown',
        minCpm: 0,
        availableImpressions: 0,
        targeting: {},
      };
    });
  }

  async getPlanAuditLogs(): Promise<AuditLogEntry[]> {
    // GAM does not expose an audit log API — order and line item change history
    // requires the Change History API which is available in the GAM UI but not the SOAP API.
    return [];
  }
}

export function createGAMClient(): GAMClient {
  const networkCode = process.env.GAM_NETWORK_CODE;
  if (!networkCode) throw new Error('GAM_NETWORK_CODE is required');

  // Explicit service account JSON takes priority; otherwise fall back to ADC
  // (set up via: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/dfp)
  let credentials: { client_email: string; private_key: string } | undefined;
  if (process.env.GAM_CREDENTIALS_JSON) {
    try {
      credentials = JSON.parse(process.env.GAM_CREDENTIALS_JSON);
    } catch {
      throw new Error('GAM_CREDENTIALS_JSON must be valid JSON');
    }
  }

  return new GAMClient({ networkCode, credentials });
}
