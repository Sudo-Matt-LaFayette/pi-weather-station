import { describe, expect, it } from 'vitest';
import { buildForecastUrl, localHourKey, normalizeForecast } from '../server/providers/openMeteo.js';

// Fixture modelled on an Open-Meteo response with timezone=auto.
// Local time is Thu 2026-11-12 22:52 in New York.
const TZ = 'America/New_York';
const NOW = new Date('2026-11-13T03:52:00Z');

function hourlyTimes(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 7 * 24; h++) {
    const day = new Date(Date.UTC(2026, 10, 12 + Math.floor(h / 24)));
    const iso = day.toISOString().slice(0, 10);
    out.push(`${iso}T${String(h % 24).padStart(2, '0')}:00`);
  }
  return out;
}

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const times = hourlyTimes();
  const n = times.length;
  const fill = (v: number | null): (number | null)[] => Array.from({ length: n }, () => v);
  return {
    timezone: TZ,
    current: {
      time: '2026-11-12T22:45',
      temperature_2m: 58.2,
      relative_humidity_2m: 71,
      apparent_temperature: 55.9,
      is_day: 0,
      precipitation: 0,
      weather_code: 0,
      cloud_cover: 12,
      pressure_msl: 1018.4,
      wind_speed_10m: 6.1,
      wind_direction_10m: 225,
      wind_gusts_10m: 11.2,
    },
    hourly: {
      time: times,
      temperature_2m: fill(60),
      precipitation_probability: fill(10),
      precipitation: fill(0),
      weather_code: fill(3),
      wind_speed_10m: fill(5),
      wind_gusts_10m: fill(9),
      uv_index: fill(0),
    },
    daily: {
      time: ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'],
      weather_code: [0, 3, 61, 61, 3, 0, 0],
      temperature_2m_max: [70, 66, 60, 58, 62, 64, 65],
      temperature_2m_min: [48, 44, 45, 40, 41, 43, 44],
      precipitation_probability_max: [5, 20, 80, null, 30, 10, 0],
      precipitation_sum: [0, 0, 0.4, 0.1, 0, 0, 0],
      uv_index_max: [4, 3, 2, 2, 3, 4, 4],
      sunrise: Array.from({ length: 7 }, (_, i) => `2026-11-${12 + i}T06:5${i}`),
      sunset: Array.from({ length: 7 }, (_, i) => `2026-11-${12 + i}T17:1${i}`),
    },
    ...overrides,
  };
}

describe('localHourKey', () => {
  it('formats the current local hour the way Open-Meteo does', () => {
    expect(localHourKey(NOW, TZ)).toBe('2026-11-12T22:00');
  });
});

describe('normalizeForecast', () => {
  it('starts the hourly list at the current local hour and keeps 24 entries', () => {
    const payload = normalizeForecast(fixture(), 'imperial', NOW);
    expect(payload.hourly).toHaveLength(24);
    expect(payload.hourly[0]?.time).toBe('2026-11-12T22:00');
  });

  it('keeps 7 daily entries with sunrise and sunset', () => {
    const payload = normalizeForecast(fixture(), 'imperial', NOW);
    expect(payload.daily).toHaveLength(7);
    expect(payload.daily[0]).toMatchObject({ date: '2026-11-12', high: 70, low: 48 });
    expect(payload.daily[0]?.sunrise).toBe('2026-11-12T06:50');
  });

  it('maps weather codes to labels', () => {
    const payload = normalizeForecast(fixture(), 'imperial', NOW);
    expect(payload.current.condition).toBe('Clear sky');
    expect(payload.daily[2]?.condition).toBe('Light rain');
  });

  it('converts pressure to inHg for imperial units and keeps hPa for metric', () => {
    const imperial = normalizeForecast(fixture(), 'imperial', NOW);
    const metric = normalizeForecast(fixture(), 'metric', NOW);
    expect(imperial.current.pressure).toBeCloseTo(30.07, 2);
    expect(metric.current.pressure).toBe(1018.4);
  });

  it('tolerates null optional values without failing', () => {
    const payload = normalizeForecast(fixture(), 'imperial', NOW);
    // Day 4 has a null precipitation probability, which must become null, not 0.
    expect(payload.daily[3]?.precipitationProbabilityMax).toBeNull();
  });

  it('throws on a missing required field instead of inventing a value', () => {
    const raw = fixture();
    (raw.current as Record<string, unknown>).temperature_2m = undefined;
    expect(() => normalizeForecast(raw, 'imperial', NOW)).toThrow(/temperature_2m/);
  });

  it('throws on a payload with no hourly column', () => {
    const raw = fixture();
    delete (raw.hourly as Record<string, unknown>).temperature_2m;
    expect(() => normalizeForecast(raw, 'imperial', NOW)).toThrow(/temperature_2m/);
  });

  it('throws when the hourly data does not reach the current hour', () => {
    const raw = fixture();
    (raw.hourly as Record<string, unknown>).time = ['2020-01-01T00:00'];
    expect(() => normalizeForecast(raw, 'imperial', NOW)).toThrow(/current hour/);
  });
});

describe('buildForecastUrl', () => {
  it('requests imperial units and auto timezone in one call', () => {
    const url = new URL(buildForecastUrl(33.9562, -83.988, 'imperial'));
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(url.searchParams.get('precipitation_unit')).toBe('inch');
  });

  it('uses Open-Meteo defaults for metric', () => {
    const url = new URL(buildForecastUrl(33.9562, -83.988, 'metric'));
    expect(url.searchParams.has('temperature_unit')).toBe(false);
  });
});
