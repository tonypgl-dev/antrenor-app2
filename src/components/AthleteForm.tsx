import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Trash2, Pencil, Settings } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AthleteFormProps {
  athlete?: any;
  coach: string;
  onClose: () => void;
}

function formatShortRo(dateISO?: string | null) {
  if (!dateISO) return "—";
  const parts = String(dateISO).split("-").map((x) => Number(x));
  if (parts.length !== 3) return "—";
  const [, m, d] = parts;
  if (!m || !d) return "—";
  const months = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Noi", "Dec"];
  return `${d} ${months[m - 1] ?? ""}`.trim();
}

type SubStatus = "none" | "valid" | "expiring" | "expired";

function getSubStatus(expiresISO?: string | null): SubStatus {
  if (!expiresISO) return "none";
  const expires = new Date(`${expiresISO}T00:00:00`).getTime();
  if (!Number.isFinite(expires)) return "none";
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((expires - todayMidnight) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return "expired";
  if (diffDays <= 4) return "expiring";
  return "valid";
}

function statusTextClass(s: SubStatus) {
  if (s === "valid") return "text-emerald-600";
  if (s === "expiring") return "text-orange-500";
  if (s === "expired") return "text-rose-600";
  return "text-muted-foreground";
}

type SubRow = {
  id: string;
  athlete_id: string;
  kind: string | null;
  start_date: string;
  expires_at: string;
  price_lei: number;
  created_at?: string;
   hidden_from_history?: boolean;
};

function kindLabel(kind: string) {
  const k = String(kind || "").toUpperCase();
  if (k === "COACHING") return "Coaching";
  if (k === "GYM" || k === "FACILITY") return "Facility";
  return "—";
}

function kindSafe(kind: string | null): "COACHING" | "GYM" | "UNKNOWN" {
  const k = String(kind || "").toUpperCase();
  if (k === "COACHING") return "COACHING";
  if (k === "GYM" || k === "FACILITY") return "GYM";
  return "UNKNOWN";
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export default function AthleteForm({ athlete, coach, onClose }: AthleteFormProps) {
  const isEdit = !!athlete;
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    full_name: athlete?.full_name || "",
    phone: athlete?.phone || "",
    birth_date: athlete?.birth_date || "",
    structure: athlete?.structure || "",
    payment_mode: athlete?.payment_mode || "PER_SESSION",
    default_race: athlete?.default_race ?? "NONE",
    email: athlete?.email || "",
    notes: athlete?.notes || "",
  });

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const [historyAdminMode, setHistoryAdminMode] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // ------------------ subscriptions history ------------------

  // TODO: SQL:
  // alter table public.subscriptions add column if not exists hidden_from_history boolean not null default false;
  const { data: subs = [], isLoading: subsLoading } = useQuery<SubRow[]>({
    queryKey: ["subs-history", athlete?.id, showAllHistory ? "all" : "visible"],
    enabled: !!athlete?.id,
    queryFn: async () => {
      let query = supabase
        .from("subscriptions")
        .select("id, athlete_id, kind, start_date, expires_at, price_lei, created_at, hidden_from_history")
        .eq("athlete_id", athlete.id);

      if (!showAllHistory) {
        query = query.eq("hidden_from_history", false);
      }

      const { data, error } = await query.order("start_date", { ascending: false });

      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const coachingSubs = useMemo(() => subs.filter((s) => kindSafe(s.kind) === "COACHING"), [subs]);
  const gymSubs = useMemo(() => subs.filter((s) => kindSafe(s.kind) === "GYM"), [subs]);

  const latestCoaching = coachingSubs[0] ?? null;
  const latestGym = gymSubs[0] ?? null;

  const coachingStatus = getSubStatus(latestCoaching?.expires_at);
  const facilityStatus = getSubStatus(latestGym?.expires_at);

  // ------------------ edit last subscription row ------------------

  const [editSubOpen, setEditSubOpen] = useState(false);
  const [editSub, setEditSub] = useState<SubRow | null>(null);
  const [editStartISO, setEditStartISO] = useState("");
  const [editEndISO, setEditEndISO] = useState("");
  const [editPriceLei, setEditPriceLei] = useState<string>("");

  const openEditSub = (row: SubRow) => {
    setEditSub(row);
    setEditStartISO(row.start_date ?? "");
    setEditEndISO(row.expires_at ?? "");
    setEditPriceLei(String(row.price_lei ?? ""));
    setEditSubOpen(true);
  };

  /**
   * Updates:
   * - subscriptions row: start_date, expires_at, price_lei
   * - cash_ledger (best effort): update latest matching row (athlete_id + type=kind)
   *
   * NOTE:
   * Your cash_ledger schema (from AttendancePage) uses:
   * athlete_id, athlete_name, type, amount, date, created_by_coach
   * There is no FK to subscriptions, so we update the latest row for that athlete+type.
   */
  const saveSubEditMutation = useMutation({
    mutationFn: async () => {
      if (!editSub) return;

      const price = Number(editPriceLei);
      if (!Number.isFinite(price) || price < 0) throw new Error("Suma invalidă");

      if (!editStartISO || !editEndISO) throw new Error("Completează start și final");

      // Update subscription row
      const { error: subErr } = await supabase
        .from("subscriptions")
        .update({ start_date: editStartISO, expires_at: editEndISO, price_lei: price })
        .eq("id", editSub.id);

      if (subErr) throw subErr;

      // Best-effort cash update
      const k = kindSafe(editSub.kind);
      if (k === "UNKNOWN") return;

      const shouldUpdateCash = window.confirm("Vrei să edităm suma în baza de date (cash)?");

      if (shouldUpdateCash) {
        const { data: cashRow, error: cashSelErr } = await supabase
          .from("cash_ledger")
          .select("id, amount, date")
          .eq("athlete_id", editSub.athlete_id)
          .eq("type", k)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cashSelErr) {
          // don't fail the whole mutation
          console.warn("cash_ledger select failed:", cashSelErr.message);
        } else if (cashRow?.id) {
          const { error: cashUpdErr } = await supabase.from("cash_ledger").update({ amount: price }).eq("id", cashRow.id);
          if (cashUpdErr) {
            console.warn("cash_ledger update failed:", cashUpdErr.message);
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Abonament actualizat");
      setEditSubOpen(false);
      queryClient.invalidateQueries({ queryKey: ["subs-history"] });
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-athletes"] });
      queryClient.invalidateQueries({ queryKey: ["cash-ledger"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Eroare editare"),
  });

  const hideSubMutation = useMutation({
    mutationFn: async (row: SubRow) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ hidden_from_history: true })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Abonament ascuns din istoric");
      queryClient.invalidateQueries({ queryKey: ["subs-history"] });
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-athletes"] });
      queryClient.invalidateQueries({ queryKey: ["cash-ledger"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Eroare la ascundere abonament"),
  });

  const unhideSubMutation = useMutation({
    mutationFn: async (row: SubRow) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ hidden_from_history: false })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Abonament reafișat în istoric");
      queryClient.invalidateQueries({ queryKey: ["subs-history"] });
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-athletes"] });
      queryClient.invalidateQueries({ queryKey: ["cash-ledger"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Eroare la reafișare abonament"),
  });

  // ------------------ one click extend (atomic, multi-device safe) ------------------

  async function extendOneClick(kind: "COACHING" | "GYM", priceLei: number) {
    if (!athlete?.id) return;

    const { error: rpcErr } = await supabase.rpc(
      "extend_subscription",
      {
        p_athlete_id: athlete.id,
        p_kind: kind,
        p_days: 30,
        p_price_lei: priceLei,
        p_created_by: coach,
      } as any
    );

    if (rpcErr) {
      toast.error(rpcErr.message);
      return;
    }

    const { error: cashErr } = await supabase.from("cash_ledger").insert({
      athlete_id: athlete.id,
      athlete_name: athlete.full_name,
      type: kind,
      amount: priceLei,
      date: todayISO(),
      created_by_coach: coach,
    } as any);

    if (cashErr) console.warn("cash_ledger insert failed:", cashErr.message);

    toast.success("Abonament prelungit");
    queryClient.invalidateQueries({ queryKey: ["subs-history"] });
    queryClient.invalidateQueries({ queryKey: ["athletes"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-athletes"] });
    queryClient.invalidateQueries({ queryKey: ["cash-ledger"] });
  }

  // ------------------ save athlete fields (not subscriptions) ------------------

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        structure: form.structure || null,
        birth_date: form.birth_date || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
        default_race: form.default_race === "NONE" ? null : form.default_race,
        created_by_coach: coach,
      };

      if (isEdit) {
        const { error } = await supabase.from("athletes").update(payload).eq("id", athlete.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("athletes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-athletes"] });
      toast.success(isEdit ? "Sportiv actualizat" : "Sportiv adăugat");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Eroare la salvare"),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("athletes").update({ archived: true }).eq("id", athlete.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athletes"] });
      toast.success("Sportiv arhivat");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Eroare arhivare"),
  });

  return (
    <div className="pb-20 animate-slide-up">
      <PageHeader
        title={isEdit ? "Editare sportiv" : "Sportiv nou"}
        action={
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <div className="space-y-4 px-4">
        <div>
          <Label>Nume complet *</Label>
          <Input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Popescu Mihai" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Telefon</Label>
            <Input
              value={form.phone}
              onChange={(e) => update("phone", e.target.value.replace(/[^\d]/g, ""))}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </div>
          <div>
            <Label>Data nașterii</Label>
            <Input value={form.birth_date} onChange={(e) => update("birth_date", e.target.value)} type="date" />
          </div>
        </div>

        <div>
          <Label>Structură</Label>
          <Select value={form.structure} onValueChange={(v) => update("structure", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selectează" />
            </SelectTrigger>
            <SelectContent>
              {["MAI", "MAPN", "IGSU", "SRI", "Other"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Mod plată</Label>
            <Select value={form.payment_mode} onValueChange={(v) => update("payment_mode", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PER_SESSION">Per ședință</SelectItem>
                <SelectItem value="SUBSCRIPTION">Abonament</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cursă implicită</Label>
            <Select value={form.default_race} onValueChange={(v) => update("default_race", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Nu intră automat</SelectItem>
                <SelectItem value="1000m">1000m</SelectItem>
                <SelectItem value="2000m">2000m</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Subscriptions */}
        {isEdit && (
          <div className="rounded-xl border bg-card p-3 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">Abonamente</div>
              <div className="flex items-center gap-2">
                <Button
                  variant={historyAdminMode ? "outline" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setHistoryAdminMode((v) => !v)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  className="h-7 px-2 text-xs"
                  onClick={() => setShowAllHistory((v) => !v)}
                  disabled={!historyAdminMode}
                >
                  Arată toate
                </Button>
              </div>
            </div>

            {/* Current status */}
            <div className="text-[12px] leading-relaxed">
              <div className={statusTextClass(coachingStatus)}>
                Coaching curent: {latestCoaching?.expires_at ? formatShortRo(latestCoaching.expires_at) : "—"}
                {coachingStatus === "expired"
                  ? " (expirat)"
                  : coachingStatus === "expiring"
                    ? " (expiră curând)"
                    : coachingStatus === "valid"
                      ? " (valabil)"
                      : ""}
              </div>
              <div className={statusTextClass(facilityStatus)}>
                Facility curent: {latestGym?.expires_at ? formatShortRo(latestGym.expires_at) : "—"}
                {facilityStatus === "expired"
                  ? " (expirat)"
                  : facilityStatus === "expiring"
                    ? " (expiră curând)"
                    : facilityStatus === "valid"
                      ? " (valabil)"
                      : ""}
              </div>
            </div>

            {/* One-click extend */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => extendOneClick("COACHING", 800)}>
                Abonament (+30 zile)
              </Button>
              <Button variant="outline" onClick={() => extendOneClick("GYM", 120)}>
                Sala (+30 zile)
              </Button>
            </div>

            <div className="h-px bg-border" />

            {/* History table */}
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Istoric abonamente</div>

              {subsLoading ? (
                <div className="text-sm text-muted-foreground">Se încarcă…</div>
              ) : subs.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nu există abonamente încă.</div>
              ) : (
                <div className="space-y-1">
                  {subs
                    .slice()
                    .reverse()
                    .map((s, idx, arr) => {
                      const isLast = idx === arr.length - 1;
                      const isHidden = !!s.hidden_from_history;
                      const rowClasses =
                        "flex items-center justify-between rounded-lg border px-2 py-2 text-[12px]" +
                        (historyAdminMode && showAllHistory && isHidden ? " opacity-60" : "");
                      return (
                        <div key={s.id} className={rowClasses}>
                          <div className="min-w-0">
                            <div className="font-semibold">
                              {kindLabel(s.kind || "")}
                              {isLast ? <span className="ml-2 text-[11px] text-muted-foreground">(ultimul)</span> : null}
                            </div>
                            <div className="text-muted-foreground tabular-nums">
                              {s.start_date} → {s.expires_at} • {s.price_lei} RON
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {historyAdminMode &&
                              (isHidden && showAllHistory ? (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => unhideSubMutation.mutate(s)}
                                >
                                  Reafișează
                                </Button>
                              ) : (
                                !isHidden && (
                                  <Button
                                    variant="outline"
                                    size="xs"
                                    className="h-7 px-2 text-[11px] text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() => hideSubMutation.mutate(s)}
                                  >
                                    X
                                  </Button>
                                )
                              ))}

                            {(historyAdminMode || isLast) && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditSub(s)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <Label>Email</Label>
          <Input value={form.email} onChange={(e) => update("email", e.target.value)} type="email" />
        </div>

        <div>
          <Label>Notițe</Label>
          <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} />
        </div>

        <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.full_name || saveMutation.isPending}>
          {saveMutation.isPending ? "Se salvează..." : isEdit ? "Actualizează" : "Adaugă sportiv"}
        </Button>

        {isEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="w-full text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Arhivează sportiv
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Arhivează sportiv?</AlertDialogTitle>
                <AlertDialogDescription>{athlete.full_name} va fi mutat în arhivă. Poți restaura oricând.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Anulează</AlertDialogCancel>
                <AlertDialogAction onClick={() => archiveMutation.mutate()}>Arhivează</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Edit last subscription dialog */}
      <Dialog
        open={editSubOpen}
        onOpenChange={(open) => {
          setEditSubOpen(open);
          if (!open) {
            setEditSub(null);
            setEditStartISO("");
            setEditEndISO("");
            setEditPriceLei("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editează ultimul abonament</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Editează manual perioada (start / final) + suma. Atenție: modifici doar rândul selectat.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Start (YYYY-MM-DD)</Label>
                <Input value={editStartISO} onChange={(e) => setEditStartISO(e.target.value)} placeholder="2026-02-01" />
              </div>
              <div className="space-y-1">
                <Label>Final (YYYY-MM-DD)</Label>
                <Input value={editEndISO} onChange={(e) => setEditEndISO(e.target.value)} placeholder="2026-03-02" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Suma (RON)</Label>
              <Input
                inputMode="numeric"
                value={editPriceLei}
                onChange={(e) => setEditPriceLei(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="800"
              />
              <div className="text-[11px] text-muted-foreground">
                Când salvezi, încercăm să actualizăm și ultima înregistrare din Cash (pentru acest sportiv + tip).
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditSubOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => saveSubEditMutation.mutate()} disabled={saveSubEditMutation.isPending}>
                {saveSubEditMutation.isPending ? "Salvez…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
