import type {
  AlertsPayload,
  Envelope,
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
