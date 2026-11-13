# Raspberry Pi Weather Station — Implementation Plan

**Status:** Planning / handoff to Claude Code  
**Research checked:** 12 November 2026  
**Primary goal:** Build a weather-station dashboard inspired by [elewin/pi-weather-station](https://github.com/elewin/pi-weather-station), with current radar as the visual centrepiece, using free data sources and running reliably on a Raspberry Pi.

---

## 1. Product goal

Create a dedicated, always-on weather display that boots directly into a full-screen dashboard on a Raspberry Pi. It should look and feel like a small weather-station instrument panel rather than a generic weather website.

The radar map is the highest-priority feature. The dashboard should also make it easy to answer:

- What is happening outside right now?
- Is rain or severe weather approaching?
- What will the next few hours look like?
- What is the outlook for the next week?
- When are sunrise and sunset?

The display must remain useful when one of the data providers is unavailable: show the last successful data with a clear age/stale indicator instead of blank panels or invented values.

### Design reference

Use the layout and purpose of the original Pi Weather Station as inspiration, especially its Raspberry Pi touchscreen / kiosk approach. Do not copy its implementation or carry forward its paid API dependencies by default. The reference project currently documents Mapbox and Tomorrow.io API keys, with RainViewer for radar and Sunrise-Sunset for solar times.

### Non-goals for the first release

- No physical weather sensors or local anemometer/rain gauge integration.
- No user accounts, cloud hosting, or public multi-user service.
- No paid API requirement.
- No AI-generated forecasts or interpretation presented as official weather information.
- No radar prediction/nowcast in the first release. Radar playback is historical/current data only; precipitation probabilities in the forecast are a separate model product.

---

## 2. Raspberry Pi requirements (design constraint, not an afterthought)

### Target hardware

- **Recommended:** Raspberry Pi 4 or Raspberry Pi 5 with 2 GB RAM or more.
- **Minimum kiosk target:** Raspberry Pi 3 with 1 GB RAM may be supported, but must be tested and may need reduced animations / fewer radar frames.
- **Operating system:** Raspberry Pi OS 64-bit with the desktop/browser session available.
- **Display:** Support the reference project's 7-inch 800 × 480 touchscreen, plus common HDMI resolutions (1280 × 720 and 1920 × 1080).
- **Network:** Internet connection required for fresh weather/radar data; wired Ethernet or Wi-Fi.

Do not make an x86-only dependency part of the runtime. Avoid Electron, heavyweight map frameworks, containers as a required install path, and unnecessary background services.

### Runtime strategy

1. Run a small Node.js server locally on the Pi.
2. Serve a pre-built static web application from that server.
3. Use the Pi's installed Chromium in kiosk mode to show `http://127.0.0.1:8080`.
4. Start the Node service with `systemd` and launch Chromium automatically after the graphical session starts.
5. Keep the application usable in a normal browser on a development computer as well as on the Pi.

**Do not require Docker for the first release.** It can be documented as an optional future packaging choice, but the native Node + systemd install should be the supported route because it is simpler and lighter on the Pi.

---

## 3. Data sources and API strategy

All first-release data sources should work without a paid subscription or API key. Respect each provider's terms, cache data, show source attribution, and handle timeouts/rate limits.

### 3.1 Radar — highest priority

Use a provider adapter so the map UI is not coupled to one vendor.

#### Primary for the United States: NOAA / NWS MRMS WMS

- Service host: `https://opengeo.ncep.noaa.gov/geoserver/`
- Initial CONUS layer to investigate: `conus_bref_qcd` (quality-controlled base reflectivity).
- Access style: OGC Web Map Service (WMS), displayed as a transparent radar overlay on a basemap.
- No API key is expected for this public government map service.
- Discover available times from the service's WMS `GetCapabilities` response. Do not guess timestamps or hard-code frame URLs.
- Pass the selected timestamp using the WMS time dimension once confirmed in the Phase 0 spike.
- Refresh radar frame metadata approximately every 2 minutes while the dashboard is active; do not continuously poll faster than the feed updates.
- Offer a recent-history loop and a timeline scrubber. Start with the last 60 minutes visible and allow the user to inspect up to approximately 120 minutes if the service exposes those frames.

The NWS documents its radar GIS services as OGC web services and lists national MRMS products including quality-controlled base reflectivity. The NWS `api.weather.gov` JSON API is **not** itself the radar-image service; use the dedicated GeoServer/WMS service for radar imagery.

**Important implementation gate:** Before building the full UI, prove that the live `conus_bref_qcd` WMS layer returns valid images, that the capabilities response exposes a usable time dimension, and that at least several distinct historical frames can be rendered. Confirm projection, WMS version, timestamp format, CORS/image behaviour, and attribution. If the exact time dimension or layer changes, adapt to the currently published NOAA service metadata rather than embedding assumptions.

#### Fallback / global option: RainViewer

- Metadata endpoint: `https://api.rainviewer.com/public/weather-maps.json`
- Use the `host` and `path` values returned by the metadata response to build radar tile URLs.
- Free public API is for personal/educational use; no API key required.
- Current free-service restrictions checked for this plan: past radar only, approximately 2 hours of history at 10-minute intervals, Universal Blue colour scheme only, PNG tiles, maximum zoom level 7, and a limit of 100 requests per IP per minute.
- **Do not implement nowcast, satellite imagery, or the old discontinued color schemes.**
- Display the required “Weather data by RainViewer” attribution with a link.
- Cache metadata and avoid excessive tile requests. Show the frame timestamp and clearly label the source.

Use NOAA as the preferred source in the U.S. if the Phase 0 test passes. RainViewer is the fallback and the option for locations outside supported NOAA coverage. If fallback selection is automatic, show which source is active so users understand differences in scan interval and zoom limits.

#### Radar map / basemap

- Use **Leaflet** for the map and transparent WMS/XYZ overlays. It is relatively small and suitable for this project.
- Use OpenStreetMap standard raster tiles initially, with visible `© OpenStreetMap contributors` attribution. Respect the OSM tile usage policy: normal interactive map viewing only, honour browser caching, do not bulk-download or prefetch areas, and do not strip the HTTP Referer.
- Keep the basemap URL configurable so a different compatible provider can be substituted later.
- Default map centre and zoom should be derived from the configured location, not the Pi's public IP address.
- Add a clear location marker and a subtle radar legend. Do not hide map/data attribution behind a settings menu.

### 3.2 Current conditions, hourly and daily forecast: Open-Meteo

Use the Open-Meteo Forecast API for everyday weather information:

- Current: temperature, apparent temperature, humidity, dew point if available, weather code, precipitation/rain, cloud cover, pressure, wind speed/direction and gusts.
- Hourly: temperature, precipitation probability/amount, weather code, wind, gusts, visibility and UV index where available.
- Daily: high/low, weather code, precipitation probability/amount, UV maximum, sunrise and sunset.
- Show the next 24 hours and a compact 7-day outlook.
- Request the location's automatic IANA time zone and format data in local time. Default units should be U.S. customary (°F, mph, inches) but configurable.

Endpoint family: `https://api.open-meteo.com/v1/forecast`  
Geocoding for the location setup screen: Open-Meteo Geocoding API.

The free hosted API is no-key and supports non-commercial use, with a published allowance of fewer than 10,000 calls/day and CC BY 4.0 attribution requirements. This app should make far fewer requests than that through caching. Include “Weather data by Open-Meteo” with a link.

**Refresh guidance:** One combined forecast request for the configured location about every 10 minutes is sufficient for the dashboard. Do not make one API request per weather card. Keep the refresh interval configurable.

### 3.3 U.S. severe weather alerts: National Weather Service

Use the NWS API for official active alerts affecting the configured point:

- Initial endpoint to validate: `https://api.weather.gov/alerts/active?point={latitude},{longitude}`.
- Parse event, headline, severity, urgency, certainty, effective/onset, expiration, affected area, description, and instructions when present.
- Give Tornado Warning, Severe Thunderstorm Warning, Flash Flood Warning and other high-priority alerts a prominent visual treatment.
- Acknowledge that alerts are U.S.-specific. Outside NWS coverage, hide this panel or report that local official alerts are unavailable.
- Send a descriptive `User-Agent` header with the application name/version and a contact method. The NWS requires a User-Agent to identify API clients.
- Refresh approximately every 2–5 minutes while active, honour upstream cache headers, and back off on errors / 429 responses.

Do not present the absence of an alert as a guarantee of safety. The dashboard is informational; official alert content and source links should remain accessible.

### 3.4 Optional phase-two information

- Open-Meteo Air Quality API: U.S. AQI, PM2.5 and PM10, with clear source and timestamp.
- Nearby NWS station observation: useful for a real observation alongside model-based conditions, but station distance and measurement quality must be visible. Do not silently treat a distant station as the user's exact conditions.
- Local radar site-specific product / velocity layer if users want greater local radar detail than the national mosaic provides.

Do not delay the first usable release for these additions.

---

## 4. Dashboard experience

### Visual direction

Use a polished, high-contrast **weather instrument panel**:

- Dark charcoal / deep navy background.
- Restrained cyan/blue accents for neutral information; precipitation colours should remain legible and true to the provider's radar palette.
- Large, readable temperature and weather condition.
- Clear severity treatment for warnings; colour must not be the only warning cue.
- Compact, consistent cards with strong visual hierarchy.
- Avoid decorative animations that consume CPU or distract from the radar.

### Main screen layout

Design for both 800 × 480 and larger displays. The 800 × 480 layout is the acceptance-test baseline.

**Header**
- Configured city / locality.
- Current local day and time.
- Last successful update / connectivity state.
- Compact alert banner when an active alert exists.

**Main area**
- Radar map is the largest element and should remain visible without scrolling.
- Current conditions card beside or over the map, depending on available width: large current temperature, condition, feels-like, humidity, wind and gusts.
- Radar controls: play/pause, timeline slider, previous/next frame, “Latest” button, and visible frame time.

**Lower strip / secondary panel**
- Next several hours: temperature and precipitation probability.
- 7-day summary, either as a compact strip or a separate Forecast view on the smallest display.
- Sunrise/sunset and UV index when there is room.

If the 800 × 480 layout becomes cramped, preserve the radar and current conditions on the home screen and put the full 24-hour / 7-day detail on a simple touch-friendly Forecast view. Do not solve small-screen layout by making every card unreadably tiny.

### Touch interaction

- Minimum touch target approximately 44 × 44 CSS pixels where practical.
- The map must support drag and pinch zoom without hijacking the radar timeline controls.
- All important information should be readable from a normal viewing distance.
- Do not require a keyboard or mouse for routine operation.

### Settings

A simple first-run settings flow should request:

- City/ZIP search or manual latitude/longitude.
- Display units (default Fahrenheit / mph / inches).
- Preferred radar source (`Auto`, `NOAA`, `RainViewer` where available).
- Display brightness / screen sleep behaviour should be documented as OS settings, not silently changed without user control.

Store settings locally in a JSON file. Do not store API keys because no key is needed for the first-release providers.

---

## 5. Proposed technical architecture

### Stack

- **Frontend:** React + TypeScript + Vite.
- **Map:** Leaflet.
- **Backend:** Node.js LTS + Express, TypeScript.
- **Radar WMS metadata parsing:** a small XML parser (for example `fast-xml-parser`) with tests against saved capability-response fixtures.
- **Tests:** Vitest for unit/integration tests; Playwright for browser smoke tests where practical.
- **Deployment:** native Node process + systemd + Chromium kiosk; no Docker required.

Keep the compiled frontend static. The Pi should not run a development server or compile TypeScript at runtime.

### Backend responsibilities

- Load and validate local settings.
- Fetch weather, alerts, geocoding and radar frame metadata.
- Normalize external payloads into stable internal TypeScript types.
- Cache responses and persist the last successful snapshots to disk.
- Expose a small local JSON API to the frontend.
- Serve the compiled frontend files.
- Report provider errors and data freshness without crashing the dashboard.

The backend should not proxy every map tile unless a later compatibility issue makes it necessary. Radar and basemap tiles should normally be loaded as map image requests by Leaflet.

### Suggested API routes

- `GET /api/health` — application status, provider status, last refresh timestamps.
- `GET /api/settings` — non-secret display/location settings.
- `PUT /api/settings` — validate and save settings; keep configuration writes local-only by default.
- `GET /api/weather` — normalized current, hourly and daily weather payload.
- `GET /api/alerts` — normalized active alerts.
- `GET /api/radar/frames` — current radar provider and available frame metadata.
- `GET /api/location/search?q=` — location search results.

Keep route response schemas in a shared types module so frontend and backend cannot drift.

### Suggested project structure

```text
pi-weather-station/
├── plan.md
├── README.md
├── CLAUDE.md
├── package.json
├── vite.config.ts
├── tsconfig.json
├── server/
│   ├── index.ts
│   ├── config/
│   │   ├── loadSettings.ts
│   │   └── validateSettings.ts
│   ├── routes/
│   ├── providers/
│   │   ├── weather/openMeteo.ts
│   │   ├── alerts/nws.ts
│   │   └── radar/
│   │       ├── types.ts
│   │       ├── noaaWms.ts
│   │       └── rainViewer.ts
│   ├── cache/
│   └── services/
├── shared/
│   └── types.ts
├── client/
│   └── src/
│       ├── components/
│       ├── views/
│       ├── hooks/
│       ├── map/
│       ├── services/
│       ├── styles/
│       └── App.tsx
├── scripts/
│   ├── install-pi.sh
│   ├── start-kiosk.sh
│   └── uninstall-pi.sh
├── systemd/
│   └── pi-weather.service
└── tests/
```

The exact structure can be adjusted if implementation reveals a simpler option, but keep provider integrations separate from UI components.

---

## 6. Caching, resilience and performance

The Pi should not continuously poll external APIs or repeatedly download data that has not changed.

Suggested starting cache policy:

| Data | Refresh target | Cache / fallback behaviour |
|---|---:|---|
| Open-Meteo current + forecast | 10 minutes | Persist last successful response; serve it with its original timestamp if upstream fails |
| NWS active alerts | 2–5 minutes | Honour server cache headers; retry with backoff |
| NOAA radar frame metadata | About 2 minutes | Cache last valid time list briefly; mark it stale when too old |
| RainViewer metadata (if selected) | 5–10 minutes | Cache metadata and use only frames actually returned by the API |
| Map tiles | On visible map requests | Let the browser honour tile cache headers; do not bulk-prefetch |

Implementation requirements:

- Use timeouts on every external request.
- Use bounded retries with exponential backoff and jitter; do not retry continuously.
- Persist successful weather/alert/radar metadata snapshots using atomic file writes.
- Show `Updated X min ago` and a stale/offline indicator.
- Never show a stale alert as active without checking its expiration; clearly identify cached alert data.
- Use one shared weather request for all cards.
- Limit radar animation to a configurable number of frames (start with 12–18 visible loop frames); lazy-load frames and avoid loading every frame's full tile set at once.
- Cancel obsolete radar tile/frame work when the user changes frame quickly.
- Test memory use over a long-running session to catch leaks from map layers and animation timers.
- Keep the dashboard shell usable if weather APIs are offline. Do not block the first render waiting for every provider.

---

## 7. Raspberry Pi installation and kiosk behaviour

Create an installation script and a manual install guide. The script should:

1. Detect Raspberry Pi OS / Linux architecture and fail with a useful message on unsupported systems.
2. Check for a supported Node.js LTS runtime and Chromium.
3. Install production dependencies and build the frontend on the Pi, or allow a prebuilt ARM-compatible release to be copied over.
4. Create an unprivileged service user or run under the selected desktop user with least privilege.
5. Create local config/cache directories with correct ownership.
6. Install and enable the `pi-weather.service` systemd unit.
7. Configure the graphical session to launch Chromium in kiosk mode pointed at `http://127.0.0.1:8080`.
8. Provide an uninstall path and clear instructions for exiting kiosk mode / reaching the Pi over SSH.

The Node service should restart on failure and start after network availability, but it must still serve the dashboard if the internet is temporarily unavailable. Chromium should also recover if it exits or crashes.

Do not blindly overwrite an existing Raspberry Pi desktop autostart file. Back it up and append/modify only the project's own clearly labelled section. Make the installer safe to re-run.

---

## 8. Implementation milestones for Claude Code

Work in small, testable increments. Complete and verify each milestone before adding the next. Keep this plan as the source of truth and update the checkboxes as work is completed.

### Milestone 0 — Validate the data sources (do this first)

- [ ] Inspect the NOAA `conus_bref_qcd` WMS `GetCapabilities` response.
- [ ] Confirm the layer, projection, time dimension, timestamp format and currently available frames.
- [ ] Render one live NOAA frame in a minimal Leaflet proof-of-concept.
- [ ] Render at least three distinct historical NOAA frames and animate them.
- [ ] Confirm actual frame age / update interval and choose sensible polling and animation defaults.
- [ ] Confirm the NWS point-alert endpoint returns valid GeoJSON for a test coordinate.
- [ ] Confirm Open-Meteo returns all required fields in one request.
- [ ] Build a RainViewer fallback proof-of-concept using the current metadata schema and only currently supported options.
- [ ] Record any API limitations discovered in this plan before proceeding.

**Exit criteria:** Radar works in a simple browser test with real current data and a timeline. If NOAA time-based WMS proves unreliable, use RainViewer as the first-release radar implementation and retain NOAA as an experimental provider until it is proven.

### Milestone 1 — Project foundation

- [ ] Scaffold React / TypeScript / Vite frontend and Express / TypeScript backend.
- [ ] Add shared response types, configuration loading and settings validation.
- [ ] Build `/api/health` and serve the production frontend from Express.
- [ ] Add tests for configuration parsing and API route error handling.
- [ ] Confirm `npm run build` succeeds on a normal development computer.

### Milestone 2 — Weather and alerts

- [ ] Implement the Open-Meteo provider with one combined forecast request.
- [ ] Implement the NWS alerts provider with a descriptive User-Agent.
- [ ] Add in-memory and disk-backed last-successful-response caching.
- [ ] Add normalized timestamps, units and weather-code mapping.
- [ ] Add fixtures and tests for normal responses, missing optional fields, timeouts, rate limits and malformed payloads.
- [ ] Verify stale values are labelled and do not look like fresh observations.

### Milestone 3 — Radar engine

- [ ] Implement the radar provider interface and NOAA WMS adapter.
- [ ] Implement WMS capability parsing and timestamp selection.
- [ ] Implement RainViewer adapter and provider fallback.
- [ ] Build the Leaflet map with basemap, radar layer, location marker, attribution and legend.
- [ ] Add play/pause, frame slider, previous/next and latest controls.
- [ ] Keep the map responsive and stable while changing frames or resizing the screen.
- [ ] Add tests for timestamp parsing, frame ordering, provider capability differences and fallback selection.

### Milestone 4 — Dashboard UI

- [ ] Implement the dark weather-station visual system.
- [ ] Add current conditions, hourly forecast, 7-day forecast and alert banner.
- [ ] Add first-run location setup and settings.
- [ ] Tune the 800 × 480 layout first, then scale up to 720p / 1080p.
- [ ] Test touch interactions and ensure radar remains the largest / most prominent visual element.
- [ ] Add data-source credits and visible last-updated timestamps.

### Milestone 5 — Pi deployment

- [ ] Build idempotent Pi install and uninstall scripts.
- [ ] Add systemd service and Chromium kiosk launcher.
- [ ] Test boot-to-dashboard on the target Raspberry Pi.
- [ ] Test app restart after killing the Node process and Chromium process.
- [ ] Test temporary internet loss and recovery.
- [ ] Verify display never gets unintentionally blanked (make this configurable).
- [ ] Run a multi-hour soak test and inspect CPU, RAM and browser stability.

### Milestone 6 — Documentation and handoff

- [ ] Write a clear README with supported hardware, install steps, first-run setup and troubleshooting.
- [ ] Document data providers, licences, limitations and attribution.
- [ ] Document how to set location, units, radar source and refresh intervals.
- [ ] Document how to use the display from another device on the LAN (optional; read-only by default).
- [ ] Include a diagnostic command / page showing provider health and last successful update.

---

## 9. Acceptance criteria

The first release is complete when all of the following are true:

1. A fresh Raspberry Pi OS 64-bit installation can install and launch the project using the documented steps.
2. The Pi boots to a working full-screen dashboard without requiring a keyboard or mouse for normal use.
3. The app works on the 7-inch 800 × 480 display without clipped or overlapping critical information.
4. The home screen shows a real radar image centred on the configured location.
5. The radar has working playback, pause, frame scrubbing, frame timestamps and a one-tap return to the newest frame.
6. The active radar source and data age are visible. It never labels an old frame as live.
7. Current conditions, hourly forecast, 7-day summary, sunrise/sunset and applicable active NWS alerts are displayed.
8. The required source attributions are present and readable.
9. No paid service, secret API key or account registration is required for the first-release feature set.
10. If a provider fails or the internet drops, the dashboard stays open, reports stale/offline data accurately and recovers automatically.
11. No uncontrolled polling, map-tile prefetching, unbounded animation, or long-running memory growth is observed during a multi-hour test.

---

## 10. Claude Code working instructions

Before writing application code, read this complete `plan.md` and inspect the existing repository. Then:

1. Start with **Milestone 0**. Do not assume old RainViewer examples still work; the free API changed in 2025–2026.
2. Implement one milestone at a time. Keep commits / changes small and run tests after each milestone.
3. Do not introduce paid API dependencies, API keys, Docker requirements, authentication systems, databases or complex state-management libraries unless a concrete requirement justifies them.
4. Prioritize Raspberry Pi ARM64 compatibility and 800 × 480 performance over desktop-only polish.
5. Do not fabricate weather data. Every displayed value must have a source timestamp and a clear stale state when appropriate.
6. Keep provider code isolated so a broken or discontinued API can be replaced without rewriting the dashboard.
7. When an API response differs from this plan, inspect its current official documentation and update the plan / implementation notes. Do not silently code around undocumented assumptions.
8. Keep the README install instructions synchronized with the actual scripts and tested Raspberry Pi OS version.
9. At the end of each milestone, report: files changed, tests run, results, unresolved issues, and the next milestone.
10. Do not mark an acceptance criterion complete until it has been tested on the target Raspberry Pi or an explicitly documented equivalent.

---

## 11. Research links

- [Reference project — elewin/pi-weather-station](https://github.com/elewin/pi-weather-station)
- [National Weather Service API documentation](https://www.weather.gov/documentation/services-web-api)
- [NWS CloudGIS web services](https://www.weather.gov/gis/cloudgiswebservices)
- [NWS radar FAQ / available products](https://www.weather.gov/radarfaq/)
- [NOAA OpenGeo service directory](https://opengeo.ncep.noaa.gov/geoserver/www/index.html)
- [Open-Meteo Forecast API documentation](https://open-meteo.com/en/docs)
- [Open-Meteo pricing / free API limits](https://open-meteo.com/en/pricing)
- [Open-Meteo terms and data licence](https://open-meteo.com/en/terms)
- [RainViewer API documentation](https://www.rainviewer.com/api.html)
- [RainViewer 2025–2026 API transition summary](https://www.rainviewer.com/api/transition-faq.html)
- [RainViewer Weather Maps API details](https://www.rainviewer.com/api/weather-maps-api.html)
- [RainViewer API example repository](https://github.com/rainviewer/rainviewer-api-example)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [Raspberry Pi kiosk-mode guide](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/)

## 12. Important data-source caveats

- RainViewer's older free API examples and the original reference project's code may refer to discontinued functionality. Current free RainViewer radar is historical-only and limited in zoom, interval and colour scheme.
- The NWS JSON API provides forecasts, alerts and observations, but not the radar image tiles. Radar display data must come from the NWS/NOAA GIS services or another radar provider.
- Open-Meteo's free hosted API is intended for non-commercial use; a public/commercial deployment would need a different licence or paid plan.
- OpenStreetMap's community tile servers are not an unlimited free tile CDN. Keep normal interactive usage and honour the published tile policy.
- Weather/radar services are best-effort. The app must communicate freshness and never imply that a consumer dashboard replaces official warning channels.
