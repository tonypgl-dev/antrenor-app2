import React from 'react';
import AthleteAvatar from './AthleteAvatar';

interface LeaderboardRowProps {
  position: number;
  name: string;
  structure?: string | null;
  photoUrl?: string | null;
  value: string;
  subValue?: string;
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function LeaderboardRow({ position, name, structure, photoUrl, value, subValue }: LeaderboardRowProps) {
  const medal = MEDAL[position];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
      <div className="w-7 text-center flex-shrink-0">
        {medal
          ? <span className="text-xl leading-none">{medal}</span>
          : <span className="text-sm font-bold text-gray-400">#{position}</span>
        }
      </div>

      <AthleteAvatar photoUrl={photoUrl} name={name} size={36} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
        {structure && <p className="text-xs text-gray-400">{structure}</p>}
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-gray-900 tabular-nums">{value}</p>
        {subValue && <p className="text-[10px] text-gray-400">{subValue}</p>}
      </div>
    </div>
  );
}
