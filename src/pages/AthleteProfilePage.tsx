import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCoach } from '@/hooks/useCoach';
import PageHeader from '@/components/PageHeader';
import AthleteAvatar from '@/components/AthleteAvatar';
import BadgeChip from '@/components/BadgeChip';
import RunnerTypeCard from '@/components/RunnerTypeCard';
import SplitBarChart from '@/components/SplitBarChart';
import ProgressLineChart from '@/components/ProgressLineChart';
import AttendanceHeatmap from '@/components/AttendanceHeatmap';
import AdmissionEstimator from '@/components/AdmissionEstimator';
import { formatMmSs, formatDateShortRo, formatMs, getSubStatus, todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, Edit, Share2, Download, Trophy, TrendingUp,
  Flame, Target, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react';

const CATEGORY_ORDER = ['DISCIPLINA', 'PROGRES', 'PACING', 'MENTALITATE', 'SIMULARE'] as const;

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-[11px] font-medium text-gray-400">{label}</span>
      </div>
      <div className="text-xl font-black tabular-nums text-gray-900">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AthleteProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { coach } = useCoach();
  const qc = useQueryClient();
  const [activeChart, setActiveChart] = useState<'splits' | 'progress'>('progress');
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [comparingWith, setComparingWith] = useState<string | null>(null);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Athlete data
  const { data: athlete, isLoading: loadingAthlete } = useQuery({
    queryKey: ['athlete', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('*, subscriptions(*)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Analysis from RPC
  const { data: analysis } = useQuery({
    queryKey: ['athlete-analysis', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_athlete_analysis', {
        p_athlete_id: id!,
        p_preset_id: null,
      });
      if (error) throw error;
      return data as {
        statistics?: any;
        recent_results?: any[];
        badges?: any[];
      } | null;
    },
  });

  // Attendance for heatmap
  const { data: attendanceData } = useQuery({
    queryKey: ['athlete-attendance-heatmap', id],
    enabled: !!id,
    queryFn: async () => {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 84);
      const fromDate = threeMonthsAgo.toISOString().split('T')[0];

      const [{ data: entries }, { data: days }] = await Promise.all([
        supabase
          .from('attendance_entries')
          .select('attendance_day_id, present')
          .eq('athlete_id', id!),
        supabase
          .from('attendance_days')
          .select('id, date')
          .gte('date', fromDate!),
      ]);

      const entryMap = new Map<string, boolean>();
      for (const e of entries ?? []) entryMap.set(e.attendance_day_id, e.present);

      return (days ?? []).map((day: any) => ({
        date: day.date as string,
        wasTrainingDay: true,
        present: entryMap.has(day.id) ? entryMap.get(day.id)! : false,
      }));
    },
  });

  // All athletes for comparison
  const { data: allAthletes = [] } = useQuery({
    queryKey: ['athletes-for-compare'],
    queryFn: async () => {
      const { data } = await supabase
        .from('athletes')
        .select('id, full_name, photo_url')
        .eq('archived', false)
        .order('full_name');
      return data ?? [];
    },
  });

  const { data: compareAnalysis } = useQuery({
    queryKey: ['athlete-analysis', comparingWith],
    enabled: !!comparingWith,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_athlete_analysis', {
        p_athlete_id: comparingWith!,
        p_preset_id: null,
      });
      if (error) throw error;
      return data as { statistics?: any; recent_results?: any[] } | null;
    },
  });

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploadingPhoto(true);
    try {
      const path = `${id}/${Date.now()}.jpg`;
      const { data: uploaded, error: upErr } = await supabase.storage
        .from('athlete-photos')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage
        .from('athlete-photos')
        .getPublicUrl(uploaded.path);

      const { error: upAthlErr } = await supabase
        .from('athletes')
        .update({ photo_url: publicUrl } as any)
        .eq('id', id);
      if (upAthlErr) throw upAthlErr;

      qc.invalidateQueries({ queryKey: ['athlete', id] });
      toast.success('Fotografie actualizată!');
    } catch (err: any) {
      toast.error(err?.message ?? 'Eroare upload foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleExportPdf() {
    // Dynamic import to avoid loading PDF lib until needed
    try {
      const { default: exportAthletePdf } = await import('@/lib/pdfExport');
      await exportAthletePdf({ athlete, analysis });
      toast.success('PDF generat!');
    } catch (err: any) {
      toast.error('Eroare la generarea PDF: ' + (err?.message ?? 'necunoscut'));
    }
  }

  if (loadingAthlete) {
    return (
      <div className="pb-20">
        <PageHeader title="Profil sportiv" backButton={
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-400"><ArrowLeft className="h-5 w-5" /></button>
        } />
        <div className="px-4 space-y-3 mt-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="pb-20">
        <PageHeader title="Profil sportiv" backButton={
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-400"><ArrowLeft className="h-5 w-5" /></button>
        } />
        <div className="px-4 mt-8 text-center text-gray-400">Sportivul nu a fost găsit.</div>
      </div>
    );
  }

  const stats = analysis?.statistics;
  const recentResults: any[] = analysis?.recent_results ?? [];
  const badges: any[] = analysis?.badges ?? [];

  const lastResultSplits: number[] = (() => {
    try {
      const last = recentResults[0];
      if (!last?.splits_json) return [];
      const parsed = typeof last.splits_json === 'string' ? JSON.parse(last.splits_json) : last.splits_json;
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();

  const progressPoints = recentResults
    .filter((r: any) => r.result_ms)
    .map((r: any) => ({ date: r.recorded_at?.split('T')[0] ?? '', result_ms: r.result_ms, is_simulation: r.is_simulation }))
    .reverse();

  const badgesByCategory = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = badges.filter((b: any) => b.category === cat);
    return acc;
  }, {} as Record<string, any[]>);

  const subsList: any[] = (athlete as any).subscriptions ?? [];
  const coachingSub = subsList.filter((s: any) => String(s.kind ?? '').toUpperCase() === 'COACHING')
    .sort((a: any, b: any) => (b.expires_at ?? '').localeCompare(a.expires_at ?? ''))[0];
  const gymSub = subsList.filter((s: any) => ['GYM', 'FACILITY'].includes(String(s.kind ?? '').toUpperCase()))
    .sort((a: any, b: any) => (b.expires_at ?? '').localeCompare(a.expires_at ?? ''))[0];

  const cStatus = getSubStatus(coachingSub?.expires_at);
  const gStatus = getSubStatus(gymSub?.expires_at);

  const compareAthlete = allAthletes.find((a: any) => a.id === comparingWith);

  return (
    <div className="pb-24">
      <PageHeader
        title={athlete.full_name}
        subtitle={`${athlete.structure ?? ''} · ${athlete.default_race ?? 'NONE'}`}
        backButton={
          <button onClick={() => navigate('/athletes')} className="p-1 -ml-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
        action={
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => navigate(`/athletes/${id}/public`)} title="Pagina publică">
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleExportPdf} title="Descarcă PDF">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="px-4 space-y-4 mt-3">
        {/* ─── HERO ─── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="relative flex-shrink-0">
              <AthleteAvatar photoUrl={athlete.photo_url} name={athlete.full_name} size={72} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs shadow-sm hover:bg-indigo-700"
                title="Schimbă poza"
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? '…' : <Edit className="h-3 w-3" />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-gray-900 leading-tight">{athlete.full_name}</h2>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
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
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold border ${
                  cStatus === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  cStatus === 'expiring' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                  'bg-rose-50 text-rose-600 border-rose-100'
                }`}>
                  Coaching: {coachingSub?.expires_at ? formatDateShortRo(coachingSub.expires_at) : '—'}
                </span>
              </div>

              {/* Recent badges */}
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {badges.slice(0, 5).map((b: any, i: number) => (
                    <BadgeChip key={i} icon={b.icon ?? '🏅'} name={b.name} category={b.category} size="sm" />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => navigate('/athletes', { state: { editId: id } })}
            >
              <Edit className="h-3.5 w-3.5 mr-1" /> Editează
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const url = `${window.location.origin}/athletes/${id}/public`;
                navigator.share?.({ url }) ?? navigator.clipboard?.writeText(url);
                toast.success('Link copiat!');
              }}
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* ─── RUNNER TYPE ─── */}
        <RunnerTypeCard runnerType={stats?.runner_type} />

        {/* ─── QUICK STATS ─── */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon="🏆" label="Best timp" value={stats?.best_ms ? formatMmSs(stats.best_ms) : '—'} />
          <StatCard icon="📈" label="Îmbunătățire" value={stats?.improvement_percent ? `${Number(stats.improvement_percent).toFixed(1)}%` : '—'} />
          <StatCard icon="🔥" label="Streak" value={stats?.streak_days ? `${stats.streak_days}z` : '0z'} sub="zile consecutive" />
          <StatCard icon="🎯" label="PCS mediu" value={stats?.avg_pcs_last5 ? `${Number(stats.avg_pcs_last5).toFixed(0)}` : '—'} sub="ultimele 5 curse" />
        </div>

        {/* ─── ADMISSION ESTIMATOR ─── */}
        <AdmissionEstimator
          bestMs={stats?.best_ms}
          improvementPercent={stats?.improvement_percent}
          totalRuns={stats?.total_runs}
        />

        {/* ─── CHARTS ─── */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveChart('progress')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeChart === 'progress' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'
              }`}
            >
              📈 Progres
            </button>
            <button
              onClick={() => setActiveChart('splits')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeChart === 'splits' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'
              }`}
            >
              📊 Splits
            </button>
          </div>
          <div className="p-3">
            {activeChart === 'progress' ? (
              <ProgressLineChart points={progressPoints} targetMs={270000} />
            ) : (
              <SplitBarChart splits={lastResultSplits} idealLapMs={stats?.best_ms ? stats.best_ms / 5.5 : undefined} hasHalfFirst={true} />
            )}
          </div>
        </div>

        {/* ─── COACHING MESSAGES (last 5 results) ─── */}
        {recentResults.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="px-4 pt-4 pb-2 font-bold text-gray-800 text-sm">Analiza curselor recente</div>
            <div className="divide-y divide-gray-50">
              {recentResults.slice(0, 5).map((result: any, i: number) => {
                const isExpanded = expandedResult === result.id;
                const splits: number[] = (() => {
                  try {
                    const p = typeof result.splits_json === 'string' ? JSON.parse(result.splits_json) : result.splits_json;
                    return Array.isArray(p) ? p : [];
                  } catch { return []; }
                })();

                const messages: { type: 'warn' | 'ok' | 'info'; text: string }[] = [];
                if (splits.length >= 3) {
                  const avg = splits.reduce((a, b) => a + b, 0) / splits.length;
                  const first = splits[0]!;
                  const last = splits[splits.length - 1]!;
                  if (first < avg * 0.92) messages.push({ type: 'warn', text: 'Ai plecat prea tare' });
                  if (last > avg * 1.12) messages.push({ type: 'warn', text: 'Ai căzut pe final' });
                  if (last < avg * 0.92) messages.push({ type: 'ok', text: 'Final Kick excelent 🦶' });
                  if ((result.pcs ?? 0) >= 90) messages.push({ type: 'ok', text: 'Ritm excelent 🎵' });
                  if ((result.pcs ?? 100) < 60) messages.push({ type: 'info', text: 'Ritm instabil — lucrează pe pace ⚡' });
                }

                return (
                  <div key={result.id ?? i} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-bold tabular-nums text-gray-900">
                          {formatMmSs(result.result_ms)}
                        </span>
                        {result.is_simulation && (
                          <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">SIM</span>
                        )}
                        <span className="ml-2 text-xs text-gray-400">{formatDateShortRo(result.recorded_at?.split('T')[0])}</span>
                        {result.pcs != null && (
                          <span className="ml-2 text-xs text-indigo-500 font-medium">PCS {result.pcs}</span>
                        )}
                      </div>
                      <button
                        onClick={() => setExpandedResult(isExpanded ? null : result.id)}
                        className="text-gray-300 hover:text-gray-500"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {messages.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {messages.map((msg, mi) => (
                          <div key={mi} className={`flex items-center gap-1.5 text-xs ${
                            msg.type === 'warn' ? 'text-amber-700' :
                            msg.type === 'ok' ? 'text-emerald-700' : 'text-blue-700'
                          }`}>
                            <span>{msg.type === 'warn' ? '⚠️' : msg.type === 'ok' ? '✅' : '⚡'}</span>
                            <span>{msg.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isExpanded && splits.length > 0 && (
                      <div className="mt-2 grid grid-cols-4 gap-1">
                        {splits.map((ms: number, si: number) => (
                          <div key={si} className="rounded-lg bg-gray-50 border border-gray-100 p-1.5 text-center">
                            <div className="text-[9px] text-gray-400 font-semibold">{si === 0 ? '½' : `T${si}`}</div>
                            <div className="text-xs font-bold tabular-nums text-gray-800">{formatMs(ms)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── ATTENDANCE HEATMAP ─── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-3">📅 Prezență (12 săptămâni)</h3>
          <AttendanceHeatmap entries={attendanceData ?? []} weeks={12} />
          <div className="mt-2 flex gap-4 text-xs text-gray-500">
            <span>Total prezențe: <strong>{stats?.attendance_30d ?? 0}</strong> / 30 zile</span>
            <span>Streak: <strong>{stats?.streak_days ?? 0}</strong> zile</span>
          </div>
        </div>

        {/* ─── BADGES ─── */}
        {badges.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800">🏅 Badge-uri ({badges.length})</h3>
              <button
                onClick={() => setShowAllBadges(!showAllBadges)}
                className="text-xs text-indigo-600 font-medium"
              >
                {showAllBadges ? 'Mai puțin' : 'Toate'}
              </button>
            </div>
            <div className="space-y-3">
              {CATEGORY_ORDER.filter(cat => badgesByCategory[cat]?.length > 0).map(cat => (
                <div key={cat}>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{cat}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(showAllBadges ? badgesByCategory[cat] : badgesByCategory[cat]?.slice(0, 4))?.map((b: any, i: number) => (
                      <BadgeChip key={i} icon={b.icon ?? '🏅'} name={b.name} category={b.category} />
                    ))}
                    {!showAllBadges && (badgesByCategory[cat]?.length ?? 0) > 4 && (
                      <span className="text-xs text-gray-400 self-center">+{badgesByCategory[cat]!.length - 4}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── COMPARAȚIE SPORTIVI ─── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-3">⚖️ Comparație</h3>
          <select
            value={comparingWith ?? ''}
            onChange={(e) => setComparingWith(e.target.value || null)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-400"
          >
            <option value="">Alege un sportiv pentru comparație...</option>
            {(allAthletes as any[]).filter((a: any) => a.id !== id).map((a: any) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>

          {comparingWith && compareAnalysis && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: '🏆 Best timp', v1: stats?.best_ms ? formatMmSs(stats.best_ms) : '—', v2: compareAnalysis.statistics?.best_ms ? formatMmSs(compareAnalysis.statistics.best_ms) : '—' },
                { label: '📈 Îmbunătățire', v1: stats?.improvement_percent ? `${Number(stats.improvement_percent).toFixed(1)}%` : '—', v2: compareAnalysis.statistics?.improvement_percent ? `${Number(compareAnalysis.statistics.improvement_percent).toFixed(1)}%` : '—' },
                { label: '🔥 Streak', v1: `${stats?.streak_days ?? 0}z`, v2: `${compareAnalysis.statistics?.streak_days ?? 0}z` },
                { label: '🎯 PCS', v1: stats?.avg_pcs_last5 ? `${Number(stats.avg_pcs_last5).toFixed(0)}` : '—', v2: compareAnalysis.statistics?.avg_pcs_last5 ? `${Number(compareAnalysis.statistics.avg_pcs_last5).toFixed(0)}` : '—' },
              ].map((row, i) => (
                <div key={i} className="rounded-xl bg-gray-50 border border-gray-100 p-2">
                  <div className="text-[10px] text-gray-400 mb-1">{row.label}</div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-indigo-600">{row.v1}</span>
                    <span className="text-gray-400 text-xs self-center">vs</span>
                    <span className="text-gray-700">{row.v2}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span className="truncate max-w-[80px]">{athlete.full_name.split(' ').pop()}</span>
                    <span className="truncate max-w-[80px] text-right">{compareAthlete?.full_name?.split(' ')?.pop?.() ?? '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── SUBSCRIPTION INFO ─── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-3">💳 Abonamente</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
              <span className="text-sm text-gray-600">Coaching</span>
              <span className={`text-sm font-semibold ${
                cStatus === 'active' ? 'text-emerald-600' :
                cStatus === 'expiring' ? 'text-amber-600' : 'text-rose-600'
              }`}>
                {coachingSub?.expires_at ? formatDateShortRo(coachingSub.expires_at) : 'Fără abonament'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
              <span className="text-sm text-gray-600">Sală / Teren</span>
              <span className={`text-sm font-semibold ${
                gStatus === 'active' ? 'text-emerald-600' :
                gStatus === 'expiring' ? 'text-amber-600' : 'text-rose-600'
              }`}>
                {gymSub?.expires_at ? formatDateShortRo(gymSub.expires_at) : 'Fără abonament'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
