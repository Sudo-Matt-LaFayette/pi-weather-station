#!/usr/bin/env bash
# Removes the systemd service and kiosk autostart entry. Keeps the project and data folder.
set -euo pipefail
sudo systemctl disable --now pi-weather.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/pi-weather.service
sudo systemctl daemon-reload
rm -f "$HOME/.config/autostart/pi-weather-kiosk.desktop"
pkill -f chromium 2>/dev/null || true
echo "Removed the service and kiosk autostart. Project and data/ were kept."
