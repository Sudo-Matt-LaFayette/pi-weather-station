#!/usr/bin/env bash
# Installs or updates the weather station on a Raspberry Pi. Safe to re-run.
# Run from the project folder as your normal user (not root):  ./scripts/install-pi.sh
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Run as your normal user, not root. The script calls sudo where needed." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="$(id -un)"
RUN_HOME="$HOME"
NODE_BIN="$(command -v node || true)"
ARCH="$(uname -m)"

case "$ARCH" in
  aarch64|armv7l|x86_64) ;;
  *) echo "Unsupported architecture: $ARCH (expected aarch64 or armv7l)." >&2; exit 1 ;;
esac

if [ -z "$NODE_BIN" ]; then
  echo "Node.js is not installed. Install Node 20 or newer first (see README)." >&2
  exit 1
fi
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node 20 or newer is required; found $("$NODE_BIN" -v)." >&2
  exit 1
fi

if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  echo "WARNING: Chromium not found. The server will install, but kiosk mode needs it:" >&2
  echo "         sudo apt install chromium-browser" >&2
fi

echo "==> Installing dependencies and building"
cd "$ROOT"
npm ci --no-audit --no-fund
npm run build

echo "==> Preparing data directory"
mkdir -p "$ROOT/data"

echo "==> Installing systemd service"
UNIT_TMP="$(mktemp)"
sed -e "s|__USER__|$RUN_USER|g" \
    -e "s|__ROOT__|$ROOT|g" \
    -e "s|__NODE__|$NODE_BIN|g" \
    "$ROOT/systemd/pi-weather.service" > "$UNIT_TMP"
sudo install -m 0644 "$UNIT_TMP" /etc/systemd/system/pi-weather.service
rm -f "$UNIT_TMP"
sudo systemctl daemon-reload
sudo systemctl enable --now pi-weather.service
sudo systemctl restart pi-weather.service

echo "==> Adding kiosk autostart (own file; existing autostart entries are untouched)"
AUTOSTART_DIR="$RUN_HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_DIR/pi-weather-kiosk.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Pi Weather Station (kiosk)
Comment=Full-screen weather dashboard
Exec=$ROOT/scripts/start-kiosk.sh
X-GNOME-Autostart-enabled=true
DESKTOP

echo
echo "Installed. Check the server with:  curl -s http://127.0.0.1:8080/api/health"
echo "Logs:  journalctl -u pi-weather -f"
echo "Edit location and units in: $ROOT/data/settings.json, then: sudo systemctl restart pi-weather"
