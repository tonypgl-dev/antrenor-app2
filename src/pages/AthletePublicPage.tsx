import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AthleteAvatar from '@/components/AthleteAvatar';
import BadgeChip from '@/components/BadgeChip';
import RunnerTypeCard from '@/components/RunnerTypeCard';
import ProgressLineChart from '@/components/ProgressLineChart';
import { formatMmSs, formatDateShortRo, formatMs } from '@/lib/utils';
import { Zap } from 'lucide-react';

export default function AthletePublicPage() {
  const { id } = useParams<{ id: string }>();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['athlete-public', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_athlete_public_profile', {
        p_athlete_id: id!,
      });
      if (error) throw error;
      return data as {
        athlete?: any;
        statistics?: any;
        badges?: any[];
        recent_results?: any[];
      } | null;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Se încarcă profilul...</p>
        </div>
      </div>
    );
  }

  if (!profile?.athlete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-400">Profilul nu a putut fi găsit.</p>
        </div>
      </div>
    );
  }

  const { athlete, statistics: stats, badges = [], recent_results: results = [] } = profile;

  const progressPoints = results
    .filter((r: any) => r.result_ms)
    .map((r: any) => ({ date: r.recorded_at?.split('T')[0] ?? '', result_ms: r.result_ms, is_simulation: r.is_simulation }))
    .reverse();

  const CATEGORY_ORDER = ['DISCIPLINA', 'PROGRES', 'PACING', 'MENTALITATE', 'SIMULARE'] as const;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Top bar */}
      <div className="bg-indigo-600 px-4 py-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-white" />
        <span className="text-white text-sm font-bold">AthletiCoach</span>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-4 mt-4">
        {/* Hero */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <AthleteAvatar photoUrl={athlete.photo_url} name={athlete.full_name} size={80} />
            <div>
              <h1 className="text-2xl font-black text-gray-900">{athlete.full_name}</h1>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {athlete.structure && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-100">
                    {athlete.structure}
                  </span>
                )}
                {athlete.default_race && athlete.default_race !== 'NONE' && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                    {athlete.default_race}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Runner type */}
        <RunnerTypeCard runnerType={stats?.runner_type} />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: '🏆', label: 'Best timp', value: stats?.best_ms ? formatMmSs(stats.best_ms) : '—' },
            { icon: '📈', label: 'Îmbunătățire', value: stats?.improvement_percent ? `${Number(stats.improvement_percent).toFixed(1)}%` : '—' },
            { icon: '🔥', label: 'Streak', value: `${stats?.streak_days ?? 0} zile` },
            { icon: '📅', label: 'Prezențe 30z', value: String(stats?.attendance_30d ?? 0) },
          ].map((s, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">{s.icon} {s.label}</div>
              <div className="text-xl font-black tabular-nums text-gray-900">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Progress chart */}
        {progressPoints.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-3">📈 Progres în timp</h3>
            <ProgressLineChart points={progressPoints} targetMs={270000} />
          </div>
        )}

        {/* Recent results */}
        {results.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="px-4 pt-4 pb-2 text-sm font-bold text-gray-800">Ultimele curse</div>
            <div className="divide-y divide-gray-50">
              {results.slice(0, 5).map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-sm font-bold tabular-nums text-gray-900">{formatMmSs(r.result_ms)}</span>
                    {r.is_simulation && (
                      <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">SIM</span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">{formatDateShortRo(r.recorded_at?.split('T')[0])}</div>
                    {r.pcs != null && <div className="text-xs text-indigo-500">PCS {r.pcs}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-3">🏅 Badge-uri câștigate</h3>
            <div className="space-y-3">
              {CATEGORY_ORDER.filter(cat => badges.some((b: any) => b.category === cat)).map(cat => (
                <div key={cat}>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{cat}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {badges.filter((b: any) => b.category === cat).map((b: any, i: number) => (
                      <BadgeChip key={i} icon={b.icon ?? '🏅'} name={b.name} category={b.category} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-2 pb-4">
          <div className="flex items-center justify-center gap-1.5">
            <Zap className="h-3 w-3" />
            <span>AthletiCoach — Antrenamente MAI / MAPN / ISU</span>
          </div>
        </div>
      </div>
    </div>
  );
}
