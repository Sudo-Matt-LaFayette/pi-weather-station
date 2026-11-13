import type { WeatherPayload } from '../../../shared/types';
import { naiveHour, unitLabels, weekday } from '../format';

interface Props {
  weather: WeatherPayload | null;
}

const HOURS_ON_SCREEN = 8;

/** Two compact rows: the next hours, then the 7-day outlook. */
export function Forecast({ weather }: Props) {
  if (!weather) return <section className="forecast" aria-hidden="true" />;
  const u = unitLabels(weather.units);

  return (
    <section className="forecast" aria-label="Forecast">
      <div className="row">
        <div className="row-label">Next {HOURS_ON_SCREEN} h</div>
        {weather.hourly.slice(0, HOURS_ON_SCREEN).map((h) => (
          <div className="cell" key={h.time}>
            <span className="cell-top">{naiveHour(h.time)}</span>
            <span className="cell-main">{Math.round(h.temperature)}°</span>
            <span className="cell-sub">
              {h.precipitationProbability ?? '–'}% precip
            </span>
          </div>
        ))}
      </div>
      <div className="row">
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
