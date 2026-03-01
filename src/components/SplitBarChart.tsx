import React from 'react';
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMmSs } from '@/lib/utils';

interface SplitBarChartProps {
  splits: number[];       // ms per split
  idealLapMs?: number;    // ms per lap (reference line)
  hasHalfFirst?: boolean; // 1000m: first split is ½ lap
}

function splitLabel(i: number, hasHalf: boolean): string {
  if (hasHalf && i === 0) return '½';
  const lapNo = hasHalf ? i : i + 1;
  return `T${lapNo}`;
}

export default function SplitBarChart({ splits, idealLapMs, hasHalfFirst = false }: SplitBarChartProps) {
  if (!splits.length) {
    return <div className="h-40 flex items-center justify-center text-sm text-gray-400">Fără splits disponibile</div>;
  }

  const data = splits.map((ms, i) => ({
    label: splitLabel(i, hasHalfFirst),
    ms,
    sec: ms / 1000,
  }));

  const minSec = Math.min(...splits) / 1000;
  const maxSec = Math.max(...splits) / 1000;
  const padding = (maxSec - minSec) * 0.2 || 2;
  const yMin = Math.floor(minSec - padding);
  const yMax = Math.ceil(maxSec + padding);

  const idealSec = idealLapMs ? idealLapMs / 1000 : null;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          tickFormatter={(v) => `${v}s`}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          formatter={(v: number) => [formatMmSs(v * 1000), 'Timp']}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          cursor={{ fill: 'rgba(99,102,241,0.06)' }}
        />
        {idealSec && (
          <ReferenceLine
            y={idealSec}
            stroke="#6366f1"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: 'Ideal', position: 'right', fontSize: 10, fill: '#6366f1' }}
          />
        )}
        <Bar dataKey="sec" radius={[4, 4, 0, 0]} maxBarSize={28}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={idealSec
                ? entry.sec <= idealSec
                  ? '#10b981'
                  : '#f43f5e'
                : '#6366f1'}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
