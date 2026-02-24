import { useState, useCallback } from 'react';
import { getCoach, setCoach as persistCoach, clearCoach, CoachName } from '@/lib/coach';

export function useCoach() {
  const [coach, setCoachState] = useState<CoachName | null>(getCoach);

  const selectCoach = useCallback((name: CoachName) => {
    persistCoach(name);
    setCoachState(name);
  }, []);

  const resetCoach = useCallback(() => {
    clearCoach();
    setCoachState(null);
  }, []);

  return { coach, selectCoach, resetCoach };
}
