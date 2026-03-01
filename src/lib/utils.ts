export function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function formatMmSs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v);
}

export function mean(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function formatDateRo(dateISO?: string | null): string {
  if (!dateISO) return '';
  const [y, m, d] = String(dateISO).split('-').map(Number);
  if (!y || !m || !d) return '';
  const months = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

export function formatDateShortRo(dateISO?: string | null): string {
  if (!dateISO) return '';
  const [y, m, d] = String(dateISO).split('-').map(Number);
  if (!y || !m || !d) return '';
  const months = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];
  return `${d} ${months[m - 1]}`;
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export type RunnerType = 'SPRINTER' | 'DIESEL' | 'SUICIDE_STARTER' | 'FADE_RUNNER' | null;

export function detectRunnerType(splits: number[]): RunnerType {
  if (splits.length < 3) return null;
  const n = splits.length;
  const avg = mean(splits);
  const firstHalfAvg = mean(splits.slice(0, Math.floor(n / 2)));
  const lastSplit = splits[n - 1]!;
  if (firstHalfAvg < avg * 0.92) return 'SUICIDE_STARTER';
  if (lastSplit > avg * 1.12) return 'FADE_RUNNER';
  if (lastSplit < avg * 0.92) return 'SPRINTER';
  return 'DIESEL';
}

export function calcPcs(splitNormMs: number[]): number {
  if (splitNormMs.length < 2) return 100;
  const m = mean(splitNormMs);
  if (!m) return 100;
  const cv = stddev(splitNormMs) / m;
  return Math.round(clamp(100 - cv * 300, 0, 100));
}

export type SubStatus = 'active' | 'expiring' | 'expired' | 'none';

export function getSubStatus(expiresISO?: string | null): SubStatus {
  if (!expiresISO) return 'none';
  const expires = new Date(expiresISO + 'T00:00:00').getTime();
  if (!Number.isFinite(expires)) return 'none';
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((expires - todayMs) / 86400000);
  if (diffDays < 0) return 'expired';
  if (diffDays <= 7) return 'expiring';
  return 'active';
}
