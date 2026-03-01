import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCoach } from '@/hooks/useCoach';
import { toast } from 'sonner';
import { Banknote, Download, Plus, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { todayISO } from '@/lib/utils';

type CashTab = 'today' | 'history' | 'report';

const TYPE_LABELS: Record<string, string> = {
  PER_SESSION: 'Ședință',
  COACHING: 'Coaching',
  GYM: 'Gym / Teren',
  SUBSCRIPTION: 'Abonament',
  MANUAL: 'Manual',
};

const TYPE_COLORS: Record<string, string> = {
  PER_SESSION: 'bg-blue-50 text-blue-700 border-blue-100',
  COACHING: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  GYM: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  SUBSCRIPTION: 'bg-purple-50 text-purple-700 border-purple-100',
  MANUAL: 'bg-gray-50 text-gray-700 border-gray-100',
};

function formatCurrency(n: number): string {
  return `${n.toLocaleString('ro-RO')} RON`;
}

function getMonthLabel(year: number, month: number): string {
  const months = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];
  return `${months[month - 1]} ${year}`;
}

export default function CashPage() {
  const { coach } = useCoach();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<CashTab>('today');
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [historyDate, setHistoryDate] = useState(todayISO());
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  // Manual entry form
  const [manualAthleteName, setManualAthleteName] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualNote, setManualNote] = useState('');

  // Today's entries
  const { data: todayEntries = [], isLoading: todayLoading } = useQuery({
    queryKey: ['cash-today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_ledger')
        .select('*')
        .eq('date', todayISO())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  // History by date
  const { data: historyEntries = [], isLoading: historyLoading } = useQuery({
    queryKey: ['cash-history', historyDate],
    enabled: activeTab === 'history',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_ledger')
        .select('*')
        .eq('date', historyDate)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Monthly report - last 3 months
  const { data: monthlyData = [], isLoading: reportLoading } = useQuery({
    queryKey: ['cash-monthly'],
    enabled: activeTab === 'report',
    queryFn: async () => {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const fromDate = threeMonthsAgo.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('cash_ledger')
        .select('*')
        .gte('date', fromDate!)
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Manual add mutation
  const addManual = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(manualAmount);
      if (isNaN(amount) || amount <= 0) throw new Error('Sumă invalidă');
      if (!manualAthleteName.trim()) throw new Error('Introduceți numele');

      const { error } = await supabase.from('cash_ledger').insert({
        athlete_name: manualAthleteName.trim(),
        amount,
        date: todayISO(),
        type: 'MANUAL',
        note: manualNote.trim() || null,
        created_by_coach: coach!,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-today'] });
      qc.invalidateQueries({ queryKey: ['cash-monthly'] });
      setAddSheetOpen(false);
      setManualAthleteName('');
      setManualAmount('');
      setManualNote('');
      toast.success('Înregistrat!');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Eroare'),
  });

  // Monthly summary computation
  const monthlySummary = useMemo(() => {
    const byMonth = new Map<string, { year: number; month: number; total: number; byCoach: Record<string, number>; byType: Record<string, number>; entries: any[] }>();

    for (const entry of monthlyData as any[]) {
      const date = String(entry.date ?? '');
      if (!date) continue;
      const [y, m] = date.split('-').map(Number);
      if (!y || !m) continue;
      const key = `${y}-${String(m).padStart(2, '0')}`;

      if (!byMonth.has(key)) {
        byMonth.set(key, { year: y, month: m, total: 0, byCoach: {}, byType: {}, entries: [] });
      }
      const row = byMonth.get(key)!;
      const amount = Number(entry.amount ?? 0);
      row.total += amount;
      row.byCoach[entry.created_by_coach ?? 'N/A'] = (row.byCoach[entry.created_by_coach ?? 'N/A'] ?? 0) + amount;
      row.byType[entry.type ?? 'OTHER'] = (row.byType[entry.type ?? 'OTHER'] ?? 0) + amount;
      row.entries.push(entry);
    }

    return [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, val]) => ({ key, ...val }));
  }, [monthlyData]);

  function exportCsv(entries: any[], filename: string) {
    const header = 'Data,Sportiv,Tip,Suma,Antrenor,Nota\n';
    const rows = entries.map((e: any) =>
      [e.date, `"${e.athlete_name ?? ''}"`, TYPE_LABELS[e.type] ?? e.type, e.amount, e.created_by_coach, `"${e.note ?? ''}"`].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const todayTotal = (todayEntries as any[]).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
  const todayByType = (todayEntries as any[]).reduce((acc: any, e: any) => {
    acc[e.type] = (acc[e.type] ?? 0) + Number(e.amount ?? 0);
    return acc;
  }, {});

  const histTotal = (historyEntries as any[]).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);

  return (
    <div className="pb-24">
      <PageHeader
        title="Cash"
        subtitle="Registru financiar"
        action={
          <Button size="sm" onClick={() => setAddSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adaugă
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {([
          { key: 'today', label: '📆 Azi' },
          { key: 'history', label: '📋 Istoric' },
          { key: 'report', label: '📊 Raport' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── TODAY ─── */}
      {activeTab === 'today' && (
        <div className="px-4 mt-4 space-y-4">
          {/* Total card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <Banknote className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-black font-mono tabular-nums">{formatCurrency(todayTotal)}</p>
                <p className="text-xs text-gray-400">{(todayEntries as any[]).length} înregistrări azi</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => exportCsv(todayEntries, `cash-${todayISO()}.csv`)}
                title="Export CSV"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
            {Object.entries(todayByType).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(todayByType).map(([type, amount]) => (
                  <span key={type} className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${TYPE_COLORS[type] ?? TYPE_COLORS.MANUAL}`}>
                    {TYPE_LABELS[type] ?? type}: {String(amount)} RON
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Entries */}
          {todayLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />)}</div>
          ) : (todayEntries as any[]).length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">Nicio înregistrare azi</div>
          ) : (
            <div className="space-y-2">
              {(todayEntries as any[]).map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{entry.athlete_name || '—'}</p>
                    <p className="text-xs text-gray-400">
                      <span className={`inline rounded-full px-1.5 py-0.5 text-[10px] font-semibold border ${TYPE_COLORS[entry.type] ?? TYPE_COLORS.MANUAL}`}>
                        {TYPE_LABELS[entry.type] ?? entry.type}
                      </span>
                      <span className="ml-1.5">{entry.created_by_coach}</span>
                      {entry.note && <span className="ml-1.5 text-gray-300">· {entry.note}</span>}
                    </p>
                  </div>
                  <span className="ml-3 font-mono text-base font-bold text-emerald-600 tabular-nums flex-shrink-0">+{entry.amount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── HISTORY ─── */}
      {activeTab === 'history' && (
        <div className="px-4 mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>

          {histTotal > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <span className="text-sm text-gray-500">Total {historyDate}</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tabular-nums text-gray-900">{formatCurrency(histTotal)}</span>
                <Button size="sm" variant="ghost" onClick={() => exportCsv(historyEntries, `cash-${historyDate}.csv`)}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {historyLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />)}</div>
          ) : (historyEntries as any[]).length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">Nicio înregistrare pentru această dată</div>
          ) : (
            <div className="space-y-2">
              {(historyEntries as any[]).map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{entry.athlete_name || '—'}</p>
                    <p className="text-xs text-gray-400">
                      <span className={`inline rounded-full px-1.5 py-0.5 text-[10px] font-semibold border ${TYPE_COLORS[entry.type] ?? TYPE_COLORS.MANUAL}`}>
                        {TYPE_LABELS[entry.type] ?? entry.type}
                      </span>
                      <span className="ml-1.5">{entry.created_by_coach}</span>
                    </p>
                  </div>
                  <span className="ml-3 font-mono text-base font-bold text-emerald-600 tabular-nums flex-shrink-0">+{entry.amount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── REPORT ─── */}
      {activeTab === 'report' && (
        <div className="px-4 mt-4 space-y-4">
          {reportLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}</div>
          ) : monthlySummary.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">Nicio înregistrare în ultimele 3 luni</div>
          ) : (
            <div className="space-y-3">
              {monthlySummary.map((month) => {
                const isExpanded = expandedMonth === month.key;
                return (
                  <div key={month.key} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpandedMonth(isExpanded ? null : month.key)}
                      className="w-full flex items-center justify-between px-4 py-4"
                    >
                      <div className="text-left">
                        <p className="text-base font-bold text-gray-900">{getMonthLabel(month.year, month.month)}</p>
                        <p className="text-xs text-gray-400">{month.entries.length} înregistrări</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black tabular-nums text-emerald-600">{formatCurrency(month.total)}</span>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 pb-4">
                        {/* By coach */}
                        <div className="mt-3 mb-2">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Pe antrenor</p>
                          <div className="space-y-1">
                            {Object.entries(month.byCoach).map(([coachName, amount]) => (
                              <div key={coachName} className="flex justify-between text-sm">
                                <span className="text-gray-600">{coachName}</span>
                                <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(Number(amount))}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* By type */}
                        <div className="mt-3 mb-2">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Pe tip</p>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(month.byType).map(([type, amount]) => (
                              <span key={type} className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${TYPE_COLORS[type] ?? TYPE_COLORS.MANUAL}`}>
                                {TYPE_LABELS[type] ?? type}: {Number(amount)} RON
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => exportCsv(month.entries, `cash-${month.key}.csv`)}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Export CSV — {getMonthLabel(month.year, month.month)}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── ADD MANUAL SHEET ─── */}
      <Sheet open={addSheetOpen} onOpenChange={setAddSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Înregistrare manuală</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Nume sportiv</label>
              <Input
                placeholder="ex: Popescu Ion"
                value={manualAthleteName}
                onChange={(e) => setManualAthleteName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Suma (RON)</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="ex: 80"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Notă (opțional)</label>
              <Input
                placeholder="ex: ședință suplimentară"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
              />
            </div>
            <Button
              className="w-full h-12"
              disabled={addManual.isPending}
              onClick={() => addManual.mutate()}
            >
              <Banknote className="h-4 w-4 mr-2" />
              Înregistrează {manualAmount ? `${manualAmount} RON` : ''}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
