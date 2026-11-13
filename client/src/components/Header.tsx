import type { Envelope, WeatherPayload } from '../../../shared/types';
import { ageLabel } from '../format';

interface Props {
  place: string;
  now: number;
  timeZone?: string;
  weather: Envelope<WeatherPayload> | null;
  loadError: string | null;
}

export function Header({ place, now, timeZone, weather, loadError }: Props) {
  const clock = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(now);

  const fetchedMs = weather?.fetchedAt ? Date.parse(weather.fetchedAt) : null;
  const ageSeconds = fetchedMs === null ? null : Math.max(0, (now - fetchedMs) / 1000);
  const stale = loadError !== null || weather === null || weather.stale;

  return (
    <header className="header">
      <div className="place">{place}</div>
      <div className="clock">{clock}</div>
      <div className="updated">
        {stale && <span className="pill pill-stale">STALE</span>}
        <span>Updated {ageLabel(ageSeconds)}</span>
      </div>
    </header>
  );
}
