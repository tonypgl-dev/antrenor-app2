import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Banknote } from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];

const TYPE_LABELS: Record<string, string> = {
  PER_SESSION: 'Ședință',
  COACHING: 'Coaching',
  GYM: 'Gym',
};

export default function CashPage() {
  const { data: entries = [] } = useQuery({
    queryKey: ['cash-today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_ledger')
        .select('*')
        .eq('date', today())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const total = entries.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const byType = entries.reduce((acc: any, e: any) => {
    acc[e.type] = (acc[e.type] || 0) + Number(e.amount);
    return acc;
  }, {});

  return (
    <div className="pb-20">
      <PageHeader title="Cash Azi" subtitle={`${entries.length} încasări`} />

      <div className="mx-4 mb-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
            <Banknote className="h-5 w-5 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{total} RON</p>
            <p className="text-xs text-muted-foreground">Total azi</p>
          </div>
        </div>
        <div className="flex gap-4">
          {Object.entries(byType).map(([type, amount]) => (
            <div key={type} className="text-xs">
              <span className="text-muted-foreground">{TYPE_LABELS[type] || type}: </span>
              <span className="font-semibold">{String(amount)} RON</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-1.5">
        {entries.map((entry: any) => (
          <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div>
              <p className="text-sm font-medium">{entry.athlete_name || 'N/A'}</p>
              <p className="text-xs text-muted-foreground">
                {TYPE_LABELS[entry.type]} · {entry.created_by_coach}
              </p>
            </div>
            <span className="font-mono text-sm font-bold text-success">+{entry.amount}</span>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">Nicio încasare azi</p>
        )}
      </div>
    </div>
  );
}
