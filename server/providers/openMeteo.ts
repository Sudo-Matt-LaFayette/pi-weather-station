import type {
  CurrentWeather,
  DailyPoint,
  HourlyPoint,
  Settings,
  Units,
  WeatherPayload,
} from '../../shared/types.js';
import { fetchJson } from '../http.js';
import { describeWeatherCode } from './weatherCodes.js';

// Open-Meteo Forecast API. Free, no key, CC BY 4.0 attribution required.
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const HOURS_SHOWN = 24;
const DAYS_SHOWN = 7;

const CURRENT_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
];
const HOURLY_VARS = [
  'temperature_2m',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'uv_index',
];
const DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'precipitation_sum',
  'uv_index_max',
  'sunrise',
  'sunset',
];

type Row = Record<string, unknown>;

export function buildForecastUrl(lat: number, lon: number, units: Units): string {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', String(DAYS_SHOWN));
  url.searchParams.set('current', CURRENT_VARS.join(','));
  url.searchParams.set('hourly', HOURLY_VARS.join(','));
  url.searchParams.set('daily', DAILY_VARS.join(','));
  if (units === 'imperial') {
    url.searchParams.set('temperature_unit', 'fahrenheit');
    url.searchParams.set('wind_speed_unit', 'mph');
    url.searchParams.set('precipitation_unit', 'inch');
  }
  return url.toString();
}

function num(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Open-Meteo response has missing or invalid ${field}`);
  }
  return v;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function text(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`Open-Meteo response has missing ${field}`);
  return v;
}

function column(block: Row | undefined, key: string): unknown[] {
  const v = block?.[key];
  if (!Array.isArray(v)) throw new Error(`Open-Meteo response is missing the ${key} column`);
  return v;
}

/** Current local hour in `timeZone`, formatted like Open-Meteo's naive times: "YYYY-MM-DDTHH:00". */
export function localHourKey(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:00`;
}

function convertPressure(hPa: number, units: Units): number {
  return units === 'imperial' ? Math.round(hPa * 0.02953 * 100) / 100 : Math.round(hPa * 10) / 10;
}

/** Turn a raw Open-Meteo response into the app's stable payload. Pure, so it is easy to test. */
export function normalizeForecast(raw: unknown, units: Units, now: Date): WeatherPayload {
  if (typeof raw !== 'object' || raw === null) throw new Error('Open-Meteo response is not an object');
  const r = raw as Row;
  const timezone = text(r.timezone, 'timezone');

  const cur = r.current as Row | undefined;
  if (!cur) throw new Error('Open-Meteo response has no current block');
  const code = num(cur.weather_code, 'current.weather_code');
  const current: CurrentWeather = {
    time: text(cur.time, 'current.time'),
    temperature: num(cur.temperature_2m, 'current.temperature_2m'),
    apparentTemperature: num(cur.apparent_temperature, 'current.apparent_temperature'),
    humidity: num(cur.relative_humidity_2m, 'current.relative_humidity_2m'),
    weatherCode: code,
    condition: describeWeatherCode(code),
    isDay: cur.is_day === 1,
    precipitation: num(cur.precipitation, 'current.precipitation'),
    cloudCover: num(cur.cloud_cover, 'current.cloud_cover'),
    pressure: convertPressure(num(cur.pressure_msl, 'current.pressure_msl'), units),
    windSpeed: num(cur.wind_speed_10m, 'current.wind_speed_10m'),
    windDirection: num(cur.wind_direction_10m, 'current.wind_direction_10m'),
    windGust: num(cur.wind_gusts_10m, 'current.wind_gusts_10m'),
  };

  // Hourly: start at the current local hour and keep the next 24 entries.
  const hourlyBlock = r.hourly as Row | undefined;
  const hTimes = column(hourlyBlock, 'time');
  const startKey = localHourKey(now, timezone);
  const start = hTimes.findIndex((t) => typeof t === 'string' && t >= startKey);
  if (start < 0) throw new Error('Open-Meteo hourly data does not cover the current hour');
  const end = Math.min(hTimes.length, start + HOURS_SHOWN);
  const hTemp = column(hourlyBlock, 'temperature_2m');
  const hPrecipProb = column(hourlyBlock, 'precipitation_probability');
  const hPrecip = column(hourlyBlock, 'precipitation');
  const hCode = column(hourlyBlock, 'weather_code');
  const hWind = column(hourlyBlock, 'wind_speed_10m');
  const hGust = column(hourlyBlock, 'wind_gusts_10m');
  const hUv = column(hourlyBlock, 'uv_index');

  const hourly: HourlyPoint[] = [];
  for (let i = start; i < end; i++) {
    const c = num(hCode[i], 'hourly.weather_code');
    hourly.push({
      time: text(hTimes[i], 'hourly.time'),
      temperature: num(hTemp[i], 'hourly.temperature_2m'),
      precipitationProbability: numOrNull(hPrecipProb[i]),
      precipitation: num(hPrecip[i], 'hourly.precipitation'),
      weatherCode: c,
      condition: describeWeatherCode(c),
      windSpeed: num(hWind[i], 'hourly.wind_speed_10m'),
      windGust: num(hGust[i], 'hourly.wind_gusts_10m'),
      uvIndex: numOrNull(hUv[i]),
    });
  }

  const dailyBlock = r.daily as Row | undefined;
  const dTimes = column(dailyBlock, 'time');
  const dHigh = column(dailyBlock, 'temperature_2m_max');
  const dLow = column(dailyBlock, 'temperature_2m_min');
  const dCode = column(dailyBlock, 'weather_code');
  const dPrecipProb = column(dailyBlock, 'precipitation_probability_max');
  const dPrecipSum = column(dailyBlock, 'precipitation_sum');
  const dUv = column(dailyBlock, 'uv_index_max');
  const dSunrise = column(dailyBlock, 'sunrise');
  const dSunset = column(dailyBlock, 'sunset');

  const daily: DailyPoint[] = [];
  for (let i = 0; i < Math.min(DAYS_SHOWN, dTimes.length); i++) {
    const c = num(dCode[i], 'daily.weather_code');
    daily.push({
      date: text(dTimes[i], 'daily.time'),
      high: num(dHigh[i], 'daily.temperature_2m_max'),
      low: num(dLow[i], 'daily.temperature_2m_min'),
      weatherCode: c,
      condition: describeWeatherCode(c),
      precipitationProbabilityMax: numOrNull(dPrecipProb[i]),
      precipitationSum: num(dPrecipSum[i], 'daily.precipitation_sum'),
      uvIndexMax: numOrNull(dUv[i]),
      sunrise: text(dSunrise[i], 'daily.sunrise'),
      sunset: text(dSunset[i], 'daily.sunset'),
    });
  }

  return { timezone, units, current, hourly, daily };
}

export async function fetchWeather(settings: Settings, now: Date): Promise<WeatherPayload> {
  const { latitude, longitude } = settings.location;
  const raw = await fetchJson(buildForecastUrl(latitude, longitude, settings.units));
  return normalizeForecast(raw, settings.units, now);
}
