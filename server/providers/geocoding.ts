import type { LocationResult } from '../../shared/types.js';
import { fetchJson } from '../http.js';

// Open-Meteo Geocoding API. Used by GET /api/location/search.
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

type Row = Record<string, unknown>;

export async function searchLocations(query: string): Promise<LocationResult[]> {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set('name', query);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  const raw = (await fetchJson(url.toString())) as { results?: Row[] };
  const results = Array.isArray(raw.results) ? raw.results : [];
  return results
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
    .map((r) => ({
      name: typeof r.name === 'string' ? r.name : 'Unknown',
      admin1: typeof r.admin1 === 'string' ? r.admin1 : null,
      country: typeof r.country === 'string' ? r.country : null,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
    }));
}
