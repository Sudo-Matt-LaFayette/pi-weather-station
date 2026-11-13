import type { RadarFrame, RadarPayload } from '../../../shared/types.js';
import { fetchJson } from '../../http.js';

// RainViewer free public API: past radar only, Universal Blue colours, max zoom 7.
// Only the "past" frames are used. Nowcast and satellite data are not implemented.
const META_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const MAX_FRAMES = 18;

type Row = Record<string, unknown>;

export function normalizeRainViewer(raw: unknown): { host: string; frames: RadarFrame[] } {
  const meta = (raw ?? {}) as Row;
  const host = meta.host;
  if (typeof host !== 'string' || !host.startsWith('https://')) {
    throw new Error('RainViewer metadata has no valid host');
  }
  const radar = (meta.radar ?? {}) as Row;
  const past = Array.isArray(radar.past) ? (radar.past as Row[]) : [];

  const frames: RadarFrame[] = [];
  for (const entry of past) {
    const time = entry.time;
    const path = entry.path;
    // Reject any path that could alter the host portion of the tile URL.
    if (typeof time !== 'number' || !Number.isFinite(time)) continue;
    if (typeof path !== 'string' || !/^\/[\w/.-]+$/.test(path) || path.includes('//') || path.includes('..')) continue;
    frames.push({ time: new Date(time * 1000).toISOString(), path });
  }
  if (frames.length === 0) throw new Error('RainViewer metadata has no usable past frames');
  frames.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return { host, frames: frames.slice(-MAX_FRAMES) };
}

export async function fetchRainViewerRadar(): Promise<RadarPayload> {
  const raw = await fetchJson(META_URL, { timeoutMs: 15_000 });
  const { host, frames } = normalizeRainViewer(raw);
  return {
    source: 'rainviewer',
    frames,
    intervalMinutes: 10,
    rainViewerHost: host,
  };
}
