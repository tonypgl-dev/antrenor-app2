import React from 'react';
import { formatMmSs } from '@/lib/utils';

interface AdmissionEstimatorProps {
  bestMs?: number | null;
  improvementPercent?: number | null;
  targetMs?: number;           // default 270000 (4:30) for 1000m
  totalRuns?: number | null;
}

export default function AdmissionEstimator({ bestMs, improvementPercent, targetMs = 270000, totalRuns }: AdmissionEstimatorProps) {
  if (!bestMs || !totalRuns || totalRuns < 3) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <span className="text-lg">🎓</span>
          <span className="text-sm">Estimatorul de admitere se activează după 3 curse înregistrate.</span>
        </div>
      </div>
    );
  }

  const alreadyBelow = bestMs <= targetMs;

  if (alreadyBelow) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="text-sm font-bold text-emerald-800">Ești deja sub target!</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Cel mai bun timp ({formatMmSs(bestMs)}) e sub targetul de admitere ({formatMmSs(targetMs)}).
            </p>
          </div>
        </div>
      </div>
    );
  }

  const gapMs = bestMs - targetMs;
  const gapPercent = (gapMs / bestMs) * 100;

  // Estimate weeks: use improvement_percent per session (avg improvement rate)
  // If we have improvement data, calculate sessions needed
  let estimateText = '';
  let color = 'border-amber-200 bg-amber-50';
  let textColor = 'text-amber-800';
  let subColor = 'text-amber-700';

  if (improvementPercent && improvementPercent > 0) {
    // improvement_percent is total improvement from baseline
    // Estimate rate: ~improvement per 10 runs
    const improvementPerRun = improvementPercent / Math.max(1, totalRuns);
    const runsNeeded = Math.ceil(gapPercent / improvementPerRun);
    const weeksNeeded = Math.ceil(runsNeeded / 3); // ~3 runs/week

    if (weeksNeeded <= 4) {
      color = 'border-emerald-200 bg-emerald-50';
      textColor = 'text-emerald-800';
      subColor = 'text-emerald-700';
      estimateText = `~${weeksNeeded} ${weeksNeeded === 1 ? 'săptămână' : 'săptămâni'} la ritmul actual`;
    } else if (weeksNeeded <= 12) {
      color = 'border-blue-200 bg-blue-50';
      textColor = 'text-blue-800';
      subColor = 'text-blue-700';
      estimateText = `~${weeksNeeded} săptămâni la ritmul actual`;
    } else {
      estimateText = `~${weeksNeeded} săptămâni — trebuie accelerat ritmul`;
    }
  } else {
    estimateText = 'Continuă antrenamentele pentru o estimare mai precisă';
  }

  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">🎓</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${textColor}`}>Estimator admitere</p>
          <p className={`text-xs mt-0.5 ${subColor}`}>
            Target: {formatMmSs(targetMs)} · Best: {formatMmSs(bestMs)} · Diferență: -{formatMmSs(gapMs)}
          </p>
          <div className={`mt-2 text-sm font-semibold ${textColor}`}>
            {estimateText}
          </div>
        </div>
      </div>
    </div>
  );
}
