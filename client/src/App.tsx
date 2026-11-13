import { api } from './api';
import { useNow, usePolling } from './hooks';
import { Attribution } from './components/Attribution';
import { AlertBanner } from './components/AlertBanner';
import { CurrentPanel } from './components/CurrentPanel';
import { Forecast } from './components/Forecast';
import { Header } from './components/Header';
import { RadarPanel } from './components/RadarPanel';

// Client polling is cheap: it reads the Pi's own cache, not the upstream APIs.
// The server controls how often the upstream providers are actually called.
const DATA_POLL_MS = 60_000;
const SETTINGS_POLL_MS = 5 * 60_000;

export default function App() {
  const now = useNow(15_000);
  const settings = usePolling(api.settings, SETTINGS_POLL_MS);
  const weather = usePolling(api.weather, DATA_POLL_MS);
  const alerts = usePolling(api.alerts, DATA_POLL_MS);
  const radar = usePolling(api.radar, DATA_POLL_MS);

  const weatherPayload = weather.data?.data ?? null;
  const timeZone = weatherPayload?.timezone;
  const location = settings.data?.location ?? null;

  return (
    <div className="app">
      <Header
        place={location?.name ?? 'Loading…'}
        now={now}
        timeZone={timeZone}
        weather={weather.data}
        loadError={weather.error}
      />
      <AlertBanner envelope={alerts.data} timeZone={timeZone} />
      <main className="main">
        {location ? (
          <RadarPanel
            key={`${location.latitude},${location.longitude}`}
            envelope={radar.data}
            center={[location.latitude, location.longitude]}
            timeZone={timeZone}
          />
        ) : (
          <section className="radar placeholder">Loading map…</section>
        )}
        <CurrentPanel weather={weatherPayload} />
      </main>
      <Forecast weather={weatherPayload} />
      <Attribution
        radarSource={radar.data?.data?.source ?? null}
        alertsCovered={alerts.data?.data ? alerts.data.data.covered : null}
      />
    </div>
  );
}
