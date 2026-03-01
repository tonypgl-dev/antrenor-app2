import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { formatMmSs } from '@/lib/utils';

function msFromMmss(v: string): number {
  const parts = v.trim().split(':');
  if (parts.length !== 2) return 0;
  const m = parseInt(parts[0]!, 10) || 0;
  const s = parseInt(parts[1]!, 10) || 0;
  return (m * 60 + s) * 1000;
}

function mmssFromMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AdminPresetsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDistance, setNewDistance] = useState('');
  const [newLaps, setNewLaps] = useState('');
  const [newTarget, setNewTarget] = useState('');

  const { data: presets = [], isLoading } = useQuery({
    queryKey: ['race-presets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('race_presets').select('*').order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
  });

  const addPreset = useMutation({
    mutationFn: async () => {
      const targetMs = msFromMmss(newTarget);
      const laps = parseFloat(newLaps);
      const dist = parseInt(newDistance, 10);
      if (!newName.trim()) throw new Error('Introduceți un nume');
      if (isNaN(laps) || laps <= 0) throw new Error('Număr de ture invalid');
      if (isNaN(dist) || dist <= 0) throw new Error('Distanță invalidă');

      const { error } = await supabase.from('race_presets').insert({
        name: newName.trim(),
        distance_m: dist,
        laps_total: laps,
        default_target_ms: targetMs || null,
        is_active: true,
        sort_order: (presets as any[]).length + 1,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['race-presets'] });
      setShowForm(false);
      setNewName('');
      setNewDistance('');
      setNewLaps('');
      setNewTarget('');
      toast.success('Preset adăugat!');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Eroare'),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('race_presets').update({ is_active: active } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['race-presets'] }),
    onError: (e: any) => toast.error(e?.message ?? 'Eroare'),
  });

  const lapMsForNew = (() => {
    const targetMs = msFromMmss(newTarget);
    const laps = parseFloat(newLaps);
    if (!targetMs || !laps) return null;
    return targetMs / laps;
  })();

  return (
    <div className="pb-24">
      <PageHeader
        title="Preseturi curse"
        subtitle="Gestiune distanțe și target-uri"
        backButton={
          <button onClick={() => navigate('/timing/setup')} className="p-1 -ml-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
        action={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> Nou
          </Button>
        }
      />

      {showForm && (
        <div className="mx-4 mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <h3 className="text-sm font-bold text-indigo-800">Preset nou</h3>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Nume cursă</label>
            <Input placeholder="ex: 800m" value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Distanță (m)</label>
              <Input inputMode="numeric" placeholder="ex: 800" value={newDistance} onChange={e => setNewDistance(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Nr. ture</label>
              <Input inputMode="decimal" placeholder="ex: 4" value={newLaps} onChange={e => setNewLaps(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Target total (mm:ss)</label>
            <Input placeholder="ex: 3:30" value={newTarget} onChange={e => setNewTarget(e.target.value)} />
            {lapMsForNew && (
              <p className="text-xs text-indigo-600 mt-1">Ideal per tur: {formatMmSs(lapMsForNew)}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={addPreset.isPending} onClick={() => addPreset.mutate()}>
              Salvează
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Anulează</Button>
          </div>
        </div>
      )}

      <div className="px-4 mt-4 space-y-3">
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}</div>
        ) : (presets as any[]).map((preset: any) => (
          <div key={preset.id} className={`rounded-2xl border ${preset.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'} p-4 shadow-sm`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-gray-900">{preset.name}</h3>
                  {preset.is_preset && (
                    <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Default</span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  <p className="text-xs text-gray-500">{preset.distance_m} m · {preset.laps_total} ture</p>
                  {preset.default_target_ms && (
                    <p className="text-xs text-gray-500">
                      Target: {formatMmSs(preset.default_target_ms)} · Per tur: {formatMmSs(preset.default_target_ms / preset.laps_total)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActive.mutate({ id: preset.id, active: !preset.is_active })}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    preset.is_active
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {preset.is_active ? 'Activ' : 'Inactiv'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
