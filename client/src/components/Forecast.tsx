import type { WeatherPayload } from '../../../shared/types';
import { naiveHour, unitLabels, weekday } from '../format';

interface Props {
  weather: WeatherPayload | null;
}

const HOURS_ON_SCREEN = 8;

/** Next hours, one per line, for the right-hand column under the current conditions. */
export function HourlyList({ weather }: Props) {
  if (!weather) return <section className="card hourly" aria-hidden="true" />;

  return (
    <section className="card hourly" aria-label="Next hours">
      <div className="hourly-title">Next {HOURS_ON_SCREEN} h</div>
      <ul className="hourly-list">
        {weather.hourly.slice(0, HOURS_ON_SCREEN).map((h) => (
          <li className="hourly-row" key={h.time}>
            <span className="hourly-time">{naiveHour(h.time)}</span>
            <span className="hourly-temp">{Math.round(h.temperature)}°</span>
            <span className="hourly-precip">{h.precipitationProbability ?? '–'}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The 7-day outlook along the bottom. */
export function Forecast({ weather }: Props) {
  if (!weather) return <section className="forecast" aria-hidden="true" />;
  const u = unitLabels(weather.units);

  return (
    <section className="forecast" aria-label="Forecast">
      <div className="row daily">
        <div className="row-label">7 days</div>
        {weather.daily.map((d) => (
          <div className="cell" key={d.date}>
            <span className="cell-top">{weekday(d.date)}</span>
            <span className="cell-main">
              {Math.round(d.high)}° <span className="low">{Math.round(d.low)}°</span>
            </span>
            <span className="cell-sub">
              {d.precipitationProbabilityMax ?? '–'}% · {d.precipitationSum.toFixed(2)} {u.precip}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
