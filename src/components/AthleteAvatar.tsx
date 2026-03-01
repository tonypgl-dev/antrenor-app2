import React from 'react';

const GRADIENTS = [
  'from-indigo-400 to-blue-500',
  'from-violet-400 to-purple-500',
  'from-emerald-400 to-teal-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
  'from-cyan-400 to-sky-500',
  'from-fuchsia-400 to-pink-500',
  'from-lime-400 to-green-500',
];

function nameToGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

interface AthleteAvatarProps {
  photoUrl?: string | null;
  name: string;
  size?: number;
  className?: string;
}

export default function AthleteAvatar({ photoUrl, name, size = 40, className = '' }: AthleteAvatarProps) {
  const gradient = nameToGradient(name);
  const fontSize = Math.round(size * 0.35);
  const borderRadius = '50%';

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`object-cover flex-shrink-0 ${className}`}
        style={{ width: size, height: size, borderRadius }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }

  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${gradient} ${className}`}
      style={{ width: size, height: size, borderRadius, fontSize, fontWeight: 700, color: 'white', letterSpacing: '-0.02em' }}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}
