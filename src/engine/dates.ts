import type { IsoDate } from './types';

// All date math is UTC-based so results never depend on the host timezone —
// a requirement for the same seed producing byte-identical event logs anywhere.

export function toUtcMs(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

export function weeksBetween(from: IsoDate, to: IsoDate): number {
  return Math.floor(daysBetween(from, to) / 7);
}

export function formatMonth(date: IsoDate): string {
  const [y, m] = date.split('-').map(Number);
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[m - 1]} ${y}`;
}
