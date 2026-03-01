import React, { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import AthleteAvatar from '@/components/AthleteAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Plus, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react';
import type { CoachName } from '@/lib/coach';

// ─── helpers ────────────────────────────────────────────────────────────────

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addMonthsISO(dateISO: string, months: number): string {
  const d = new Date(dateISO + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRo(dateISO?: string | null) {
  if (!dateISO) return '—';
  const [y, m, d] = String(dateISO).split('-').map(Number);
  if (!y || !m || !d) return '—';
  const months = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

function getSubStatus(expiresAt?: string | null): 'active' | 'expiring' | 'expired' | 'none' {
  if (!expiresAt) return 'none';
  const today = todayISO();
  if (expiresAt < today) return 'expired';
  const diffDays = Math.ceil(
    (new Date(expiresAt + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) /
      (1000 * 60 * 60 * 24),
  );
  return diffDays <= 7 ? 'expiring' : 'active';
}

function kindSafe(kind: any): 'COACHING' | 'GYM' | 'UNKNOWN' {
  const k = String(kind ?? '').toUpperCase();
  if (k === 'COACHING') return 'COACHING';
  if (k === 'GYM' || k === 'FACILITY') return 'GYM';
  return 'UNKNOWN';
}

// ─── SubEditRow ──────────────────────────────────────────────────────────────
// Un rând de abonament cu editare inline: starts_at / expires_at / price_lei
// La salvare, dacă suma diferă → actualizează și cash_ledger

interface SubEditRowProps {
  sub: any;
  onSaved: () => void;
}

function SubEditRow({ sub, onSaved }: SubEditRowProps) {
  const [editing, setEditing] = useState(false);
  const [startsAt, setStartsAt] = useState<string>(sub.starts_at ?? '');
  const [expiresAt, setExpiresAt] = useState<string>(sub.expires_at ?? '');
  const [priceLei, setPriceLei] = useState<string>(sub.price_lei != null ? String(sub.price_lei) : '');
  const [saving, setSaving] = useState(false);

  const status = getSubStatus(sub.expires_at);
  const statusConfig = {
    active:   { label: 'Activ',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    expiring: { label: 'Expiră curând', cls: 'bg-amber-50  text-amber-700  border-amber-100'  },
    expired:  { label: 'Expirat',       cls: 'bg-gray-100  text-gray-500   border-gray-200'   },
    none:     { label: '—',             cls: 'bg-gray-100  text-gray-400   border-gray-200'   },
  };
  const cfg = statusConfig[status];

  function cancelEdit() {
    setStartsAt(sub.starts_at ?? '');
    setExpiresAt(sub.expires_at ?? '');
    setPriceLei(sub.price_lei != null ? String(sub.price_lei) : '');
    setEditing(false);
  }

  async function handleSave() {
    if (!startsAt || !expiresAt) { toast.error('Completează ambele date'); return; }
    if (startsAt > expiresAt)    { toast.error('Start nu poate fi după expirare'); return; }

    setSaving(true);
    try {
      const newPrice = priceLei !== '' ? Number(priceLei) : null;
      const oldPrice = sub.price_lei != null ? Number(sub.price_lei) : null;
      const priceChanged = newPrice !== null && newPrice !== oldPrice;

      // 1. Actualizează subscriptions
      const { error: subErr } = await supabase
        .from('subscriptions')
        .update({
          starts_at: startsAt,
          expires_at: expiresAt,
          ...(newPrice !== null ? { price_lei: newPrice } : {}),
        } as any)
        .eq('id', sub.id);
      if (subErr) throw subErr;

      // 2. Dacă suma s-a schimbat → actualizează cash_ledger (coloana amount)
      //    Cautăm înregistrarea după subscription_id (dacă există câmpul) sau
      //    după referință directă la sub.id
      if (priceChanged) {
        const { error: cashErr } = await supabase
          .from('cash_ledger')
          .update({ amount: newPrice } as any)
          .eq('subscription_id', sub.id);

        if (cashErr) {
          // Nu blocăm operația — cash_ledger poate să nu aibă subscription_id
          console.warn('cash_ledger update warn:', cashErr.message);
          toast.warning(`Abonament salvat. Cash neactualizat: ${cashErr.message}`);
        } else {
          toast.success(
            `Salvat ✓ — suma actualizată ${oldPrice ?? '?'} → ${newPrice} RON (și în Cash)`,
          );
        }
      } else {
        toast.success('Abonament actualizat');
      }

      setEditing(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? 'Eroare salvare');
    } finally {
      setSaving(false);
    }
  }

  // ── View mode ─────────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-700 tabular-nums">
            {formatRo(sub.starts_at)}
            <span className="text-gray-400 mx-1.5">→</span>
            {formatRo(sub.expires_at)}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {sub.created_by_coach && (
              <span className="text-xs text-gray-400">de {sub.created_by_coach}</span>
            )}
            {sub.price_lei != null && (
              <span className="text-xs font-bold text-gray-600">{sub.price_lei} RON</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>
            {cfg.label}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            title="Editează"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  return (
    <div className="px-4 py-3 bg-indigo-50/60 border-l-4 border-indigo-400 space-y-2.5">
      <div className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Editare abonament</div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Data start</label>
          <input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Data expirare</label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-0.5 block">Sumă (RON)</label>
        <input
          type="number"
          min="0"
          step="1"
          value={priceLei}
          onChange={(e) => setPriceLei(e.target.value)}
          placeholder="ex: 800"
          className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        {priceLei !== '' && String(sub.price_lei ?? '') !== priceLei && (
          <p className="text-xs text-amber-600 mt-1">
            ⚠️ Suma din Cash va fi actualizată:{' '}
            <span className="font-semibold">
              {sub.price_lei ?? '—'} → {priceLei} RON
            </span>
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Check className="h-4 w-4" />
          {saving ? 'Se salvează...' : 'Salvează'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={cancelEdit}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm font-semibold px-4 py-2 hover:bg-gray-50 transition-colors"
        >
          <X className="h-4 w-4" />
          Anulează
        </button>
      </div>
    </div>
  );
}

// ─── SubSection ──────────────────────────────────────────────────────────────
// Ultimul abonament mereu vizibil; restul ascunse în dropdown

interface SubSectionProps {
  label: string;
  subs: any[];          // deja sortate descrescător după expires_at
  onSaved: () => void;
}

function SubSection({ label, subs, onSaved }: SubSectionProps) {
  const [showRest, setShowRest] = useState(false);
  if (subs.length === 0) return null;

  const latest = subs[0];
  const rest   = subs.slice(1);

  return (
    <div className="divide-y divide-gray-50">
      {/* Header tip */}
      <div className="px-4 py-2 bg-gray-50">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>

      {/* Ultimul abonament — mereu vizibil */}
      <SubEditRow key={latest.id} sub={latest} onSaved={onSaved} />

      {/* Restul — în dropdown */}
      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowRest((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-400 hover:bg-gray-50 transition-colors"
          >
            <span>
              {showRest
                ? 'Ascunde istoricul'
                : `▾ Vezi ${rest.length} abonament${rest.length > 1 ? 'e' : ''} mai vechi`}
            </span>
            {showRest ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showRest &&
            rest.map((sub: any) => (
              <SubEditRow key={sub.id} sub={sub} onSaved={onSaved} />
            ))}
        </>
      )}
    </div>
  );
}

// ─── AthleteForm ─────────────────────────────────────────────────────────────

interface AthleteFormProps {
  athlete?: any | null;
  coach: CoachName;
  onClose: () => void;
}

export default function AthleteForm({ athlete, coach, onClose }: AthleteFormProps) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!athlete?.id;

  const [form, setForm] = useState({
    full_name:            athlete?.full_name    ?? '',
    structure:            athlete?.structure    ?? '',
    default_race:         athlete?.default_race ?? 'NONE',
    payment_mode:         athlete?.payment_mode ?? 'PER_SESSION',
    phone:                athlete?.phone        ?? '',
    email:                athlete?.email        ?? '',
    birth_date:           athlete?.birth_date   ?? '',
    notes:                athlete?.notes        ?? '',
    photo_url:            athlete?.photo_url    ?? '',
    coaching_start_date:  '',
    coaching_expires_at:  '',
    facility_start_date:  '',
    facility_expires_at:  '',
  });

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  function setField(key: keyof typeof form, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  // ── Fetch subscriptions fresh ────────────────────────────────────────────
  const { data: subscriptions = [], refetch: refetchSubs } = useQuery({
    queryKey: ['athlete-subs', athlete?.id],
    enabled: isEdit && !!athlete?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('athlete_id', athlete.id)
        .order('expires_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Sortate deja descrescător
  const coachingSubs = (subscriptions as any[]).filter((s) => kindSafe(s.kind) === 'COACHING');
  const gymSubs      = (subscriptions as any[]).filter((s) => kindSafe(s.kind) === 'GYM');
  const latestCoaching = coachingSubs[0];
  const latestGym      = gymSubs[0];

  // Callback după orice editare abonament
  function handleSubSaved() {
    qc.invalidateQueries({ queryKey: ['athletes'] });
    qc.invalidateQueries({ queryKey: ['athlete-subs', athlete?.id] });
    qc.invalidateQueries({ queryKey: ['cash-today'] });
    qc.invalidateQueries({ queryKey: ['cash-ledger'] });
    refetchSubs();
  }

  // ── Photo upload ─────────────────────────────────────────────────────────
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const tmpId = athlete?.id ?? `new-${Date.now()}`;
      const path = `${tmpId}/${Date.now()}.jpg`;
      const { data: uploaded, error: upErr } = await supabase.storage
        .from('athlete-photos')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage
        .from('athlete-photos')
        .getPublicUrl(uploaded.path);
      setField('photo_url', publicUrl);
    } catch (err: any) {
      toast.error('Upload foto eșuat: ' + (err?.message ?? ''));
    } finally {
      setUploadingPhoto(false);
    }
  }

  // ── Save athlete ─────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error('Numele este obligatoriu');

      const payload: any = {
        full_name:    form.full_name.trim(),
        structure:    form.structure    || null,
        default_race: form.default_race || 'NONE',
        payment_mode: form.payment_mode || 'PER_SESSION',
        phone:        form.phone.trim() || null,
        email:        form.email.trim() || null,
        birth_date:   form.birth_date   || null,
        notes:        form.notes.trim() || null,
        photo_url:    form.photo_url    || null,
      };

      if (isEdit) {
        const { error } = await supabase.from('athletes').update(payload).eq('id', athlete.id);
        if (error) throw error;
      } else {
        const { data: newAthlete, error } = await supabase
          .from('athletes')
          .insert({ ...payload, created_by_coach: coach, archived: false })
          .select()
          .single();
        if (error) throw error;

        const subsToInsert: any[] = [];
        if (form.coaching_start_date && form.coaching_expires_at) {
          subsToInsert.push({
            athlete_id: newAthlete.id, kind: 'COACHING',
            starts_at: form.coaching_start_date, expires_at: form.coaching_expires_at,
            created_by_coach: coach,
          });
        }
        if (form.facility_start_date && form.facility_expires_at) {
          subsToInsert.push({
            athlete_id: newAthlete.id, kind: 'GYM',
            starts_at: form.facility_start_date, expires_at: form.facility_expires_at,
            created_by_coach: coach,
          });
        }
        if (subsToInsert.length) {
          await supabase.from('subscriptions').insert(subsToInsert as any);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['athletes'] });
      toast.success(isEdit ? 'Sportiv actualizat!' : 'Sportiv adăugat!');
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Eroare salvare'),
  });

  // ── Archive ──────────────────────────────────────────────────────────────
  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('athletes').update({ archived: true }).eq('id', athlete.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['athletes'] });
      toast.success('Sportiv arhivat');
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Eroare arhivare'),
  });

  // ── Add subscription ─────────────────────────────────────────────────────
  const addSubscription = useMutation({
    mutationFn: async ({ kind, priceLei }: { kind: 'COACHING' | 'GYM'; priceLei: number }) => {
      if (!athlete?.id) throw new Error('ID sportiv lipsă');

      const existingSubs = (subscriptions as any[]).filter((s) => kindSafe(s.kind) === kind);
      const latestSub = existingSubs[0]; // deja sortat descrescător

      let startsAt = todayISO();
      if (latestSub?.expires_at && latestSub.expires_at >= todayISO()) {
        startsAt = addDaysISO(latestSub.expires_at, 1);
      }
      const expiresAt = addDaysISO(addMonthsISO(startsAt, 1), -1);

      const { error } = await supabase.from('subscriptions').insert({
        athlete_id: athlete.id, kind,
        starts_at: startsAt, expires_at: expiresAt,
        price_lei: priceLei, created_by_coach: coach,
      } as any);
      if (error) throw error;
      return { startsAt, expiresAt };
    },
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: ['athletes'] });
      qc.invalidateQueries({ queryKey: ['athlete-subs', athlete?.id] });
      refetchSubs();
      const kindLabel = vars.kind === 'COACHING' ? 'Coaching' : 'Sală/Teren';
      toast.success(`${kindLabel} adăugat: ${formatRo(result.startsAt)} → ${formatRo(result.expiresAt)}`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Eroare adăugare abonament'),
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="pb-28 bg-gray-50 min-h-screen">
      <PageHeader
        title={isEdit ? 'Editează sportiv' : 'Sportiv nou'}
        backButton={
          <button onClick={onClose} className="p-1 -ml-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
        action={
          isEdit ? (
            <Button
              size="sm" variant="ghost" className="text-rose-500"
              onClick={() => { if (confirm('Arhivezi acest sportiv?')) archive.mutate(); }}
            >
              Arhivează
            </Button>
          ) : undefined
        }
      />

      <div className="px-4 mt-4 space-y-4">

        {/* ── Foto ────────────────────────────────────────────────────── */}
        <div className="flex justify-center">
          <div className="relative">
            <AthleteAvatar photoUrl={form.photo_url} name={form.full_name || 'Nou'} size={80} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-sm hover:bg-indigo-700"
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? <span className="text-xs">…</span> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>
        </div>

        {/* ── Date personale ──────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700">Date personale</h3>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Nume complet *</label>
            <Input value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} placeholder="ex: Popescu Ion" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Structură</label>
              <select
                value={form.structure}
                onChange={(e) => setField('structure', e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
              >
                <option value="">—</option>
                <option value="MAPN">MAPN</option>
                <option value="MAI">MAI</option>
                <option value="ISU">ISU</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Probă default</label>
              <select
                value={form.default_race}
                onChange={(e) => setField('default_race', e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
              >
                <option value="NONE">NONE</option>
                <option value="1000m">1000m</option>
                <option value="2000m">2000m</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Mod plată</label>
            <div className="flex gap-2">
              {[{ v: 'PER_SESSION', l: 'La ședință' }, { v: 'SUBSCRIPTION', l: 'Abonament' }].map((opt) => (
                <button
                  key={opt.v} type="button"
                  onClick={() => setField('payment_mode', opt.v)}
                  className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
                    form.payment_mode === opt.v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Telefon</label>
            <Input type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="07XX XXX XXX" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
            <Input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="ex: ion@email.ro" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Data nașterii</label>
            <Input type="date" value={form.birth_date} onChange={(e) => setField('birth_date', e.target.value)} />
          </div>
        </div>

        {/* ── Abonamente inițiale (doar la creare) ────────────────────── */}
        {!isEdit && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700">Abonamente inițiale (opțional)</h3>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Coaching — perioadă</label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={form.coaching_start_date} onChange={(e) => setField('coaching_start_date', e.target.value)} />
                <Input type="date" value={form.coaching_expires_at} onChange={(e) => setField('coaching_expires_at', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Sală / Teren — perioadă</label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={form.facility_start_date} onChange={(e) => setField('facility_start_date', e.target.value)} />
                <Input type="date" value={form.facility_expires_at} onChange={(e) => setField('facility_expires_at', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ── Adaugă abonament (edit mode) ────────────────────────────── */}
        {isEdit && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Adaugă abonament</h3>

            {/* Status curent */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([
                { kind: 'COACHING' as const, label: 'Coaching curent', sub: latestCoaching },
                { kind: 'GYM'      as const, label: 'Sală curent',     sub: latestGym      },
              ] as const).map(({ kind, label, sub }) => (
                <div key={kind} className="rounded-xl bg-gray-50 border border-gray-100 p-2.5 text-xs">
                  <div className="text-gray-400 font-medium mb-0.5">{label}</div>
                  {sub ? (
                    <div className={`font-semibold ${
                      getSubStatus(sub.expires_at) === 'active'   ? 'text-emerald-600' :
                      getSubStatus(sub.expires_at) === 'expiring' ? 'text-amber-600'   : 'text-rose-600'
                    }`}>
                      până {formatRo(sub.expires_at)}
                    </div>
                  ) : (
                    <div className="text-gray-400">Niciun abonament</div>
                  )}
                </div>
              ))}
            </div>

            {/* Butoane adăugare */}
            <div className="space-y-2">
              <button
                type="button" disabled={addSubscription.isPending}
                onClick={() => addSubscription.mutate({ kind: 'COACHING', priceLei: 800 })}
                className="w-full flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Plus className="h-4 w-4 flex-shrink-0" />
                  <span>Coaching</span>
                  {latestCoaching?.expires_at && latestCoaching.expires_at >= todayISO() && (
                    <span className="text-xs text-indigo-400 font-normal">
                      (va începe {formatRo(addDaysISO(latestCoaching.expires_at, 1))})
                    </span>
                  )}
                </div>
                <span className="font-bold tabular-nums ml-2">800 RON</span>
              </button>

              <button
                type="button" disabled={addSubscription.isPending}
                onClick={() => addSubscription.mutate({ kind: 'GYM', priceLei: 120 })}
                className="w-full flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Plus className="h-4 w-4 flex-shrink-0" />
                  <span>Sală / Teren</span>
                  {latestGym?.expires_at && latestGym.expires_at >= todayISO() && (
                    <span className="text-xs text-emerald-400 font-normal">
                      (va începe {formatRo(addDaysISO(latestGym.expires_at, 1))})
                    </span>
                  )}
                </div>
                <span className="font-bold tabular-nums ml-2">120 RON</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Istoricul abonamentelor (edit mode) ─────────────────────── */}
        {/* Ultimul coaching + ultimul sală mereu vizibil; restul în dropdown */}
        {isEdit && (coachingSubs.length > 0 || gymSubs.length > 0) && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700">
                📋 Abonamente ({subscriptions.length})
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Apasă <Pencil className="inline h-3 w-3" /> pentru a edita date sau sumă
              </p>
            </div>

            <SubSection label="Coaching"       subs={coachingSubs} onSaved={handleSubSaved} />
            <SubSection label="Sală / Teren"   subs={gymSubs}      onSaved={handleSubSaved} />
          </div>
        )}

        {/* ── Note ────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
          <textarea
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="Observații, restricții medicale, etc."
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none"
          />
        </div>

        {/* ── Buton Salvează inline (în scroll, mereu vizibil) ────────── */}
        <Button
          className="w-full h-12 text-base font-bold shadow-md"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Se salvează...' : isEdit ? '✓  Salvează modificările' : 'Adaugă sportiv'}
        </Button>

      </div>
    </div>
  );
}