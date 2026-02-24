import { NavLink } from 'react-router-dom';
import { Users, ClipboardCheck, Timer, Banknote, BarChart3 } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/athletes', icon: Users, label: 'Sportivi' },
  { to: '/attendance', icon: ClipboardCheck, label: 'Prezență' },
  { to: '/timing', icon: Timer, label: 'Crono' },
  { to: '/cash', icon: Banknote, label: 'Cash' },
  { to: '/dashboard', icon: BarChart3, label: 'Stats' },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm safe-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-1 py-1.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
