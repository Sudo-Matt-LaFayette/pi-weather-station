import type { WeatherPayload } from '../../../shared/types';
import { compass, naiveClock, unitLabels } from '../format';

interface Props {
  weather: WeatherPayload | null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function CurrentPanel({ weather }: Props) {
  if (!weather) {
    return <section className="card current">Loading weather…</section>;
  }
  const c = weather.current;
  const u = unitLabels(weather.units);
  const today = weather.daily[0];

  return (
    <section className="card current" aria-label="Current conditions">
      <div className="temp">
        {Math.round(c.temperature)}
        <span>{u.temp}</span>
      </div>
      <div className="condition">{c.condition}</div>
      <dl className="stats">
        <Stat label="Feels like" value={`${Math.round(c.apparentTemperature)}${u.temp}`} />
        <Stat label="Humidity" value={`${Math.round(c.humidity)}%`} />
        <Stat label="Wind" value={`${Math.round(c.windSpeed)} ${u.speed} ${compass(c.windDirection)}`} />
        <Stat label="Gusts" value={`${Math.round(c.windGust)} ${u.speed}`} />
        <Stat label="Pressure" value={`${c.pressure} ${u.pressure}`} />
        <Stat label="UV max" value={today?.uvIndexMax != null ? String(Math.round(today.uvIndexMax)) : '–'} />
        <Stat label="Sunrise" value={today ? naiveClock(today.sunrise) : '–'} />
        <Stat label="Sunset" value={today ? naiveClock(today.sunset) : '–'} />
      </dl>
    </section>
  );
}
