import type * as soap from 'soap';
import type { JWT } from 'google-auth-library';
import type { DeliveryReport } from '../adcp/types.js';
import { createSoapClient, soapCall } from './soap.js';

interface GamDate {
  year: number;
  month: number;
  day: number;
}

export function toGamDate(dateStr: string): GamDate {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

export function fromGamDateStr(s: string): string {
  // GAM CSV dates come as YYYY-MM-DD or M/D/YYYY — normalise to YYYY-MM-DD
  if (s.includes('/')) {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

async function waitForReport(
  client: soap.Client,
  reportJobId: string,
  maxWaitMs = 120_000
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    const res = await soapCall<{ rval?: string }>(client, 'getReportJobStatus', { reportJobId });
    if (res?.rval === 'COMPLETED') return;
    if (res?.rval === 'FAILED') throw new Error(`GAM report job ${reportJobId} failed`);
  }
  throw new Error(`GAM report job ${reportJobId} timed out after ${maxWaitMs / 1000}s`);
}

function parseReportCsv(
  csv: string,
  lineItemFilter?: string
): Map<string, { date: string; impressions: number; clicks: number; spend: number }[]> {
  const lines = csv.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return new Map();

  const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));

  const dateCol = col('date');
  const lineItemIdCol = col('line item id');
  const impCol = col('impressions');
  const clickCol = col('clicks');
  const revenueCol = col('revenue') !== -1 ? col('revenue') : col('cpm');

  const result = new Map<string, { date: string; impressions: number; clicks: number; spend: number }[]>();

  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.replace(/"/g, '').trim());
    const lineItemId = lineItemIdCol >= 0 ? cols[lineItemIdCol] : lineItemFilter ?? 'unknown';

    if (lineItemFilter && lineItemId !== lineItemFilter) continue;

    const row = {
      date: fromGamDateStr(cols[dateCol] ?? ''),
      impressions: Number(cols[impCol] ?? 0),
      clicks: Number(cols[clickCol] ?? 0),
      spend: Number(cols[revenueCol] ?? 0),
    };

    if (!result.has(lineItemId)) result.set(lineItemId, []);
    result.get(lineItemId)!.push(row);
  }

  return result;
}

function computePacing(
  rows: { date: string; impressions: number }[],
  totalGoal: number,
  startDate: string,
  endDate: string
): number {
  if (totalGoal <= 0) return 1;
  const totalDays = Math.max(
    1,
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000
  );
  const daysElapsed = Math.min(
    totalDays,
    (Date.now() - new Date(startDate).getTime()) / 86_400_000
  );
  const delivered = rows.reduce((s, r) => s + r.impressions, 0);
  const expectedPct = daysElapsed / totalDays;
  const actualPct = delivered / totalGoal;
  return expectedPct > 0 ? Math.min(actualPct / expectedPct, 2) : 0;
}

export async function runDeliveryReport(
  networkCode: string,
  auth: JWT,
  soapCache: Map<string, soap.Client>,
  opts: {
    startDate: string;
    endDate: string;
    lineItemIds?: string[];
  }
): Promise<Map<string, { date: string; impressions: number; clicks: number; spend: number }[]>> {
  const client = await createSoapClient('ReportService', networkCode, auth, soapCache);

  const reportQuery: Record<string, unknown> = {
    dimensions: ['DATE', 'LINE_ITEM_ID', 'LINE_ITEM_NAME'],
    columns: ['AD_SERVER_IMPRESSIONS', 'AD_SERVER_CLICKS', 'AD_SERVER_CPM_AND_CPC_REVENUE'],
    dateRangeType: 'CUSTOM_DATE',
    startDate: toGamDate(opts.startDate),
    endDate: toGamDate(opts.endDate),
  };

  if (opts.lineItemIds?.length) {
    reportQuery.statement = {
      query: `WHERE LINE_ITEM_ID IN (${opts.lineItemIds.join(',')})`,
    };
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

  const { token } = await auth.getAccessToken();
  const res = await fetch(csvUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GAM report download failed: ${res.status}`);
  const csv = await res.text();

  return parseReportCsv(csv);
}

export function toDeliveryReports(
  rows: { date: string; impressions: number; clicks: number; spend: number }[],
  mediaBuyId: string,
  totalGoal: number,
  startDate: string,
  endDate: string
): DeliveryReport[] {
  const pacing = computePacing(rows, totalGoal, startDate, endDate);
  return rows.map((r) => ({
    mediaBuyId,
    date: r.date,
    impressions: r.impressions,
    clicks: r.clicks,
    spend: r.spend,
    pacing,
  }));
}
