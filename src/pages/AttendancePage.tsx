import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useCoach } from '@/hooks/useCoach';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Timer, AlertTriangle, Settings, ChevronLeft, ChevronRight, X } from 'lucide-react';
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
  const expires = String(expiresISO).includes('T')
    ? new Date(String(expiresISO)).getTime()
    : new Date(`${expiresISO}T00:00:00`).getTime();
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


function formatDateRo(dateISO: string) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const months = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
  const days = ['Duminică','Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă'];
  const dow = new Date(y, m - 1, d).getDay();
  return `${days[dow]} ${d} ${months[m - 1] ?? ''}`;
}


function HistoryCalendar({ month, athleteId, athletes }: { month: string; athleteId: string; athletes: any[] }) {
  const { data: entriesRaw } = useQuery({
    queryKey: ['history-entries', month, athleteId],
    queryFn: async () => {
      let q = (supabase.from('attendance_entries' as any) as any)
        .select('athlete_id, present, attendance_days!inner(date)')
        .gte('attendance_days.date', month + '-01')
        .lte('attendance_days.date', month + '-31');
      if (athleteId) q = q.eq('athlete_id', athleteId);
      const { data } = await q;
      return data ?? [];
    },
    staleTime: 30000,
  });
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay();
  const totalPerDate: Record<string, number> = {};
  (entriesRaw ?? []).forEach((e: any) => {
    const date = e.attendance_days?.date;
    if (!date || !e.present) return;
    totalPerDate[date] = (totalPerDate[date] ?? 0) + 1;
  });
  const todayStr = new Date().toISOString().split('T')[0];
  const weekDays = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa'];
  const trainingDays = Object.keys(totalPerDate).length;
  const totalPresences = Object.values(totalPerDate).reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
        ))}
        {Array.from({ length: (firstDow + 6) % 7 }).map((_, i) => <div key={'e'+i} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = month + '-' + String(day).padStart(2, '0');
          const count = totalPerDate[dateStr] ?? 0;
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;
          return (
            <div key={day} className={['flex flex-col items-center justify-center rounded-lg py-1.5 min-h-[40px] text-sm font-semibold',
              isToday ? 'ring-2 ring-primary' : '',
              count > 0 ? 'bg-emerald-500/20 text-emerald-700' : isPast ? 'text-muted-foreground/40' : 'text-foreground/60',
            ].join(' ')}>
              <span>{day}</span>
              {count > 0 && <span className="text-[9px] font-black text-emerald-600 leading-none">{count}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/50 py-2"><div className="text-xl font-black text-emerald-500">{trainingDays}</div><div className="text-[10px] text-muted-foreground">Zile antren.</div></div>
        <div className="rounded-xl bg-muted/50 py-2"><div className="text-xl font-black text-blue-500">{totalPresences}</div><div className="text-[10px] text-muted-foreground">Total prezențe</div></div>
        <div className="rounded-xl bg-muted/50 py-2"><div className="text-xl font-black">{athletes.length}</div><div className="text-[10px] text-muted-foreground">Sportivi</div></div>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const { coach } = useCoach();
  const [coachPhotoUrl] = useState<string | null>(() => localStorage.getItem('coach_photo_url') ?? 'https://i.ibb.co/99vDChQW/daniela.png');

  // UI preferences (persisted)
  type SortMode = 'FIRST' | 'SECOND';
  type StructureFilter = 'ALL' | 'MAI' | 'MAPN';

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('attendance_dark_mode') === 'true');

  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const v = localStorage.getItem('attendance_sort_mode');
    return (v === 'FIRST' || v === 'SECOND') ? (v as SortMode) : 'FIRST';
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

  // Load all preferences from Supabase when coach is known
  useEffect(() => {
    if (!coach) return;
    supabase
      .from('coach_preferences' as any)
      .select('sort_mode, structure_filter, show_badges, dark_mode, text_size, hide_valid_subs')
      .eq('coach_id', coach)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if (data.sort_mode === 'FIRST' || data.sort_mode === 'SECOND') setSortMode(data.sort_mode as any);
        if (data.structure_filter === 'ALL' || data.structure_filter === 'MAI' || data.structure_filter === 'MAPN') setStructureFilter(data.structure_filter as any);
        if (typeof data.show_badges === 'boolean') setShowBadges(data.show_badges);
        if (typeof data.dark_mode === 'boolean') setDarkMode(data.dark_mode);
        if (data.text_size === 'sm' || data.text_size === 'md' || data.text_size === 'lg') setTextSize(data.text_size as any);
        if (typeof data.hide_valid_subs === 'boolean') setHideValidSubs(data.hide_valid_subs);
      });
  }, [coach]);

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
  const [needsAttentionDismissed, setNeedsAttentionDismissed] = useState(true);
  // Flash ! icon until user opens it for the first time today
  const [attentionFlashDone, setAttentionFlashDone] = useState(() =>
    localStorage.getItem('attention_flash_done_date') === today()
  );
  const [dismissedAttentionIds, setDismissedAttentionIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showBadges, setShowBadges] = useState(() => localStorage.getItem('attendance_show_badges') !== 'false');
  const [textSize, setTextSize] = useState<'sm'|'md'|'lg'>(() => (localStorage.getItem('attendance_text_size') as any) ?? 'md');
  const [hideValidSubs, setHideValidSubs] = useState(() => localStorage.getItem('attendance_hide_valid_subs') !== 'false');
  useEffect(() => {
    localStorage.setItem('attendance_show_badges', String(showBadges));
    localStorage.setItem('attendance_dark_mode', String(darkMode));
    localStorage.setItem('attendance_text_size', textSize);
    localStorage.setItem('attendance_hide_valid_subs', String(hideValidSubs));
    if (!coach) return;
    supabase
      .from('coach_preferences' as any)
      .upsert({ coach_id: coach, show_badges: showBadges, dark_mode: darkMode, text_size: textSize, hide_valid_subs: hideValidSubs }, { onConflict: 'coach_id' })
      .then(({ error }) => { if (error) console.warn('prefs save:', error.message); });
  }, [showBadges, darkMode, textSize, hideValidSubs, coach]);
  const [showBottomBtn, setShowBottomBtn] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMonth, setHistoryMonth] = useState<string>(() => today().slice(0, 7));
  const [historyAthleteId, setHistoryAthleteId] = useState<string>("");
  const longPressTimer = useRef<Record<string, number>>({});
  const [forcedCash, setForcedCash] = useState<Set<string>>(new Set());
  const lastScrollY = useRef(0);
  const scrollTimerRef = useRef<number | null>(null);

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

  // Check for existing timing session (duplicate session detection)
  const { data: existingTimingSession } = useQuery({
    queryKey: ['timing-session-check', today()],
    queryFn: async () => {
      const { data } = await supabase.from('timing_sessions').select('id, created_at').eq('date', today()).maybeSingle();
      return data;
    },
    refetchInterval: 20000,
  });



  // Get athletes with subs and entries
  const { data: athletes = [] } = useQuery({
    queryKey: ['attendance-athletes', attendanceDay?.id],
    enabled: !!attendanceDay,
    queryFn: async () => {
      const { data: allAthletes, error: aErr } = await supabase
        .from('athletes')
        .select('*, subscriptions(*), athlete_badges(badge_definition_id, badge_definitions(icon, name, category))')
        .eq('archived', false)
        .order('full_name');
      if (aErr) throw aErr;

      const { data: entries, error: eErr } = await supabase.from('attendance_entries').select('*').eq('attendance_day_id', attendanceDay!.id);
      if (eErr) throw eErr;

      const entryMap = new Map((entries || []).map((e: any) => [e.athlete_id, e]));

      return (allAthletes || []).map((a: any) => ({
        ...a,
        entry: entryMap.get(a.id),
        badges: (a.athlete_badges ?? []).map((b: any) => b.badge_definitions).filter(Boolean),
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

  const needsAttention = useMemo(() => {
    const list = filteredAthletes.filter((a: any) => {
      const c = a.payment_mode !== 'PER_SESSION' ? getSubStatus(getLatestSub(a, 'COACHING')?.expires_at) : 'none';
      const g = getSubStatus(getLatestSub(a, 'GYM')?.expires_at);
      const cExp = getLatestSub(a, 'COACHING')?.expires_at;
      const gExp = getLatestSub(a, 'GYM')?.expires_at;
      const cToday = cExp ? String(cExp).slice(0,10) === today() : false;
      const gToday = gExp ? String(gExp).slice(0,10) === today() : false;
      // Include: expired or expires today
      // Also include expiring-soon ONLY if the other sub is expired
      const cSoon = c === 'expiring' && !cToday && g === 'expired';
      const gSoon = g === 'expiring' && !gToday && c === 'expired';
      return c === 'expired' || g === 'expired' || cToday || gToday || cSoon || gSoon;
    });
    // Sort: both expired > coaching expired > gym expired > expiring today > expiring soon
    return list.sort((a: any, b: any) => {
      const score = (x: any) => {
        const c = x.payment_mode !== 'PER_SESSION' ? getSubStatus(getLatestSub(x, 'COACHING')?.expires_at) : 'none';
        const g = getSubStatus(getLatestSub(x, 'GYM')?.expires_at);
        if (c === 'expired' && g === 'expired') return 0;
        if (c === 'expired') return 1;
        if (g === 'expired') return 2;
        return 3;
      };
      return score(a) - score(b);
    });
  }, [filteredAthletes]);

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

      const wasPerSession = athlete?.payment_mode === 'PER_SESSION';
      if (wasPerSession && kind === 'COACHING') {
        const ok = window.confirm(`${athleteName} este setat(ă) "la ședință". Dacă adaugi abonament COACHING, îl(o) vom trece pe tip de plată "Abonament". Continui?`);
        if (!ok) throw new Error('__CANCELLED_RENEW__');
      }


      const { data: insertedSub, error: subErr } = await supabase
        .from('subscriptions')
        .insert(
          {
            athlete_id: athleteId,
            kind,
            starts_at,
            expires_at,
            price_lei: priceLei,
            created_by_coach: coach!,
          } as any,
        )
        .select()
        .single();

      if (subErr) throw subErr;

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

        // If athlete was PER_SESSION and we add COACHING subscription, switch to SUBSCRIPTION mode
        if (wasPerSession && kind === 'COACHING') {
          const { error: pmErr } = await supabase
            .from('athletes')
            .update({ payment_mode: 'SUBSCRIPTION' } as any)
            .eq('id', athleteId);
          if (pmErr) {
            console.warn('payment_mode update failed:', pmErr.message);
          } else {
            toast.message(`${athleteName} a fost trecut(ă) pe tip de plată Abonament. Pentru a reveni la la ședință, intră în pagina Sportivi.`);
          }
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
    onError: (e: any) => {
      if (e?.message === '__CANCELLED_RENEW__') return;
      toast.error(e?.message ?? 'Eroare reînnoire');
    },
  });

  const presentCount = filteredAthletes.filter((a: any) => a.entry?.present).length;

  // Race counts: timed (1000/2000) vs don't time (NONE)
  const presentAthletes = filteredAthletes.filter((a: any) => a.entry?.present);
  const count1000 = presentAthletes.filter((a: any) => String(a.default_race ?? '').includes('1000')).length;
  const count2000 = presentAthletes.filter((a: any) => String(a.default_race ?? '').includes('2000')).length;
  const countNone = presentAthletes.filter((a: any) => !String(a.default_race ?? '').includes('1000') && !String(a.default_race ?? '').includes('2000')).length;

  // Filter by search
  const searchFiltered = useMemo(() => {
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}+/gu, '');
    return sorted.filter((a: any) => {
      const name = String(a.full_name ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}+/gu, '');
      return name.includes(q);
    });
  }, [sorted, searchQuery]);

  // Grouped A-Z list (stable: hooks above render)
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const l of LETTERS) map.set(l, []);
    for (const a of searchFiltered as any[]) {
            const letter = normalizeLetter(getSortKey(a));
      map.get(letter)!.push(a);
    }
    return map;
  }, [sorted]);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeLetter, setActiveLetter] = useState<(typeof LETTERS)[number]>('A');
  const { show: showIndex, setShow: setShowIndex } = useShowIndexOnFastScroll({ velocityThreshold: 0.8, hideDelayMs: 3000 });

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

  // Bottom button + tab bar hide/show on scroll
  useEffect(() => {
    let idleTimer: number | null = null;
    // Find tab bar: try common selectors
    const getTabBar = () => document.querySelector<HTMLElement>('#bottom-nav');

    const showTabBar = () => {
      const tb = getTabBar(); if (tb) tb.style.transform = '';
    };
    const hideTabBar = () => {
      const tb = getTabBar(); if (tb) tb.style.transform = 'translateY(100%)';
    };

    const resetIdle = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => { setShowBottomBtn(true); }, 5000);
    };
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 10) {
        setShowBottomBtn(true);
        showTabBar();
        if (idleTimer) window.clearTimeout(idleTimer);
        return;
      }
      setShowBottomBtn(false);
      hideTabBar();
      lastScrollY.current = y;
      resetIdle();
    };
    const onTouch = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => { setShowBottomBtn(true); }, 5000);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', onTouch);
      if (idleTimer) window.clearTimeout(idleTimer);
      showTabBar(); // restore on unmount
    };
  }, []);

  const scrollToLetter = (l: (typeof LETTERS)[number]) => {
    const el = sectionRefs.current[l];
    if (!el) return;
    const top = window.scrollY + el.getBoundingClientRect().top - 120;
    window.scrollTo({ top, behavior: 'auto' });
    setActiveLetter(l);
  };

  return (
    <>
    <style>{`@keyframes exclamFlash { 0%,100% { color: rgb(156 163 175 / 0.4); } 50% { color: rgb(249 115 22); } }`}</style>
    <div className={["pb-24 min-h-screen transition-colors duration-200", darkMode ? "bg-[#1a1f2e] text-[#e2e8f0]" : ""].join(" ")}>
      <div className={["sticky top-0 z-30 border-b border-border/40 backdrop-blur", darkMode ? "bg-[#1a1f2e]/95" : "bg-background/95"].join(" ")}>
      <div className="relative">
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center gap-2">
            {/* Coach avatar */}
            <div className="w-12 h-12 rounded-full flex-shrink-0 border-2 border-border overflow-hidden bg-muted flex items-center justify-center">
              {coachPhotoUrl
                ? <img src={coachPhotoUrl} alt={coach ?? ''} className="w-full h-full object-cover" />
                : <span className="text-sm font-bold text-muted-foreground">{String(coach ?? '?')[0].toUpperCase()}</span>
              }
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-bold leading-tight">
                Prezență {formatDateRo(today())}
              </div>
              <div className="text-[15px] text-muted-foreground font-semibold leading-tight">
                {coach ?? ''}
                {presentCount > 0 && <>
                  {count1000 > 0 && <> · <span className="text-emerald-500 font-black">{count1000}</span></>}
                  {count2000 > 0 && <> · <span className="text-teal-400 font-black">{count2000}</span></>}
                  {countNone > 0 && <> · <span className="text-foreground/45 font-black">{countNone}</span></>}
                </>}
                {presentCount === 0 && <> · 0 prezenți</>}
              </div>
            </div>
          </div>
        </div>
        <div className="absolute right-2 top-1.5 flex items-center gap-0.5">
          {/* AB toggle: ON=show subs, OFF=hide subs */}
          <button
            type="button"
            onClick={() => setHideValidSubs(v => !v)}
            className="flex items-center h-8 px-1.5 gap-1.5"
            title={hideValidSubs ? "Afișează abonamentele valabile" : "Ascunde abonamentele valabile"}
          >
            <span className={["text-[9px] font-bold leading-none transition-colors", hideValidSubs ? "text-muted-foreground/35" : "text-foreground/60"].join(" ")}>AB</span>
            <div className={["w-9 h-5 rounded-full relative transition-all duration-200 flex-shrink-0",
              hideValidSubs
                ? "bg-foreground/15 shadow-inner"
                : "bg-foreground/30 shadow-[inset_0_1px_3px_rgba(0,0,0,0.25),0_1px_0_rgba(255,255,255,0.15)]"
            ].join(" ")}>
              <div className={["absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 bg-gradient-to-b from-white to-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.8)]",
                hideValidSubs ? "translate-x-0.5" : "translate-x-[18px]"
              ].join(" ")} />
            </div>
          </button>
          {/* ! icon — always visible when needs attention has items */}
          {needsAttention.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setNeedsAttentionDismissed(false);
                setShowNeedsAttention(true);
                if (!attentionFlashDone) {
                  localStorage.setItem('attention_flash_done_date', today());
                  setAttentionFlashDone(true);
                }
              }}
              className={[
                "h-8 w-6 flex items-center justify-center transition-colors",
                needsAttentionDismissed && !attentionFlashDone
                  ? "animate-[exclamFlash_1s_ease-in-out_infinite]"
                  : needsAttentionDismissed
                    ? "text-muted-foreground/40 hover:text-warning"
                    : "text-warning"
              ].join(" ")}
              title="Arată 'Necesită atenție'"
            >
              <span className="text-2xl font-black leading-none">!</span>
            </button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSettingsOpen(true)}
            title="Setări listă"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
      {/* Search bar */}
      <div className="px-3 pb-1.5">
        <div className="relative">
          <input
            type="search"
            placeholder="Caută sportiv..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm pl-7 outline-none focus:ring-2 focus:ring-primary/30"
          />
          <span className="absolute left-2.5 top-2.5 text-muted-foreground text-xs">🔍</span>
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2 text-muted-foreground text-lg leading-none">×</button>
          )}
        </div>
      </div>

      </div>
      {needsAttention.length > 0 && !needsAttentionDismissed && (
        <div className={["mx-0 mb-2 border-b border-warning/30 bg-warning/5 overflow-hidden transition-all", showNeedsAttention ? "sticky top-0 z-10 backdrop-blur" : ""].join(" ")}>
          <div className="flex items-center gap-1 px-3 py-2 flex-wrap">
            <button onClick={() => setShowNeedsAttention(v => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-warning min-w-0 flex-1">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Necesită atenție</span>
              <span className="text-xs opacity-70 flex-shrink-0">{showNeedsAttention ? '▲' : '▼'}</span>
            </button>
            <div className="flex items-center gap-2 text-xs font-semibold flex-shrink-0">
              {(() => {
                const expC = needsAttention.filter((a: any) => getSubStatus(getLatestSub(a, 'COACHING')?.expires_at) === 'expired').length;
                const expG = needsAttention.filter((a: any) => getSubStatus(getLatestSub(a, 'GYM')?.expires_at) === 'expired').length;
                return <>
                  {expC > 0 && <span className="text-rose-600">AB:{expC}</span>}
                  {expG > 0 && <span className="text-orange-500">Sală:{expG}</span>}
                </>;
              })()}
            </div>
            <button onClick={() => setNeedsAttentionDismissed(true)}
              className="ml-1 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-warning/60 hover:text-warning hover:bg-warning/10 text-base leading-none">
              ×
            </button>
          </div>
          {showNeedsAttention && (
            <div className="px-3 pb-3 space-y-1.5 border-t border-warning/20 pt-2 max-h-48 overflow-y-auto">
              {needsAttention.filter((a: any) => {
                if (dismissedAttentionIds.has(a.id)) return false;
                const c = a.payment_mode !== 'PER_SESSION' ? getSubStatus(getLatestSub(a, 'COACHING')?.expires_at) : 'none';
                const g = getSubStatus(getLatestSub(a, 'GYM')?.expires_at);
                const cExp = getLatestSub(a, 'COACHING')?.expires_at;
                const gExp = getLatestSub(a, 'GYM')?.expires_at;
                const cToday = cExp ? String(cExp).slice(0,10) === today() : false;
                const gToday = gExp ? String(gExp).slice(0,10) === today() : false;
                return c === 'expired' || g === 'expired' || cToday || gToday;
              }).map((a: any) => {
                const c = a.payment_mode !== 'PER_SESSION' ? getSubStatus(getLatestSub(a, 'COACHING')?.expires_at) : 'none';
                const g = getSubStatus(getLatestSub(a, 'GYM')?.expires_at);
                const cExp = getLatestSub(a, 'COACHING')?.expires_at;
                const gExp = getLatestSub(a, 'GYM')?.expires_at;
                const cToday = cExp ? String(cExp).slice(0,10) === today() : false;
                const gToday = gExp ? String(gExp).slice(0,10) === today() : false;
                const icon = (c === 'expired' || g === 'expired') ? '🔴' : '🟠';
                const name = String(a.full_name ?? '');
                // Build grammatically correct Romanian sentence
                const expiredItems: string[] = [];
                if (c === 'expired') expiredItems.push('abonamentul');
                if (g === 'expired') expiredItems.push('sala');
                const todayItems: string[] = [];
                if (cToday && c !== 'expired') todayItems.push('abonamentul');
                if (gToday && g !== 'expired') todayItems.push('sala');
                const soonItems: string[] = [];
                if (c === 'expiring' && !cToday && g === 'expired') soonItems.push('abonamentul');
                if (g === 'expiring' && !gToday && c === 'expired') soonItems.push('sala');
                const allParts: string[] = [];
                if (expiredItems.length === 1) allParts.push(`i-a expirat ${expiredItems[0]}`);
                if (expiredItems.length > 1) allParts.push(`i-au expirat ${expiredItems.join(' și ')}`);
                if (todayItems.length) allParts.push(`îi expiră ${todayItems.join(' și ')} azi`);
                if (soonItems.length) allParts.push(`îi expiră ${soonItems.join(' și ')} în curând`);
                const sentence = allParts.length === 1
                  ? `Lui ${name} ${allParts[0]}.`
                  : `Lui ${name} ${allParts.slice(0,-1).join(', ')} și ${allParts[allParts.length-1]}.`;
                return (
                  <div key={a.id} className="text-base flex items-center gap-2 py-0.5">
                    <span className="flex-shrink-0">{icon}</span>
                    <span className="text-amber-900 dark:text-amber-100 font-medium flex-1">{sentence}</span>
                    <button
                      onClick={() => setDismissedAttentionIds(prev => new Set([...prev, a.id]))}
                      className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-warning/40 hover:text-warning hover:bg-warning/10 text-sm leading-none"
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DUPLICATE SESSION BANNER ── */}


      <div className="px-4 space-y-3">
        {LETTERS.map((letter) => {
          const list = grouped.get(letter) ?? [];
          if (list.length === 0) return null;

          return (
            <div key={letter} ref={(el) => (sectionRefs.current[letter] = el)}>
               {letter !== 'A' && (
               <div className="sticky top-[92px] z-[5] -mx-4 px-3 border-b border-border/30 bg-transparent text-center">
                 <div className={["font-black transition-all duration-150 leading-none", letter === activeLetter ? "text-7xl py-1 text-foreground/50" : "text-[9px] text-foreground/25 py-0"].join(" ")}>{letter}</div>
               </div>
               )}

              <div className="space-y-0.5">
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
               onClick={() => { if (!longPressTimer.current[athlete.id]) togglePresent.mutate(athlete); }}
               onPointerDown={() => { longPressTimer.current[athlete.id] = window.setTimeout(() => { setForcedCash(s => { const n = new Set(s); n.add(athlete.id); return n; }); }, 2000); }}
               onPointerUp={() => { window.clearTimeout(longPressTimer.current[athlete.id]); longPressTimer.current[athlete.id] = 0; }}
               onPointerLeave={() => { window.clearTimeout(longPressTimer.current[athlete.id]); longPressTimer.current[athlete.id] = 0; }}
              className={[
                "relative flex items-center justify-between rounded px-1.5 py-1 transition-all cursor-pointer active:scale-[0.99]",
                isPresent ? "athlete-row-present" : active ? "athlete-row-should-present" : "athlete-row-default",
                darkMode && isPresent ? "!bg-[#1e3a2e] !border !border-emerald-700/40" : "",
                darkMode && !isPresent && active ? "!bg-[#1e2a3a] !border !border-blue-700/30" : "",
                darkMode && !isPresent && !active ? "!bg-[#242938] !border !border-gray-700" : "",
              ].join(" ")}
            >
              <div className="min-w-0 flex-1">
                <div className={["uppercase font-hand font-bold leading-tight", darkMode ? "text-[#c8d4e8]" : "text-foreground/80"].join(" ")}>
                  <span className={["block font-semibold truncate leading-none relative z-10", darkMode ? "text-[#8fa3bf]" : "text-foreground/70", textSize==="sm" ? "text-[14px] mb-0.5" : textSize==="lg" ? "text-[32px] mb-[-8px]" : "text-[25px] mb-[-6px]"].join(" ")}>{String(firstNames ?? '').toUpperCase()}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={["font-black tracking-wide leading-none", darkMode ? "text-[#dde6f0]" : "", textSize==="sm" ? "text-[20px]" : textSize==="lg" ? "text-[39px]" : "text-[30px]"].join(" ")}>{String(lastName ?? '').toUpperCase()}</span>
                    {!isPerSession && cStatus === 'expired' && (
                      <span className="text-rose-500 text-2xl font-black flex-shrink-0 leading-none">!</span>
                    )}
                    {gStatus === 'expired' && (
                      <span className="text-orange-400 text-2xl font-black flex-shrink-0 leading-none">!</span>
                    )}
                    {showBadges && (athlete.badges ?? []).slice(0, 5).map((b: any, i: number) => (
                      <span key={i} className="text-sm leading-none cursor-pointer flex-shrink-0"
                        title={b.name}
                        onClick={e => { e.stopPropagation(); navigate(`/athletes/${athlete.id}`); }}
                      >{b.icon ?? '🏅'}</span>
                    ))}
                  </div>
                </div>
                {isPerSession && (
                  <div className="absolute top-0 left-0 overflow-hidden w-8 h-8 pointer-events-none">
                    <div className="absolute top-[6px] left-[-10px] -rotate-45 bg-emerald-500/50 text-[7px] font-black text-white w-[36px] text-center leading-none py-[2px] select-none">CASH</div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="text-right text-[14px] leading-tight tabular-nums font-semibold"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenewSheet({ athleteId: athlete.id, athleteName: athlete.full_name });
                  }}
                  title={isPerSession ? 'Per ședință' : 'Tap pentru reînnoire'}
                >
                  {!isPerSession && (!hideValidSubs || cStatus === 'expired' || cStatus === 'expiring') && (
                    <div className={statusTextClass(cStatus)}>AB {cText}</div>
                  )}
                  {(!hideValidSubs || gStatus === 'expired' || gStatus === 'expiring') && (
                    <div className={statusTextClass(gStatus)}>Sală {gText}</div>
                  )}
                </div>

                {(isPerSession || forcedCash.has(athlete.id)) && isPresent && !isPaidSession && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-5 px-1.5 text-xs font-bold leading-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      paySession.mutate(athlete); setForcedCash(s => { const n = new Set(s); n.delete(athlete.id); return n; });
                    }}
                  >
                    80
                  </Button>
                )}

                {/* Quick renewal buttons (show when needs renewal) */}
                {isPresent && (
                  <>
                    {(gStatus === 'expired' || gStatus === 'expiring' || gStatus === 'none') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-5 px-1.5 text-xs font-bold leading-none"
                        disabled={renewSub.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          renewSub.mutate({ athleteId: athlete.id, kind: 'GYM', priceLei: 120, athleteName: athlete.full_name });
                        }}
                      >
                        120
                      </Button>
                    )}
                    {!isPerSession && (cStatus === 'expired' || cStatus === 'expiring' || cStatus === 'none') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-5 px-1.5 text-xs font-bold leading-none"
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
          className="fixed right-1 top-2 bottom-14 z-30 rounded-full bg-background/25 backdrop-blur border border-border/30 px-0.5 py-1 shadow-sm flex flex-col"
          style={{ touchAction: 'none' }}
          onPointerMove={(e) => {
            if (e.buttons === 0) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const y = e.clientY - rect.top;
            const idx = Math.floor((y / rect.height) * LETTERS.length);
            const l = LETTERS[Math.max(0, Math.min(LETTERS.length - 1, idx))];
            scrollToLetter(l);
          }}
        >
          <div className="flex flex-col items-center justify-between w-full flex-1 min-h-0 overflow-hidden">
            {LETTERS.map((l) => {
              const has = (grouped.get(l) ?? []).length > 0;
              const isActive = l === activeLetter;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={!has}
                  className={`w-7 flex-1 flex items-center justify-center rounded font-black transition-all duration-100 ${
                    !has
                      ? 'opacity-20 text-foreground/30 text-[12px]'
                      : isActive
                        ? 'text-foreground/90 text-[20px] scale-110'
                        : 'text-foreground/60 text-[15px]'
                  }`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (has) scrollToLetter(l);
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>
          <button
            onPointerDown={(e) => { e.stopPropagation(); window.scrollTo({ top: 0, behavior: 'auto' }); }}
            className="mt-0.5 w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full mx-auto transition-all active:scale-90 active:opacity-60"
            style={{ background: 'linear-gradient(180deg,#374151 0%,#1f2937 100%)', boxShadow: '0 1px 0 #111827, inset 0 1px 0 rgba(255,255,255,0.12)' }}
            title="Înapoi sus"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>
      )}

      <div className={[
        "fixed bottom-16 left-0 right-0 px-4 pb-2 transition-all duration-300 z-40",
        showBottomBtn ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0 pointer-events-none"
      ].join(" ")}>
         <button
           onClick={() => { if (presentCount > 0) setConfirmFinalize(true); }}
           disabled={presentCount === 0}
           className={["w-full h-14 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98]",
             presentCount === 0 ? "opacity-50 cursor-not-allowed" : "",
           ].join(" ")}
           style={{
             background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 55%, #1e3fba 100%)',
             boxShadow: '0 2px 0 #1730a0, 0 8px 28px rgba(29,78,216,0.6), inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -3px 0 rgba(0,0,0,0.22)',
           }}
         >
           <Timer className="h-6 w-6 flex-shrink-0 text-white" />
           <span className="text-xl font-black tracking-wide text-white">Finalizează</span>
           <span className="text-sm font-semibold text-blue-200 ml-1">({count1000 + count2000}{countNone > 0 ? `+${countNone}` : ''})</span>
         </button>
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

                  // Award attendance badges
                  try {
                    await supabase.rpc('award_attendance_badges' as any, { p_attendance_day_id: attendanceDay.id });
                  } catch (badgeErr) {
                    console.warn('award_attendance_badges failed (non-critical):', badgeErr);
                  }

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

            <div>
              <div className="text-sm font-semibold mb-2">Aspect pagină</div>
              <button type="button" onClick={() => setDarkMode(v => !v)}
                className={["flex items-center justify-between w-full rounded-xl border-2 px-4 py-3 transition-colors",
                  darkMode ? "border-blue-500 bg-[#1a1f2e] text-[#e2e8f0]" : "border-border bg-background text-foreground"].join(" ")}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{darkMode ? "🌙" : "☀️"}</span>
                  <div className="text-left">
                    <div className="text-sm font-bold">{darkMode ? "Dark" : "Light"}</div>
                    <div className="text-xs opacity-60">{darkMode ? "Fundal închis, text deschis" : "Fundal deschis, text închis"}</div>
                  </div>
                </div>
                <div className={["w-12 h-6 rounded-full transition-colors relative flex-shrink-0", darkMode ? "bg-blue-500" : "bg-gray-300"].join(" ")}>
                  <div className={["absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform", darkMode ? "translate-x-7" : "translate-x-1"].join(" ")} />
                </div>
              </button>
            </div>
            <div>
              <div className="text-sm font-semibold mb-2">Badge-uri în listă</div>
              <button type="button" onClick={() => setShowBadges(v => !v)}
                className={["flex items-center justify-between w-full rounded-xl border-2 px-4 py-3 transition-colors",
                  showBadges ? "border-emerald-500 bg-emerald-50" : "border-border bg-background"].join(" ")}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🏅</span>
                  <div className="text-left">
                    <div className="text-sm font-bold">{showBadges ? "Badge-uri vizibile" : "Badge-uri ascunse"}</div>
                    <div className="text-xs opacity-60">Afișează simbolurile în card</div>
                  </div>
                </div>
                <div className={["w-12 h-6 rounded-full transition-colors relative flex-shrink-0", showBadges ? "bg-emerald-500" : "bg-gray-300"].join(" ")}>
                  <div className={["absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform", showBadges ? "translate-x-7" : "translate-x-1"].join(" ")} />
                </div>
              </button>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Dimensiune text</div>
              <div className="flex gap-2">
                {(["sm","md","lg"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setTextSize(s)}
                    className={["flex-1 rounded-xl border-2 py-2 text-sm font-bold transition-colors",
                      textSize === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    ].join(" ")}
                  >{s==="sm" ? "↓ Mai mic" : s==="lg" ? "↑ Mai mare" : "◎ Mediu"}</button>
                ))}
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <Button type="button" variant="outline" className="w-full justify-start gap-2"
                onClick={() => { setHistoryOpen(true); setSettingsOpen(false); }}>
                📅 Istoric prezențe
              </Button>
            <Button type="button" className="w-full" onClick={() => setSettingsOpen(false)}>Închide</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto p-0">
          <SheetHeader className="sticky top-0 z-10 bg-background border-b px-4 py-3">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">Istoric Prezențe</SheetTitle>
              <button onClick={() => setHistoryOpen(false)} className="p-1 rounded-md hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
          </SheetHeader>
          <div className="px-4 pt-3 pb-8 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Sportiv</label>
              <select className="w-full mt-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm outline-none"
                value={historyAthleteId} onChange={e => setHistoryAthleteId(e.target.value)}>
                <option value="">— Toți sportivii —</option>
                {(athletes as any[]).map((a: any) => (
                  <option key={a.id} value={a.id}>{a.full_name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <button className="p-2 rounded-lg hover:bg-muted" onClick={() => setHistoryMonth(mm => { const d = new Date(mm + '-01'); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })}><ChevronLeft className="w-5 h-5" /></button>
              <span className="font-bold text-base">{new Date(historyMonth + '-01').toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })}</span>
              <button className="p-2 rounded-lg hover:bg-muted" onClick={() => setHistoryMonth(mm => { const d = new Date(mm + '-01'); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7); })}><ChevronRight className="w-5 h-5" /></button>
            </div>
            <HistoryCalendar month={historyMonth} athleteId={historyAthleteId} athletes={athletes as any[]} />
          </div>
        </SheetContent>
      </Sheet>

    </>
  );
}
