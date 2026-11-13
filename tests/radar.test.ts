import { describe, expect, it } from 'vitest';
import {
  parseCapabilities,
  parseTimeDimension,
  selectFrames,
} from '../server/providers/radar/noaaWms.js';
import { normalizeRainViewer } from '../server/providers/radar/rainViewer.js';
import { inNoaaCoverage, radarProviderOrder } from '../server/providers/radar/index.js';

const NOW = new Date('2026-11-12T22:45:00Z');

// Trimmed GetCapabilities-style fixture. The layer is nested under a group layer,
// and its time dimension is a comma-separated list.
const CAPABILITIES = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Service><Name>WMS</Name></Service>
  <Capability>
    <Layer>
      <Title>root</Title>
      <Layer queryable="1">
        <Name>conus</Name>
        <Layer>
          <Name>conus:conus_bref_qcd</Name>
          <Title>Base reflectivity</Title>
          <Dimension name="time" units="ISO8601">2026-11-12T22:38:00.000Z,2026-11-12T22:40:00.000Z,2026-11-12T22:42:00.000Z,2026-11-12T22:44:00.000Z</Dimension>
        </Layer>
        <Layer><Name>conus:other</Name></Layer>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

describe('parseCapabilities', () => {
  it('finds a nested layer by suffix name and reads its time dimension', () => {
    const { version, times } = parseCapabilities(CAPABILITIES, 'conus_bref_qcd');
    expect(version).toBe('1.3.0');
    expect(times).toHaveLength(4);
    expect(times[0]?.toISOString()).toBe('2026-11-12T22:38:00.000Z');
  });

  it('throws when the layer does not exist', () => {
    expect(() => parseCapabilities(CAPABILITIES, 'missing')).toThrow(/not found/);
  });

  it('throws on something that is not capabilities XML', () => {
    expect(() => parseCapabilities('<html></html>', 'x')).toThrow(/not a WMS capabilities/);
  });
});

describe('parseTimeDimension', () => {
  it('sorts list entries ascending and drops invalid ones', () => {
    const times = parseTimeDimension('2026-11-12T22:44:00Z, nonsense, 2026-11-12T22:40:00Z');
    expect(times.map((t) => t.toISOString())).toEqual([
      '2026-11-12T22:40:00.000Z',
      '2026-11-12T22:44:00.000Z',
    ]);
  });

  it('expands a minute-based period', () => {
    const times = parseTimeDimension('2026-11-12T22:00:00Z/2026-11-12T22:10:00Z/PT5M');
    expect(times).toHaveLength(3);
  });

  it('rejects periods it does not understand', () => {
    expect(() => parseTimeDimension('2026-11-12T22:00:00Z/2026-11-12T22:10:00Z/P1D')).toThrow(/unsupported/);
  });
});

describe('selectFrames', () => {
  const times = Array.from({ length: 40 }, (_, i) => new Date(NOW.getTime() - (39 - i) * 2 * 60_000));

  it('keeps the newest frames up to the limit, in ascending order', () => {
    const picked = selectFrames(times, NOW, 12);
    expect(picked).toHaveLength(12);
    expect(picked[11]?.getTime()).toBe(times[39]?.getTime());
    expect(picked[0]!.getTime()).toBeLessThan(picked[1]!.getTime());
  });

  it('excludes frames from the future', () => {
    const future = new Date(NOW.getTime() + 60 * 60_000);
    const picked = selectFrames([...times, future], NOW, 100);
    expect(picked.some((t) => t.getTime() === future.getTime())).toBe(false);
  });

  it('falls back to the newest available frames when nothing is in the window', () => {
    const old = [new Date('2026-11-01T00:00:00Z'), new Date('2026-11-01T00:10:00Z')];
    expect(selectFrames(old, NOW, 18)).toHaveLength(2);
  });
});

describe('RainViewer normalization', () => {
  const meta = {
    host: 'https://tilecache.rainviewer.com',
    radar: {
      past: [
        { time: 1794700800, path: '/v2/radar/1794700800' },
        { time: 1794700200, path: '/v2/radar/1794700200' },
      ],
      nowcast: [{ time: 1794701400, path: '/v2/radar/nowcast_x' }],
    },
  };

  it('uses past frames only, sorted oldest first, and ignores nowcast', () => {
    const { host, frames } = normalizeRainViewer(meta);
    expect(host).toBe('https://tilecache.rainviewer.com');
    expect(frames.map((f) => f.path)).toEqual(['/v2/radar/1794700200', '/v2/radar/1794700800']);
  });

  it('rejects a non-https host', () => {
    expect(() => normalizeRainViewer({ ...meta, host: 'http://evil.example' })).toThrow(/host/);
  });

  it('drops frames whose path could change the tile host', () => {
    const bad = { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: 1, path: '//evil.example/x' }] } };
    expect(() => normalizeRainViewer(bad)).toThrow(/usable past frames/);
  });
});

describe('radar source selection', () => {
  it('prefers NOAA inside CONUS, with RainViewer as fallback', () => {
    expect(inNoaaCoverage(33.9562, -83.988)).toBe(true);
    expect(radarProviderOrder('auto', 33.9562, -83.988)).toEqual(['noaa', 'rainviewer']);
  });

  it('uses RainViewer only outside NOAA coverage', () => {
    expect(inNoaaCoverage(51.5, -0.12)).toBe(false);
    expect(radarProviderOrder('auto', 51.5, -0.12)).toEqual(['rainviewer']);
  });

  it('never falls back when the user picked one source explicitly', () => {
    expect(radarProviderOrder('noaa', 33.9, -83.9)).toEqual(['noaa']);
    expect(radarProviderOrder('rainviewer', 33.9, -83.9)).toEqual(['rainviewer']);
  });
});
