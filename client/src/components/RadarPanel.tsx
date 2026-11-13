import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Envelope, RadarFrame, RadarPayload } from '../../../shared/types';
import { useNow } from '../hooks';
import { instantClock } from '../format';

const BASEMAP_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const FRAME_INTERVAL_MS = 700;
// A frame older than this is labelled as not live, so an old scan never looks current.
const NOT_LIVE_MINUTES = 20;

interface Props {
  envelope: Envelope<RadarPayload> | null;
  center: [number, number];
  timeZone?: string;
}

function rainViewerUrl(host: string, path: string): string {
  // Universal Blue colour scheme (2), smooth 1, snow 1. Max zoom 7 on the free tier.
  return `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function buildLayer(p: RadarPayload, frame: RadarFrame): L.TileLayer {
  if (p.source === 'noaa' && p.noaa) {
    return L.tileLayer.wms(p.noaa.wmsUrl, {
      layers: p.noaa.layer,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      crs: L.CRS.EPSG3857,
      opacity: 0.75,
      time: frame.time,
      attribution: 'NOAA/NWS MRMS',
      maxZoom: 10,
    } as L.WMSOptions);
  }
  return L.tileLayer(rainViewerUrl(p.rainViewerHost ?? '', frame.path ?? ''), {
    opacity: 0.75,
    maxNativeZoom: 7,
    maxZoom: 10,
    attribution: 'Weather data by <a href="https://www.rainviewer.com/">RainViewer</a>',
  });
}

export function RadarPanel({ envelope, center, timeZone }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.TileLayer | null>(null);
  const layerSourceRef = useRef<string | null>(null);
  const layerKeyRef = useRef<string | null>(null);

  const now = useNow(30_000);
  const payload = envelope?.data ?? null;
  const frames = payload?.frames ?? [];
  const n = frames.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const safeIndex = n > 0 ? Math.min(index, n - 1) : 0;
  const frame = frames[safeIndex] ?? null;

  // The map is created once per mount. The parent remounts this panel when the location changes.
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const map = L.map(el, { center, zoom: 7, minZoom: 4, maxZoom: 10 });
    L.tileLayer(BASEMAP_URL, { maxZoom: 18, attribution: BASEMAP_ATTRIBUTION }).addTo(map);
    L.circleMarker(center, {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: '#2dd4bf',
      fillOpacity: 1,
    }).addTo(map);
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      layerSourceRef.current = null;
      layerKeyRef.current = null;
    };
    // Intentionally run once: the map is recreated by remounting, not by re-running this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the current frame. Only touch the layer when the frame really changed, so
  // polling with identical data does not reload tiles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !payload || !frame) return;
    const key = `${payload.source}|${payload.rainViewerHost ?? ''}|${frame.time}|${frame.path ?? ''}`;
    if (key === layerKeyRef.current) return;

    const layer = layerRef.current;
    if (layer && layerSourceRef.current === payload.source) {
      if (payload.source === 'noaa') {
        // Leaflet's WMS typings omit the WMS TIME parameter, so type the call narrowly.
        (layer as unknown as { setParams(p: Record<string, string>): void }).setParams({
          time: frame.time,
        });
      } else {
        layer.setUrl(rainViewerUrl(payload.rainViewerHost ?? '', frame.path ?? ''));
      }
    } else {
      layer?.remove();
      const next = buildLayer(payload, frame);
      next.addTo(map);
      layerRef.current = next;
      layerSourceRef.current = payload.source;
    }
    layerKeyRef.current = key;
  }, [payload, frame]);

  // Loop playback. Any manual control pauses it.
  useEffect(() => {
    if (!playing || n < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % n), FRAME_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, n]);

  const step = (delta: number): void => {
    setPlaying(false);
    setIndex((i) => {
      const current = Math.min(i, n - 1);
      return (((current + delta) % n) + n) % n;
    });
  };

  const goLatest = (): void => {
    setPlaying(false);
    setIndex(Math.max(0, n - 1));
  };

  const ageMinutes = frame ? (now - Date.parse(frame.time)) / 60_000 : null;
  const notLive = ageMinutes !== null && ageMinutes > NOT_LIVE_MINUTES;
  const sourceName =
    payload?.source === 'noaa'
      ? 'NOAA/NWS MRMS radar'
      : payload?.source === 'rainviewer'
        ? 'RainViewer radar (fallback)'
        : 'Radar';

  return (
    <section className="radar" aria-label="Radar map">
      <div className="map" ref={mountRef} />

      <div className="radar-info">
        <div className="radar-source">{sourceName}</div>
        {frame && ageMinutes !== null ? (
          <div className="radar-time">
            {instantClock(frame.time, timeZone)} · {Math.max(0, Math.round(ageMinutes))} min old
            {notLive && <span className="pill pill-stale">NOT LIVE</span>}
            {envelope?.stale && !notLive && <span className="pill pill-stale">CACHED</span>}
          </div>
        ) : (
          <div className="radar-time">
            {envelope?.error ? `Radar unavailable: ${envelope.error}` : 'Waiting for radar…'}
          </div>
        )}
      </div>

      <div className="radar-controls">
        <button type="button" onClick={() => step(-1)} aria-label="Previous frame" disabled={n < 2}>
          ‹
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause radar loop' : 'Play radar loop'}
          disabled={n < 2}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" onClick={() => step(1)} aria-label="Next frame" disabled={n < 2}>
          ›
        </button>
        <input
          type="range"
          className="scrubber"
          min={0}
          max={Math.max(0, n - 1)}
          value={safeIndex}
          disabled={n < 2}
          aria-label="Radar frame"
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
        />
        <button type="button" className="latest" onClick={goLatest} disabled={n === 0}>
          Latest
        </button>
      </div>

      <div className="legend" aria-hidden="true">
        <span>light</span>
        <div className="legend-bar" />
        <span>heavy</span>
      </div>
    </section>
  );
}
