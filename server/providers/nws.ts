import type { AlertSeverity, AlertsPayload, Settings, WeatherAlert } from '../../shared/types.js';
import { fetchJson, HttpError } from '../http.js';

// National Weather Service active alerts for a point. U.S. coverage only.
const ALERTS_URL = 'https://api.weather.gov/alerts/active';
const SEVERITIES: readonly AlertSeverity[] = ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'];

type Row = Record<string, unknown>;

export function buildAlertsUrl(lat: number, lon: number): string {
  return `${ALERTS_URL}?point=${lat},${lon}`;
}

/** The NWS requires an identifying User-Agent with a contact method. */
export function userAgent(contact: string): string {
  return `pi-weather-station/0.1 (${contact})`;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function severity(v: unknown): AlertSeverity {
  return SEVERITIES.find((s) => s === v) ?? 'Unknown';
}

/** Lower sorts first: more severe first, warnings ahead of watches at the same level. */
function rank(a: WeatherAlert): number {
  const sev = SEVERITIES.indexOf(a.severity);
  const kind = /warning/i.test(a.event) ? 0 : 1;
  return sev * 2 + kind;
}

export function normalizeAlerts(raw: unknown, now: Date): WeatherAlert[] {
  const features = (raw as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) throw new Error('NWS response has no features array');

  const alerts: WeatherAlert[] = [];
  for (const f of features) {
    const feature = (f ?? {}) as Row;
    const p = (feature.properties ?? {}) as Row;
    // Drop anything already expired. Never show an expired alert as active.
    const expires = str(p.expires);
    if (expires && Date.parse(expires) <= now.getTime()) continue;
    // Skip tests and drills.
    if (typeof p.status === 'string' && p.status !== 'Actual') continue;
    const event = str(p.event);
    if (!event) continue;
    const id = str(p.id) ?? str(feature.id) ?? `${event}-${str(p.onset) ?? ''}`;
    const featureId = str(feature.id);
    alerts.push({
      id,
      event,
      headline: str(p.headline),
      severity: severity(p.severity),
      urgency: str(p.urgency),
      certainty: str(p.certainty),
      onset: str(p.onset) ?? str(p.effective),
      expires,
      areaDesc: str(p.areaDesc),
      description: str(p.description),
      instruction: str(p.instruction),
      url: featureId && featureId.startsWith('https://') ? featureId : null,
    });
  }
  return alerts.sort((a, b) => rank(a) - rank(b));
}

export async function fetchAlerts(settings: Settings, now: Date): Promise<AlertsPayload> {
  const { latitude, longitude } = settings.location;
  try {
    const raw = await fetchJson(buildAlertsUrl(latitude, longitude), {
      headers: {
        'User-Agent': userAgent(settings.contact),
        Accept: 'application/geo+json',
      },
    });
    return { covered: true, alerts: normalizeAlerts(raw, now) };
  } catch (err) {
    // Points outside NWS coverage are reported as not covered rather than as an error.
    if (err instanceof HttpError && (err.status === 400 || err.status === 404)) {
      return { covered: false, alerts: [] };
    }
    throw err;
  }
}
