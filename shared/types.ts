// Shared response types. The server produces these and the client consumes them,
// so both sides must import from this one file to avoid drift.

export type Units = 'imperial' | 'metric';
export type RadarSourceSetting = 'auto' | 'noaa' | 'rainviewer';
export type RadarSource = 'noaa' | 'rainviewer';
export type AlertSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';

export interface Settings {
  location: { name: string; latitude: number; longitude: number };
  units: Units;
  radarSource: RadarSourceSetting;
  refreshMinutes: { weather: number; alerts: number; radar: number };
  noaa: { wmsUrl: string; layer: string };
  /** Contact string sent in the NWS User-Agent header, as the NWS requires. */
  contact: string;
}

/** Every API response is wrapped so the client can show age and staleness. */
export interface Envelope<T> {
  data: T | null;
  /** When the data was fetched from the upstream provider (ISO 8601). */
  fetchedAt: string | null;
  ageSeconds: number | null;
  stale: boolean;
  /** Last refresh error, if the most recent attempt failed. */
  error: string | null;
}

export interface CurrentWeather {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  weatherCode: number;
  condition: string;
  isDay: boolean;
  precipitation: number;
  cloudCover: number;
  /** inHg when units are imperial, hPa when metric. */
  pressure: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
}

export interface HourlyPoint {
  time: string;
  temperature: number;
  precipitationProbability: number | null;
  precipitation: number;
  weatherCode: number;
  condition: string;
  windSpeed: number;
  windGust: number;
  uvIndex: number | null;
}

export interface DailyPoint {
  date: string;
  high: number;
  low: number;
  weatherCode: number;
  condition: string;
  precipitationProbabilityMax: number | null;
  precipitationSum: number;
  uvIndexMax: number | null;
  sunrise: string;
  sunset: string;
}

/** Times are naive local times in `timezone` (e.g. "2026-11-12T22:00"). */
export interface WeatherPayload {
  timezone: string;
  units: Units;
  current: CurrentWeather;
  hourly: HourlyPoint[];
  daily: DailyPoint[];
}

export interface WeatherAlert {
  id: string;
  event: string;
  headline: string | null;
  severity: AlertSeverity;
  urgency: string | null;
  certainty: string | null;
  onset: string | null;
  expires: string | null;
  areaDesc: string | null;
  description: string | null;
  instruction: string | null;
  url: string | null;
}

export interface AlertsPayload {
  /** False when the point is outside NWS coverage (U.S. only). */
  covered: boolean;
  alerts: WeatherAlert[];
}

export interface RadarFrame {
  /** ISO 8601 instant of the radar scan. */
  time: string;
  /** RainViewer only: tile path such as /v2/radar/<unix>. */
  path?: string;
}

export interface RadarPayload {
  source: RadarSource;
  intervalMinutes: number;
  frames: RadarFrame[];
  noaa?: { wmsUrl: string; layer: string; version: string };
  rainViewerHost?: string;
}

export interface ProviderHealth {
  name: string;
  ok: boolean;
  lastSuccess: string | null;
  lastAttempt: string | null;
  error: string | null;
  consecutiveFailures: number;
}

export interface HealthPayload {
  status: 'ok';
  startedAt: string;
  providers: ProviderHealth[];
}

export interface LocationResult {
  name: string;
  admin1: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}
