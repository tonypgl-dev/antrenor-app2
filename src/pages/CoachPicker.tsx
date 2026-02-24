import { CoachName, COACHES } from '@/lib/coach';
import { User } from 'lucide-react';

const COACH_EMOJIS: Record<CoachName, string> = {
  Daniela: '🏃‍♀️',
  Mirela: '🏋️‍♀️',
  Tica: '⏱️',
};

interface CoachPickerProps {
  onSelect: (coach: CoachName) => void;
}

export default function CoachPicker({ onSelect }: CoachPickerProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <User className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">AthletiCoach</h1>
          <p className="mt-2 text-sm text-muted-foreground">Alege antrenorul</p>
        </div>

        <div className="space-y-3">
          {COACHES.map((name) => (
            <button
              key={name}
              onClick={() => onSelect(name)}
              className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md active:scale-[0.98]"
            >
              <span className="text-3xl">{COACH_EMOJIS[name]}</span>
              <span className="text-lg font-semibold text-card-foreground">{name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
