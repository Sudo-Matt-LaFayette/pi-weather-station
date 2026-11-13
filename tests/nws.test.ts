import { describe, expect, it } from 'vitest';
import { buildAlertsUrl, normalizeAlerts, userAgent } from '../server/providers/nws.js';

const NOW = new Date('2026-11-13T03:00:00Z');

function feature(props: Record<string, unknown>, id = 'https://api.weather.gov/alerts/urn:oid:1') {
  return { id, type: 'Feature', properties: props };
}

describe('normalizeAlerts', () => {
  it('drops expired alerts and sorts warnings above watches of the same severity', () => {
    const raw = {
      features: [
        feature({ id: 'watch', event: 'Tornado Watch', severity: 'Severe', expires: '2026-11-13T10:00:00Z' }),
        feature({ id: 'old', event: 'Flood Warning', severity: 'Severe', expires: '2026-11-12T10:00:00Z' }),
        feature({ id: 'warn', event: 'Tornado Warning', severity: 'Extreme', expires: '2026-11-13T05:00:00Z' }),
      ],
    };
    const alerts = normalizeAlerts(raw, NOW);
    expect(alerts.map((a) => a.id)).toEqual(['warn', 'watch']);
  });

  it('skips test and draft alerts', () => {
    const raw = {
      features: [feature({ event: 'Test Warning', severity: 'Minor', status: 'Test' })],
    };
    expect(normalizeAlerts(raw, NOW)).toHaveLength(0);
  });

  it('fills missing optional fields with null and unknown severity as Unknown', () => {
    const raw = { features: [feature({ event: 'Wind Advisory', severity: 'Weird' }, 'x')] };
    const [alert] = normalizeAlerts(raw, NOW);
    expect(alert?.severity).toBe('Unknown');
    expect(alert?.headline).toBeNull();
    expect(alert?.expires).toBeNull();
    expect(alert?.url).toBeNull();
  });

  it('throws on a response without a features array', () => {
    expect(() => normalizeAlerts({ title: 'nope' }, NOW)).toThrow(/features/);
  });
});

describe('NWS request helpers', () => {
  it('builds the point query', () => {
    expect(buildAlertsUrl(33.9562, -83.988)).toBe('https://api.weather.gov/alerts/active?point=33.9562,-83.988');
  });

  it('identifies the client in the User-Agent', () => {
    expect(userAgent('ops@example.test')).toBe('pi-weather-station/0.1 (ops@example.test)');
  });
});
