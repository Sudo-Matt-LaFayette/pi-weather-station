import type { AlertsPayload, Envelope, WeatherAlert } from '../../../shared/types';
import { instantClock } from '../format';

interface Props {
  envelope: Envelope<AlertsPayload> | null;
  timeZone?: string;
}

/** Text labels carry the meaning too, so the banner does not rely on colour alone. */
function kindLabel(alert: WeatherAlert): string {
  if (/warning/i.test(alert.event)) return 'WARNING';
  if (/watch/i.test(alert.event)) return 'WATCH';
  return 'ALERT';
}

function severityClass(alert: WeatherAlert): string {
  if (alert.severity === 'Extreme') return 'alert-extreme';
  if (/warning/i.test(alert.event)) return 'alert-warning';
  if (/watch/i.test(alert.event)) return 'alert-watch';
  return 'alert-advisory';
}

export function AlertBanner({ envelope, timeZone }: Props) {
  const payload = envelope?.data;
  // Outside NWS coverage, or with no active alerts, the banner stays hidden.
  if (!payload || !payload.covered || payload.alerts.length === 0) return null;

  const [top, ...rest] = payload.alerts;
  if (!top) return null;

  return (
    <div className={`alert ${severityClass(top)}`} role="alert">
      <strong>{kindLabel(top)}</strong>
      <span className="alert-event">{top.event}</span>
      {top.expires && <span>until {instantClock(top.expires, timeZone)}</span>}
      {rest.length > 0 && <span>(+{rest.length} more)</span>}
      {envelope?.stale && <span className="pill pill-stale">CACHED</span>}
      <span className="alert-note">Check official NWS sources for details</span>
    </div>
  );
}
