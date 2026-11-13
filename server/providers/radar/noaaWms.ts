import { XMLParser } from 'fast-xml-parser';
import type { RadarFrame, RadarPayload, Settings } from '../../../shared/types.js';
import { fetchText } from '../../http.js';

// NOAA/NWS MRMS radar served as OGC WMS. Frame times come from GetCapabilities,
// never from guessed URLs. The layer and URL are settings, so they can be changed
// if NOAA's published service metadata changes.

const MAX_FRAMES = 18;
const WINDOW_MINUTES = 120;
const FUTURE_TOLERANCE_MS = 5 * 60_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  removeNSPrefix: true,
  isArray: (name) => name === 'Layer' || name === 'Dimension',
});

type Node = Record<string, unknown>;

function textOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object' && '#text' in v) return String((v as Node)['#text']).trim();
  return '';
}

function list(v: unknown): Node[] {
  return Array.isArray(v) ? (v as Node[]) : [];
}

/** Depth-first search for a named layer. Returns the chain of layers from the top down to it. */
function findLayerChain(node: Node, layerName: string, chain: Node[] = []): Node[] | null {
  for (const layer of list(node.Layer)) {
    const next = [...chain, layer];
    const name = textOf(layer.Name);
    if (name === layerName || name.endsWith(`:${layerName}`)) return next;
    const found = findLayerChain(layer, layerName, next);
    if (found) return found;
  }
  return null;
}

/** Parse a WMS time dimension: either a comma-separated list or a "start/end/PTnM" period. */
export function parseTimeDimension(text: string): Date[] {
  const trimmed = text.trim();
  if (trimmed.includes('/') && !trimmed.includes(',')) {
    const [startText, endText, periodText] = trimmed.split('/');
    const match = /^PT(\d+)M$/.exec(periodText ?? '');
    if (!match) throw new Error(`NOAA WMS: unsupported time period "${periodText}"`);
    const stepMs = Number(match[1]) * 60_000;
    const start = Date.parse(startText ?? '');
    const end = Date.parse(endText ?? '');
    if (Number.isNaN(start) || Number.isNaN(end)) throw new Error('NOAA WMS: invalid time period');
    const out: Date[] = [];
    for (let t = start; t <= end && out.length < 1000; t += stepMs) out.push(new Date(t));
    return out;
  }
  return trimmed
    .split(',')
    .map((s) => new Date(s.trim()))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
}

export function parseCapabilities(xml: string, layerName: string): { version: string; times: Date[] } {
  const parsed = parser.parse(xml) as Node;
  const root = (parsed.WMS_Capabilities ?? parsed.WMT_MS_Capabilities) as Node | undefined;
  if (!root) throw new Error('NOAA WMS: response is not a WMS capabilities document');
  const capability = root.Capability as Node | undefined;
  if (!capability) throw new Error('NOAA WMS: capabilities has no Capability element');

  const chain = findLayerChain(capability, layerName);
  if (!chain) throw new Error(`NOAA WMS: layer "${layerName}" not found`);

  // WMS dimensions are inherited from parent layers, so search from the layer upward.
  let timeText = '';
  for (let i = chain.length - 1; i >= 0 && !timeText; i--) {
    const dim = list(chain[i]?.Dimension).find(
      (d) => String(d['@_name'] ?? '').toLowerCase() === 'time',
    );
    if (dim) timeText = textOf(dim);
  }
  if (!timeText) throw new Error('NOAA WMS: layer has no time dimension');

  return {
    version: String(root['@_version'] ?? ''),
    times: parseTimeDimension(timeText),
  };
}

/** Pick the most recent frames inside the window. Future frames are excluded. */
export function selectFrames(times: Date[], now: Date, maxFrames = MAX_FRAMES): Date[] {
  const cutoff = now.getTime() - WINDOW_MINUTES * 60_000;
  const upper = now.getTime() + FUTURE_TOLERANCE_MS;
  const inWindow = times.filter((t) => t.getTime() >= cutoff && t.getTime() <= upper);
  const pool = inWindow.length > 0 ? inWindow : times.filter((t) => t.getTime() <= upper);
  return pool.slice(-maxFrames);
}

function medianIntervalMinutes(times: Date[]): number | null {
  if (times.length < 3) return null;
  const diffs: number[] = [];
  for (let i = 1; i < times.length; i++) {
    diffs.push((times[i]!.getTime() - times[i - 1]!.getTime()) / 60_000);
  }
  diffs.sort((a, b) => a - b);
  return Math.round(diffs[Math.floor(diffs.length / 2)]! * 10) / 10;
}

export async function fetchNoaaRadar(settings: Settings, now: Date): Promise<RadarPayload> {
  const { wmsUrl, layer } = settings.noaa;
  const xml = await fetchText(`${wmsUrl}?service=WMS&version=1.3.0&request=GetCapabilities`, {
    timeoutMs: 15_000,
  });
  const { version, times } = parseCapabilities(xml, layer);
  const picked = selectFrames(times, now);
  if (picked.length === 0) throw new Error('NOAA WMS: no frames available');
  const frames: RadarFrame[] = picked.map((d) => ({ time: d.toISOString() }));
  return {
    source: 'noaa',
    frames,
    intervalMinutes: medianIntervalMinutes(times) ?? 2,
    noaa: { wmsUrl, layer, version: version || '1.3.0' },
  };
}
