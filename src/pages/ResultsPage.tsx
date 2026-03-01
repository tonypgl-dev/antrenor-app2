import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import LeaderboardRow from '@/components/LeaderboardRow';
import BadgeChip from '@/components/BadgeChip';
import AthleteAvatar from '@/components/AthleteAvatar';
import { formatMmSs } from '@/lib/utils';

type Tab = 'leaderboard' | 'badges' | 'simulations';

const LEADERBOARD_TYPES = [
  { key: 'best_time',    label: '🏆 Best timp',        format: (v: any) => v?.best_ms ? formatMmSs(v.best_ms) : '—' },
  { key: 'improvement',  label: '📈 Îmbunătățit',      format: (v: any) => v?.improvement_percent ? `${Number(v.improvement_percent).toFixed(1)}%` : '—' },
  { key: 'pcs',          label: '🎯 Consistență',       format: (v: any) => v?.avg_pcs_last5 ? `PCS ${Number(v.avg_pcs_last5).toFixed(0)}` : '—' },
  { key: 'attendance',   label: '📅 Prezențe',          format: (v: any) => `${v?.attendance_30d ?? 0} zile` },
  { key: 'streak',       label: '🔥 Streak',            format: (v: any) => `${v?.streak_days ?? 0}z` },
  { key: 'finish_rate',  label: '💪 Fighter',           format: (v: any) => v?.finish_rate ? `${(Number(v.finish_rate) * 100).toFixed(0)}%` : '—' },
] as const;

const PRESETS_LABELS: Record<string, string> = { all: 'Toate', '1000m': '1000m', '2000m': '2000m' };

export default function ResultsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard');
  const [lbType, setLbType] = useState<string>('best_time');
  const [preset, setPreset] = useState<string>('all');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Fetch presets for filter
  const { data: presets = [] } = useQuery({
    queryKey: ['race-presets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('race_presets').select('*').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  // Leaderboard data
  const { data: leaderboardRaw, isLoading: lbLoading } = useQuery({
    queryKey: ['leaderboard', lbType, preset],
    enabled: activeTab === 'leaderboard',
    queryFn: async () => {
      const presetId = preset !== 'all'
        ? presets.find((p: any) => p.name === preset)?.id ?? null
        : null;
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_type: lbType,
        p_preset_id: presetId,
        p_period: 'all',
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Monthly badges leaderboard
  const { data: badgesLb, isLoading: bdLoading } = useQuery({
    queryKey: ['monthly-badges', currentYear, currentMonth],
    enabled: activeTab === 'badges',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_monthly_badge_leaderboard', {
        p_year: currentYear,
        p_month: currentMonth,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Simulations leaderboard — fetch directly
  const { data: simResults, isLoading: simLoading } = useQuery({
    queryKey: ['simulation-results'],
    enabled: activeTab === 'simulations',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_results')
        .select('athlete_id, result_ms, recorded_at, race_preset_id, athletes!inner(id, full_name, photo_url, structure)')
        .eq('is_simulation', true)
        .eq('is_abandoned', false)
        .order('result_ms', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Group simulation results by athlete - best per athlete
  const simLeaderboard = (() => {
    const byAthlete = new Map<string, any>();
    for (const r of simResults ?? []) {
      const existing = byAthlete.get(r.athlete_id);
      if (!existing || r.result_ms < existing.result_ms) {
        byAthlete.set(r.athlete_id, r);
      }
    }
    return [...byAthlete.values()].sort((a, b) => a.result_ms - b.result_ms);
  })();

  const currentLbConfig = LEADERBOARD_TYPES.find(t => t.key === lbType)!;
  const leaderboard = (leaderboardRaw ?? []).filter((r: any) => r != null);

  return (
    <div className="pb-24">
      <PageHeader title="Rezultate" subtitle="Clasamente și badge-uri" />

      {/* Tab selector */}
      <div className="flex border-b border-gray-200 bg-white">
        {([
          { key: 'leaderboard', label: '🏆 Clasament' },
          { key: 'badges', label: '🏅 Badge-uri' },
          { key: 'simulations', label: '🎮 Simulări' },
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

      {/* ─── LEADERBOARD TAB ─── */}
      {activeTab === 'leaderboard' && (
        <div className="px-4 mt-4 space-y-4">
          {/* Type selector */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {LEADERBOARD_TYPES.map(t => (
              <button
                key={t.key}
                onClick={() => setLbType(t.key)}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  lbType === t.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Preset filter */}
          <div className="flex gap-2">
            {['all', ...presets.map((p: any) => p.name)].map(p => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  preset === p
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {PRESETS_LABELS[p] ?? p}
              </button>
            ))}
          </div>

          {/* List */}
          {lbLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />)}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">Nicio dată disponibilă</div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((row: any, i: number) => (
                <LeaderboardRow
                  key={row.id ?? i}
                  position={i + 1}
                  name={row.full_name ?? '—'}
                  structure={row.structure}
                  photoUrl={row.photo_url}
                  value={currentLbConfig.format(row)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── BADGES TAB ─── */}
      {activeTab === 'badges' && (
        <div className="px-4 mt-4 space-y-4">
          <div className="text-sm font-semibold text-gray-500">
            {new Date().toLocaleString('ro-RO', { month: 'long', year: 'numeric' })} — cele mai multe badge-uri
          </div>

          {bdLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div>
          ) : (badgesLb ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">Niciun badge acordat luna aceasta</div>
          ) : (
            <div className="space-y-3">
              {(badgesLb ?? []).map((row: any, i: number) => (
                <div key={row.id ?? i} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-7 text-center flex-shrink-0">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-sm font-bold text-gray-400">#{i + 1}</span>}
                    </div>
                    <AthleteAvatar photoUrl={row.photo_url} name={row.full_name} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{row.full_name}</p>
                      <p className="text-xs text-indigo-600 font-bold">{row.badge_count} badge-uri</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 pl-10">
                    {(Array.isArray(row.badges) ? row.badges : []).slice(0, 6).map((b: string, bi: number) => (
                      <span key={bi} className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5 font-medium border border-indigo-100">{b}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── SIMULATIONS TAB ─── */}
      {activeTab === 'simulations' && (
        <div className="px-4 mt-4 space-y-3">
          <div className="text-sm font-semibold text-gray-500">Best timp simulare per sportiv</div>

          {simLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />)}</div>
          ) : simLeaderboard.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">Nicio simulare înregistrată</div>
          ) : (
            <div className="space-y-2">
              {simLeaderboard.map((row: any, i: number) => (
                <LeaderboardRow
                  key={row.athlete_id}
                  position={i + 1}
                  name={(row.athletes as any)?.full_name ?? '—'}
                  structure={(row.athletes as any)?.structure}
                  photoUrl={(row.athletes as any)?.photo_url}
                  value={formatMmSs(row.result_ms)}
                  subValue={row.recorded_at ? new Date(row.recorded_at).toLocaleDateString('ro-RO') : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
