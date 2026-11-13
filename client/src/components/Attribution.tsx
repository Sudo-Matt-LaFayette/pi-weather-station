import type { RadarSource } from '../../../shared/types';

interface Props {
  radarSource: RadarSource | null;
  alertsCovered: boolean | null;
}

/** Attribution stays visible on the main screen, not behind a menu. */
export function Attribution({ radarSource, alertsCovered }: Props) {
  return (
    <footer className="attribution">
      <span>
        Weather data by <a href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0)
      </span>
      <span className="sep">·</span>
      {radarSource === 'rainviewer' ? (
        <a href="https://www.rainviewer.com/">Weather data by RainViewer</a>
      ) : (
        <span>
          Radar: <a href="https://opengeo.ncep.noaa.gov/geoserver/www/index.html">NOAA/NWS MRMS</a>
        </span>
      )}
      <span className="sep">·</span>
      <span>
        Alerts: {alertsCovered === false ? 'U.S. only' : <a href="https://www.weather.gov/">NWS</a>}
      </span>
      <span className="sep">·</span>
      <span>
        Map © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
      </span>
    </footer>
  );
}
