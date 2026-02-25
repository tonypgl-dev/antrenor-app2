import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCoach } from "@/hooks/useCoach";

const today = () => new Date().toISOString().split("T")[0];

type FlashItem = { id: string; name: string; expiresAt: number };

type FinishUiState = {
  finishedAt: number;   // first time we detected FINISH on this device
  collapsed: boolean;   // after 3s -> true (moves to bottom group)
  movedKey: number;     // increments to trigger a light "fly" animation on mount
};

type FinishUiMap = Record<string, FinishUiState>;

function formatMs(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function formatClockMs(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function lastWordUpper(name: string | null | undefined) {
  const n = (name ?? "").trim();
  if (!n) return "SPORTIV";
  const parts = n.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] ?? n).toUpperCase();
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function msFromMinSec(minStr: string, secStr: string) {
  const m = Math.max(0, parseInt(minStr || "0", 10) || 0);
  const s = Math.max(0, parseInt(secStr || "0", 10) || 0);
  return (m * 60 + s) * 1000;
}

function minSecFromMs(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return { m: String(m), s: String(s).padStart(2, "0") };
}

function mmssFromMs(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function msFromMmss(mmss: string) {
  const t = (mmss ?? "").trim();
  if (!t) return 0;
  const parts = t.split(":");
  if (parts.length !== 2) return 0;
  const m = parseInt(parts[0], 10) || 0;
  const s = parseInt(parts[1], 10) || 0;
  return (m * 60 + s) * 1000;
}

function stddev(vals: number[]) {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v);
}

type TrendArrow = "UP" | "UP45" | "FLAT" | "DOWN45" | "DOWN";

function arrowGlyph(a: TrendArrow) {
  switch (a) {
    case "UP":
      return "↑";
    case "UP45":
      return "↗";
    case "DOWN45":
      return "↘";
    case "DOWN":
      return "↓";
    default:
      return "→";
  }
}

function playBeep(durationMs: number, frequency = 520) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    try { (ctx as any).resume?.(); } catch {}
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = frequency;
    o.type = "sine";
    g.gain.value = 0.1;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, durationMs);
  } catch {
    // ignore
  }
}

export default function LaneTimingPage() {
  const { laneId } = useParams();
  const navigate = useNavigate();
  const { coach } = useCoach();
  const qc = useQueryClient();


  const [finishUi, setFinishUi] = useState<FinishUiMap>({});
  const [expandedFinished, setExpandedFinished] = useState<Record<string, boolean>>({});
  const finishTimersRef = useRef<Record<string, number>>({});
  const prevFinishedRef = useRef<Record<string, boolean>>({});

    const pendingLapRef = useRef<Record<string, boolean>>({});
  const retryLapEventIdRef = useRef<Record<string, { id: string; ts: number }>>({});

const pressTimer = useRef<number | null>(null);
  const flashTick = useRef<number | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const [startPending, setStartPending] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [targetMin, setTargetMin] = useState("");
  const [targetSec, setTargetSec] = useState("");
  const [idealLapMmss, setIdealLapMmss] = useState("");
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>({});

  const [flashList, setFlashList] = useState<FlashItem[]>([]);
  const [pulseId, setPulseId] = useState<string | null>(null);

  const [menuFor, setMenuFor] = useState<any | null>(null);

  const { data: timingSession } = useQuery({
    queryKey: ["timing-session", today()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timing_sessions")
        .select("*")
        .eq("date", today())
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: lane } = useQuery({
    queryKey: ["lane", laneId],
    enabled: !!laneId,
    queryFn: async () => {
      const { data, error } = await supabase.from("lanes").select("*").eq("id", laneId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: run, refetch: refetchRun } = useQuery({
    queryKey: ["run-current", timingSession?.id, laneId],
    enabled: !!timingSession && !!laneId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("runs")
        .select("*")
        .eq("timing_session_id", timingSession!.id)
        .eq("lane_id", laneId!)
        .order("run_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ["lane-assignments", timingSession?.id, laneId],
    enabled: !!timingSession && !!laneId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lane_assignments")
        .select("*, athletes(full_name)")
        .eq("timing_session_id", timingSession!.id)
        .eq("lane_id", laneId!)
        .eq("is_out", false)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: lapEvents = [] } = useQuery({
    queryKey: ["lap-events", run?.id],
    enabled: !!run?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lap_events")
        .select("*")
        .eq("run_id", run!.id)
        .order("created_at", {
          ascending: true,
        });
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime: lap events + assignments
  useEffect(() => {
    if (!run?.id) return;

    const ch = supabase
      .channel(`lt_run_${run.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lap_events", filter: `run_id=eq.${run.id}` },
        () => qc.invalidateQueries({ queryKey: ["lap-events", run.id] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [run?.id, qc]);

  useEffect(() => {
    if (!timingSession?.id || !laneId) return;

    const ch = supabase
      .channel(`lt_assign_${timingSession.id}_${laneId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lane_assignments", filter: `lane_id=eq.${laneId}` },
        () => qc.invalidateQueries({ queryKey: ["lane-assignments", timingSession.id, laneId] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [timingSession?.id, laneId, qc]);

  const maxElapsed = useMemo(() => {
    if (!lapEvents.length) return 0;
    return lapEvents.reduce((max: number, ev: any) => Math.max(max, Number(ev.elapsed_ms) || 0), 0);
  }, [lapEvents]);

  // Timer tick
  useEffect(() => {
    let interval: any;
    if (run?.status === "RUNNING" && run.start_at) {
      setElapsed(Date.now() - new Date(run.start_at).getTime());
      interval = setInterval(() => {
        setElapsed(Date.now() - new Date(run.start_at).getTime());
      }, 100);
    } else if (run?.status === "COMPLETED") {
      setElapsed(maxElapsed);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [run?.status, run?.start_at, maxElapsed]);

  // flash fade tick
  useEffect(() => {
    if (flashTick.current) window.clearInterval(flashTick.current);
    flashTick.current = window.setInterval(() => {
      const now = Date.now();
      setFlashList((prev) => prev.filter((x) => x.expiresAt > now));
    }, 120);
    return () => {
      if (flashTick.current) window.clearInterval(flashTick.current);
    };
  }, []);

  function pushFlash(fullName: string) {
    const now = Date.now();
    const id = `${now}-${Math.random().toString(16).slice(2)}`;
    const ttl = 1500 + 700;
    setFlashList((prev) => [{ id, name: lastWordUpper(fullName), expiresAt: now + ttl }, ...prev].slice(0, 5));
  }

  // Race / laps
  const raceType = String(lane?.race_type ?? "").toLowerCase();
  const lapsTotal = useMemo(() => {
    if (raceType.includes("1000")) return 5.5;
    const v = Number(lane?.laps_total ?? 0) || 0;
    return v;
  }, [raceType, lane?.laps_total]);

  const frac = lapsTotal > 0 ? lapsTotal - Math.floor(lapsTotal) : 0; // 0 or 0.5
  const hasHalfFirstSplit = frac > 0;
  const lapsDisplayTotal = Math.max(1, Math.floor(lapsTotal || 0)); // 5 for 5.5, otherwise int

  const defaultTargetTotalMs = useMemo(() => {
    if (raceType.includes("1000")) return msFromMinSec("4", "30");
    if (raceType.includes("2000")) return msFromMinSec("10", "00");
    return 0;
  }, [raceType]);

  const runTargetTotalMsRaw = Number((run as any)?.target_total_ms ?? 0) || 0;
  const effectiveTargetTotalMs = runTargetTotalMsRaw || defaultTargetTotalMs;

  // init settings inputs when run/lane loaded
  useEffect(() => {
    if (!lane || !run) return;
    const t = effectiveTargetTotalMs;
    const { m, s } = minSecFromMs(t || 0);
    setTargetMin(m);
    setTargetSec(s);

    const ideal = lapsTotal ? Math.round((t || 0) / lapsTotal) : 0;
    setIdealLapMmss(ideal ? mmssFromMs(ideal) : "");
  }, [lane?.id, run?.id]); // intentionally only on lane/run switch

  const idealLapMs = useMemo(() => {
    const manual = msFromMmss(idealLapMmss);
    if (manual > 0) return manual;
    if (!effectiveTargetTotalMs || !lapsTotal) return 0;
    return Math.round(effectiveTargetTotalMs / lapsTotal);
  }, [idealLapMmss, effectiveTargetTotalMs, lapsTotal]);

  // group lap events by assignment
  const lapsByAssignment = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const ev of lapEvents as any[]) {
      const key = ev.lane_assignment_id;
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [lapEvents]);

  // Derived KPIs per athlete
  const derived = useMemo(() => {
    const out: Record<string, any> = {};
    for (const a of assignments as any[]) {
      const events = lapsByAssignment.get(a.id) ?? [];
      const n = events.length;

      const lastEv = events[n - 1];
      const totalElapsedAtLast = n ? Number(lastEv.elapsed_ms) : 0;

      // use lap_number when present; otherwise fall back to event count
      const maxLapNumber = events.reduce(
        (max: number, ev: any) => Math.max(max, Number(ev.lap_number) || 0),
        0,
      );
      const hasLapNumbers = events.some((ev: any) => ev.lap_number != null && Number(ev.lap_number) > 0);
      const lapCountForDistance = hasLapNumbers ? maxLapNumber : events.length;

      // distance units done (in laps, can be 0.5 steps)
      let distanceDone = 0;
      if (lapCountForDistance > 0) {
        if (hasHalfFirstSplit) {
          distanceDone = Math.min(lapsTotal, 0.5 + Math.max(0, lapCountForDistance - 1));
        } else {
          distanceDone = Math.min(lapsTotal, lapCountForDistance);
        }
      }

      // splits (segment times)
      const splitMs: number[] = [];
      for (let i = 0; i < n; i++) {
        const ev = events[i];
        const prev = events[i - 1];
        splitMs.push(i === 0 ? Number(ev.elapsed_ms) : Number(ev.elapsed_ms) - Number(prev.elapsed_ms));
      }

      // Chart points for visual graph (normalized 0-100)
      let chartPoints = "";
      if (splitMs.length > 1) {
        const min = Math.min(...splitMs);
        const max = Math.max(...splitMs);
        const range = max - min || 1;
        chartPoints = splitMs
          .map((ms, i) => {
            const x = (i / (splitMs.length - 1)) * 100;
            // Lower ms (faster) = Higher Y (visual) -> so we invert. 0 is top in SVG.
            // Let's map: min ms -> 10 (top), max ms -> 90 (bottom)
            const y = 10 + ((ms - min) / range) * 80;
            return `${x},${y}`;
          })
          .join(" ");
      }

      // normalize splits to "per full lap" pace (half split *2)
      const splitNormMs = splitMs.map((ms, i) => (hasHalfFirstSplit && i === 0 ? ms * 2 : ms));

      const lastSplit = splitMs.length ? splitMs[splitMs.length - 1] : null;
      const lastSplitNorm = splitNormMs.length ? splitNormMs[splitNormMs.length - 1] : null;

      const avgPerLapNorm = distanceDone > 0 ? Math.round(totalElapsedAtLast / distanceDone) : null;

      // GAP vs Ghost/Ideal split at the athlete's last recorded split
      const idealElapsedAtLast = idealLapMs > 0 ? Math.round(idealLapMs * distanceDone) : 0;
      const gapMs = idealLapMs > 0 && n > 0 ? totalElapsedAtLast - idealElapsedAtLast : null;

      // Energy buffer: how many ms "in the bank" (+ good)
      const bufferMs = idealLapMs > 0 && n > 0 ? idealElapsedAtLast - totalElapsedAtLast : null;

      // Projected finish: weighted moving average on normalized paces
      let projectedFinishMs: number | null = null;
      if (effectiveTargetTotalMs > 0 && lapsTotal > 0 && n > 0 && lastSplitNorm != null) {
        const last = lastSplitNorm;
        const prevN = splitNormMs.length >= 2 ? splitNormMs[splitNormMs.length - 2] : null;
        const rest = splitNormMs.length >= 3 ? splitNormMs.slice(0, -2) : [];
        const restAvg = rest.length ? rest.reduce((x, y) => x + y, 0) / rest.length : prevN ?? last;

        const paceEst = prevN != null ? last * 0.5 + prevN * 0.3 + restAvg * 0.2 : last;

        const remaining = Math.max(0, lapsTotal - distanceDone);
        projectedFinishMs = Math.round(totalElapsedAtLast + paceEst * remaining);
      }

      // PCS: based on coefficient of variation of normalized lap paces
      let pcs: number | null = null;
      if (splitNormMs.length >= 2) {
        const mean = splitNormMs.reduce((x, y) => x + y, 0) / splitNormMs.length;
        const sd = stddev(splitNormMs);
        const cv = mean > 0 ? sd / mean : 0;
        // map cv to score: cv 0 => 100, cv 0.1 => 70, cv 0.2 => 40
        pcs = Math.round(clamp(100 - cv * 300, 0, 100));
      }

      // Trend arrow: based on average pace vs ideal lap (Ghost pace)
      let arrow: TrendArrow = "FLAT";
      if (avgPerLapNorm != null && idealLapMs > 0) {
        const ratio = avgPerLapNorm / idealLapMs; // >1 slower
        if (ratio <= 0.9) arrow = "UP";
        else if (ratio <= 0.97) arrow = "UP45";
        else if (ratio < 1.03) arrow = "FLAT";
        else if (ratio < 1.15) arrow = "DOWN45";
        else arrow = "DOWN";
      }

      const finished = distanceDone >= lapsTotal && lapsTotal > 0;

      out[a.id] = {
        n,
        events,
        totalElapsedAtLast,
        distanceDone,
        splitMs,
        splitNormMs,
        lastSplit,
        lastSplitNorm,
        avgPerLapNorm,
        gapMs,
        bufferMs,
        projectedFinishMs,
        pcs,
        arrow,
        finished,
        chartPoints,
      };
    }
    return out;
  }, [assignments, lapsByAssignment, lapsTotal, hasHalfFirstSplit, idealLapMs, effectiveTargetTotalMs]);

  const allFinished = useMemo(() => {
    if (!assignments.length) return false;
    const active = assignments.filter((a: any) => !a.is_abandoned);
    if (!active.length) return false;
    return active.every((a: any) => derived[a.id]?.finished);
  }, [assignments, derived]);

  // Detect FINISH transitions locally (UI-only): keep full card for 3s, then collapse + move to bottom
  useEffect(() => {
    // reset UI state when we switch runs / lanes
    const activeIds = new Set((assignments as any[]).map((a: any) => a.id));
    setFinishUi((prev) => {
      const next: FinishUiMap = {};
      for (const [id, st] of Object.entries(prev)) {
        if (activeIds.has(id)) next[id] = st;
      }
      return next;
    });
    setExpandedFinished((prev) => {
      const next: Record<string, boolean> = {};
      for (const [id, v] of Object.entries(prev)) {
        if (activeIds.has(id)) next[id] = v;
      }
      return next;
    });

    for (const a of assignments as any[]) {
      const id = a.id as string;
      const isFin = !!derived[id]?.finished;
      const wasFin = !!prevFinishedRef.current[id];

      if (isFin && !wasFin) {
        prevFinishedRef.current[id] = true;

        // initialize UI state for this finish
        setFinishUi((prev) => ({
          ...prev,
          [id]: {
            finishedAt: Date.now(),
            collapsed: false,
            movedKey: prev[id]?.movedKey ?? 0,
          },
        }));

        // clear any previous timer (defensive)
        const oldT = finishTimersRef.current[id];
        if (oldT) window.clearTimeout(oldT);

        // after 3s -> collapse + move to bottom
        finishTimersRef.current[id] = window.setTimeout(() => {
          setFinishUi((prev) => {
            const curr = prev[id];
            if (!curr) return prev;
            return {
              ...prev,
              [id]: {
                ...curr,
                collapsed: true,
                movedKey: (curr.movedKey ?? 0) + 1,
              },
            };
          });
        }, 3000);
      }

      if (!isFin && wasFin) {
        // if finish was undone (UNDO lap etc.), revert UI state
        prevFinishedRef.current[id] = false;
        const oldT = finishTimersRef.current[id];
        if (oldT) window.clearTimeout(oldT);
        delete finishTimersRef.current[id];
        setFinishUi((prev) => {
          if (!prev[id]) return prev;
          const { [id]: _, ...rest } = prev;
          return rest;
        });
        setExpandedFinished((prev) => {
          if (!prev[id]) return prev;
          const { [id]: _, ...rest } = prev;
          return rest;
        });
      }
    }

    return () => {
      // no-op: timers are cleared on unmount below
    };
  }, [assignments, derived]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const t of Object.values(finishTimersRef.current)) {
        window.clearTimeout(t);
      }
      finishTimersRef.current = {};
    };
  }, []);


  async function completeRun() {
    if (!run?.id) return;
    const { error } = await supabase.from("runs").update({ status: "COMPLETED" }).eq("id", run.id);
    if (error) {
      console.error(error);
      toast.error("Eroare la finalizare cursă");
    }
    refetchRun();
  }

  useEffect(() => {
    if (run?.status === "RUNNING" && allFinished) {
      completeRun();
      // Melodic finish sound
      playBeep(150, 523); // C5
      setTimeout(() => playBeep(150, 659), 150); // E5
      setTimeout(() => playBeep(150, 784), 300); // G5
      setTimeout(() => playBeep(400, 1046), 450); // C6
      if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
        (navigator as any).vibrate([200, 100, 200, 100, 400]);
      }
      toast.success("Cursă finalizată!");
    }
  }, [allFinished, run?.status]);

    const sortedAssignments = useMemo(() => {
    const list = [...(assignments as any[])];

    const isCollapsedFinished = (a: any) => {
      const id = a.id as string;
      const isFin = !!derived[id]?.finished;
      return isFin && !!finishUi[id]?.collapsed;
    };

    const finalMs = (a: any) => {
      const id = a.id as string;
      const v = derived[id]?.totalElapsedAtLast;
      const n = Number(v);
      return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    };

    // Groups:
    // 0) active + finished-but-still-showing-full-card (first 3s)
    // 1) finished-collapsed (move to bottom, best final time first)
    // 2) abandoned (always last)
    const g0: any[] = [];
    const g1: any[] = [];
    const g2: any[] = [];

    for (const a of list) {
      if (a.is_abandoned) {
        g2.push(a);
      } else if (isCollapsedFinished(a)) {
        g1.push(a);
      } else {
        g0.push(a);
      }
    }

    g0.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    g1.sort((a, b) => finalMs(a) - finalMs(b));
    g2.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    return [...g0, ...g1, ...g2];
  }, [assignments, derived, finishUi]);

function baseSecondName(a: any) {
    return lastWordUpper(a.athletes?.full_name ?? "Sportiv");
  }
  function suffixLabel(a: any) {
    return (a.external_name ?? "").trim();
  }
  function fullName(a: any) {
    return (a.athletes?.full_name ?? "Sportiv").toUpperCase();
  }

  async function saveLabel(a: any, value: string) {
    const v = (value ?? "").trim();
    const { error } = await supabase.from("lane_assignments").update({ external_name: v || null }).eq("id", a.id);
    if (error) {
      toast.error("Nu pot salva numele");
      console.error(error);
      return;
    }
    refetchAssignments();
  }

  async function saveTargetSettings() {
    const totalMs = msFromMinSec(targetMin, targetSec);
    if (!run?.id) return;
    const { error } = await supabase.from("runs").update({ target_total_ms: totalMs || null }).eq("id", run.id);
    if (error) {
      toast.error("Nu pot salva target-ul");
      console.error(error);
      return;
    }
    toast.success("Setări salvate");
    refetchRun();
  }

  async function addLap(a: any) {
    if (!run || run.status !== "RUNNING" || !run.start_at) return;
    if (a.is_abandoned) return;
    const d = derived[a.id];
    if (d?.finished) return;

    const pendingKey = a.id;
    if (pendingLapRef.current[pendingKey]) return;
    pendingLapRef.current[pendingKey] = true;

    // Anti double-tap + reconnect edge-case:
// Reuse the same client_event_id for a short window so the DB idempotency can dedupe.
// 3s is safe: a real lap can't happen that fast.
const nowTs = Date.now();
const existing = retryLapEventIdRef.current[pendingKey];
const clientEventId =
  existing && nowTs - existing.ts < 3_000 ? existing.id : crypto.randomUUID();

// store immediately so rapid double taps reuse the same id
retryLapEventIdRef.current[pendingKey] = { id: clientEventId, ts: nowTs };

    try {
      const elapsedMs = Date.now() - new Date(run.start_at).getTime();

      const { data, error } = await (supabase as any).rpc("add_lap_event_atomic", {
        p_run_id: run.id,
        p_lane_assignment_id: a.id,
        p_elapsed_ms: elapsedMs,
        p_coach: coach ?? "COACH",
        p_client_event_id: clientEventId,
      });

      if (error) {
        console.error(error);
        // Keep retry id only on likely network failures
        const msg = String((error as any)?.message ?? "");
        const isNetwork = msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch");
        if (isNetwork) retryLapEventIdRef.current[pendingKey] = { id: clientEventId, ts: nowTs };
        toast.error(`Lap nereușit: ${error.message ?? "Eroare"}`);
        return;
      }

      const row = Array.isArray(data) ? (data as any)[0] : (data as any);
      const inserted = row?.inserted === true;
      if (!inserted) {
        // duplicate or ignored event; keep silent
        window.setTimeout(() => {
          const cur = retryLapEventIdRef.current[pendingKey];
          if (cur?.id === clientEventId) delete retryLapEventIdRef.current[pendingKey];
        }, 3_000);
        return;
      }

      // cleanup debounce id after 3s (only if still the same id)
      window.setTimeout(() => {
        const cur = retryLapEventIdRef.current[pendingKey];
        if (cur?.id === clientEventId) delete retryLapEventIdRef.current[pendingKey];
      }, 3_000);

      // success feedback (only when inserted)
      pushFlash(a.athletes?.full_name ?? "Sportiv");
      setPulseId(a.id);
      window.setTimeout(() => setPulseId(null), 500);
      playBeep(80, 880);
      try {
        if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
          (navigator as any).vibrate(30);
        }
      } catch {
        // ignore
      }
    } finally {
      pendingLapRef.current[pendingKey] = false;
    }
  }

  async function undoLastLap(a: any) {
    if (!run?.id) return;
    const { data, error } = await supabase
      .from("lap_events")
      .select("id, created_at")
      .eq("run_id", run.id)
      .eq("lane_assignment_id", a.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(error);
      toast.error("Nu pot citi ultimul lap");
      return;
    }
    if (!data?.id) {
      toast.message("Nu există lap de șters");
      return;
    }

    const { error: delErr } = await supabase.from("lap_events").delete().eq("id", data.id);
    if (delErr) {
      console.error(delErr);
      toast.error("UNDO nereușit");
      return;
    }
    toast.success("UNDO OK");
  }

  async function abandonAthlete(a: any) {
    const { error } = await supabase.from("lane_assignments").update({ is_abandoned: true }).eq("id", a.id);
    if (error) {
      console.error(error);
      toast.error("ABANDON nereușit");
      return;
    }
    toast.success("Marcat ABANDON");
    refetchAssignments();
  }

  async function startRun() {
    if (!run?.id) return;
    if (startPending) return;
    setStartPending(true);
    try {
      const { data, error } = await supabase.rpc("start_run_atomic", {
        p_run_id: run.id,
      });
      if (error) {
        console.error(error);
        toast.error("Nu pot porni cursa");
        return;
      }

      if (!data) {
        // run already started by another device; refresh local state silently
        await refetchRun();
        return;
      }

      qc.setQueryData(["run-current", timingSession?.id, laneId], (prev: any) => {
        if (!prev) return prev;
        return { ...prev, status: "RUNNING", start_at: data };
      });

      await refetchRun();
    } finally {
      setStartPending(false);
    }
  }

  async function stopRun() {
    if (!run?.id) return;
    const { error } = await supabase.from("runs").update({ status: "PAUSED", start_at: null }).eq("id", run.id);
    if (error) {
      console.error(error);
      toast.error("Nu pot opri cursa");
      return;
    }
    refetchRun();
  }

  function paceVisual(a: any, d: any) {
    // Organic live color:
    // Compare "time since last split" against REQUIRED time for next segment (based on target remaining)
    if (!run?.status || run.status !== "RUNNING") return { className: "bg-card border-border", style: {} as any };

    if (!effectiveTargetTotalMs || !lapsTotal) return { className: "bg-card border-border", style: {} as any };

    if (a.is_abandoned) return { className: "bg-muted border-border", style: {} as any };

    const nowElapsed = elapsed; // global stopwatch
    const distanceDone = d?.distanceDone ?? 0;

    const remainingDistance = Math.max(0.0001, lapsTotal - distanceDone);
    const timeLeft = Math.max(0, effectiveTargetTotalMs - nowElapsed);
    const requiredAvgLeft = timeLeft / remainingDistance; // ms per full lap

    // next segment distance (0.5 only for first split if none yet)
    const nextSegDist = hasHalfFirstSplit && (d?.n ?? 0) === 0 ? 0.5 : 1;

    const lastElapsed = (d?.n ?? 0) > 0 ? d.totalElapsedAtLast : 0;
    const expectedNext = lastElapsed + requiredAvgLeft * nextSegDist;

    const delay = nowElapsed - expectedNext; // >0 means late already
    const maxYellow = requiredAvgLeft * nextSegDist * 0.3; // 30%

    // Normalize into 0..1 (yellow intensity), where 1 => red threshold
    const t = delay <= 0 ? 0 : delay / maxYellow;
    const intensity = clamp(t, 0, 1);

    // Determine bucket
    const isRed = t >= 1;

    // low-contrast tint + glow
    // NOTE: colors are gentle by design
    const base = isRed
      ? {
          bg: "bg-rose-50",
          border: "rgba(244,63,94,0.55)",
          glow: `0 0 ${10 + 12 * intensity}px rgba(244,63,94,${0.16 + 0.12 * intensity})`,
        }
      : intensity > 0
      ? {
          bg: "bg-amber-50",
          border: `rgba(245,158,11,${0.28 + 0.32 * intensity})`,
          glow: `0 0 ${8 + 10 * intensity}px rgba(245,158,11,${0.12 + 0.12 * intensity})`,
        }
      : { bg: "bg-emerald-50", border: "rgba(16,185,129,0.35)", glow: "0 0 8px rgba(16,185,129,0.10)" };

    return {
      className: `${base.bg} border`,
      style: {
        borderColor: base.border,
        boxShadow: base.glow,
        transition: "box-shadow 120ms linear, border-color 120ms linear, background-color 120ms linear",
      } as React.CSSProperties,
    };
  }

  const raceTitle = lane?.race_type ? String(lane.race_type) : "Cursă";
  const groupTitle = lane?.name ? String(lane.name) : "";
  const isRaceDone = run?.status === "COMPLETED";

  function splitLabel(i: number) {
    // For 1000m (5.5 laps) first split is 1/2 lap
    if (hasHalfFirstSplit && i === 0) return "½";
    // After the half split, index 1 corresponds to "Tur 1"
    const lapNo = hasHalfFirstSplit ? i : i + 1;
    return `T${lapNo}`;
  }

  return (
    <div className="pb-24">
      <PageHeader title={raceTitle} subtitle={groupTitle} />

      <div className="px-4 py-2">
        <div className="relative rounded-xl border bg-card p-3">
          {/* Flash names above stopwatch (no layout shift) */}
          <div className="pointer-events-none absolute left-0 right-0 -top-7 flex flex-col items-center gap-1">
            {flashList.map((f) => {
              const remaining = f.expiresAt - Date.now();
              const fadeStart = 700;
              const opacity = remaining <= 0 ? 0 : remaining < fadeStart ? clamp(remaining / fadeStart, 0, 1) : 1;
              return (
                <div key={f.id} className="text-3xl font-bold tabular-nums" style={{ opacity, transition: "opacity 120ms linear" }}>
                  {f.name}
                </div>
              );
            })}
          </div>

          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-center text-3xl font-bold tabular-nums">{formatMs(elapsed)}</div>
              <div className="mt-1 text-center text-xs text-muted-foreground">
                {lapsTotal ? `${lapsDisplayTotal} ture${hasHalfFirstSplit ? " + ½" : ""}` : ""}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen((v) => !v)}>
                ⚙
              </Button>
            </div>
          </div>

          {settingsOpen && (
            <div className="mt-3 rounded-lg border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">Setări cursă</div>
                <Button size="sm" onClick={saveTargetSettings}>
                  OK
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <div className="mb-1 text-[11px] text-muted-foreground">Target total</div>
                  <div className="flex gap-1">
                    <Input
                      inputMode="numeric"
                      className="h-9 text-center tabular-nums"
                      value={targetMin}
                      onChange={(e) => setTargetMin(e.target.value.replace(/\D/g, ""))}
                      placeholder="min"
                    />
                    <Input
                      inputMode="numeric"
                      className="h-9 text-center tabular-nums"
                      value={targetSec}
                      onChange={(e) => setTargetSec(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      placeholder="sec"
                    />
                  </div>
                </div>

                <div className="col-span-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">Ideal / tur (editabil)</div>
                  <Input
                    className="h-9 tabular-nums"
                    value={idealLapMmss}
                    onChange={(e) => setIdealLapMmss(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
                    placeholder="0:00"
                  />
                  <div className="mt-1 text-[11px] text-muted-foreground">Auto: {idealLapMs ? mmssFromMs(idealLapMs) : "—"} / tur</div>
                </div>
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                Edit nume sportivi direct în butoane (mai jos). După START, editarea se blochează.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Athletes grid */}
      <div className="px-4">
        <div className="grid grid-cols-2 gap-3">
          {sortedAssignments.map((a: any) => {
            const d = derived[a.id];
            const pressed = pulseId === a.id;

            // Finished UI state
            const isCollapsed = !!d?.finished && !!finishUi[a.id]?.collapsed;
            const isExpanded = !!expandedFinished[a.id];
            const showCompact = isCollapsed && !isExpanded;

            const { className, style } = paceVisual(a, d);

            const lastSplit = d?.lastSplit != null ? formatMs(d.lastSplit) : "—";
            const avgLap = d?.avgPerLapNorm != null ? formatMs(d.avgPerLapNorm) : "—";

            // Laps display: for 1000m (5.5) show 0/5 after half split
            const doneInt = Math.max(0, Math.floor(d?.distanceDone ?? 0));
            const lapsTxt = `${doneInt}/${lapsDisplayTotal}`;
            const hasHalfMarker = hasHalfFirstSplit && ((d?.distanceDone ?? 0) - Math.floor(d?.distanceDone ?? 0) >= 0.49);

            const gapTxt =
              d?.gapMs == null ? "—" : `${d.gapMs >= 0 ? "+" : "-"}${(Math.abs(d.gapMs) / 1000).toFixed(1)}s`;

            const pfTxt = d?.projectedFinishMs != null ? formatClockMs(d.projectedFinishMs) : "—";
            const bufTxt =
              d?.bufferMs != null ? `${d.bufferMs >= 0 ? "+" : "-"}${(Math.abs(d.bufferMs) / 1000).toFixed(0)}s` : "—";
            const pcsTxt = d?.pcs != null ? `${d.pcs}` : "—";
            const arrow = arrowGlyph((d?.arrow ?? "FLAT") as TrendArrow);

            // Energy buffer bar: clamp to +/-20s
            const bufSec = d?.bufferMs != null ? d.bufferMs / 1000 : 0;
            const bufNorm = clamp((bufSec + 20) / 40, 0, 1);

            const disabled =
              (run?.status !== "RUNNING" && !isRaceDone) ||
              a.is_abandoned ||
              (!showCompact && d?.finished) ||
              pendingLapRef.current[a.id] === true;
            const canEditName = settingsOpen && run?.status !== "RUNNING";

            const mainName = baseSecondName(a);
            const suffix = suffixLabel(a);

            const gapColor =
              d?.gapMs == null
                ? "text-muted-foreground"
                : d.gapMs <= -800
                ? "text-emerald-700"
                : d.gapMs < 800
                ? "text-foreground"
                : "text-rose-700";

            const finalTxt = d?.finished ? formatMs(Number(d?.totalElapsedAtLast ?? 0)) : null;
            const splitList: number[] = Array.isArray(d?.splitMs) ? d.splitMs : [];

            return (
              <button
                key={isCollapsed ? `${a.id}-done-${finishUi[a.id]?.movedKey ?? 0}-${isExpanded ? 1 : 0}` : a.id}
                className={[
                  "relative w-full rounded-xl p-3 text-left shadow-sm",
                  isCollapsed ? "animate-in slide-in-from-top-2 duration-200" : "",
                  className,
                  disabled ? "opacity-80" : "active:scale-[0.99]",
                  pressed ? "ring-2 ring-offset-1 ring-primary" : "",
                ].join(" ")}
                style={style}
                onClick={() => {
                  if (showCompact) {
                    setExpandedFinished((prev) => ({ ...prev, [a.id]: true }));
                    return;
                  }
                  if (isCollapsed && isExpanded) {
                    // toggle collapse/expand for finished athletes
                    setExpandedFinished((prev) => ({ ...prev, [a.id]: !prev[a.id] }));
                    return;
                  }
                  addLap(a);
                }}
                onPointerDown={() => {
                  if (run?.status !== "RUNNING") return;
                  pressTimer.current = window.setTimeout(() => {
                    setMenuFor(a);
                  }, 2200);
                }}
                onPointerUp={() => {
                  if (pressTimer.current) window.clearTimeout(pressTimer.current);
                }}
                onPointerLeave={() => {
                  if (pressTimer.current) window.clearTimeout(pressTimer.current);
                }}
              >
                {/* Header name */}
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {canEditName ? (
                      <Input
                        className="h-9 text-base font-bold"
                        value={editingLabels[a.id] ?? (a.external_name ?? "")}
                        onChange={(e) => setEditingLabels((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        onBlur={() => saveLabel(a, editingLabels[a.id] ?? (a.external_name ?? ""))}
                        placeholder={fullName(a)}
                      />
                    ) : (
                      <div className="truncate text-xl font-bold tracking-wide">
                        {mainName}
                        {suffix ? <span className="ml-2 text-sm font-semibold text-muted-foreground/75">{suffix}</span> : null}
                      </div>
                    )}
                  </div>

                  {a.is_abandoned ? (
                    <div className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">ABANDON</div>
                  ) : d?.finished ? (
                    <div className="rounded-full bg-emerald-200 px-2 py-1 text-[10px] font-semibold text-emerald-900">FINISH</div>
                  ) : null}
                </div>

                {/* KPI row: big GAP + big laps */}
                {!showCompact && (
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className={["text-2xl font-extrabold tabular-nums leading-none", gapColor].join(" ")}>{gapTxt}</div>

                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>PF {pfTxt}</span>
                      <span>PCS {pcsTxt}</span>
                      <span className="font-bold">{arrow}</span>
                    </div>

                    {/* Buffer bar */}
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>BUF {bufTxt}</span>
                        <span>{lastSplit !== "—" ? `LAST ${lastSplit}` : ""}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted/60">
                        <div className="h-2 rounded-full bg-emerald-500/40" style={{ width: `${bufNorm * 100}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-extrabold tabular-nums leading-none">{lapsTxt}</div>
                    {hasHalfMarker ? (
                      <div className="mt-1 text-[11px] font-semibold text-muted-foreground">½ split</div>
                    ) : (
                      <div className="mt-1 text-[11px] text-muted-foreground">{avgLap !== "—" ? `AVG ${avgLap}` : ""}</div>
                    )}
                  </div>
                </div>                )}

                {/* ✅ NEW: Final time + per-lap splits when finished */}
                                {d?.finished && (
                  <>
                    {showCompact ? (
                      <div className="mt-2 flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2">
                        <div className="text-[11px] font-semibold text-muted-foreground">FINAL</div>
                        <div className="text-lg font-extrabold tabular-nums">{finalTxt}</div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border bg-background/60 p-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-semibold text-muted-foreground">FINAL</div>
                          <div className="text-lg font-extrabold tabular-nums">{finalTxt}</div>
                        </div>

                        {splitList.length > 0 && (
                          <div className="mt-2 grid grid-cols-3 gap-1">
                            {splitList.map((ms: number, i: number) => (
                              <div key={i} className="rounded-md border bg-card px-2 py-1">
                                <div className="text-[10px] font-semibold text-muted-foreground">{splitLabel(i)}</div>
                                <div className="text-sm font-bold tabular-nums">{formatMs(ms)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isCollapsed && isExpanded && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-3 text-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setExpandedFinished((prev) => ({ ...prev, [a.id]: false }));
                          }}
                        >
                          Collapse
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {menuFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background p-4 shadow-xl">
            <div className="mb-2 text-sm font-semibold">Opțiuni: {baseSecondName(menuFor)}</div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  await undoLastLap(menuFor);
                  setMenuFor(null);
                }}
              >
                UNDO last lap
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await abandonAthlete(menuFor);
                  setMenuFor(null);
                }}
              >
                ABANDON
              </Button>
            </div>
            <div className="mt-3">
              <Button variant="ghost" className="w-full" onClick={() => setMenuFor(null)}>
                Închide
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="fixed bottom-16 left-0 right-0 px-4">
        <div className="flex gap-3">
          <Button className="flex-1 h-12" disabled={startPending} onClick={run?.status === "RUNNING" ? stopRun : startRun}>
            {run?.status === "RUNNING" ? "Stop" : "Start"}
          </Button>
          <Button variant="outline" className="h-12" onClick={() => navigate("/timing")}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}