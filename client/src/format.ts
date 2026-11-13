import type { Units } from '../../shared/types';

const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/** Open-Meteo local times are naive ("2026-11-12T22:00"). Show the hour as "10 PM". */
export function naiveHour(local: string): string {
  const h = Number(local.slice(11, 13));
  const m = local.slice(14, 16);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? 'AM' : 'PM';
  return m === '00' ? `${h12} ${suffix}` : `${h12}:${m} ${suffix}`;
}

/** Naive local time to clock format, e.g. "6:52 AM". */
export function naiveClock(local: string): string {
  const h = Number(local.slice(11, 13));
  const m = local.slice(14, 16);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A real instant (ISO with offset) shown in the location's timezone. */
export function instantClock(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

/** Weekday for a date string "YYYY-MM-DD". Uses UTC so the day never shifts. */
export function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

export function ageLabel(seconds: number | null): string {
  if (seconds === null) return 'no data yet';
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

export function compass(degrees: number): string {
  const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return POINTS[index] ?? 'N';
}

export function unitLabels(units: Units): { temp: string; speed: string; precip: string; pressure: string } {
  return units === 'imperial'
    ? { temp: '°F', speed: 'mph', precip: 'in', pressure: 'inHg' }
    : { temp: '°C', speed: 'km/h', precip: 'mm', pressure: 'hPa' };
}
