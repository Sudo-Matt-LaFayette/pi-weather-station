import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useNow, usePolling } from './hooks';
import { applyTheme, initialTheme, type Theme } from './theme';
import { Attribution } from './components/Attribution';
import { AlertBanner } from './components/AlertBanner';
import { CurrentPanel } from './components/CurrentPanel';
import { Forecast } from './components/Forecast';
import { Header } from './components/Header';
import { LocationSearch } from './components/LocationSearch';
import { RadarPanel } from './components/RadarPanel';

// Client polling reads the Pi's own cache, not the upstream APIs.
// The server controls how often the upstream providers are actually called.
const DATA_POLL_MS = 60_000;
const SETTINGS_POLL_MS = 5 * 60_000;
// After a location change, poll quickly for a short while so new data appears soon.
const BURST_INTERVAL_MS = 4_000;
const BURST_TICKS = 10;

export default function App() {
  const now = useNow(15_000);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [searchOpen, setSearchOpen] = useState(false);
  const settings = usePolling(api.settings, SETTINGS_POLL_MS);
  const weather = usePolling(api.weather, DATA_POLL_MS);
  const alerts = usePolling(api.alerts, DATA_POLL_MS);
  const radar = usePolling(api.radar, DATA_POLL_MS);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const refreshAllRef = useRef<() => void>(() => {});
  refreshAllRef.current = () => {
    settings.refresh();
    weather.refresh();
    alerts.refresh();
    radar.refresh();
  };

  const burstRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (burstRef.current) clearInterval(burstRef.current);
    },
    [],
  );

  const onLocationSaved = (): void => {
    if (burstRef.current) clearInterval(burstRef.current);
    refreshAllRef.current();
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      refreshAllRef.current();
      if (ticks >= BURST_TICKS) clearInterval(id);
    }, BURST_INTERVAL_MS);
    burstRef.current = id;
  };

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
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onSearch={() => setSearchOpen(true)}
      />
      <AlertBanner envelope={alerts.data} timeZone={timeZone} />
      <main className="main">
        {location ? (
          <RadarPanel
            key={`${location.latitude},${location.longitude}`}
            envelope={radar.data}
            center={[location.latitude, location.longitude]}
            timeZone={timeZone}
            theme={theme}
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
      {searchOpen && (
        <LocationSearch
          currentName={location?.name ?? ''}
          onClose={() => setSearchOpen(false)}
          onSaved={onLocationSaved}
        />
      )}
    </div>
  );
}
