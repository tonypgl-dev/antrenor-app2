const COACH_KEY = 'athletics-coach';

export type CoachName = 'Daniela' | 'Mirela' | 'Tica';

export const COACHES: CoachName[] = ['Daniela', 'Mirela', 'Tica'];

export function getCoach(): CoachName | null {
  return localStorage.getItem(COACH_KEY) as CoachName | null;
}

export function setCoach(name: CoachName) {
  localStorage.setItem(COACH_KEY, name);
}

export function clearCoach() {
  localStorage.removeItem(COACH_KEY);
}
