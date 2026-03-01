import React, { useMemo } from 'react';

interface DayEntry {
  date: string;         // ISO yyyy-mm-dd
  present: boolean;
  wasTrainingDay: boolean; // attendance_day existed for this date
}

interface AttendanceHeatmapProps {
  entries: DayEntry[];
  weeks?: number;
}

function isoToLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function localToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const DAY_LABELS = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
const MONTHS_RO = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];

export default function AttendanceHeatmap({ entries, weeks = 12 }: AttendanceHeatmapProps) {
  const { grid, monthLabels } = useMemo(() => {
    const entryMap = new Map<string, DayEntry>();
    for (const e of entries) entryMap.set(e.date, e);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Align to Monday of the week 'weeks' ago
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (weeks * 7 - 1));
    // Shift to Monday
    const dow = startDate.getDay();
    const shift = dow === 0 ? 6 : dow - 1;
    startDate.setDate(startDate.getDate() - shift);

    const columns: { iso: string; entry: DayEntry | null; isFuture: boolean }[][] = [];
    const months: { label: string; col: number }[] = [];
    let lastMonth = -1;

    for (let w = 0; w < weeks; w++) {
      const col: typeof columns[0] = [];
      for (let d = 0; d < 7; d++) {
        const cur = new Date(startDate);
        cur.setDate(startDate.getDate() + w * 7 + d);
        const iso = localToISO(cur);
        const isFuture = cur > today;
        const entry = entryMap.get(iso) ?? null;

        if (cur.getMonth() !== lastMonth && !isFuture) {
          months.push({ label: MONTHS_RO[cur.getMonth()]!, col: w });
          lastMonth = cur.getMonth();
        }
        col.push({ iso, entry, isFuture });
      }
      columns.push(col);
    }

    return { grid: columns, monthLabels: months };
  }, [entries, weeks]);

  function cellColor(cell: { iso: string; entry: DayEntry | null; isFuture: boolean }): string {
    if (cell.isFuture) return 'bg-gray-100';
    if (!cell.entry) return 'bg-gray-100'; // no data
    if (!cell.entry.wasTrainingDay) return 'bg-gray-100'; // not a training day
    if (cell.entry.present) return 'bg-emerald-500';
    return 'bg-rose-400'; // training day but absent
  }

  function cellTitle(cell: { iso: string; entry: DayEntry | null; isFuture: boolean }): string {
    if (cell.isFuture) return cell.iso;
    if (!cell.entry || !cell.entry.wasTrainingDay) return `${cell.iso} — Fără antrenament`;
    return `${cell.iso} — ${cell.entry.present ? 'Prezent ✓' : 'Absent ✗'}`;
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Month labels */}
        <div className="flex mb-1 pl-6">
          {monthLabels.map((ml, i) => (
            <div
              key={i}
              className="text-[10px] text-gray-400 font-medium"
              style={{ marginLeft: i === 0 ? `${ml.col * 14}px` : `${(ml.col - (monthLabels[i - 1]?.col ?? 0)) * 14 - 20}px` }}
            >
              {ml.label}
            </div>
          ))}
        </div>

        <div className="flex gap-0.5">
          {/* Day of week labels */}
          <div className="flex flex-col gap-0.5 mr-1">
            {DAY_LABELS.map((d, i) => (
              <div key={i} className="text-[9px] text-gray-400 w-4 h-3 flex items-center justify-end pr-0.5">{i % 2 === 0 ? d : ''}</div>
            ))}
          </div>

          {/* Cells */}
          {grid.map((col, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {col.map((cell, di) => (
                <div
                  key={di}
                  title={cellTitle(cell)}
                  className={`w-3 h-3 rounded-sm ${cellColor(cell)}`}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-2 pl-6">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
            <span className="text-[10px] text-gray-500">Prezent</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-rose-400" />
            <span className="text-[10px] text-gray-500">Absent</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200" />
            <span className="text-[10px] text-gray-500">Fără antrenament</span>
          </div>
        </div>
      </div>
    </div>
  );
}
