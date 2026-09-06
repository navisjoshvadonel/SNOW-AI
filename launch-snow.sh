#!/bin/bash

# ─────────────────────────────────────────────────────────────────────────────
# SNOW AI ASSISTANT — PRODUCTION OS LAUNCHER & SUMMONER
# Supports systemd daemon, Windows+S global hotkey, and floating HUD overlay
# ─────────────────────────────────────────────────────────────────────────────

export PATH="/snap/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$HOME/.local/bin:$HOME/bin:$PATH"
export HOME="${HOME:-/home/snowjd}"
export USER="${USER:-snowjd}"

PROJECT_DIR="/home/snowjd/Documents/Snow Jarvis"
PORT=3000
LOG_FILE="/tmp/snow-server.log"
PID_FILE="/tmp/snow-server.pid"

log() { echo "[SNOW $(date '+%H:%M:%S')] $*"; }

cd "$PROJECT_DIR" || { log "ERROR: Cannot enter project directory $PROJECT_DIR"; exit 1; }

# ── Check if server is running and responding ─────────────────────────────────
is_server_ready() {
  local HTTP_CODE
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:$PORT/api/system" 2>/dev/null)
  [ "$HTTP_CODE" = "200" ]
}

# ── Wait for server readiness ────────────────────────────────────────────────
wait_for_server() {
  local MAX_WAIT=20
  local ELAPSED=0
  log "Waiting for SNOW server to be ready on port $PORT..."
  while [ $ELAPSED -lt $MAX_WAIT ]; do
    if is_server_ready; then
      log "✅ SNOW server ready (${ELAPSED}s)"
      return 0
    fi
    sleep 0.5
    ELAPSED=$((ELAPSED + 1))
  done
  log "⚠️ Server did not respond within ${MAX_WAIT}s"
  return 1
}

# ── Start server via systemd or direct fallback ──────────────────────────────
ensure_server_running() {
  if is_server_ready; then
    return 0
  fi

  # If systemd service is installed, try starting it
  if systemctl --user is-enabled snow.service &>/dev/null; then
    log "Starting SNOW via systemd user service..."
    systemctl --user start snow.service
    if wait_for_server; then
      return 0
    fi
  fi

  # Direct background fallback
  log "Starting SNOW server process..."
  TSX="$PROJECT_DIR/node_modules/.bin/tsx"
  if [ -x "$TSX" ]; then
    nohup "$TSX" "$PROJECT_DIR/server.ts" > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    wait_for_server
  else
    nohup node "$PROJECT_DIR/dist/server.cjs" > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    wait_for_server
  fi
}

# ── Launch floating HUD window ───────────────────────────────────────────────
launch_hud_window() {
  local URL="http://127.0.0.1:$PORT"
  local APP_FLAGS="--app=$URL --user-data-dir=$HOME/.config/snow-hud-profile --class=SNOW --window-size=1260,820 --window-position=center --no-first-run --disable-sync --disable-translate --disable-features=Translate"

  log "⚡ Summoning SNOW HUD window..."
  if [ -x "/snap/bin/chromium" ]; then
    /snap/bin/chromium $APP_FLAGS &
  elif command -v chromium &>/dev/null; then
    chromium $APP_FLAGS &
  elif command -v google-chrome &>/dev/null; then
    google-chrome $APP_FLAGS &
  elif command -v google-chrome-stable &>/dev/null; then
    google-chrome-stable $APP_FLAGS &
  elif command -v firefox &>/dev/null; then
    firefox --new-window "$URL" &
  else
    xdg-open "$URL" &
  fi
}

# ── Bind Windows + S (<Super>s) Global Hotkey in GNOME ───────────────────────
bind_global_hotkey() {
  log "Configuring Windows + S global shortcut in GNOME..."
  # Free <Super>s from default quick settings toggle
  gsettings set org.gnome.shell.keybindings toggle-quick-settings "[]" 2>/dev/null || true

  # Register custom keybinding
  gsettings set org.gnome.settings-daemon.plugins.media-keys custom-keybindings "['/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/snow/']"
  gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/snow/ name 'SNOW AI Assistant'
  gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/snow/ command "$PROJECT_DIR/launch-snow.sh --summon"
  gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/snow/ binding '<Super>s'

  log "✅ Windows + S is now bound globally to summon SNOW!"
}

# ── Install systemd service & desktop entry ──────────────────────────────────
install_system_integration() {
  log "Installing SNOW system-level integration..."
  
  # 1. Systemd user service
  mkdir -p "$HOME/.config/systemd/user"
  cp "$PROJECT_DIR/snow.service" "$HOME/.config/systemd/user/snow.service"
  systemctl --user daemon-reload
  systemctl --user enable --now snow.service
  log "✅ systemd service 'snow.service' installed and started."

  # 2. Desktop entries
  mkdir -p "$HOME/.local/share/applications"
  cp "$PROJECT_DIR/snow.desktop" "$HOME/.local/share/applications/snow.desktop"
  if [ -d "$HOME/Desktop" ]; then
    cp "$PROJECT_DIR/snow.desktop" "$HOME/Desktop/snow.desktop"
    chmod +x "$HOME/Desktop/snow.desktop"
    gio set "$HOME/Desktop/snow.desktop" metadata::trusted true 2>/dev/null || true
  fi
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  log "✅ Desktop entry installed."

  # 3. Global hotkey
  bind_global_hotkey

  log "🎉 SNOW system integration complete! Press Windows + S anywhere to summon."
}

# ── CLI Arguments Handler ────────────────────────────────────────────────────
case "$1" in
  --summon)
    ensure_server_running
    launch_hud_window
    ;;
  --install|--install-service)
    install_system_integration
    ;;
  --bind-hotkey)
    bind_global_hotkey
    ;;
  --daemon)
    ACTION="${2:-status}"
    systemctl --user "$ACTION" snow.service
    ;;
  *)
    ensure_server_running
    launch_hud_window
    ;;
esac
