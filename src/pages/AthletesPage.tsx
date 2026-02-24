import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Archive } from 'lucide-react';
import AthleteForm from '@/components/AthleteForm';
import { useCoach } from '@/hooks/useCoach';
import { toast } from 'sonner';

function formatShortRo(dateISO?: string | null) {
  if (!dateISO) return '';
  const [y, m, d] = String(dateISO).split('-').map((x) => Number(x));
  if (!y || !m || !d) return '';
  const months = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];
  return `${d} ${months[m - 1]} ${String(y).slice(2)}`;
}

function dateOnlyNowISO() {
  // local date, yyyy-mm-dd
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getSubStatus(expiresAt?: string | null) {
  if (!expiresAt) return 'none' as const;
  const today = dateOnlyNowISO();
  if (expiresAt < today) return 'expired' as const;
  // expiring in <=7 days
  const t = new Date(today + 'T00:00:00');
  const e = new Date(expiresAt + 'T00:00:00');
  const diffDays = Math.ceil((e.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return 'expiring' as const;
  return 'active' as const;
}

function getStatusClass(s: ReturnType<typeof getSubStatus>) {
  if (s === 'active') return 'text-emerald-600';
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

function normalizeLetter(s: string) {
  // strip diacritics, uppercase; return A-Z or '#'
  const base = s
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
        const v = dy / dt; // px/ms
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

export default function AthletesPage() {
  const { coach } = useCoach();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: athletes = [], isLoading } = useQuery({
    queryKey: ['athletes', showArchived],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('*, subscriptions(*)')
        .eq('archived', showArchived)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('athletes').update({ archived }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['athletes'] });
      toast.success(showArchived ? 'Sportiv restaurat' : 'Sportiv arhivat');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Eroare arhivare'),
  });

  const getLatestSub = (athlete: any, kind: 'COACHING' | 'GYM') => {
    const subs = (athlete.subscriptions || []).filter((s: any) => kindSafe(s.kind) === kind);
    if (!subs.length) return null;
    return subs.sort((a: any, b: any) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())[0];
  };

  // counts (based on current archived toggle, not on search)
  const headerStats = useMemo(() => {
    const totalActive = athletes.length;

    let gymActive = 0;
    let abonTotal = 0;
    let abonActive = 0;
    let perSession = 0;

    for (const a of athletes as any[]) {
      const pay = String(a.payment_mode ?? '').toUpperCase();
      if (pay === 'PER_SESSION') perSession += 1;
      else abonTotal += 1;

      const coaching = getLatestSub(a, 'COACHING');
      if (getSubStatus(coaching?.expires_at) === 'active' || getSubStatus(coaching?.expires_at) === 'expiring') {
        // consider expiring as active for "has active subscription" count, because still valid today
        abonActive += 1;
      }

      const gym = getLatestSub(a, 'GYM');
      if (getSubStatus(gym?.expires_at) === 'active' || getSubStatus(gym?.expires_at) === 'expiring') {
        gymActive += 1;
      }
    }

    return { totalActive, gymActive, abonTotal, abonActive, perSession };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athletes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return athletes as any[];
    return (athletes as any[]).filter((a) => String(a.full_name ?? '').toLowerCase().includes(q));
  }, [athletes, search]);

  // Grouped list for A-Z sections
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const l of LETTERS) map.set(l, []);
    for (const a of filtered) {
      const letter = normalizeLetter(String(a.full_name ?? ''));
      map.get(letter)!.push(a);
    }
    return map;
  }, [filtered]);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeLetter, setActiveLetter] = useState<(typeof LETTERS)[number]>('A');

  // show index only on fast scroll
  const { show: showIndex, setShow: setShowIndex } = useShowIndexOnFastScroll({ velocityThreshold: 0.8, hideDelayMs: 800 });

  // track active letter based on scroll position (window scroll)
  useEffect(() => {
    const onScroll = () => {
      // find the last section whose top is <= 120px
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

  // ---- IMPORTANT: keep hooks above this early return (stability, no hook mismatch) ----
  if (showForm || editingAthlete) {
    return (
      <AthleteForm
        athlete={editingAthlete}
        coach={coach!}
        onClose={() => {
          setShowForm(false);
          setEditingAthlete(null);
        }}
      />
    );
  }

  return (
    <div className="pb-20 relative">
      <PageHeader
        title="Sportivi"
        subtitle={
          showArchived
            ? `${headerStats.totalActive} arhivați`
            : `${headerStats.totalActive} activi • Sala: ${headerStats.gymActive} • Abon.: ${headerStats.abonTotal}(${headerStats.abonActive}) • La ședință: ${headerStats.perSession}`
        }
        action={
          <div className="flex gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowArchived(!showArchived)}
              className={showArchived ? 'text-warning' : 'text-muted-foreground'}
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Button size="icon" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Caută sportiv..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {LETTERS.map((letter) => {
            const list = grouped.get(letter) ?? [];
            if (!list.length) return null;
            return (
              <div key={letter} ref={(el) => (sectionRefs.current[letter] = el)}>
                <div className="sticky top-[84px] z-10 -mx-4 px-4 py-2 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
                  <div className="text-xl font-semibold text-foreground/70">{letter === '#' ? '#' : letter}</div>
                </div>

                <div className="space-y-2">
                  {list.map((athlete: any) => {
                    const coachingSub = getLatestSub(athlete, 'COACHING');
                    const gymSub = getLatestSub(athlete, 'GYM');

                    const cStatus = getSubStatus(coachingSub?.expires_at);
                    const gStatus = getSubStatus(gymSub?.expires_at);

                    const cText = coachingSub?.expires_at ? formatShortRo(coachingSub.expires_at) : '—';
                    const gText = gymSub?.expires_at ? formatShortRo(gymSub.expires_at) : '—';

                    return (
                      <div
                        key={athlete.id}
                        onClick={() => setEditingAthlete(athlete)}
                        className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-all active:scale-[0.99] cursor-pointer hover:border-primary/30"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xl text-foreground/80 truncate">{athlete.full_name}</p>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            <span className="text-base text-foreground/60">
                              {String(athlete.payment_mode ?? '').toUpperCase() === 'PER_SESSION' ? 'La ședință' : 'Abonament'}
                            </span>
                            <span className="text-base text-foreground/60">{athlete.default_race ?? 'NONE'}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                            <span className={`text-base ${getStatusClass(cStatus)}`}>Abon.: {cText}</span>
                            <span className={`text-base ${getStatusClass(gStatus)}`}>Sala: {gText}</span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 pl-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              archiveMutation.mutate({ id: athlete.id, archived: !showArchived });
                            }}
                          >
                            {showArchived ? 'Rest.' : 'Arh.'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* A–Z index (shows only on fast scroll or while scrubbing) */}
      {showIndex && !isLoading && (
        <AlphaIndex
          activeLetter={activeLetter}
          grouped={grouped}
          onJump={(l) => scrollToLetter(l)}
          onScrubStart={() => setShowIndex(true)}
          onScrubEnd={() => {
            // let the fast-scroll timer hide it naturally; keep it visible briefly
            window.setTimeout(() => setShowIndex(false), 400);
          }}
        />
      )}
    </div>
  );
}

function AlphaIndex(props: {
  activeLetter: typeof LETTERS[number];
  grouped: Map<string, any[]>;
  onJump: (l: typeof LETTERS[number]) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}) {
  const { activeLetter, grouped, onJump, onScrubStart, onScrubEnd } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);

  const pickLetterFromY = (clientY: number) => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const y = Math.min(Math.max(clientY, rect.top), rect.bottom);
    const pct = (y - rect.top) / rect.height;
    const idx = Math.min(LETTERS.length - 1, Math.max(0, Math.floor(pct * LETTERS.length)));
    return LETTERS[idx];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    scrubbingRef.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    onScrubStart();
    const l = pickLetterFromY(e.clientY);
    if (l) onJump(l);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!scrubbingRef.current) return;
    const l = pickLetterFromY(e.clientY);
    if (l) onJump(l);
  };

  const endScrub = () => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    onScrubEnd();
  };

  return (
    <div
      ref={ref}
      className="fixed right-2 top-1/2 -translate-y-1/2 z-20 select-none touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
    >
      <div className="flex flex-col items-center gap-0.5 rounded-full bg-background/70 backdrop-blur px-1.5 py-2 shadow-sm border border-border">
        {LETTERS.map((l) => {
          const hasAny = (grouped.get(l) ?? []).length > 0;
          const isActive = l === activeLetter;
          return (
            <button
              key={l}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onJump(l);
              }}
              className={[
                'leading-none px-1 py-0.5 rounded-md',
                hasAny ? 'text-foreground/70' : 'text-foreground/25',
                isActive ? 'font-bold text-primary scale-125' : 'font-medium',
                'transition-transform',
                'text-base',
              ].join(' ')}
              aria-label={`Sari la ${l}`}
            >
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}
