export const COACHES = ['Daniela', 'Mirela', 'Tica'] as const;
export type CoachName = typeof COACHES[number];

export const COACH_PINS: Record<CoachName, string> = {
  Daniela: '0001',
  Mirela: '0002',
  Tica: '0003',
};

export const COACH_EMOJIS: Record<CoachName, string> = {
  Daniela: '🏃‍♀️',
  Mirela: '🏋️‍♀️',
  Tica: '⏱️',
};

export const STORAGE_KEY = 'athleticoach_coach';
