import React, { useState, useRef } from 'react';
import { CoachName, COACHES, COACH_EMOJIS, COACH_PINS } from '@/lib/coach';
import { Zap } from 'lucide-react';

interface CoachPickerProps {
  onSelect: (name: CoachName, pin: string) => boolean;
}

export default function CoachPicker({ onSelect }: CoachPickerProps) {
  const [selected, setSelected] = useState<CoachName | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleCoachClick(name: CoachName) {
    setSelected(name);
    setPin('');
    setError('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handlePinChange(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    setPin(digits);
    setError('');

    if (digits.length === 4) {
      const ok = onSelect(selected!, digits);
      if (!ok) {
        const next = attempts + 1;
        setAttempts(next);
        setError(`PIN incorect (${next}/3 încercări)`);
        setPin('');
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900">AthletiCoach</h1>
          <p className="mt-1 text-sm text-gray-500">Aplicație antrenori MAI / MAPN / ISU</p>
        </div>

        {!selected ? (
          <div className="space-y-3">
            <p className="text-center text-xs font-medium uppercase tracking-wider text-gray-400 mb-4">Selectează antrenorul</p>
            {COACHES.map((name) => (
              <button
                key={name}
                onClick={() => handleCoachClick(name)}
                className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow-md active:scale-[0.98]"
              >
                <span className="text-3xl">{COACH_EMOJIS[name]}</span>
                <span className="text-lg font-bold text-gray-900">{name}</span>
                <span className="ml-auto text-gray-300">→</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <button
              onClick={() => setSelected(null)}
              className="mb-4 flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600"
            >
              ← Înapoi
            </button>

            <div className="mb-6 flex items-center gap-3">
              <span className="text-3xl">{COACH_EMOJIS[selected]}</span>
              <div>
                <p className="text-lg font-bold text-gray-900">{selected}</p>
                <p className="text-xs text-gray-400">Introdu PIN-ul</p>
              </div>
            </div>

            {/* PIN dots display */}
            <div className="flex justify-center gap-3 mb-6">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full transition-all ${
                    i < pin.length ? 'bg-indigo-600 scale-110' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              placeholder="····"
              autoComplete="off"
            />

            {error && (
              <p className="mt-3 text-center text-sm font-medium text-rose-600">{error}</p>
            )}

            <p className="mt-4 text-center text-xs text-gray-400">
              Apasă 4 cifre — autentificare automată
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
