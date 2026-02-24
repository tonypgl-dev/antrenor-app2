import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Timer, X, Repeat2, Play } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const today = () => new Date().toISOString().split("T")[0];

type TimingSessionRow = { id: string; date: string; attendance_day_id: string | null };
type LaneRow = { id: string; name: string; race_type: string | null; laps_total: number | null; timing_session_id: string | null; status?: string | null };
type RunRow = { id: string; lane_id: string; run_number: number; status: "PENDING" | "RUNNING" | "PAUSED" | "COMPLETED"; start_at: string | null };
type AssignmentRow = {
  id: string;
  timing_session_id: string;
  lane_id: string;
  athlete_id: string | null;
  is_out: boolean;
  sort_order: number | null;
  nickname: string | null;
  external_name: string | null;
  athletes?: { full_name: string } | null;
};

function getFullName(a: AssignmentRow) {
  return a.athletes?.full_name ?? a.external_name ?? "—";
}
function getFirstName(fullName: string) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts[parts.length - 1]; // Ion din Popescu Ion
}
function getLastNameInitial(fullName: string) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return "";
  return (parts[0] || "").slice(0, 1).toUpperCase(); // P din Popescu Ion
}
function parseGroupNumber(laneName: string) {
  const m = String(laneName).match(/Grupa\s+(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function playBeep(durationMs: number, frequency = 520) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = frequency;
    o.type = "sine";
    g.gain.value = 0.06;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, durationMs);
  } catch {
    // ignore
  }
}

export default function TimingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [editOpen, setEditOpen] = useState(false);
  const [editAssignmentId, setEditAssignmentId] = useState<string | null>(null);
  const [editNick, setEditNick] = useState("");

  const pressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);

  const { data: timingSession } = useQuery<TimingSessionRow | null>({
    queryKey: ["timing-session", today()],
    queryFn: async () => {
      const { data, error } = await supabase.from("timing_sessions").select("*").eq("date", today()).maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });

  const sessionId = (timingSession?.id ?? searchParams.get("session") ?? null) as string | null;

  const { data: lanes = [], refetch: refetchLanes } = useQuery<LaneRow[]>({
    queryKey: ["session-lanes", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lanes")
        .select("*")
        .eq("timing_session_id", sessionId!)
        .order("name");
      if (error) throw error;
      return ((data as any) ?? []) as LaneRow[];
    },
  });

  const { data: assignmentsAll = [], refetch: refetchAssignments } = useQuery<AssignmentRow[]>({
    queryKey: ["session-assignments", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lane_assignments")
        .select("*, athletes(full_name)")
        .eq("timing_session_id", sessionId!)
        .eq("is_out", false)
        .order("sort_order");
      if (error) throw error;
      return ((data as any) ?? []) as AssignmentRow[];
    },
  });

  const { data: runsAll = [], refetch: refetchRuns } = useQuery<RunRow[]>({
    queryKey: ["session-runs", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("runs")
        .select("id,lane_id,run_number,status,start_at")
        .eq("timing_session_id", sessionId!)
        .order("run_number", { ascending: false });
      if (error) throw error;
      return ((data as any) ?? []) as RunRow[];
    },
  });

  const latestRunByLane = useMemo(() => {
    const map = new Map<string, RunRow>();
    for (const r of runsAll) {
      if (!map.has(r.lane_id)) map.set(r.lane_id, r);
    }
    return map;
  }, [runsAll]);

  const assignmentsByLane = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const a of assignmentsAll) {
      const arr = map.get(a.lane_id) ?? [];
      arr.push(a);
      map.set(a.lane_id, arr);
    }
    return map;
  }, [assignmentsAll]);

  const lanesByRace = useMemo(() => {
    const map = new Map<string, LaneRow[]>();
    for (const l of lanes) {
      const rt = l.race_type ?? "UNKNOWN";
      const arr = map.get(rt) ?? [];
      arr.push(l);
      map.set(rt, arr);
    }
    // sort by group number if possible
    for (const [rt, arr] of map.entries()) {
      arr.sort((a, b) => (parseGroupNumber(a.name) ?? 9999) - (parseGroupNumber(b.name) ?? 9999));
      map.set(rt, arr);
    }
    return map;
  }, [lanes]);

  useEffect(() => {
    if (!sessionId) return;

    const ch = supabase
      .channel(`timing-overview-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lane_assignments" }, () => refetchAssignments())
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, () => refetchRuns())
      .on("postgres_changes", { event: "*", schema: "public", table: "lanes" }, () => refetchLanes())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [sessionId, refetchAssignments, refetchRuns, refetchLanes]);

  async function removeFromLane(assignmentId: string) {
    const { error } = await supabase.from("lane_assignments").update({ is_out: true }).eq("id", assignmentId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Scos din grupă");
    refetchAssignments();
  }

  function otherRace(race: string | null) {
    if (race === "1000m") return "2000m";
    if (race === "2000m") return "1000m";
    return null;
  }

  function findGroup1LaneId(race: string | null) {
    if (!race) return null;
    const candidates = lanesByRace.get(race) ?? [];
    const g1 = candidates.find((l) => String(l.name).includes("Grupa 1"));
    return (g1 ?? candidates[0] ?? null)?.id ?? null;
  }

  async function ensureLatestRun(lane_id: string): Promise<RunRow> {
    const existing = latestRunByLane.get(lane_id);
    if (existing) return existing;

    // create if missing
    const { data: created, error } = await supabase
      .from("runs")
      .insert({ timing_session_id: sessionId!, lane_id, run_number: 1, status: "PENDING", start_at: null } as any)
      .select("id,lane_id,run_number,status,start_at")
      .single();

    if (error) throw error;
    await refetchRuns();
    return created as any;
  }

  async function moveAssignmentToLane(assignment: AssignmentRow, destLaneId: string) {
    const destRun = await ensureLatestRun(destLaneId);
    if (destRun.status === "RUNNING") {
      toast.error("Nu poți adăuga sportivi într-o grupă care rulează (RUNNING).");
      return;
    }

    const destList = assignmentsByLane.get(destLaneId) ?? [];
    const maxSort = destList.reduce((m, x) => Math.max(m, x.sort_order ?? 0), 0);
    const nextSort = (destList.length ? maxSort : -1) + 1;

    const { error } = await supabase
      .from("lane_assignments")
      .update({ lane_id: destLaneId, sort_order: nextSort, is_out: false })
      .eq("id", assignment.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    playBeep(60, 520);
    refetchAssignments();
  }

  async function moveToOtherRaceGroup1(assignment: AssignmentRow, fromLane: LaneRow) {
    const destRace = otherRace(fromLane.race_type ?? null);
    if (!destRace) {
      toast.error("Nu pot determina proba destinație.");
      return;
    }

    const destLaneId = findGroup1LaneId(destRace);
    if (!destLaneId) {
      toast.error(`Nu există Grupa 1 la ${destRace}.`);
      return;
    }

    await moveAssignmentToLane(assignment, destLaneId);
    toast.success(`Mutat în ${destRace} • Grupa 1`);
  }

  function openNickEdit(assignment: AssignmentRow) {
    setEditAssignmentId(assignment.id);
    setEditNick(assignment.nickname ?? "");
    setEditOpen(true);
  }

  async function saveNick() {
    if (!editAssignmentId) return;

    const { error } = await supabase
      .from("lane_assignments")
      .update({ nickname: editNick.trim() || null })
      .eq("id", editAssignmentId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Salvat");
    setEditOpen(false);
    setEditAssignmentId(null);
    setEditNick("");
    refetchAssignments();
  }

  function clearPressTimer() {
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  }

  async function ensureRunExistsForLaneId(lane_id: string) {
    await ensureLatestRun(lane_id);
  }

  async function createNewGroupLike(lane: LaneRow, nextNo: number) {
    const { data: createdLane, error: laneErr } = await supabase
      .from("lanes")
      .insert({
        timing_session_id: sessionId!,
        race_type: lane.race_type,
        name: `${lane.race_type} • Grupa ${nextNo}`,
        laps_total: lane.laps_total ?? 0,
        status: "edit",
      } as any)
      .select("*")
      .single();
    if (laneErr) throw laneErr;

    const { error: runErr } = await supabase.from("runs").insert({
      timing_session_id: sessionId!,
      lane_id: createdLane.id,
      run_number: 1,
      status: "PENDING",
      start_at: null,
    } as any);
    if (runErr) throw runErr;

    await refetchLanes();
    await refetchRuns();
    return createdLane as any as LaneRow;
  }

  async function autoMoveToNextPendingGroup(assignment: AssignmentRow, fromLane: LaneRow) {
    const fromRun = latestRunByLane.get(fromLane.id) ?? null;
    if (fromRun?.status === "RUNNING") {
      toast.error("Nu poți muta sportivi cât timp grupa rulează (RUNNING).");
      return;
    }

    const race = fromLane.race_type;
    if (!race) {
      toast.error("Lane fără race_type.");
      return;
    }

    const raceLanes = lanesByRace.get(race) ?? [];
    const currentNo = parseGroupNumber(fromLane.name) ?? 1;

    // Try next existing groups: first PENDING (not RUNNING)
    let dest: LaneRow | null = null;
    for (const l of raceLanes) {
      const n = parseGroupNumber(l.name) ?? 9999;
      if (n <= currentNo) continue;

      await ensureRunExistsForLaneId(l.id);
      const r = latestRunByLane.get(l.id);
      if (r?.status === "PENDING") {
        dest = l;
        break;
      }
    }

    if (!dest) {
      const maxNo = raceLanes.reduce((m, x) => Math.max(m, parseGroupNumber(x.name) ?? 0), 0);
      const nextNo = Math.max(maxNo + 1, currentNo + 1);
      dest = await createNewGroupLike(fromLane, nextNo);
    }

    if (!dest) return;

    await moveAssignmentToLane(assignment, dest.id);
    toast.success(`Mutat în ${dest.name}`);
  }

  function buildNameDisplay(list: AssignmentRow[]) {
    const counts: Record<string, number> = {};
    for (const a of list) {
      const first = getFirstName(getFullName(a));
      counts[first] = (counts[first] || 0) + 1;
    }
    return counts;
  }

  if (!timingSession && !sessionId) {
    return (
      <div className="pb-20">
        <PageHeader title="Cronometru" subtitle="Grupe" />
        <div className="px-4">
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Nu există sesiune de azi. Mergi la Prezență și apasă “Finalizează & Start Crono”.
          </div>
        </div>
      </div>
    );
  }

  // Only show lanes for this session (if there are preset lanes showing, they are not session lanes)
  return (
    <div className="pb-20">
      <PageHeader title="Curse & Grupe" subtitle="Overview" />

      <div className="px-4 space-y-4 mt-3">
        {lanes.map((lane) => {
          const run = latestRunByLane.get(lane.id) ?? null;
          const list = assignmentsByLane.get(lane.id) ?? [];
          const firstNameCounts = buildNameDisplay(list);

          const isRunning = run?.status === "RUNNING";
          const race = lane.race_type ?? "UNKNOWN";
          const raceGroups = lanesByRace.get(race) ?? [];
          const groupsCount = raceGroups.length;
          const isGroup1 = String(lane.name).includes("Grupa 1");

          // group buttons appear only in Grupa 1, and only when NOT running
          const showGroupButtons = isGroup1 && !isRunning && groupsCount > 1;

          return (
            <div key={lane.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Timer className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">
                        {lane.name} {lane.laps_total ? `(${lane.laps_total} tur${lane.laps_total === 1 ? "" : "uri"})` : ""}
                      </p>
                      {isRunning && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <Play className="h-3 w-3" /> RUNNING
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{list.length} sportivi</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={list.length === 0}
                  onClick={() => {
                    if (list.length === 0) {
                      toast.error("Nu există sportivi în această grupă.");
                      return;
                    }
                    navigate(`/timing/lane/${lane.id}`);
                  }}
                >
                  Deschide
                </Button>
              </div>

              {/* athletes list */}
              <div className="mt-3 space-y-2">
                {list.map((a) => {
                  const full = getFullName(a);
                  const first = getFirstName(full);
                  const showInitial = (firstNameCounts[first] || 0) > 1;
                  const disp = showInitial ? `${first} ${getLastNameInitial(full)}.` : first;

                  function onPointerDown(e: React.PointerEvent) {
                    if (e.button !== 0) return;
                    didLongPressRef.current = false;
                    clearPressTimer();
                    pressTimerRef.current = window.setTimeout(async () => {
                      didLongPressRef.current = true;
                      try {
                        await autoMoveToNextPendingGroup(a, lane);
                      } catch (err: any) {
                        console.error(err);
                        toast.error(err?.message ?? "Eroare la auto-move.");
                      }
                    }, 450);
                  }

                  function onPointerUp() {
                    clearPressTimer();
                  }

                  return (
                    <div
                      key={a.id}
                      className="flex items-start gap-2 rounded-lg border bg-background px-3 py-2"
                      onPointerDown={onPointerDown}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                    >
                      {/* LEFT controls (hidden when RUNNING) */}
                      {!isRunning ? (
                        <div className="flex flex-col gap-2 pt-0.5">
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-9 w-9"
                            title="Scoate din grupă"
                            onClick={() => removeFromLane(a.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>

                          <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9"
                            title="Mută în proba cealaltă (Grupa 1)"
                            onClick={() => moveToOtherRaceGroup1(a, lane)}
                          >
                            <Repeat2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="w-9" />
                      )}

                      {/* NAME + LABEL */}
                      <button
                        className={`min-w-0 flex-1 text-left ${isRunning ? "cursor-default" : "cursor-pointer"}`}
                        disabled={isRunning}
                        onClick={() => {
                          if (didLongPressRef.current) {
                            didLongPressRef.current = false;
                            return;
                          }
                          if (isRunning) return;
                          openNickEdit(a);
                        }}
                      >
                        <div className="font-semibold text-sm truncate">{disp}</div>
                        {a.nickname ? <div className="text-xs text-muted-foreground truncate">{a.nickname}</div> : null}

                        {/* GROUP BUTTONS only in Grupa 1 */}
                        {showGroupButtons && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {raceGroups.map((g, idx) => {
                              const n = idx + 1;
                              return (
                                <Button
                                  key={g.id}
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    moveAssignmentToLane(a, g.id);
                                  }}
                                >
                                  {n}
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}

                {list.length === 0 && (
                  <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
                    Nu există sportivi în această grupă.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* nickname edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Etichetă / notă (ex: tricou alb)</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input value={editNick} onChange={(e) => setEditNick(e.target.value)} placeholder="ex: tricou alb" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Anulează
              </Button>
              <Button onClick={saveNick}>Salvează</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
