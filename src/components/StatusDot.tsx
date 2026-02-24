import { cn } from '@/lib/utils';

type DotStatus = 'active' | 'expiring' | 'expired' | 'inactive';

interface StatusDotProps {
  status: DotStatus;
  className?: string;
}

export default function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        'status-dot',
        status === 'active' && 'status-dot-active',
        status === 'expiring' && 'status-dot-expiring',
        status === 'expired' && 'status-dot-expired',
        status === 'inactive' && 'status-dot-inactive',
        className
      )}
    />
  );
}

export function getSubscriptionStatus(expiresAt: string | null): DotStatus {
  if (!expiresAt) return 'inactive';
  const now = new Date();
  const exp = new Date(expiresAt);
  if (exp < now) return 'expired';
  const daysLeft = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysLeft <= 4) return 'expiring';
  return 'active';
}
