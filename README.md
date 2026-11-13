# Pi Weather Station

A full-screen weather dashboard for a Raspberry Pi and an old monitor. The radar map is the main element. It shows current conditions, the next 8 hours, a 7-day outlook, sunrise and sunset, and official U.S. weather alerts.

It uses free data sources that need no API key or account. The design follows `plan.md`.

## Status: what is and isn't verified

| Item | Status |
|---|---|
| Server and client build (`npm run build`) | Verified |
| Unit tests (42, using recorded fixtures) | Verified (`npm test`) |
| Server starts and serves the dashboard | Verified on a Linux sandbox |
| Behaviour when upstream APIs are unreachable (stays up, reports errors, no invented data) | Verified |
| **Live Open-Meteo, NWS, NOAA and RainViewer responses** | **Not verified.** The development sandbox could not reach those hosts. |
| **NOAA `conus_bref_qcd` WMS layer name, workspace path and time dimension** | **Not verified.** Set in `data/settings.json`. Check against `GetCapabilities`. |
| **RainViewer metadata schema** | **Not verified** against the current 2026 API. |
| Radar rendering in a real browser | **Not verified** |
| Raspberry Pi install, boot-to-dashboard, 800×480 layout | **Not verified.** Needs a real Pi. |
| Multi-hour soak test, network-loss recovery | **Not done** |

Run the first-run checks in "Verify the data sources" below before trusting the dashboard.

## Hardware

- Raspberry Pi 4 or 5 with 2 GB RAM or more (recommended). A Pi 3 may work but is untested.
- Raspberry Pi OS 64-bit with the desktop, so Chromium can run in kiosk mode.
- Any HDMI monitor. The layout is designed for 800×480 and scales to 1280×720 and 1920×1080.
- Internet access by Ethernet or Wi-Fi.

## Install on the Pi

1. Install Node.js 20 or newer (for example from NodeSource, or `sudo apt install nodejs` if your OS version provides 20+).
2. Install Chromium: `sudo apt install chromium-browser` (or `chromium` on newer releases).
3. Copy this project folder to the Pi, for example to `/home/pi/pi-weather-station`.
4. From the project folder, run:

   ```sh
   ./scripts/install-pi.sh
   ```

   The script installs dependencies, builds the app, installs and starts the `pi-weather` systemd service, and adds a kiosk autostart entry. It is safe to re-run. The first install on a Pi 4 can take several minutes.
5. Reboot. The monitor should open the dashboard full-screen.

To remove it: `./scripts/uninstall-pi.sh`. This keeps the project folder and `data/`.

## Configure

Settings are in `data/settings.json`. It is created with defaults on first run. The defaults are Lawrenceville, GA. **Change `location` to your own place.**

```json
{
  "location": { "name": "Lawrenceville, GA", "latitude": 33.9562, "longitude": -83.988 },
  "units": "imperial",
  "radarSource": "auto",
  "refreshMinutes": { "weather": 10, "alerts": 3, "radar": 2 },
  "noaa": { "wmsUrl": "https://opengeo.ncep.noaa.gov/geoserver/conus/wms", "layer": "conus_bref_qcd" },
  "contact": "your name or email, for the NWS User-Agent header"
}
```

- `units`: `imperial` (°F, mph, in) or `metric`.
- `radarSource`: `auto` (NOAA inside the U.S., RainViewer elsewhere), `noaa`, or `rainviewer`.
- `contact`: the NWS asks API clients to identify themselves. Put a real contact here.
- After editing, run `sudo systemctl restart pi-weather`.

To find a location's coordinates, use the search endpoint (run on the Pi):

```sh
curl -s "http://127.0.0.1:8080/api/location/search?q=Atlanta"
```

Settings can also be changed by `PUT /api/settings` from the Pi itself. Requests from other machines are refused.

### Change the location on screen

Tap **Location** in the header, type a city name, and tap a result. The dashboard clears the old place's data and loads the new one, usually within a minute. Results come from Open-Meteo's geocoding service, so searching needs internet access.

### Light and dark mode

Tap **Light** or **Dark** in the header. The choice is saved in the browser. The default is dark.

## Verify the data sources (do this before relying on the screen)

```sh
curl -s http://127.0.0.1:8080/api/health     # per-provider status and errors
curl -s http://127.0.0.1:8080/api/weather    # should have data, not null
curl -s http://127.0.0.1:8080/api/radar/frames
```

Check the NOAA layer against the service itself:

```sh
curl -s "https://opengeo.ncep.noaa.gov/geoserver/conus/wms?service=WMS&version=1.3.0&request=GetCapabilities" | grep -o 'conus_bref_qcd' | head -3
```

If the layer is missing or the URL is wrong, the server falls back to RainViewer in `auto` mode, and the screen shows which source is active. If the layer name or workspace is different, update `noaa` in `data/settings.json`.

## Day-to-day

- Logs: `journalctl -u pi-weather -f`
- Restart the server: `sudo systemctl restart pi-weather`
- Restart the kiosk browser: `pkill -f chromium` (it relaunches automatically)
- Leave kiosk mode for a terminal: connect over SSH and run `pkill -f chromium`
- The display's own sleep setting is an OS setting. `start-kiosk.sh` turns off screen blanking when it runs under X11 (set `KEEP_DISPLAY_ON=0` to skip that).

## How it behaves when something fails

- The app shows its last successful data with a timestamp, and the header is marked **STALE**. It never shows old data as live.
- Radar frames older than 20 minutes are marked **NOT LIVE**.
- Expired alerts are removed on every request. Cached alerts are marked **CACHED**.
- If the internet drops, the dashboard stays open and the last data is shown until connectivity returns. Each provider retries with exponential backoff and jitter. It does not poll continuously.
- Snapshots are saved to `data/cache/`, so a reboot during an outage still shows the last data.

## Data sources and attribution

- **Weather, forecast, sunrise/sunset, UV**: [Open-Meteo](https://open-meteo.com/) Forecast API. Free for non-commercial use, CC BY 4.0. Commercial use needs a different plan.
- **Alerts**: [U.S. National Weather Service](https://www.weather.gov/) active alerts. U.S. coverage only. The panel is hidden elsewhere. An absence of alerts is not a guarantee of safety.
- **Radar, U.S.**: NOAA/NWS MRMS base reflectivity, through the public NOAA OpenGeo WMS service.
- **Radar, fallback and outside the U.S.**: [RainViewer](https://www.rainviewer.com/) free API. Personal and educational use. Past radar only, Universal Blue colours, max zoom 7. Nowcast and satellite are not used.
- **Map**: OpenStreetMap tiles, © OpenStreetMap contributors. Normal interactive use only. Do not bulk-download tiles.
- This dashboard is informational. Use official warning channels for emergencies.

## Project layout

```
server/            Node + Express: providers, polling, cache, routes
  providers/       openMeteo.ts, nws.ts, geocoding.ts, radar/ (NOAA WMS, RainViewer)
shared/types.ts    Response types used by both server and client
client/src/        React + Leaflet dashboard
tests/             Vitest tests built from recorded fixtures
scripts/           install-pi.sh, uninstall-pi.sh, start-kiosk.sh
systemd/           Service template
data/              settings.json and cache/ (created at runtime, not in git)
```

## Development

```sh
npm install
npm test            # unit tests
npm run build       # server + client into dist/
npm run dev:server  # API on :8080 (reads data/)
npm run dev:client  # Vite on :5173, proxies /api to :8080
```

The compiled app runs with `npm start`. The Pi never compiles TypeScript at runtime.

## Known gaps

- Units are still set only in `data/settings.json`. Location and theme are changed on screen.
- Hourly visibility is not requested from Open-Meteo.
- Dew point is not shown because Open-Meteo's current-conditions endpoint does not provide it.
- The forecast view for very small screens is not built. The 800×480 layout shows 8 hours and 7 days in compact rows instead.
- Nothing has been tested on real hardware yet (see the status table).
