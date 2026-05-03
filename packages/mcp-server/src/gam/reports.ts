import type * as soap from 'soap';
import { gunzipSync } from 'node:zlib';
import type { GamAuth } from './soap.js';
import type { DeliveryRow } from '../adcp/types.js';
import type { GamDimension } from '../data-client.js';
import { createSoapClient, soapCall } from './soap.js';
import type { DeliveryReport } from '../adcp/types.js';

interface GamDate { year: number; month: number; day: number; }

export function toGamDate(dateStr: string): GamDate {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

export function fromGamDateStr(s: string): string {
  if (s.includes('/')) {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

// Maps our dimension names to GAM API dimension names
const DIMENSION_MAP: Record<GamDimension, string> = {
  date: 'DATE',
  ad_unit: 'AD_UNIT_NAME',
  order: 'ORDER_NAME',
  line_item: 'LINE_ITEM_NAME',
  device: 'DEVICE_CATEGORY_NAME',
  country: 'COUNTRY_NAME',
  ssp: 'BUYER_NETWORK_NAME',
};

const REPORT_COLUMNS = [
  'AD_SERVER_IMPRESSIONS',
  'AD_SERVER_CLICKS',
  'AD_SERVER_CPM_AND_CPC_REVENUE',
  'TOTAL_CODE_SERVED_COUNT',
] as const;

async function waitForReport(client: soap.Client, reportJobId: string, maxWaitMs = 120_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    const res = await soapCall<{ rval?: string }>(client, 'getReportJobStatus', { reportJobId });
    if (res?.rval === 'COMPLETED') return;
    if (res?.rval === 'FAILED') throw new Error(`GAM report job ${reportJobId} failed`);
  }
  throw new Error(`GAM report job ${reportJobId} timed out after ${maxWaitMs / 1000}s`);
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { cols.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

function parseDeliveryCsv(csv: string, dimensions: GamDimension[]): DeliveryRow[] {
  const lines = csv.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const dimCount = dimensions.length;
  const rows: DeliveryRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    // Skip totals rows
    if (cols[0]?.toLowerCase().includes('total')) continue;

    const dimValues: Record<string, string> = {};
    dimensions.forEach((dim, i) => {
      dimValues[dim] = dim === 'date' ? fromGamDateStr(cols[i] ?? '') : (cols[i] ?? '');
    });

    // Strip thousand separators before parsing
    const num = (s?: string) => Number((s ?? '0').replace(/,/g, ''));
    const impressions = num(cols[dimCount]);
    const clicks = num(cols[dimCount + 1]);
    const revenue = num(cols[dimCount + 2]);
    const totalRequests = num(cols[dimCount + 3]);

    rows.push({
      dimensions: dimValues,
      impressions,
      clicks,
      revenue,
      ecpm: impressions > 0 ? (revenue / impressions) * 1000 : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      totalRequests,
      fillRate: totalRequests > 0 ? impressions / totalRequests : 0,
    });
  }
  return rows;
}

export async function runReport(
  networkCode: string,
  auth: GamAuth,
  soapCache: Map<string, soap.Client>,
  opts: {
    startDate: string;
    endDate: string;
    dimensions: GamDimension[];
    filter?: string;
  }
): Promise<DeliveryRow[]> {
  const client = await createSoapClient('ReportService', networkCode, auth, soapCache);

  const reportQuery: Record<string, unknown> = {
    dimensions: opts.dimensions.map((d) => DIMENSION_MAP[d]),
    columns: [...REPORT_COLUMNS],
    startDate: toGamDate(opts.startDate),
    endDate: toGamDate(opts.endDate),
    dateRangeType: 'CUSTOM_DATE',
  };

  if (opts.filter) {
    reportQuery.statement = { query: opts.filter };
  }

  const jobResult = await soapCall<{ rval?: { id: string } }>(client, 'runReportJob', {
    reportJob: { reportQuery },
  });

  const reportJobId = jobResult?.rval?.id;
  if (!reportJobId) throw new Error('GAM did not return a report job ID');

  await waitForReport(client, reportJobId);

  const urlResult = await soapCall<{ rval?: string }>(client, 'getReportDownloadURL', {
    reportJobId,
    exportFormat: 'CSV_DUMP',
  });

  const csvUrl = urlResult?.rval;
  if (!csvUrl) throw new Error('GAM did not return a report download URL');

  const token = await auth.getAccessToken();
  const res = await fetch(csvUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GAM report download failed: ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const csv = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return parseDeliveryCsv(csv, opts.dimensions);
}

// Legacy helpers kept for getAllDeliveryReports / pacing alerts
export function toGamDate2(dateStr: string): GamDate { return toGamDate(dateStr); }

export function computePacing(delivered: number, totalGoal: number, startDate: string, endDate: string): number {
  if (totalGoal <= 0) return 1;
  const totalDays = Math.max(1, (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000);
  const daysElapsed = Math.min(totalDays, (Date.now() - new Date(startDate).getTime()) / 86_400_000);
  const expectedPct = daysElapsed / totalDays;
  const actualPct = delivered / totalGoal;
  return expectedPct > 0 ? Math.min(actualPct / expectedPct, 2) : 0;
}

export function toDeliveryReports(
  rows: { date: string; impressions: number; clicks: number; spend: number }[],
  mediaBuyId: string,
  totalGoal: number,
  startDate: string,
  endDate: string
): DeliveryReport[] {
  const delivered = rows.reduce((s, r) => s + r.impressions, 0);
  const pacing = computePacing(delivered, totalGoal, startDate, endDate);
  return rows.map((r) => ({ mediaBuyId, date: r.date, impressions: r.impressions, clicks: r.clicks, spend: r.spend, pacing }));
}

// Legacy runDeliveryReport kept for getAllDeliveryReports
export async function runDeliveryReport(
  networkCode: string,
  auth: GamAuth,
  soapCache: Map<string, soap.Client>,
  opts: { startDate: string; endDate: string; lineItemIds?: string[] }
): Promise<Map<string, { date: string; impressions: number; clicks: number; spend: number }[]>> {
  const rows = await runReport(networkCode, auth, soapCache, {
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: ['date', 'line_item'],
    filter: opts.lineItemIds?.length ? `WHERE LINE_ITEM_ID IN (${opts.lineItemIds.join(',')})` : undefined,
  });

  const result = new Map<string, { date: string; impressions: number; clicks: number; spend: number }[]>();
  for (const row of rows) {
    const id = row.dimensions['line_item'] ?? 'unknown';
    if (!result.has(id)) result.set(id, []);
    result.get(id)!.push({ date: row.dimensions['date'] ?? '', impressions: row.impressions, clicks: row.clicks, spend: row.revenue });
  }
  return result;
}
