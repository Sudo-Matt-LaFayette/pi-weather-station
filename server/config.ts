import { promises as fs } from 'node:fs';
import { writeFileAtomic } from './atomicFile.js';
import type { RadarSourceSetting, Settings, Units } from '../shared/types.js';

/** Defaults are a starting point. Edit data/settings.json to match your location. */
export const DEFAULT_SETTINGS: Settings = {
  location: { name: 'Lawrenceville, GA', latitude: 33.9562, longitude: -83.988 },
  units: 'imperial',
  radarSource: 'auto',
  refreshMinutes: { weather: 10, alerts: 3, radar: 2 },
  noaa: {
    wmsUrl: 'https://opengeo.ncep.noaa.gov/geoserver/conus/wms',
    layer: 'conus_bref_qcd',
  },
  contact: 'set contact in data/settings.json',
};

const UNITS: readonly Units[] = ['imperial', 'metric'];
const RADAR_SOURCES: readonly RadarSourceSetting[] = ['auto', 'noaa', 'rainviewer'];

export type ValidationResult = { ok: true; value: Settings } | { ok: false; errors: string[] };

type Record_ = Record<string, unknown>;

function isRecord(v: unknown): v is Record_ {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Overlay a partial patch onto the current settings. Nested objects merge one level deep. */
export function mergeSettings(base: Settings, patch: unknown): unknown {
  const p: Record_ = isRecord(patch) ? patch : {};
  const loc: Record_ = isRecord(p.location) ? p.location : {};
  const refresh: Record_ = isRecord(p.refreshMinutes) ? p.refreshMinutes : {};
  const noaa: Record_ = isRecord(p.noaa) ? p.noaa : {};
  return {
    location: { ...base.location, ...loc },
    units: p.units ?? base.units,
    radarSource: p.radarSource ?? base.radarSource,
    refreshMinutes: { ...base.refreshMinutes, ...refresh },
    noaa: { ...base.noaa, ...noaa },
    contact: p.contact ?? base.contact,
  };
}

function checkRange(
  value: unknown,
  min: number,
  max: number,
  label: string,
  errors: string[],
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    errors.push(`${label} must be a number between ${min} and ${max}`);
    return min;
  }
  return value;
}

/** Validate untrusted input and return a clean, typed Settings object. */
export function validateSettings(input: unknown): ValidationResult {
  if (!isRecord(input)) return { ok: false, errors: ['settings must be a JSON object'] };
  const errors: string[] = [];

  const loc: Record_ = isRecord(input.location) ? input.location : {};
  if (!isRecord(input.location)) errors.push('location must be an object');
  const name = typeof loc.name === 'string' ? loc.name.trim() : '';
  if (name === '' || name.length > 80) errors.push('location.name must be 1-80 characters');
  const latitude = checkRange(loc.latitude, -90, 90, 'location.latitude', errors);
  const longitude = checkRange(loc.longitude, -180, 180, 'location.longitude', errors);

  if (!UNITS.includes(input.units as Units)) errors.push('units must be "imperial" or "metric"');
  if (!RADAR_SOURCES.includes(input.radarSource as RadarSourceSetting)) {
    errors.push('radarSource must be "auto", "noaa" or "rainviewer"');
  }

  const refresh: Record_ = isRecord(input.refreshMinutes) ? input.refreshMinutes : {};
  if (!isRecord(input.refreshMinutes)) errors.push('refreshMinutes must be an object');
  const weather = checkRange(refresh.weather, 5, 120, 'refreshMinutes.weather', errors);
  const alerts = checkRange(refresh.alerts, 2, 60, 'refreshMinutes.alerts', errors);
  const radar = checkRange(refresh.radar, 1, 30, 'refreshMinutes.radar', errors);

  const noaa: Record_ = isRecord(input.noaa) ? input.noaa : {};
  const wmsUrl = typeof noaa.wmsUrl === 'string' ? noaa.wmsUrl : '';
  if (!wmsUrl.startsWith('https://') || wmsUrl.length > 300) {
    errors.push('noaa.wmsUrl must be an https URL');
  }
  const layer = typeof noaa.layer === 'string' ? noaa.layer : '';
  if (!/^[\w:.-]{1,120}$/.test(layer)) errors.push('noaa.layer must be a plain layer name');

  const contact = typeof input.contact === 'string' ? input.contact : '';
  if (contact.length < 1 || contact.length > 200 || /[\x00-\x1f]/.test(contact)) {
    errors.push('contact must be 1-200 printable characters');
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      location: { name, latitude, longitude },
      units: input.units as Units,
      radarSource: input.radarSource as RadarSourceSetting,
      refreshMinutes: { weather, alerts, radar },
      noaa: { wmsUrl, layer },
      contact,
    },
  };
}

/**
 * Load settings from disk. A missing file is created with defaults.
 * An invalid file is a startup error, so the problem is visible in the logs.
 */
export async function loadSettings(file: string): Promise<Settings> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await saveSettings(file, DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${file} is not valid JSON`);
  }
  const result = validateSettings(mergeSettings(DEFAULT_SETTINGS, parsed));
  if (!result.ok) throw new Error(`Invalid settings in ${file}: ${result.errors.join('; ')}`);
  return result.value;
}

export async function saveSettings(file: string, settings: Settings): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(settings, null, 2)}\n`);
}
