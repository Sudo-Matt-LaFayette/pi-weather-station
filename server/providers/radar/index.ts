import type { RadarPayload, RadarSource, Settings } from '../../../shared/types.js';
import { fetchNoaaRadar } from './noaaWms.js';
import { fetchRainViewerRadar } from './rainViewer.js';

// Rough NOAA MRMS CONUS coverage box. Outside it, RainViewer is the only option.
export function inNoaaCoverage(lat: number, lon: number): boolean {
  return lat >= 24 && lat <= 50 && lon >= -125.5 && lon <= -65.5;
}

/** Which providers to try, in order. An explicit choice never falls back to the other. */
export function radarProviderOrder(
  setting: Settings['radarSource'],
  lat: number,
  lon: number,
): RadarSource[] {
  if (setting === 'noaa') return ['noaa'];
  if (setting === 'rainviewer') return ['rainviewer'];
  return inNoaaCoverage(lat, lon) ? ['noaa', 'rainviewer'] : ['rainviewer'];
}

export async function fetchRadar(settings: Settings, now: Date): Promise<RadarPayload> {
  const order = radarProviderOrder(
    settings.radarSource,
    settings.location.latitude,
    settings.location.longitude,
  );
  const errors: string[] = [];
  for (const source of order) {
    try {
      return source === 'noaa' ? await fetchNoaaRadar(settings, now) : await fetchRainViewerRadar();
    } catch (err) {
      errors.push(`${source}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(errors.join('; '));
}
