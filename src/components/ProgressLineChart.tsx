import React from 'react';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, Dot } from 'recharts';
import { formatMmSs, formatDateShortRo } from '@/lib/utils';

interface ProgressPoint {
  date: string;       // ISO date
  result_ms: number;
  is_simulation?: boolean;
}

interface ProgressLineChartProps {
  points: ProgressPoint[];
  targetMs?: number;
}

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (payload.is_simulation) {
    return <polygon points={`${cx},${cy - 5} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}`} fill="#f59e0b" />;
  }
  return <circle cx={cx} cy={cy} r={4} fill="#6366f1" strokeWidth={0} />;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ProgressPoint;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm text-xs">
      <p className="font-bold text-gray-900">{formatMmSs(d.result_ms)}</p>
      <p className="text-gray-500">{formatDateShortRo(d.date)}{d.is_simulation ? ' · Simulare' : ''}</p>
    </div>
  );
};

export default function ProgressLineChart({ points, targetMs }: ProgressLineChartProps) {
  if (!points.length) {
    return <div className="h-40 flex items-center justify-center text-sm text-gray-400">Fără curse înregistrate</div>;
  }

  const data = points
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ ...p, sec: p.result_ms / 1000 }));

  const secs = data.map((d) => d.sec);
  const minSec = Math.min(...secs);
  const maxSec = Math.max(...secs);
  const pad = (maxSec - minSec) * 0.15 || 10;
  const yMin = Math.floor(minSec - pad);
  const yMax = Math.ceil(maxSec + pad);

  const targetSec = targetMs ? targetMs / 1000 : null;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          tickFormatter={formatDateShortRo}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          tickFormatter={(v) => formatMmSs(v * 1000)}
          axisLine={false}
          tickLine={false}
          width={36}
          reversed
        />
        <Tooltip content={<CustomTooltip />} />
        {targetSec && (
          <ReferenceLine
            y={targetSec}
            stroke="#6366f1"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: 'Target', position: 'right', fontSize: 10, fill: '#6366f1' }}
          />
        )}
        <Line
          type="monotone"
          dataKey="sec"
          stroke="#6366f1"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 5, fill: '#6366f1' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
