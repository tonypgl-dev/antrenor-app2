export function useSimulationDay(): boolean {
  return new Date().getDay() === 6; // Saturday
}
