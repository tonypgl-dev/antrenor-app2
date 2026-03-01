import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Users, CalendarCheck, Timer, BarChart3, Wallet } from 'lucide-react';

const TABS = [
  { path: '/athletes',   icon: Users,          label: 'Sportivi'   },
  { path: '/attendance', icon: CalendarCheck,  label: 'Prezență'   },
  { path: '/timing',     icon: Timer,          label: 'Cronometru' },
  { path: '/results',    icon: BarChart3,       label: 'Rezultate'  },
  { path: '/cash',       icon: Wallet,         label: 'Cash'       },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // Hide on timing lane page (dark mode fullscreen)
  if (location.pathname.includes('/timing/lane/')) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 safe-bottom">
      <div className="mx-auto max-w-lg flex">
        {TABS.map((tab) => {
          const isActive = tab.path === '/timing'
            ? location.pathname.startsWith('/timing')
            : location.pathname.startsWith(tab.path);
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
              }`}
              style={{ minHeight: 56 }}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
