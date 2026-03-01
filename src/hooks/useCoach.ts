import { useState, useCallback } from 'react';
import { CoachName, COACH_PINS, STORAGE_KEY } from '@/lib/coach';

function loadCoach(): CoachName | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v as CoachName | null;
  } catch {
    return null;
  }
}

export function useCoach() {
  const [coach, setCoach] = useState<CoachName | null>(loadCoach);

  const selectCoach = useCallback((name: CoachName, pin: string): boolean => {
    if (COACH_PINS[name] !== pin) return false;
    try { localStorage.setItem(STORAGE_KEY, name); } catch {}
    setCoach(name);
    return true;
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setCoach(null);
  }, []);

  return { coach, selectCoach, logout };
}
