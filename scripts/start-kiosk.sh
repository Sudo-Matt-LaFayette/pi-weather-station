#!/bin/sh
# Opens the dashboard full-screen in Chromium. Runs from the desktop autostart entry.
# Waits for the server, keeps the display awake, and relaunches the browser if it exits.
# Exit kiosk mode from SSH with: pkill -f chromium
set -u

URL="${WEATHER_URL:-http://127.0.0.1:8080}"
KEEP_DISPLAY_ON="${KEEP_DISPLAY_ON:-1}"

BROWSER="$(command -v chromium-browser || command -v chromium || true)"
if [ -z "$BROWSER" ]; then
  echo "Chromium is not installed. Run: sudo apt install chromium-browser" >&2
  exit 1
fi

if [ "$KEEP_DISPLAY_ON" = "1" ] && command -v xset >/dev/null 2>&1; then
  xset s off -dpms s noblank 2>/dev/null || true
fi

# Wait for the local server. It can start a few seconds after the desktop.
until curl -fsS "$URL/api/health" >/dev/null 2>&1; do
  sleep 2
done

while true; do
  "$BROWSER" \
    --kiosk \
    --incognito \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --no-first-run \
    --disable-translate \
    --check-for-update-interval=31536000 \
    "$URL"
  sleep 3
done
