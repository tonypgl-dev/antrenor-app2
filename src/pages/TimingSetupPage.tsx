import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function TimingSetupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");

  const [groups1000, setGroups1000] = useState<number>(1);
  const [groups2000, setGroups2000] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [confirmRecreate, setConfirmRecreate] = useState(false);

  const canContinue = useMemo(() => {
    if (!sessionId) return false;
    return groups1000 >= 0 && groups1000 <= 7 && groups2000 >= 0 && groups2000 <= 7;
  }, [sessionId, groups1000, groups2000]);

  async function recreateGroupsHard() {
    if (!sessionId) return;

    setLoading(true);
    try {
      // delete dependent data in correct order
      // 1) lap_events -> runs -> lane_assignments -> lanes (for this session)
      const { data: runs, error: rErr } = await supabase
        .from("runs")
        .select("id")
        .eq("timing_session_id", sessionId);

      if (rErr) throw rErr;

      const runIds = (runs || []).map((r: any) => r.id);
      if (runIds.length > 0) {
        const { error: leErr } = await supabase.from("lap_events").delete().in("run_id", runIds);
        if (leErr) throw leErr;
      }

      const { error: delRunsErr } = await supabase.from("runs").delete().eq("timing_session_id", sessionId);
      if (delRunsErr) throw delRunsErr;

      const { error: delAssignErr } = await supabase.from("lane_assignments").delete().eq("timing_session_id", sessionId);
      if (delAssignErr) throw delAssignErr;

      const { error: delLanesErr } = await supabase.from("lanes").delete().eq("timing_session_id", sessionId);
      if (delLanesErr) throw delLanesErr;

      toast.success("Grupele vechi au fost șterse. Poți recrea acum.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Eroare la ștergerea grupelor vechi.");
    } finally {
      setLoading(false);
      setConfirmRecreate(false);
    }
  }

  async function createLanesAndAssignments() {
    if (!sessionId) {
      toast.error("Lipsă session id. Întoarce-te și refă prezența.");
      return;
    }

    setLoading(true);
    try {
      // 0) validăm sesiunea și luăm attendance_day_id
      const { data: timingSession, error: tsErr } = await supabase
        .from("timing_sessions")
        .select("id, attendance_day_id, date")
        .eq("id", sessionId)
        .maybeSingle();

      if (tsErr) throw tsErr;
      if (!timingSession) {
        toast.error("Sesiunea de timing nu există. Refă finalizarea prezenței.");
        return;
      }

      // 1) dacă există deja lanes pentru sesiunea asta -> NU recreăm automat
      const { data: existingSessionLanes, error: exErr } = await supabase
        .from("lanes")
        .select("id,name,race_type,timing_session_id")
        .eq("timing_session_id", sessionId);

      if (exErr) throw exErr;

      if ((existingSessionLanes || []).length > 0) {
        toast.message("Grupele există deja. Dacă vrei alt număr, apasă «Refă grupele».");
        navigate(`/timing?session=${sessionId}`);
        return;
      }

      // 2) luăm preset lanes (globale, fără timing_session_id)
      const { data: presets, error: presetError } = await supabase
        .from("lanes")
        .select("*")
        .is("timing_session_id", null);

      if (presetError) throw presetError;

      const preset1000: any = (presets || []).find((l: any) => l.race_type === "1000m");
      const preset2000: any = (presets || []).find((l: any) => l.race_type === "2000m");

      if (!preset1000 || !preset2000) {
        toast.error("Lipsesc preset lanes (race_type=1000m / 2000m).");
        return;
      }

      // 3) creăm lanes (grupe) pentru sesiunea curentă
      const newLanes: any[] = [];

      for (let i = 1; i <= groups1000; i++) {
        newLanes.push({
          timing_session_id: sessionId,
          race_type: "1000m",
          name: `1000m • Grupa ${i}`,
          laps_total: preset1000.laps_total,
          status: "edit",
        });
      }

      for (let i = 1; i <= groups2000; i++) {
        newLanes.push({
          timing_session_id: sessionId,
          race_type: "2000m",
          name: `2000m • Grupa ${i}`,
          laps_total: preset2000.laps_total,
          status: "edit",
        });
      }

      const { data: createdLanes, error: createError } = await supabase
        .from("lanes")
        .insert(newLanes)
        .select("id,name,race_type");

      if (createError) throw createError;

      // create an initial run for each created lane (so we can check RUNNING/PENDING reliably)
      if ((createdLanes || []).length > 0) {
        const runRows = (createdLanes || []).map((l: any) => ({
          timing_session_id: sessionId,
          lane_id: l.id,
          run_number: 1,
          status: "PENDING",
          start_at: null,
        }));

        const { error: runErr } = await supabase.from("runs").insert(runRows as any);
        if (runErr) throw runErr;
      }

      const lane1000g1 = (createdLanes || []).find((l: any) => l.race_type === "1000m" && String(l.name).includes("Grupa 1"));
      const lane2000g1 = (createdLanes || []).find((l: any) => l.race_type === "2000m" && String(l.name).includes("Grupa 1"));

      // 4) sportivi prezenți (dedupe)
      const { data: presentEntries, error: pErr } = await supabase
        .from("attendance_entries")
        .select("athlete_id")
        .eq("attendance_day_id", timingSession.attendance_day_id)
        .eq("present", true);

      if (pErr) throw pErr;

      const presentIdsRaw = (presentEntries || []).map((x: any) => x.athlete_id);
      const presentIds = Array.from(new Set(presentIdsRaw));

      if (presentIds.length === 0) {
        toast.error("Nu există sportivi prezenți.");
        return;
      }

      const { data: presentAthletes, error: aErr } = await supabase
        .from("athletes")
        .select("id, full_name, default_race")
        .in("id", presentIds)
        .eq("archived", false);

      if (aErr) throw aErr;

      const sortedAthletes = (presentAthletes || []).sort((a: any, b: any) =>
        String(a.full_name).localeCompare(String(b.full_name))
      );

      // 5) assignments în grupa 1
      const inserts: any[] = [];
      let pos1000 = 0;
      let pos2000 = 0;

      for (const ath of sortedAthletes) {
        if (!ath.default_race || ath.default_race === "NONE") continue;

        if (ath.default_race === "1000m" && lane1000g1) {
          inserts.push({
            timing_session_id: sessionId,
            lane_id: lane1000g1.id,
            athlete_id: ath.id,
            sort_order: pos1000++,
            is_out: false,
          });
        } else if (ath.default_race === "2000m" && lane2000g1) {
          inserts.push({
            timing_session_id: sessionId,
            lane_id: lane2000g1.id,
            athlete_id: ath.id,
            sort_order: pos2000++,
            is_out: false,
          });
        }
      }

      // dedupe within batch
      const uniqueMap = new Map<string, any>();
      for (const row of inserts) {
        uniqueMap.set(`${row.lane_id}:${row.athlete_id}`, row);
      }
      const safeInserts = Array.from(uniqueMap.values());

      if (safeInserts.length > 0) {
        // safe insert via RPC to avoid unique violations
        const { error: rpcErr } = await supabase.rpc("insert_lane_assignments_safe", { p_rows: safeInserts } as any);
        if (rpcErr) throw rpcErr;
      }

      toast.success("Grupele au fost create!");
      navigate(`/timing?session=${sessionId}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Eroare la crearea grupelor. Vezi consola.");
    } finally {
      setLoading(false);
    }
  }

  if (!sessionId) {
    return (
      <div className="pb-24">
        <PageHeader title="Setup Grupe" subtitle="Eroare" />
        <div className="px-4">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
            Lipsă <b>session</b> în URL. Întoarce-te și refă prezența.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <PageHeader title="Setup Grupe" subtitle="Alege numărul de grupe" />

      <div className="px-4 space-y-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-semibold mb-2">Câte grupe sunt la 2000m?</div>
          <input
            type="number"
            min={0}
            max={7}
            value={groups2000}
            onChange={(e) => setGroups2000(clampInt(Number(e.target.value), 0, 7))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-semibold mb-2">Câte grupe sunt la 1000m?</div>
          <input
            type="number"
            min={0}
            max={7}
            value={groups1000}
            onChange={(e) => setGroups1000(clampInt(Number(e.target.value), 0, 7))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <Button className="w-full h-12 text-sm font-bold" onClick={createLanesAndAssignments} disabled={!canContinue || loading}>
          {loading ? "Se creează..." : "Continuă"}
        </Button>

        <Button
          className="w-full h-12 text-sm font-bold"
          variant="destructive"
          onClick={() => setConfirmRecreate(true)}
          disabled={loading}
        >
          Refă grupele (șterge tot pentru sesiunea asta)
        </Button>
      </div>

      <AlertDialog open={confirmRecreate} onOpenChange={setConfirmRecreate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refaci grupele?</AlertDialogTitle>
            <AlertDialogDescription>
              Șterge lanes/runs/assignments/lap_events pentru această sesiune. Folosește doar înainte să începi cronometrarea.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={recreateGroupsHard}>Șterge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
