import React from 'react';
import type { RunnerType } from '@/lib/utils';

interface RunnerTypeConfig {
  label: string;
  emoji: string;
  gradient: string;
  textColor: string;
  description: string;
  tip: string;
}

const RUNNER_TYPE_CONFIG: Record<NonNullable<RunnerType>, RunnerTypeConfig> = {
  SPRINTER: {
    label: 'Sprinter',
    emoji: '🦅',
    gradient: 'from-emerald-500 to-teal-600',
    textColor: 'text-white',
    description: 'Ai un final exploziv — ultimul tur e cel mai rapid.',
    tip: 'Menține ritmul constant în prima jumătate pentru un timp și mai bun.',
  },
  DIESEL: {
    label: 'Diesel',
    emoji: '⚙️',
    gradient: 'from-indigo-500 to-blue-600',
    textColor: 'text-white',
    description: 'Ritm constant pe toată cursa — pacing excelent.',
    tip: 'Încearcă un final kick ușor pe ultimele 300m pentru extra timp.',
  },
  SUICIDE_STARTER: {
    label: 'Suicide Starter',
    emoji: '💥',
    gradient: 'from-amber-500 to-orange-600',
    textColor: 'text-white',
    description: 'Pleci prea tare și pierzi tempo pe final.',
    tip: 'Țintește primul tur cu +3s mai lent. Accelerează de la tura 4 spre final.',
  },
  FADE_RUNNER: {
    label: 'Fade Runner',
    emoji: '🌊',
    gradient: 'from-rose-500 to-pink-600',
    textColor: 'text-white',
    description: 'Cazi vizibil pe final — ultimul tur e cel mai lent.',
    tip: 'Lucrează pe rezistență la antrenamente specifice. Menține cadența pe ultimele 2 ture.',
  },
};

interface RunnerTypeCardProps {
  runnerType?: RunnerType | string | null;
  compact?: boolean;
}

export default function RunnerTypeCard({ runnerType, compact = false }: RunnerTypeCardProps) {
  if (!runnerType) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        Tipul de alergător se calculează după cel puțin 3 curse.
      </div>
    );
  }

  const config = RUNNER_TYPE_CONFIG[runnerType as NonNullable<RunnerType>];
  if (!config) return null;

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${config.gradient} px-3 py-1.5`}>
        <span className="text-base">{config.emoji}</span>
        <span className={`text-sm font-bold ${config.textColor}`}>{config.label}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl bg-gradient-to-br ${config.gradient} p-4`}>
      <div className="flex items-start gap-3">
        <span className="text-3xl">{config.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold uppercase tracking-wider opacity-80 ${config.textColor}`}>
            Tipul tău de alergător
          </div>
          <div className={`text-xl font-black mt-0.5 ${config.textColor}`}>{config.label}</div>
          <p className={`text-sm mt-1.5 opacity-90 ${config.textColor}`}>{config.description}</p>
          <div className={`mt-2 rounded-xl bg-white/20 px-3 py-2 text-sm font-medium ${config.textColor}`}>
            💡 {config.tip}
          </div>
        </div>
      </div>
    </div>
  );
}
