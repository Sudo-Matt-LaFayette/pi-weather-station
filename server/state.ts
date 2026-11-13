import path from 'node:path';
import type {
  AlertsPayload,
  Envelope,
  HealthPayload,
  RadarPayload,
  Settings,
  WeatherPayload,
} from '../shared/types.js';
import { saveSettings } from './config.js';
import { Poller } from './poller.js';
import { fetchAlerts } from './providers/nws.js';
import { fetchWeather } from './providers/openMeteo.js';
import { fetchRadar } from './providers/radar/index.js';
import { SnapshotStore } from './store.js';

const MINUTE = 60_000;
// Past these ages the data is shown as stale, with its timestamp, never as live.
const WEATHER_STALE_MS = 30 * MINUTE;
const ALERTS_STALE_MS = 10 * MINUTE;
const RADAR_STALE_MS = 10 * MINUTE;

export class AppState {
  readonly startedAt = new Date().toISOString();
  readonly settingsFile: string;
  readonly weather: Poller<WeatherPayload>;
  readonly alerts: Poller<AlertsPayload>;
  readonly radar: Poller<RadarPayload>;
  private settings: Settings;

  constructor(dataDir: string, initial: Settings) {
    this.settings = initial;
    this.settingsFile = path.join(dataDir, 'settings.json');
    const store = new SnapshotStore(path.join(dataDir, 'cache'));
    this.weather = new Poller<WeatherPayload>({
      name: 'weather',
      store,
      intervalMs: () => this.settings.refreshMinutes.weather * MINUTE,
      run: () => fetchWeather(this.settings, new Date()),
    });
    this.alerts = new Poller<AlertsPayload>({
      name: 'alerts',
      store,
      intervalMs: () => this.settings.refreshMinutes.alerts * MINUTE,
      run: () => fetchAlerts(this.settings, new Date()),
      maxBackoffMs: 10 * MINUTE,
    });
    this.radar = new Poller<RadarPayload>({
      name: 'radar',
      store,
      intervalMs: () => this.settings.refreshMinutes.radar * MINUTE,
      run: () => fetchRadar(this.settings, new Date()),
      maxBackoffMs: 10 * MINUTE,
    });
  }

  getSettings(): Settings {
    return this.settings;
  }

  async init(): Promise<void> {
    await Promise.all([this.weather.init(), this.alerts.init(), this.radar.init()]);
  }

  start(): void {
    this.weather.start();
    this.alerts.start();
    this.radar.start();
  }

  stop(): void {
    this.weather.stop();
    this.alerts.stop();
    this.radar.stop();
  }

  async updateSettings(next: Settings): Promise<void> {
    await saveSettings(this.settingsFile, next);
    this.settings = next;
    // Refresh in the background so the PUT response is not held up by upstream calls.
    void this.weather.refresh();
    void this.alerts.refresh();
    void this.radar.refresh();
  }

  envelope<T>(poller: Poller<T>, staleAfterMs: number): Envelope<T> {
    const snap = poller.snapshot;
    const ageSeconds = snap
      ? Math.max(0, Math.round((Date.now() - Date.parse(snap.fetchedAt)) / 1000))
      : null;
    return {
      data: snap?.data ?? null,
      fetchedAt: snap?.fetchedAt ?? null,
      ageSeconds,
      stale: snap === null || (ageSeconds ?? 0) * 1000 > staleAfterMs || poller.error !== null,
      error: poller.error,
    };
  }

  weatherEnvelope(): Envelope<WeatherPayload> {
    return this.envelope(this.weather, WEATHER_STALE_MS);
  }

  radarEnvelope(): Envelope<RadarPayload> {
    return this.envelope(this.radar, RADAR_STALE_MS);
  }

  /** Expired alerts are removed at request time, even when the snapshot is older. */
  alertsEnvelope(): Envelope<AlertsPayload> {
    const env = this.envelope(this.alerts, ALERTS_STALE_MS);
    if (!env.data) return env;
    const now = Date.now();
    return {
      ...env,
      data: {
        covered: env.data.covered,
        alerts: env.data.alerts.filter((a) => !a.expires || Date.parse(a.expires) > now),
      },
    };
  }

  health(): HealthPayload {
    return {
      status: 'ok',
      startedAt: this.startedAt,
      providers: [this.weather.health(), this.alerts.health(), this.radar.health()],
    };
  }
}
