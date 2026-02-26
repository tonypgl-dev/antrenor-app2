import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCoach } from "@/hooks/useCoach";
import { Settings, ChevronLeft } from "lucide-react";

const today = () => new Date().toISOString().split("T")[0];

type FlashItem = { id: string; name: string; expiresAt: number };

type FinishUiState = {
  finishedAt: number;
  collapsed: boolean;
  movedKey: number;
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
    setTimeout(() => { o.stop(); ctx.close(); }, durationMs);
  } catch { /* ignore */ }
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
      const { data, error } = await supabase.from("timing_sessions").select("*").eq("date", today()).maybeSingle();
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
        .from("runs").select("*")
        .eq("timing_session_id", timingSession!.id)
        .eq("lane_id", laneId!)
        .order("run_number", { ascending: false })
        .limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ["lane-assignments", timingSession?.id, laneId],
    enabled: !!timingSession && !!laneId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lane_assignments").select("*, athletes(full_name)")
        .eq("timing_session_id", timingSession!.id)
        .eq("lane_id", laneId!).eq("is_out", false).order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: lapEvents = [] } = useQuery({
    queryKey: ["lap-events", run?.id],
    enabled: !!run?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("lap_events").select("*").eq("run_id", run!.id).order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime
  useEffect(() => {
    if (!run?.id) return;
    const ch = supabase.channel(`lt_run_${run.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lap_events", filter: `run_id=eq.${run.id}` },
        () => qc.invalidateQueries({ queryKey: ["lap-events", run.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [run?.id, qc]);

  useEffect(() => {
    if (!timingSession?.id || !laneId) return;
    const ch = supabase.channel(`lt_assign_${timingSession.id}_${laneId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lane_assignments", filter: `lane_id=eq.${laneId}` },
        () => qc.invalidateQueries({ queryKey: ["lane-assignments", timingSession.id, laneId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [timingSession?.id, laneId, qc]);

  const maxElapsed = useMemo(() => {
    if (!lapEvents.length) return 0;
    return lapEvents.reduce((max: number, ev: any) => Math.max(max, Number(ev.elapsed_ms) || 0), 0);
  }, [lapEvents]);

  useEffect(() => {
    let interval: any;
    if (run?.status === "RUNNING" && run.start_at) {
      setElapsed(Date.now() - new Date(run.start_at).getTime());
      interval = setInterval(() => setElapsed(Date.now() - new Date(run.start_at).getTime()), 100);
    } else if (run?.status === "COMPLETED") {
      setElapsed(maxElapsed);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [run?.status, run?.start_at, maxElapsed]);

  useEffect(() => {
    if (flashTick.current) window.clearInterval(flashTick.current);
    flashTick.current = window.setInterval(() => {
      const now = Date.now();
      setFlashList((prev) => prev.filter((x) => x.expiresAt > now));
    }, 120);
    return () => { if (flashTick.current) window.clearInterval(flashTick.current); };
  }, []);

  function pushFlash(fullName: string) {
    const now = Date.now();
    const id = `${now}-${Math.random().toString(16).slice(2)}`;
    setFlashList((prev) => [{ id, name: lastWordUpper(fullName), expiresAt: now + 2200 }, ...prev].slice(0, 5));
  }

  const raceType = String(lane?.race_type ?? "").toLowerCase();
  const lapsTotal = useMemo(() => {
    if (raceType.includes("1000")) return 5.5;
    const v = Number(lane?.laps_total ?? 0) || 0;
    return v;
  }, [raceType, lane?.laps_total]);

  const frac = lapsTotal > 0 ? lapsTotal - Math.floor(lapsTotal) : 0;
  const hasHalfFirstSplit = frac > 0;
  const lapsDisplayTotal = Math.max(1, Math.floor(lapsTotal || 0));

  const defaultTargetTotalMs = useMemo(() => {
    if (raceType.includes("1000")) return msFromMinSec("4", "30");
    if (raceType.includes("2000")) return msFromMinSec("10", "00");
    return 0;
  }, [raceType]);

  const runTargetTotalMsRaw = Number((run as any)?.target_total_ms ?? 0) || 0;
  const effectiveTargetTotalMs = runTargetTotalMsRaw || defaultTargetTotalMs;

  useEffect(() => {
    if (!lane || !run) return;
    const t = effectiveTargetTotalMs;
    const { m, s } = minSecFromMs(t || 0);
    setTargetMin(m);
    setTargetSec(s);
    const ideal = lapsTotal ? Math.round((t || 0) / lapsTotal) : 0;
    setIdealLapMmss(ideal ? mmssFromMs(ideal) : "");
  }, [lane?.id, run?.id]);

  const idealLapMs = useMemo(() => {
    const manual = msFromMmss(idealLapMmss);
    if (manual > 0) return manual;
    if (!effectiveTargetTotalMs || !lapsTotal) return 0;
    return Math.round(effectiveTargetTotalMs / lapsTotal);
  }, [idealLapMmss, effectiveTargetTotalMs, lapsTotal]);

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

  const derived = useMemo(() => {
    const out: Record<string, any> = {};
    for (const a of assignments as any[]) {
      const events = lapsByAssignment.get(a.id) ?? [];
      const n = events.length;
      const lastEv = events[n - 1];
      const totalElapsedAtLast = n ? Number(lastEv.elapsed_ms) : 0;

      const maxLapNumber = events.reduce((max: number, ev: any) => Math.max(max, Number(ev.lap_number) || 0), 0);
      const hasLapNumbers = events.some((ev: any) => ev.lap_number != null && Number(ev.lap_number) > 0);
      const lapCountForDistance = hasLapNumbers ? maxLapNumber : events.length;

      let distanceDone = 0;
      if (lapCountForDistance > 0) {
        if (hasHalfFirstSplit) distanceDone = Math.min(lapsTotal, 0.5 + Math.max(0, lapCountForDistance - 1));
        else distanceDone = Math.min(lapsTotal, lapCountForDistance);
      }

      const splitMs: number[] = [];
      for (let i = 0; i < n; i++) {
        const ev = events[i];
        const prev = events[i - 1];
        splitMs.push(i === 0 ? Number(ev.elapsed_ms) : Number(ev.elapsed_ms) - Number(prev.elapsed_ms));
      }

      const splitNormMs = splitMs.map((ms, i) => (hasHalfFirstSplit && i === 0 ? ms * 2 : ms));
      const lastSplit = splitMs.length ? splitMs[splitMs.length - 1] : null;
      const lastSplitNorm = splitNormMs.length ? splitNormMs[splitNormMs.length - 1] : null;
      const avgPerLapNorm = distanceDone > 0 ? Math.round(totalElapsedAtLast / distanceDone) : null;

      const idealElapsedAtLast = idealLapMs > 0 ? Math.round(idealLapMs * distanceDone) : 0;
      const gapMs = idealLapMs > 0 && n > 0 ? totalElapsedAtLast - idealElapsedAtLast : null;
      const bufferMs = idealLapMs > 0 && n > 0 ? idealElapsedAtLast - totalElapsedAtLast : null;

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

      let pcs: number | null = null;
      if (splitNormMs.length >= 2) {
        const mean = splitNormMs.reduce((x, y) => x + y, 0) / splitNormMs.length;
        const sd = stddev(splitNormMs);
        const cv = mean > 0 ? sd / mean : 0;
        pcs = Math.round(clamp(100 - cv * 300, 0, 100));
      }

      let arrow: TrendArrow = "FLAT";
      if (avgPerLapNorm != null && idealLapMs > 0) {
        const ratio = avgPerLapNorm / idealLapMs;
        if (ratio <= 0.9) arrow = "UP";
        else if (ratio <= 0.97) arrow = "UP45";
        else if (ratio < 1.03) arrow = "FLAT";
        else if (ratio < 1.15) arrow = "DOWN45";
        else arrow = "DOWN";
      }

      const finished = distanceDone >= lapsTotal && lapsTotal > 0;

      out[a.id] = {
        n, events, totalElapsedAtLast, distanceDone, splitMs, splitNormMs,
        lastSplit, lastSplitNorm, avgPerLapNorm, gapMs, bufferMs,
        projectedFinishMs, pcs, arrow, finished,
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

  // Finish UI transitions
  useEffect(() => {
    const activeIds = new Set((assignments as any[]).map((a: any) => a.id));
    setFinishUi((prev) => {
      const next: FinishUiMap = {};
      for (const [id, st] of Object.entries(prev)) { if (activeIds.has(id)) next[id] = st; }
      return next;
    });

    for (const a of assignments as any[]) {
      const id = a.id as string;
      const isFin = !!derived[id]?.finished;
      const wasFin = !!prevFinishedRef.current[id];

      if (isFin && !wasFin) {
        prevFinishedRef.current[id] = true;
        setFinishUi((prev) => ({ ...prev, [id]: { finishedAt: Date.now(), collapsed: false, movedKey: prev[id]?.movedKey ?? 0 } }));
        const oldT = finishTimersRef.current[id];
        if (oldT) window.clearTimeout(oldT);
        finishTimersRef.current[id] = window.setTimeout(() => {
          setFinishUi((prev) => {
            const curr = prev[id];
            if (!curr) return prev;
            return { ...prev, [id]: { ...curr, collapsed: true, movedKey: (curr.movedKey ?? 0) + 1 } };
          });
        }, 3000);
      }

      if (!isFin && wasFin) {
        prevFinishedRef.current[id] = false;
        const oldT = finishTimersRef.current[id];
        if (oldT) window.clearTimeout(oldT);
        delete finishTimersRef.current[id];
        setFinishUi((prev) => { const { [id]: _, ...rest } = prev; return rest; });
        setExpandedFinished((prev) => { const { [id]: _, ...rest } = prev; return rest; });
      }
    }
  }, [assignments, derived]);

  useEffect(() => {
    return () => { for (const t of Object.values(finishTimersRef.current)) window.clearTimeout(t); };
  }, []);

  async function completeRun() {
    if (!run?.id) return;
    const { error } = await supabase.from("runs").update({ status: "COMPLETED" }).eq("id", run.id);
    if (error) toast.error("Eroare la finalizare cursă");
    refetchRun();
  }

  useEffect(() => {
    if (run?.status === "RUNNING" && allFinished) {
      completeRun();
      playBeep(150, 523); setTimeout(() => playBeep(150, 659), 150);
      setTimeout(() => playBeep(150, 784), 300); setTimeout(() => playBeep(400, 1046), 450);
      if (typeof navigator !== "undefined" && (navigator as any).vibrate) (navigator as any).vibrate([200, 100, 200, 100, 400]);
      toast.success("Cursă finalizată!");
    }
  }, [allFinished, run?.status]);

  const sortedAssignments = useMemo(() => {
    const list = [...(assignments as any[])];
    const isCollapsedFinished = (a: any) => !!derived[a.id]?.finished && !!finishUi[a.id]?.collapsed;
    const finalMs = (a: any) => { const v = derived[a.id]?.totalElapsedAtLast; const n = Number(v); return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; };
    const g0: any[] = [], g1: any[] = [], g2: any[] = [];
    for (const a of list) {
      if (a.is_abandoned) g2.push(a);
      else if (isCollapsedFinished(a)) g1.push(a);
      else g0.push(a);
    }
    g0.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    g1.sort((a, b) => finalMs(a) - finalMs(b));
    g2.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return [...g0, ...g1, ...g2];
  }, [assignments, derived, finishUi]);

  async function addLap(a: any) {
    if (!run || run.status !== "RUNNING" || !run.start_at) return;
    if (a.is_abandoned) return;
    const d = derived[a.id];
    if (d?.finished) return;
    const pendingKey = a.id;
    if (pendingLapRef.current[pendingKey]) return;
    pendingLapRef.current[pendingKey] = true;

    const nowTs = Date.now();
    const existing = retryLapEventIdRef.current[pendingKey];
    const clientEventId = existing && nowTs - existing.ts < 3_000 ? existing.id : crypto.randomUUID();
    retryLapEventIdRef.current[pendingKey] = { id: clientEventId, ts: nowTs };

    try {
      const elapsedMs = Date.now() - new Date(run.start_at).getTime();
      const { data, error } = await (supabase as any).rpc("add_lap_event_atomic", {
        p_run_id: run.id, p_lane_assignment_id: a.id,
        p_elapsed_ms: elapsedMs, p_coach: coach ?? "COACH", p_client_event_id: clientEventId,
      });
      if (error) { toast.error(`Lap nereușit: ${error.message ?? "Eroare"}`); return; }

      const row = Array.isArray(data) ? (data as any)[0] : (data as any);
      if (!row?.inserted) { window.setTimeout(() => { const cur = retryLapEventIdRef.current[pendingKey]; if (cur?.id === clientEventId) delete retryLapEventIdRef.current[pendingKey]; }, 3_000); return; }

      window.setTimeout(() => { const cur = retryLapEventIdRef.current[pendingKey]; if (cur?.id === clientEventId) delete retryLapEventIdRef.current[pendingKey]; }, 3_000);

      pushFlash(a.athletes?.full_name ?? "Sportiv");
      setPulseId(a.id);
      window.setTimeout(() => setPulseId(null), 400);
      playBeep(60, 880);
      try { if (typeof navigator !== "undefined" && (navigator as any).vibrate) (navigator as any).vibrate(25); } catch {}
    } finally {
      pendingLapRef.current[pendingKey] = false;
    }
  }

  async function undoLastLap(a: any) {
    if (!run?.id) return;
    const { data, error } = await supabase.from("lap_events").select("id").eq("run_id", run.id).eq("lane_assignment_id", a.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !data?.id) { toast.message("Nu există lap de șters"); return; }
    const { error: delErr } = await supabase.from("lap_events").delete().eq("id", data.id);
    if (delErr) { toast.error("UNDO nereușit"); return; }
    toast.success("UNDO OK");
  }

  async function abandonAthlete(a: any) {
    const { error } = await supabase.from("lane_assignments").update({ is_abandoned: true }).eq("id", a.id);
    if (error) { toast.error("ABANDON nereușit"); return; }
    toast.success("Marcat ABANDON");
    refetchAssignments();
  }

  async function startRun() {
    if (!run?.id || startPending) return;
    setStartPending(true);
    try {
      const { data, error } = await supabase.rpc("start_run_atomic", { p_run_id: run.id });
      if (error) { toast.error("Nu pot porni cursa"); return; }
      if (!data) { await refetchRun(); return; }
      qc.setQueryData(["run-current", timingSession?.id, laneId], (prev: any) => prev ? { ...prev, status: "RUNNING", start_at: data } : prev);
      await refetchRun();
    } finally { setStartPending(false); }
  }

  async function stopRun() {
    if (!run?.id) return;
    const { error } = await supabase.from("runs").update({ status: "PAUSED", start_at: null }).eq("id", run.id);
    if (error) { toast.error("Nu pot opri cursa"); return; }
    refetchRun();
  }

  async function saveTargetSettings() {
    const totalMs = msFromMinSec(targetMin, targetSec);
    if (!run?.id) return;
    const { error } = await supabase.from("runs").update({ target_total_ms: totalMs || null }).eq("id", run.id);
    if (error) { toast.error("Nu pot salva target-ul"); return; }
    toast.success("Setări salvate");
    setSettingsOpen(false);
    refetchRun();
  }

  async function saveLabel(a: any, value: string) {
    const v = (value ?? "").trim();
    const { error } = await supabase.from("lane_assignments").update({ external_name: v || null }).eq("id", a.id);
    if (error) { toast.error("Nu pot salva"); return; }
    refetchAssignments();
  }

  // Card pace color — returns CSS variables approach
  function getPaceStatus(a: any, d: any): "green" | "amber" | "red" | "neutral" | "done" | "abandoned" {
    if (a.is_abandoned) return "abandoned";
    if (d?.finished) return "done";
    if (run?.status !== "RUNNING" || !effectiveTargetTotalMs || !lapsTotal) return "neutral";

    const nowElapsed = elapsed;
    const distanceDone = d?.distanceDone ?? 0;
    const remainingDistance = Math.max(0.0001, lapsTotal - distanceDone);
    const timeLeft = Math.max(0, effectiveTargetTotalMs - nowElapsed);
    const requiredAvgLeft = timeLeft / remainingDistance;
    const nextSegDist = hasHalfFirstSplit && (d?.n ?? 0) === 0 ? 0.5 : 1;
    const lastElapsed = (d?.n ?? 0) > 0 ? d.totalElapsedAtLast : 0;
    const expectedNext = lastElapsed + requiredAvgLeft * nextSegDist;
    const delay = nowElapsed - expectedNext;
    const maxYellow = requiredAvgLeft * nextSegDist * 0.3;
    const t = delay <= 0 ? 0 : delay / maxYellow;

    if (t >= 1) return "red";
    if (t > 0) return "amber";
    return "green";
  }

  const isRunning = run?.status === "RUNNING";
  const isCompleted = run?.status === "COMPLETED";
  const raceTitle = lane?.race_type ? String(lane.race_type) : "Cursă";
  const groupTitle = lane?.name ? String(lane.name) : "";

  function splitLabel(i: number) {
    if (hasHalfFirstSplit && i === 0) return "½";
    const lapNo = hasHalfFirstSplit ? i : i + 1;
    return `T${lapNo}`;
  }

  const statusColors = {
    green:    { bg: "#0d2218", border: "#16a34a", gapColor: "#4ade80" },
    amber:    { bg: "#221a06", border: "#d97706", gapColor: "#fbbf24" },
    red:      { bg: "#210d0d", border: "#dc2626", gapColor: "#f87171" },
    neutral:  { bg: "#16161a", border: "#2a2a35", gapColor: "#a1a1aa" },
    done:     { bg: "#0a1a2e", border: "#1d4ed8", gapColor: "#60a5fa" },
    abandoned:{ bg: "#111111", border: "#27272a", gapColor: "#52525b" },
  };

  return (
    <div
      className="min-h-screen pb-20"
      style={{ background: "#0a0a0e", fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace" }}
    >
      {/* ── STICKY HEADER ── */}
      <div
        className="sticky top-0 z-30"
        style={{
          background: "rgba(10,10,14,0.97)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1e1e28",
        }}
      >
        {/* Flash name overlay */}
        {flashList.length > 0 && (
          <div className="absolute inset-x-0 top-0 flex justify-center pointer-events-none" style={{ zIndex: 40 }}>
            {flashList.slice(0, 1).map((f) => {
              const remaining = f.expiresAt - Date.now();
              const opacity = remaining < 700 ? clamp(remaining / 700, 0, 1) : 1;
              return (
                <div
                  key={f.id}
                  style={{
                    opacity,
                    transition: "opacity 120ms linear",
                    fontSize: "13px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: "#fbbf24",
                    paddingTop: "2px",
                  }}
                >
                  {f.name}
                </div>
              );
            })}
          </div>
        )}

        <div className="px-3 pt-2 pb-2">
          {/* Group name + back + settings row */}
          <div className="flex items-center justify-between mb-1">
            <button
              onClick={() => navigate("/timing")}
              className="flex items-center gap-1"
              style={{ color: "#6366f1", fontSize: "13px", fontWeight: 600 }}
            >
              <ChevronLeft size={16} />
              {groupTitle}
            </button>

            <button
              onClick={() => setSettingsOpen((v) => !v)}
              style={{
                color: settingsOpen ? "#6366f1" : "#52525b",
                background: settingsOpen ? "rgba(99,102,241,0.12)" : "transparent",
                border: `1px solid ${settingsOpen ? "#6366f1" : "#27272a"}`,
                borderRadius: "8px",
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              <Settings size={14} />
              {effectiveTargetTotalMs > 0 ? formatClockMs(effectiveTargetTotalMs) : "Target"}
            </button>
          </div>

          {/* Timer + Start/Stop */}
          <div className="flex items-center justify-between gap-3">
            <div
              style={{
                fontSize: "44px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: isRunning ? "#f0f0f5" : isCompleted ? "#60a5fa" : "#52525b",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                fontFamily: "'DM Mono', 'Fira Code', monospace",
              }}
            >
              {formatMs(elapsed)}
            </div>

            <button
              onClick={isRunning ? stopRun : startRun}
              disabled={startPending}
              style={{
                minWidth: "88px",
                height: "48px",
                borderRadius: "12px",
                border: "none",
                fontWeight: 700,
                fontSize: "16px",
                letterSpacing: "0.04em",
                cursor: startPending ? "wait" : "pointer",
                background: isRunning
                  ? "linear-gradient(135deg, #dc2626, #991b1b)"
                  : "linear-gradient(135deg, #16a34a, #166534)",
                color: "#fff",
                boxShadow: isRunning
                  ? "0 0 20px rgba(220,38,38,0.4)"
                  : "0 0 20px rgba(22,163,74,0.4)",
                transition: "all 150ms",
                flexShrink: 0,
              }}
            >
              {startPending ? "..." : isRunning ? "STOP" : "START"}
            </button>
          </div>

          {/* Laps info row */}
          <div style={{ fontSize: "11px", color: "#52525b", marginTop: "2px", letterSpacing: "0.05em" }}>
            {lapsTotal ? `${lapsDisplayTotal} TURE${hasHalfFirstSplit ? " + ½" : ""}` : ""}&nbsp;
            {isRunning && <span style={{ color: "#22d3ee" }}>● LIVE</span>}
            {isCompleted && <span style={{ color: "#60a5fa" }}>✓ FINAL</span>}
          </div>
        </div>

        {/* Settings panel */}
        {settingsOpen && (
          <div style={{ background: "#0f0f16", borderTop: "1px solid #1e1e28", padding: "12px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", alignItems: "end" }}>
              <div>
                <div style={{ fontSize: "10px", color: "#52525b", marginBottom: "4px", letterSpacing: "0.08em" }}>MIN</div>
                <Input
                  inputMode="numeric"
                  className="h-9 text-center"
                  style={{ background: "#16161e", border: "1px solid #2a2a35", color: "#f0f0f5", fontFamily: "monospace" }}
                  value={targetMin}
                  onChange={(e) => setTargetMin(e.target.value.replace(/\D/g, ""))}
                  placeholder="min"
                />
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#52525b", marginBottom: "4px", letterSpacing: "0.08em" }}>SEC</div>
                <Input
                  inputMode="numeric"
                  className="h-9 text-center"
                  style={{ background: "#16161e", border: "1px solid #2a2a35", color: "#f0f0f5", fontFamily: "monospace" }}
                  value={targetSec}
                  onChange={(e) => setTargetSec(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="sec"
                />
              </div>
              <button
                onClick={saveTargetSettings}
                style={{
                  height: "36px", borderRadius: "8px", background: "#6366f1",
                  color: "#fff", fontWeight: 700, fontSize: "13px", border: "none",
                }}
              >
                OK
              </button>
            </div>
            <div style={{ marginTop: "8px", fontSize: "10px", color: "#3f3f52" }}>
              Ideal/tur: {idealLapMs ? mmssFromMs(idealLapMs) : "—"} · Long press pe sportiv → UNDO / ABANDON
            </div>
          </div>
        )}
      </div>

      {/* ── ATHLETES GRID (3 columns) ── */}
      <div style={{ padding: "10px 8px 8px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "7px" }}>
        {sortedAssignments.map((a: any) => {
          const d = derived[a.id];
          const status = getPaceStatus(a, d);
          const colors = statusColors[status];
          const isCollapsed = !!d?.finished && !!finishUi[a.id]?.collapsed;
          const showExpanded = !!expandedFinished[a.id];
          const pressed = pulseId === a.id;

          const doneInt = Math.max(0, Math.floor(d?.distanceDone ?? 0));
          const hasHalfMarker = hasHalfFirstSplit && ((d?.distanceDone ?? 0) - Math.floor(d?.distanceDone ?? 0) >= 0.49);
          const lapsTxt = hasHalfMarker ? `${doneInt}.5/${lapsDisplayTotal}` : `${doneInt}/${lapsDisplayTotal}`;

          const gapTxt = d?.gapMs == null
            ? "—"
            : `${d.gapMs >= 0 ? "+" : ""}${(d.gapMs / 1000).toFixed(1)}s`;

          const lastSplitTxt = d?.lastSplit != null ? mmssFromMs(d.lastSplit) : "—";
          const finalTxt = d?.finished ? formatMs(Number(d?.totalElapsedAtLast ?? 0)) : null;

          const canTap = isRunning && !a.is_abandoned && !d?.finished;
          const mainName = (a.athletes?.full_name ?? a.external_name ?? "?").toUpperCase().split(/\s+/).pop() ?? "?";
          const suffix = (a.external_name ?? "").trim();

          // Compact card (collapsed finished)
          if (isCollapsed && !showExpanded) {
            return (
              <button
                key={`${a.id}-done-${finishUi[a.id]?.movedKey ?? 0}`}
                onClick={() => setExpandedFinished((prev) => ({ ...prev, [a.id]: true }))}
                style={{
                  background: colors.bg,
                  border: `1.5px solid ${colors.border}`,
                  borderRadius: "10px",
                  padding: "7px 6px",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#a1a1aa", letterSpacing: "0.06em", marginBottom: "2px" }}>{mainName}</div>
                <div style={{ fontSize: "13px", fontWeight: 800, color: colors.gapColor, fontVariantNumeric: "tabular-nums" }}>{finalTxt}</div>
                <div style={{ fontSize: "9px", color: "#6366f1", fontWeight: 700, marginTop: "2px" }}>✓ FINISH</div>
              </button>
            );
          }

          return (
            <button
              key={isCollapsed ? `${a.id}-exp-${finishUi[a.id]?.movedKey ?? 0}` : a.id}
              style={{
                background: colors.bg,
                border: `1.5px solid ${pressed ? "#818cf8" : colors.border}`,
                borderRadius: "10px",
                padding: "8px 7px",
                textAlign: "left",
                cursor: canTap ? "pointer" : "default",
                boxShadow: pressed ? "0 0 0 2px rgba(129,140,248,0.4)" : "none",
                transition: "border-color 120ms, box-shadow 120ms, background 120ms",
                opacity: a.is_abandoned ? 0.45 : 1,
                position: "relative",
              }}
              onClick={() => {
                if (isCollapsed && showExpanded) { setExpandedFinished((prev) => ({ ...prev, [a.id]: false })); return; }
                if (canTap) addLap(a);
              }}
              onPointerDown={() => {
                if (!isRunning) return;
                pressTimer.current = window.setTimeout(() => setMenuFor(a), 2000);
              }}
              onPointerUp={() => { if (pressTimer.current) window.clearTimeout(pressTimer.current); }}
              onPointerLeave={() => { if (pressTimer.current) window.clearTimeout(pressTimer.current); }}
            >
              {/* Name */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "4px" }}>
                <div style={{
                  fontSize: "13px",
                  fontWeight: 800,
                  color: a.is_abandoned ? "#52525b" : "#e4e4ef",
                  letterSpacing: "0.04em",
                  lineHeight: 1.1,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {mainName}
                </div>
                {d?.finished && (
                  <div style={{ fontSize: "8px", background: "#1d4ed8", color: "#bfdbfe", borderRadius: "4px", padding: "1px 4px", fontWeight: 700, flexShrink: 0, marginLeft: "2px" }}>
                    FIN
                  </div>
                )}
              </div>

              {/* GAP — primary metric */}
              <div style={{
                fontSize: d?.gapMs == null ? "18px" : "22px",
                fontWeight: 900,
                color: colors.gapColor,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                marginBottom: "5px",
                letterSpacing: d?.finished ? "0" : "-0.02em",
              }}>
                {d?.finished ? finalTxt : gapTxt}
              </div>

              {/* Secondary row: laps + last split */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#a1a1aa", fontVariantNumeric: "tabular-nums" }}>
                  {lapsTxt}
                </div>
                <div style={{ fontSize: "11px", color: "#6b6b80", fontVariantNumeric: "tabular-nums" }}>
                  {lastSplitTxt}
                </div>
              </div>

              {/* Suffix label (external name / tricou etc) */}
              {suffix && (
                <div style={{ fontSize: "9px", color: "#4a4a5a", marginTop: "2px", letterSpacing: "0.06em" }}>{suffix}</div>
              )}

              {/* Expanded split list */}
              {isCollapsed && showExpanded && d?.splitMs && (
                <div style={{ marginTop: "8px", borderTop: "1px solid #1e1e2e", paddingTop: "6px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3px" }}>
                    {d.splitMs.map((ms: number, i: number) => (
                      <div key={i} style={{ background: "#0f0f18", borderRadius: "5px", padding: "3px 4px", textAlign: "center" }}>
                        <div style={{ fontSize: "8px", color: "#52525b", fontWeight: 700 }}>{splitLabel(i)}</div>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "#e4e4ef", fontVariantNumeric: "tabular-nums" }}>{mmssFromMs(ms)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── LONG PRESS MENU ── */}
      {menuFor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => setMenuFor(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "480px",
              background: "#13131a",
              borderTop: "1px solid #2a2a35",
              borderRadius: "20px 20px 0 0",
              padding: "20px 16px 32px",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#a1a1aa", marginBottom: "12px", letterSpacing: "0.05em" }}>
              {lastWordUpper(menuFor.athletes?.full_name ?? menuFor.external_name ?? "SPORTIV")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button
                onClick={async () => { await undoLastLap(menuFor); setMenuFor(null); }}
                style={{ height: "48px", borderRadius: "10px", background: "#1e1e2e", border: "1px solid #2a2a35", color: "#e4e4ef", fontWeight: 700, fontSize: "14px" }}
              >
                ↩ UNDO lap
              </button>
              <button
                onClick={async () => { await abandonAthlete(menuFor); setMenuFor(null); }}
                style={{ height: "48px", borderRadius: "10px", background: "#2a0a0a", border: "1px solid #7f1d1d", color: "#f87171", fontWeight: 700, fontSize: "14px" }}
              >
                ✕ ABANDON
              </button>
            </div>
            <button
              onClick={() => setMenuFor(null)}
              style={{ marginTop: "10px", width: "100%", height: "40px", borderRadius: "10px", background: "transparent", border: "1px solid #2a2a35", color: "#52525b", fontWeight: 600, fontSize: "13px" }}
            >
              Anulează
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
