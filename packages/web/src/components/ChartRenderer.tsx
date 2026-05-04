'use client';

import {
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface ChartSpec {
  __type: 'adcp_chart';
  chartType: 'line' | 'bar' | 'area' | 'pie';
  title: string;
  description?: string;
  data: Record<string, unknown>[];
  xKey: string;
  series: ChartSeries[];
}

// Editorial palette — quietly distinctive, reads at small sizes,
// avoids the indigo / pastel-rainbow defaults.
const PALETTE = ['#0E0E0C', '#7A6B4F', '#5C7A6B', '#A85A1F', '#3F506B', '#7A4F6B'];

const AXIS_TICK = { fill: '#76746C', fontSize: 11, fontFamily: 'inherit' };
const GRID_STROKE = '#E7E5DE';

const TOOLTIP_STYLE = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #D4D2C9',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(20,18,12,0.06)',
  color: '#0E0E0C',
  fontSize: 12,
  fontFamily: 'inherit',
  padding: '8px 12px',
};

const LEGEND_STYLE = { fontSize: 11, color: '#4F4D47', paddingTop: 8 };

interface Props {
  spec: ChartSpec;
}

export function ChartRenderer({ spec }: Props) {
  const { chartType, title, description, data, xKey, series } = spec;

  const colors = series.map((s, i) => s.color ?? PALETTE[i % PALETTE.length]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(20,18,12,0.03)]">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="text-[13px] font-semibold text-[var(--foreground)] tracking-tight">{title}</p>
          {description && <p className="text-[11.5px] text-[var(--foreground-soft)] mt-0.5">{description}</p>}
        </div>
        <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--foreground-soft)]">{chartType}</span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        {chartType === 'pie' ? (
          <PieChart>
            <Pie data={data} dataKey={series[0].key} nameKey={xKey} cx="50%" cy="50%" outerRadius={84} label={{ fontSize: 11, fill: '#4F4D47', fontFamily: 'inherit' }}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
          </PieChart>
        ) : chartType === 'bar' ? (
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} dy={4} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(14, 14, 12, 0.04)' }} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        ) : chartType === 'area' ? (
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[i]} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={colors[i]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} dy={4} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            {series.map((s, i) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[i]} fill={`url(#grad-${s.key})`} strokeWidth={2} dot={false} />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} dy={4} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            {series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[i]} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function parseChartSpec(text: string): ChartSpec | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.__type === 'adcp_chart') return parsed as ChartSpec;
  } catch {}
  return null;
}
