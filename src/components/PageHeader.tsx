import React, { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backButton?: ReactNode;
}

export default function PageHeader({ title, subtitle, action, backButton }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b border-gray-100 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {backButton}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate leading-tight">{title}</h1>
            {subtitle && <p className="text-xs text-gray-500 truncate leading-tight mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
}
