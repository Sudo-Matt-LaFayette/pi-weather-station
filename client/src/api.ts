import type {
  AlertsPayload,
  Envelope,
  LocationResult,
  RadarPayload,
  Settings,
  WeatherPayload,
} from '../../shared/types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return (await res.json()) as T;
}

// Defined once at module level so usePolling's dependency stays stable.
export const api = {
  settings: () => getJson<Settings>('/api/settings'),
  weather: () => getJson<Envelope<WeatherPayload>>('/api/weather'),
  alerts: () => getJson<Envelope<AlertsPayload>>('/api/alerts'),
  radar: () => getJson<Envelope<RadarPayload>>('/api/radar/frames'),
};

export function searchLocations(query: string): Promise<LocationResult[]> {
  return getJson<LocationResult[]>(`/api/location/search?q=${encodeURIComponent(query)}`);
}

export async function saveLocation(location: Settings['location']): Promise<Settings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location }),
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as { errors?: string[]; error?: string };
    throw new Error(err.errors?.join('; ') ?? err.error ?? `Server returned ${res.status}`);
  }
  return body as Settings;
}
