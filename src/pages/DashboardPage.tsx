import PageHeader from '@/components/PageHeader';
import { BarChart3 } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="pb-20">
      <PageHeader title="Dashboard" subtitle="Statistici & clasament" />
      
      <div className="px-4">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            Dashboard-ul va fi disponibil după primele sesiuni de cronometrare.
          </p>
        </div>
      </div>
    </div>
  );
}
