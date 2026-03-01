import React from 'react';

export type BadgeCategory = 'DISCIPLINA' | 'PROGRES' | 'PACING' | 'MENTALITATE' | 'SIMULARE';

export const CATEGORY_COLORS: Record<BadgeCategory, string> = {
  DISCIPLINA:  'bg-blue-100 text-blue-800 border-blue-200',
  PROGRES:     'bg-green-100 text-green-800 border-green-200',
  PACING:      'bg-purple-100 text-purple-800 border-purple-200',
  MENTALITATE: 'bg-orange-100 text-orange-800 border-orange-200',
  SIMULARE:    'bg-red-100 text-red-800 border-red-200',
};

interface BadgeChipProps {
  icon: string;
  name: string;
  category: BadgeCategory | string;
  size?: 'sm' | 'md';
  className?: string;
}

export default function BadgeChip({ icon, name, category, size = 'md', className = '' }: BadgeChipProps) {
  const colors = CATEGORY_COLORS[category as BadgeCategory] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  const sizeClass = size === 'sm'
    ? 'text-[11px] px-2 py-0.5 gap-1'
    : 'text-xs px-2.5 py-1 gap-1.5';

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${colors} ${sizeClass} ${className}`}>
      <span>{icon}</span>
      <span>{name}</span>
    </span>
  );
}
