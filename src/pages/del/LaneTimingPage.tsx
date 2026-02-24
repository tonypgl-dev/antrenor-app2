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

function formatMs(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function lastWordUpper(name: string | null | undefined) {
  const n = (name ?? "").trim();
  if (!n) return "SPORTIV";
  const parts = n.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] ?? n).toUpperCase();
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
  const { m, s } = minSecFromMs(ms);
  return `${m}:${s}`;
}

function msFromMmss(v: string) {
  const t = (v ?? "").trim();
  if (!t) return 0;
  const parts = t.split(":");
  if (parts.length == 1) return (parseInt(parts[0], 10) || 0) * 1000;
  const m = parseInt(parts[0], 10) || 0;
  const s = parseInt(parts[1], 10) || 0;
  return (m * 60 + s) * 1000;
}

function classForDiffMs(diffMs: number) {
  // diff = actual - ideal (ms). Negative is faster.
  if (diffMs <= -1200) return "bg-emerald-100 border-emerald-300";
  if (diffMs <= -400) return "bg-emerald-50 border-emerald-200";
  if (diffMs < 400) return "bg-card border-border";
  if (diffMs < 1200) return "bg-amber-50 border-amber-200";
  return "bg-rose-50 border-rose-200";
}

export default function LaneTimingPage() {
  const { laneId } = useParams();
  const navigate = useNavigate();
  const { coach } = useCoach();
  const qc = useQueryClient();

  const pressTimer = useRef<number | null>(null);

  const [elapsed, setElapsed] = useState(0);

  // flash feedback list near timer
  const [flashList, setFlashList] = useState<FlashItem[]>([]);
  const flashTick = useRef<number | null>(null);

  // button visual pulse on tap
  const [pulseId, setPulseId] = useState<string | null>(null);

  // settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [targetMin, setTargetMin] = useState("");
  const [targetSec, setTargetSec] = useState("");
  const [idealLapMmss, setIdealLapMmss] = useState(""); // editable
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>({});

  // long press menu
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
      const { data, error } = await supabase
        .from("lanes")
        .select("*")
        .eq("id", laneId!)
        .single();
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
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // realtime subscriptions for lap events
  useEffect(() => {
    if (!run?.id) return;

    const channel = supabase
      .channel(`lap_events_run_${run.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lap_events", filter: `run_id=eq.${run.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["lap-events", run.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [run?.id, qc]);

  // timer tick
  useEffect(() => {
    let interval: any;
    if (run?.status === "RUNNING" && run.start_at) {
      interval = setInterval(() => {
        setElapsed(Date.now() - new Date(run.start_at).getTime());
      }, 100);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [run?.status, run?.start_at]);

  // keep flashList alive (for fade animation)
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

  // hydrate target inputs when run/lane changes
  useEffect(() => {
    if (!run || !lane) return;
    const total = run.target_total_ms ?? 0;
    const { m, s } = minSecFromMs(total);
    setTargetMin(m);
    setTargetSec(s);
    const lapsTotal = Number(lane.laps_total ?? 0) || 0;
    const idealLap = lapsTotal > 0 && total > 0 ? Math.round(total / lapsTotal) : 0;
    setIdealLapMmss(idealLap ? mmssFromMs(idealLap) : "");
  }, [run?.id, run?.target_total_ms, lane?.id, lane?.laps_total]);

  function pushFlash(fullName: string) {
    const name = lastWordUpper(fullName);
    const now = Date.now();
    const id = `${now}-${Math.random().toString(16).slice(2)}`;
    const ttl = 2200; // 1.5s show + ~0.7s fade
    setFlashList((prev) => [{ id, name, expiresAt: now + ttl }, ...prev].slice(0, 5));
  }

  async function addLap(a: any) {
    if (!run || run.status !== "RUNNING" || !run.start_at) return;
    if (a.is_abandoned) return;

    const elapsedMs = Date.now() - new Date(run.start_at).getTime();

    // visual feedback
    pushFlash(a.athletes?.full_name ?? "Sportiv");
    setPulseId(a.id);
    window.setTimeout(() => setPulseId((p) => (p === a.id ? null : p)), 900);

    const { error } = await (supabase as any).rpc("add_lap_event_atomic", {
      p_run_id: run.id,
      p_lane_assignment_id: a.id,
      p_elapsed_ms: elapsedMs,
      p_coach: coach ?? "COACH",
    });

    if (error) {
      toast.error(`Lap nereușit: ${error.message ?? "Eroare"}`);
      console.error(error);
    }
  }

  async function startRun() {
    if (!run) return;
    await supabase
      .from("runs")
      .update({ status: "RUNNING", start_at: new Date().toISOString() })
      .eq("id", run.id);
    refetchRun();
  }

  async function stopRun() {
    if (!run) return;
    await supabase.from("runs").update({ status: "PAUSED" }).eq("id", run.id);
    refetchRun();
  }

  async function abandonAthlete(a: any) {
    await supabase.from("lane_assignments").update({ is_abandoned: true }).eq("id", a.id);
    toast.success("Marcat abandon");
    refetchAssignments();
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
      toast.error("Nu pot citi ultimul lap");
      console.error(error);
      return;
    }
    if (!data?.id) {
      toast.message("Nu există lap de șters");
      return;
    }
    const del = await supabase.from("lap_events").delete().eq("id", data.id);
    if (del.error) {
      toast.error("Undo eșuat");
      console.error(del.error);
      return;
    }
    toast.success("Undo lap");
  }

  async function saveRunTarget() {
    if (!run || !lane) return;
    const lapsTotal = Number(lane.laps_total ?? 0) || 0;

    // compute total from inputs (or from idealLapMmss if edited)
    const totalMsFromInputs = msFromMinSec(targetMin, targetSec);

    // if idealLapMmss is filled, treat it as source-of-truth and recompute total
    let totalMs = totalMsFromInputs;
    const idealLapMs = idealLapMmss ? msFromMmss(idealLapMmss) : 0;
    if (lapsTotal > 0 && idealLapMs > 0) {
      totalMs = Math.round(idealLapMs * lapsTotal);
      const { m, s } = minSecFromMs(totalMs);
      setTargetMin(m);
      setTargetSec(s);
    }

    const { error } = await supabase.from("runs").update({ target_total_ms: totalMs }).eq("id", run.id);
    if (error) {
      toast.error("Nu pot salva target");
      console.error(error);
      return;
    }
    toast.success("Target salvat");
    setSettingsOpen(false);
    refetchRun();
  }

  function recalcIdealFromTotal(mStr: string, sStr: string) {
    const totalMs = msFromMinSec(mStr, sStr);
    if (!lane?.laps_total) {
      setIdealLapMmss("");
      return;
    }
    const lapsTotal = Number(lane.laps_total ?? 0) || 0;
    const ideal = lapsTotal > 0 && totalMs > 0 ? Math.round(totalMs / lapsTotal) : 0;
    setIdealLapMmss(ideal ? mmssFromMs(ideal) : "");
  }

  // lap metrics per athlete
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

  const lapsTotal = Number(lane?.laps_total ?? 0) || 0;
  const frac = lapsTotal > 0 ? lapsTotal - Math.floor(lapsTotal) : 0; // 0 or 0.5
  const hasHalfFirstSplit = frac > 0;

  const runTargetTotalMs = Number(run?.target_total_ms ?? 0) || 0;
  const idealLapMs = useMemo(() => {
    if (!runTargetTotalMs || !lapsTotal) return 0;
    return Math.round(runTargetTotalMs / lapsTotal);
  }, [runTargetTotalMs, lapsTotal]);

  const derived = useMemo(() => {
    const out: Record<string, any> = {};
    for (const a of assignments as any[]) {
      const events = lapsByAssignment.get(a.id) ?? [];
      const lapsCount = events.length;

      let distanceDone = 0;
      if (lapsCount > 0) {
        if (hasHalfFirstSplit) distanceDone = Math.min(lapsTotal, frac + Math.max(0, lapsCount - 1));
        else distanceDone = Math.min(lapsTotal, lapsCount);
      }

      const lastEv = events[lapsCount - 1];
      const prevEv = events[lapsCount - 2];

      const lastSplitMs =
        lapsCount === 0 ? null : lapsCount === 1 ? Number(lastEv.elapsed_ms) : Number(lastEv.elapsed_ms) - Number(prevEv.elapsed_ms);

      const totalElapsed = lapsCount ? Number(lastEv.elapsed_ms) : 0;
      const avgLapMs = distanceDone > 0 ? Math.round(totalElapsed / distanceDone) : null;

      let lastSplitIdeal = 0;
      if (lastSplitMs != null && idealLapMs > 0) {
        if (hasHalfFirstSplit && lapsCount === 1) lastSplitIdeal = Math.round(idealLapMs * frac);
        else lastSplitIdeal = idealLapMs;
      }
      const lastSplitDiffMs = lastSplitMs != null && lastSplitIdeal ? lastSplitMs - lastSplitIdeal : null;

      const finished = distanceDone >= lapsTotal && lapsTotal > 0;

      out[a.id] = { lapsCount, distanceDone, lastSplitMs, lastSplitDiffMs, avgLapMs, finished };
    }
    return out;
  }, [assignments, lapsByAssignment, hasHalfFirstSplit, frac, lapsTotal, idealLapMs]);

  const sortedAssignments = useMemo(() => {
    const list = [...(assignments as any[])];
    list.sort((a, b) => {
      const aa = a.is_abandoned ? 1 : 0;
      const bb = b.is_abandoned ? 1 : 0;
      if (aa !== bb) return aa - bb;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    return list;
  }, [assignments]);

  function displayLabel(a: any) {
    const ext = (a.external_name ?? "").trim();
    if (ext) return lastWordUpper(ext);
    return lastWordUpper(a.athletes?.full_name ?? "Sportiv");
  }

  function fullName(a: any) {
    return (a.athletes?.full_name ?? "Sportiv").toUpperCase();
  }

  const canEdit = settingsOpen && run?.status !== "RUNNING";

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

  const raceTitle = lane?.race_type ? String(lane.race_type) : "Cursă";
  const groupTitle = lane?.name ? String(lane.name) : "";

  return (
    <div className="pb-24">
      <PageHeader title={raceTitle} subtitle={groupTitle} />

      <div className="px-4 py-2">
        <div className="relative rounded-xl border bg-card p-3">
          <div className="pointer-events-none absolute left-0 right-0 -top-7 flex flex-col items-center gap-1">
            {flashList.map((f) => {
              const remaining = f.expiresAt - Date.now();
              const fadeStart = 700;
              const opacity = remaining <= 0 ? 0 : remaining < fadeStart ? Math.max(0, remaining / fadeStart) : 1;
              return (
                <div
                  key={f.id}
                  className="text-3xl font-bold tracking-wide"
                  style={{ opacity, transition: "opacity 120ms linear" }}
                >
                  {f.name}
                </div>
              );
            })}
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 text-center text-3xl font-bold">{formatMs(elapsed)}</div>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen((v) => !v)} className="h-9 px-3">
              ⚙️
            </Button>
          </div>

          {settingsOpen && (
            <div className="mt-3 space-y-3 border-t pt-3">
              <div className="text-sm text-muted-foreground">Target total (min / sec)</div>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-24"
                  value={targetMin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, "");
                    setTargetMin(v);
                    recalcIdealFromTotal(v, targetSec);
                  }}
                  placeholder="min"
                />
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-24"
                  value={targetSec}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, "");
                    setTargetSec(v);
                    recalcIdealFromTotal(targetMin, v);
                  }}
                  placeholder="sec"
                />
              </div>

              <div className="text-sm text-muted-foreground">Ideal / lap (mm:ss) (editabil)</div>
              <Input
                className="w-32"
                value={idealLapMmss}
                onChange={(e) => setIdealLapMmss(e.target.value.replace(/[^\d:]/g, ""))}
                placeholder="0:54"
              />

              <div className="flex gap-2">
                <Button onClick={saveRunTarget} className="h-10 flex-1">
                  OK
                </Button>
                <Button variant="outline" onClick={() => setSettingsOpen(false)} className="h-10">
                  Cancel
                </Button>
              </div>

              {canEdit && (
                <div className="text-xs text-muted-foreground">
                  Edit nume sportivi direct în butoane (mai jos). După START, editarea se blochează.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4">
        <div className="grid grid-cols-2 gap-3">
          {sortedAssignments.map((a: any) => {
            const d = derived[a.id];
            const label = displayLabel(a);

            const lastSplit = d?.lastSplitMs != null ? formatMs(d.lastSplitMs) : "—";
            const avgLap = d?.avgLapMs != null ? formatMs(d.avgLapMs) : "—";
            const lapsDoneTxt = d ? `${d.distanceDone.toFixed(hasHalfFirstSplit ? 1 : 0)}/${lapsTotal}` : `0/${lapsTotal}`;

            const diff = d?.lastSplitDiffMs;
            const diffClass = diff != null ? classForDiffMs(diff) : "bg-card border-border";

            const disabled = run?.status !== "RUNNING" || a.is_abandoned;
            const pressed = pulseId === a.id;

            return (
              <button
                key={a.id}
                className={[
                  "relative w-full rounded-xl border p-3 text-left shadow-sm",
                  diffClass,
                  disabled ? "opacity-70" : "active:scale-[0.99]",
                  pressed ? "ring-2 ring-offset-1 ring-primary" : "",
                ].join(" ")}
                onClick={() => addLap(a)}
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
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {canEdit ? (
                      <Input
                        className="h-9 text-base font-bold"
                        value={editingLabels[a.id] ?? (a.external_name ?? "")}
                        onChange={(e) => setEditingLabels((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        onBlur={() => saveLabel(a, editingLabels[a.id] ?? (a.external_name ?? ""))}
                        placeholder={fullName(a)}
                      />
                    ) : (
                      <div className="text-xl font-bold tracking-wide">{label}</div>
                    )}

                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>LAST: {lastSplit}</span>
                      <span>AVG: {avgLap}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">LAPS: {lapsDoneTxt}</div>
                  </div>

                  {a.is_abandoned && (
                    <div className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                      ABANDON
                    </div>
                  )}

                  {d?.finished && (
                    <div className="rounded-full bg-emerald-200 px-2 py-1 text-[10px] font-semibold text-emerald-900">
                      FINISH
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {menuFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background p-4 shadow-xl">
            <div className="mb-2 text-sm font-semibold">Opțiuni: {displayLabel(menuFor)}</div>
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
            <Button variant="ghost" className="mt-2 w-full" onClick={() => setMenuFor(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="fixed bottom-16 left-0 right-0 px-4">
        <div className="flex gap-3">
          <Button className="flex-1 h-12" onClick={run?.status === "RUNNING" ? stopRun : startRun}>
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
