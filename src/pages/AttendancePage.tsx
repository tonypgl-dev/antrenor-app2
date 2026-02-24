import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useCoach } from '@/hooks/useCoach';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Timer, AlertTriangle, Settings } from 'lucide-react';
import { addDays, addMonths, format, parseISO, subDays } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const today = () => new Date().toISOString().split('T')[0];

function normalizeLetter(s: string) {
  const base = String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .trim()
    .toUpperCase();
  const ch = base[0] ?? '#';
  return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

function useShowIndexOnFastScroll(options?: { velocityThreshold?: number; hideDelayMs?: number }) {
  const velocityThreshold = options?.velocityThreshold ?? 0.8; // px/ms
  const hideDelayMs = options?.hideDelayMs ?? 800;

  const [show, setShow] = useState(false);
  const lastYRef = useRef<number | null>(null);
  const lastTRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const t = performance.now();

      const lastY = lastYRef.current;
      const lastT = lastTRef.current;

      if (lastY != null && lastT != null) {
        const dy = Math.abs(y - lastY);
        const dt = Math.max(1, t - lastT);
        const v = dy / dt;
        if (v >= velocityThreshold) setShow(true);

        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => setShow(false), hideDelayMs);
      }

      lastYRef.current = y;
      lastTRef.current = t;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [velocityThreshold, hideDelayMs]);

  return { show, setShow };
}

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'] as const;

function formatShortRo(dateISO?: string | null) {
  if (!dateISO) return '';
  const [y, m, d] = String(dateISO).split('-').map((x) => Number(x));
  if (!y || !m || !d) return '';
  const months = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];
  return `${d} ${months[m - 1] ?? ''}`.trim();
}

type SubStatus = 'none' | 'valid' | 'expiring' | 'expired';

function getSubStatus(expiresISO?: string | null): SubStatus {
  if (!expiresISO) return 'none';
  const expires = new Date(`${expiresISO}T00:00:00`).getTime();
  if (!Number.isFinite(expires)) return 'none';
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((expires - todayMidnight) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 4) return 'expiring';
  return 'valid';
}

function statusTextClass(s: SubStatus) {
  if (s === 'valid') return 'text-emerald-600';
  if (s === 'expiring') return 'text-orange-500';
  if (s === 'expired') return 'text-rose-600';
  return 'text-muted-foreground';
}

function kindSafe(kind: any): 'COACHING' | 'GYM' | 'UNKNOWN' {
  const k = String(kind ?? '').toUpperCase();
  if (k === 'COACHING') return 'COACHING';
  if (k === 'GYM' || k === 'FACILITY') return 'GYM';
  return 'UNKNOWN';
}

export default function AttendancePage() {
  const { coach } = useCoach();

  // UI preferences (persisted)
  type SortMode = 'FIRST' | 'SECOND';
  type StructureFilter = 'ALL' | 'MAI' | 'MAPN';

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const v = localStorage.getItem('attendance_sort_mode');
    return (v === 'FIRST' || v === 'SECOND') ? (v as SortMode) : 'SECOND';
  });
  const [structureFilter, setStructureFilter] = useState<StructureFilter>(() => {
    const v = localStorage.getItem('attendance_structure_filter');
    return (v === 'ALL' || v === 'MAI' || v === 'MAPN') ? (v as StructureFilter) : 'ALL';
  });

  useEffect(() => {
    localStorage.setItem('attendance_sort_mode', sortMode);
  }, [sortMode]);

  useEffect(() => {
    localStorage.setItem('attendance_structure_filter', structureFilter);
  }, [structureFilter]);

  const getSortKey = (athlete: any) => {
    const name = String(athlete?.full_name ?? '').trim();
    if (!name) return '';
    if (sortMode === 'FIRST') return name;
    const parts = name.split(/\s+/);
    const last = parts[parts.length - 1] ?? '';
    const rest = parts.slice(0, -1).join(' ');
    return `${last} ${rest}`.trim();
  };


  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [paymentOverlay, setPaymentOverlay] = useState<{ name: string; amount: number } | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [renewSheet, setRenewSheet] = useState<{ athleteId: string; athleteName: string } | null>(null);
  const [showNeedsAttention, setShowNeedsAttention] = useState(true);

  // Ensure attendance day exists
  const { data: attendanceDay } = useQuery({
    queryKey: ['attendance-day', today()],
    queryFn: async () => {
      const { data: existing } = await supabase.from('attendance_days').select('*').eq('date', today()).maybeSingle();
      if (existing) return existing;
      const { data, error } = await supabase.from('attendance_days').insert({ date: today(), status: 'DRAFT' }).select().single();
      if (error) throw error;
      return data;
    },
  });

  // Get athletes with subs and entries
  const { data: athletes = [] } = useQuery({
    queryKey: ['attendance-athletes', attendanceDay?.id],
    enabled: !!attendanceDay,
    queryFn: async () => {
      const { data: allAthletes, error: aErr } = await supabase
        .from('athletes')
        .select('*, subscriptions(*)')
        .eq('archived', false)
        .order('full_name');
      if (aErr) throw aErr;

      const { data: entries, error: eErr } = await supabase.from('attendance_entries').select('*').eq('attendance_day_id', attendanceDay!.id);
      if (eErr) throw eErr;

      const entryMap = new Map((entries || []).map((e: any) => [e.athlete_id, e]));

      return (allAthletes || []).map((a: any) => ({
        ...a,
        entry: entryMap.get(a.id),
      }));
    },
  });

  // Latest sub by kind
  const getLatestSub = (athlete: any, kind: 'COACHING' | 'GYM') => {
    const subs = (athlete.subscriptions || []).filter((s: any) => kindSafe(s.kind) === kind);
    if (!subs.length) return null;
    return subs.sort((a: any, b: any) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())[0];
  };

  const hasActiveSub = (athlete: any) => {
    const c = getLatestSub(athlete, 'COACHING');
    const g = getLatestSub(athlete, 'GYM');
    const cStatus = getSubStatus(c?.expires_at);
    const gStatus = getSubStatus(g?.expires_at);
    return cStatus === 'valid' || cStatus === 'expiring' || gStatus === 'valid' || gStatus === 'expiring';
  };

  // Structure filter (uses athletes.structure)
  type StructureTag = 'MAI' | 'MAPN' | 'OTHER';
  const getStructureTag = (athlete: any): StructureTag => {
    const raw = String(athlete?.structure ?? '').toUpperCase().trim();
    if (raw === 'MAI') return 'MAI';
    if (raw === 'MAPN') return 'MAPN';
    return 'OTHER';
  };

  const filteredAthletes = useMemo(() => {
    if (structureFilter === 'ALL') return athletes;
    return athletes.filter((a: any) => getStructureTag(a) === structureFilter);
  }, [athletes, structureFilter]);

  const sorted = [...filteredAthletes].sort((a: any, b: any) => {
    const aActive = hasActiveSub(a);
    const bActive = hasActiveSub(b);
    const aPerSession = a.payment_mode === 'PER_SESSION';
    const bPerSession = b.payment_mode === 'PER_SESSION';

    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    if (!aActive && !bActive) {
      if (aPerSession && !bPerSession) return -1;
      if (!aPerSession && bPerSession) return 1;
    }
    return getSortKey(a).localeCompare(getSortKey(b), 'ro', { sensitivity: 'base' });
  });

  const needsAttention = filteredAthletes.filter((a: any) => {
    if (a.payment_mode === 'PER_SESSION') return false;
    const c = getSubStatus(getLatestSub(a, 'COACHING')?.expires_at);
    const g = getSubStatus(getLatestSub(a, 'GYM')?.expires_at);
    return c === 'expired' || c === 'expiring' || g === 'expired' || g === 'expiring';
  });

  const togglePresent = useMutation({
    mutationFn: async (athlete: any) => {
      const existing = athlete.entry;
      if (existing) {
        const { error } = await supabase.from('attendance_entries').update({ present: !existing.present, created_by_coach: coach }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('attendance_entries').insert({
          attendance_day_id: attendanceDay!.id,
          athlete_id: athlete.id,
          present: true,
          created_by_coach: coach,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance-athletes'] }),
    onError: (e: any) => toast.error(e?.message ?? 'Eroare prezență'),
  });

  const paySession = useMutation({
    mutationFn: async (athlete: any) => {
      const { error: cErr } = await supabase.from('cash_ledger').insert({
        athlete_id: athlete.id,
        athlete_name: athlete.full_name,
        type: 'PER_SESSION',
        amount: 80,
        date: today(),
        created_by_coach: coach!,
      } as any);
      if (cErr) throw cErr;

      const { error: eErr } = await supabase
        .from('attendance_entries')
        .update({ session_paid: true })
        .eq('attendance_day_id', attendanceDay!.id)
        .eq('athlete_id', athlete.id);
      if (eErr) throw eErr;
    },
    onSuccess: (_, athlete) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-athletes'] });
      setPaymentOverlay({ name: athlete.full_name, amount: 80 });
      setTimeout(() => setPaymentOverlay(null), 1200);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Eroare plată'),
  });

  const renewSub = useMutation({
    mutationFn: async ({ athleteId, kind, priceLei, athleteName }: { athleteId: string; kind: 'COACHING' | 'GYM'; priceLei: number; athleteName: string }) => {
      // Monthly rule (calendar month - 1 day):
      // start = today OR (latest expires + 1 day if still valid)
      // end = addMonths(start, 1) - 1 day
      const t = parseISO(today());

      const athlete = athletes.find((a: any) => a.id === athleteId);
      const latest = athlete ? getLatestSub(athlete, kind) : null;

      const wasPerSession = athlete?.payment_mode === 'PER_SESSION';

      let start = t;
      if (latest?.expires_at) {
        const expires = parseISO(String(latest.expires_at));
        // if expires today or later, extend from the next day
        if (String(latest.expires_at) >= today()) {
          start = addDays(expires, 1);
        }
      }

      const end = subDays(addMonths(start, 1), 1);

      const starts_at = format(start, 'yyyy-MM-dd');
      const expires_at = format(end, 'yyyy-MM-dd');

      if (!coach) throw new Error('Selectează coach-ul înainte de a reînnoi.');

      const { data: insertedSub, error: subErr } = await supabase
        .from('subscriptions')
        .insert(
          {
            athlete_id: athleteId,
            type: kind,
            kind,
            starts_at,
            start_date: starts_at,
            expires_at,
            ends_at: expires_at,
            amount: priceLei,
            price_lei: priceLei,
            created_by_coach: coach!,
          } as any,
        )
        .select()
        .single();

      if (subErr) throw subErr;

      // If athlete is PER_SESSION, do not auto-switch payment mode when adding subscriptions
      if (wasPerSession) {
        const { error: pmErr } = await supabase.from('athletes').update({ payment_mode: 'PER_SESSION' } as any).eq('id', athleteId);
        if (pmErr) console.warn('payment_mode restore failed:', pmErr.message);
      }

      if (insertedSub) {
        const todayISO = new Date().toISOString().slice(0, 10);

        const { error: cashErr } = await supabase
          .from('cash_ledger')
          .upsert(
            {
              athlete_id: insertedSub.athlete_id,
              athlete_name: athleteName,
              // relies on DB column + unique(subscription_id)
              subscription_id: insertedSub.id,
              type: (insertedSub as any).kind ?? insertedSub.type ?? 'SUBSCRIPTION',
              amount:
                (insertedSub as any).price_lei ??
                (insertedSub as any).price ??
                insertedSub.amount,
              date: todayISO,
              note: 'subscription',
              created_by_coach: coach!,
            } as any,
            { onConflict: 'subscription_id' },
          );

        if (cashErr) {
          console.warn('cash_ledger upsert failed:', cashErr.message);
          toast.error('Cash insert: ' + (cashErr.message ?? 'eroare necunoscută'));
        }
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-athletes'] });
      queryClient.invalidateQueries({ queryKey: ['athletes'] });
      queryClient.invalidateQueries({ queryKey: ['subs-history'] });
      queryClient.invalidateQueries({ queryKey: ['cash-ledger'] });
      setRenewSheet(null);
      setPaymentOverlay({ name: vars.athleteName || '', amount: vars.priceLei });
      setTimeout(() => setPaymentOverlay(null), 1200);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Eroare reînnoire'),
  });

  const presentCount = filteredAthletes.filter((a: any) => a.entry?.present).length;

  // Grouped A-Z list (stable: hooks above render)
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const l of LETTERS) map.set(l, []);
    for (const a of sorted as any[]) {
            const letter = normalizeLetter(getSortKey(a));
      map.get(letter)!.push(a);
    }
    return map;
  }, [sorted]);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeLetter, setActiveLetter] = useState<(typeof LETTERS)[number]>('A');
  const { show: showIndex, setShow: setShowIndex } = useShowIndexOnFastScroll({ velocityThreshold: 0.8, hideDelayMs: 800 });

  useEffect(() => {
    const onScroll = () => {
      let current: (typeof LETTERS)[number] = activeLetter;
      for (const l of LETTERS) {
        const el = sectionRefs.current[l];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= 140) current = l;
      }
      if (current !== activeLetter) setActiveLetter(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeLetter]);

  const scrollToLetter = (l: (typeof LETTERS)[number]) => {
    const el = sectionRefs.current[l];
    if (!el) return;
    const top = window.scrollY + el.getBoundingClientRect().top - 120;
    window.scrollTo({ top, behavior: 'auto' });
    setActiveLetter(l);
  };

  return (
    <div className="pb-24">
      <div className="relative">
        <PageHeader title="Prezență Azi" subtitle={`${presentCount} prezenți`} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 h-9 w-9"
          onClick={() => setSettingsOpen(true)}
          title="Setări listă"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {needsAttention.length > 0 && showNeedsAttention && (
        <div className="mx-4 mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <button onClick={() => setShowNeedsAttention(!showNeedsAttention)} className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" />
            Necesită atenție ({needsAttention.length})
          </button>
        </div>
      )}

      <div className="px-4 space-y-3">
        {LETTERS.map((letter) => {
          const list = grouped.get(letter) ?? [];
          if (list.length === 0) return null;

          return (
            <div key={letter} ref={(el) => (sectionRefs.current[letter] = el)}>
              <div className="sticky top-[92px] z-[5] -mx-4 px-4 py-1.5 bg-background/90 backdrop-blur border-b">
                <div className="text-xl font-bold text-foreground/80">{letter}</div>
              </div>

              <div className="space-y-1 mt-2">
                {list.map((athlete: any) => {
          const isPresent = athlete.entry?.present;
          const isPaidSession = athlete.entry?.session_paid;
          const isPerSession = athlete.payment_mode === 'PER_SESSION';
          const active = hasActiveSub(athlete);

          const coachingSub = getLatestSub(athlete, 'COACHING');
          const gymSub = getLatestSub(athlete, 'GYM');

          const cStatus = getSubStatus(coachingSub?.expires_at);
          const gStatus = getSubStatus(gymSub?.expires_at);

          const cText = coachingSub?.expires_at ? formatShortRo(coachingSub.expires_at) : '—';
          const gText = gymSub?.expires_at ? formatShortRo(gymSub.expires_at) : '—';

          const [lastName, ...rest] = String(athlete.full_name ?? '').trim().split(/\s+/).reverse();
          const firstNames = rest.reverse().join(' ');

          return (
            <div
              key={athlete.id}
              onClick={() => togglePresent.mutate(athlete)}
              className={`flex items-center justify-between rounded-lg p-3 transition-all cursor-pointer active:scale-[0.99] ${
                isPresent ? 'athlete-row-present' : active ? 'athlete-row-should-present' : 'athlete-row-default'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate uppercase text-foreground/80 font-hand font-bold leading-tight">
                  <span className="block text-base opacity-90">{String(firstNames ?? '').toUpperCase()}</span>
                  <span className="block text-2xl tracking-wide">{String(lastName ?? '').toUpperCase()}</span>
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{isPerSession ? '80/ședință' : 'Abon.'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="text-right text-[11px] leading-tight tabular-nums"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenewSheet({ athleteId: athlete.id, athleteName: athlete.full_name });
                  }}
                  title={isPerSession ? 'Per ședință' : 'Tap pentru reînnoire'}
                >
                  {!isPerSession && <div className={statusTextClass(cStatus)}>C: {cText}</div>}
                  <div className={statusTextClass(gStatus)}>F: {gText}</div>
                </div>

                {isPerSession && isPresent && !isPaidSession && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 px-3 text-xs font-bold"
                    onClick={(e) => {
                      e.stopPropagation();
                      paySession.mutate(athlete);
                    }}
                  >
                    80
                  </Button>
                )}

                {/* Renewal buttons (show when expired) */}
                {isPresent && (
                  <>
                    {gStatus === 'expired' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs font-bold"
                        disabled={renewSub.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          renewSub.mutate({ athleteId: athlete.id, kind: 'GYM', priceLei: 120, athleteName: athlete.full_name });
                        }}
                      >
                        120
                      </Button>
                    )}
                    {cStatus === 'expired' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs font-bold"
                        disabled={renewSub.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          renewSub.mutate({ athleteId: athlete.id, kind: 'COACHING', priceLei: 800, athleteName: athlete.full_name });
                        }}
                      >
                        800
                      </Button>
                    )}
                  </>
                )}

                {isPaidSession && <span className="text-xs font-semibold text-success">✓</span>}
              </div>
            </div>
          );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Alphabet quick scroll (shows only on fast scroll; tap/scrub supported) */}
      {showIndex && (
        <div
          className="fixed right-2 top-24 z-20 rounded-full bg-background/70 backdrop-blur border px-1 py-2 shadow-sm select-none"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            setShowIndex(true);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 0) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const y = e.clientY - rect.top;
            const idx = Math.floor((y / rect.height) * LETTERS.length);
            const l = LETTERS[Math.max(0, Math.min(LETTERS.length - 1, idx))];
            scrollToLetter(l);
          }}
        >
          <div className="flex flex-col items-center gap-0.5">
            {LETTERS.map((l) => {
              const has = (grouped.get(l) ?? []).length > 0;
              const isActive = l === activeLetter;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={!has}
                  className={`w-6 h-4 flex items-center justify-center rounded text-[11px] font-bold transition ${
                    !has
                      ? 'opacity-25'
                      : isActive
                        ? 'text-primary scale-125'
                        : 'text-foreground/70 hover:text-foreground'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToLetter(l);
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2">
        <Button className="w-full h-12 text-sm font-bold" onClick={() => setConfirmFinalize(true)} disabled={presentCount === 0}>
          <Timer className="mr-2 h-4 w-4" />
          Finalizează & Start Crono ({presentCount})
        </Button>
      </div>

      {paymentOverlay && (
        <div className="payment-overlay">
          <div className="text-center animate-payment-pop">
            <p className="text-5xl font-bold text-success">+{paymentOverlay.amount} RON</p>
            <p className="mt-2 text-lg text-muted-foreground">{paymentOverlay.name}</p>
          </div>
        </div>
      )}

      <AlertDialog open={confirmFinalize} onOpenChange={setConfirmFinalize}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start cronometrare?</AlertDialogTitle>
            <AlertDialogDescription>Pornești cronometrarea cu {presentCount} sportivi prezenți?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
  console.log("ATTENDANCE FINALIZE HANDLER V3");
  try {
                  if (!attendanceDay) return;

                  const { error: updErr } = await supabase
                    .from('attendance_days')
                    .update({ status: 'FINALIZED', finalized_by_coach: coach })
                    .eq('id', attendanceDay.id);
                  if (updErr) throw updErr;

                  const { data: existingSession, error: sErr } = await supabase.from('timing_sessions').select('*').eq('date', today()).maybeSingle();
                  if (sErr) throw sErr;

                  let timingSession = existingSession;
                  if (!timingSession) {
                    const { data: created, error: cErr } = await supabase
                      .from('timing_sessions')
                      .insert({
                        date: today(),
                        attendance_day_id: attendanceDay.id,
                        created_by_coach: coach!,
                      })
                      .select()
                      .single();
                    if (cErr) throw cErr;
                    timingSession = created;
                  }
                  toast.success('Prezență finalizată');

// 👉 trimitem în setup wizard
navigate(`/timing/setup?session=${timingSession.id}`);
return;
                } catch (err: any) {
                  console.error(err);
                  toast.error(err?.message || 'Eroare la finalizare prezență.');
                }
              }}
            >
              Start
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!renewSheet} onOpenChange={() => setRenewSheet(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Reînnoire abonament</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">{renewSheet?.athleteName}</p>
            <Button
              className="w-full justify-between"
              variant="outline"
              disabled={renewSub.isPending}
              onClick={() =>
                renewSub.mutate({ athleteId: renewSheet!.athleteId, kind: 'COACHING', priceLei: 800, athleteName: renewSheet!.athleteName })
              }
            >
              <span>Coaching</span>
              <span className="font-bold">800 RON</span>
            </Button>
            <Button
              className="w-full justify-between"
              variant="outline"
              disabled={renewSub.isPending}
              onClick={() => renewSub.mutate({ athleteId: renewSheet!.athleteId, kind: 'GYM', priceLei: 120, athleteName: renewSheet!.athleteName })}
            >
              <span>Gym / Teren</span>
              <span className="font-bold">120 RON</span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-[320px] sm:w-[360px]">
          <SheetHeader>
            <SheetTitle>Setări Prezență</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            <div>
              <div className="text-sm font-semibold mb-2">Sortare alfabetică</div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={sortMode === 'FIRST' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSortMode('FIRST')}
                >
                  Primul nume
                </Button>
                <Button
                  type="button"
                  variant={sortMode === 'SECOND' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSortMode('SECOND')}
                >
                  Al doilea nume
                </Button>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                A-Z indexul din dreapta urmează aceeași regulă de sortare.
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Filtru structură</div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={structureFilter === 'ALL' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setStructureFilter('ALL')}
                >
                  Toți
                </Button>
                <Button
                  type="button"
                  variant={structureFilter === 'MAI' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setStructureFilter('MAI')}
                >
                  MAI
                </Button>
                <Button
                  type="button"
                  variant={structureFilter === 'MAPN' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setStructureFilter('MAPN')}
                >
                  MAPN
                </Button>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Filtrarea folosește câmpul de structură din sportiv (MAI / MAPN).
              </div>
            </div>

            <div className="pt-2">
              <Button type="button" className="w-full" onClick={() => setSettingsOpen(false)}>
                Închide
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
