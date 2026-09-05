#!/bin/bash

# ─────────────────────────────────────────────────────────────────────────────
# SNOW JARVIS — PRODUCTION-GRADE DESKTOP LAUNCHER
# Works both offline (Ollama local) and online (Gemini cloud)
# ─────────────────────────────────────────────────────────────────────────────

# Ensure full system PATH is available for desktop/GUI launchers (non-login shells)
export PATH="/snap/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$HOME/.local/bin:$HOME/bin:$PATH"
export HOME="/home/snowjd"
export USER="snowjd"

# ── Project root ─────────────────────────────────────────────────────────────
PROJECT_DIR="/home/snowjd/Documents/Snow Jarvis"
LOG_FILE="/tmp/snow-server.log"
PID_FILE="/tmp/snow-server.pid"
PORT=3000

log() { echo "[SNOW $(date '+%H:%M:%S')] $*"; }

cd "$PROJECT_DIR" || { log "ERROR: Cannot enter project dir"; exit 1; }

# ── Kill any stale server on port 3000 ───────────────────────────────────────
kill_old_server() {
  # Kill by PID file
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      log "Stopping old server (PID $OLD_PID)..."
      kill "$OLD_PID" 2>/dev/null
      sleep 1
    fi
    rm -f "$PID_FILE"
  fi

  # Kill anything still using port 3000
  PIDS=$(lsof -ti :$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    log "Clearing port $PORT (PIDs: $PIDS)..."
    echo "$PIDS" | xargs kill -9 2>/dev/null
    sleep 1
  fi
}

# ── Wait for server to be fully ready (checks /api/system endpoint) ──────────
wait_for_server() {
  local MAX_WAIT=60
  local ELAPSED=0
  log "Waiting for SNOW server to be fully ready..."
  while [ $ELAPSED -lt $MAX_WAIT ]; do
    # Check that the API endpoint responds correctly (not just TCP)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:$PORT/api/system" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ]; then
      log "✅ Server ready after ${ELAPSED}s"
      return 0
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
    if [ $((ELAPSED % 5)) -eq 0 ]; then
      log "Still waiting... (${ELAPSED}s) HTTP: $HTTP_CODE"
    fi
  done
  log "⚠️  Server did not become ready in ${MAX_WAIT}s — launching browser anyway"
  return 1
}

# ── Start the SNOW server ────────────────────────────────────────────────────
start_server() {
  log "🚀 Starting SNOW server..."
  # Use absolute path to tsx to avoid PATH issues in desktop launchers
  TSX="$PROJECT_DIR/node_modules/.bin/tsx"
  if [ ! -x "$TSX" ]; then
    log "ERROR: tsx not found at $TSX — run 'npm install' in $PROJECT_DIR"
    exit 1
  fi

  # Start server in background, redirect all output to log
  nohup "$TSX" "$PROJECT_DIR/server.ts" > "$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"
  log "Server started with PID $SERVER_PID (log: $LOG_FILE)"
}

# ── Launch browser/app window ────────────────────────────────────────────────
launch_browser() {
  log "🌐 Launching SNOW App window..."
  local URL="http://localhost:$PORT"
  local APP_FLAGS="--app=$URL --user-data-dir=$HOME/.config/snow-app --class=SNOW --no-first-run --disable-sync --disable-translate"

  if [ -x "/snap/bin/chromium" ]; then
    /snap/bin/chromium $APP_FLAGS &
  elif command -v chromium-browser &>/dev/null; then
    chromium-browser $APP_FLAGS &
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

# ── MAIN FLOW ────────────────────────────────────────────────────────────────

# Check if server is already running and healthy
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:$PORT/api/system" 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
  log "✅ SNOW server already running on port $PORT"
  launch_browser
  exit 0
fi

# Server not running — clean up and start fresh
kill_old_server
sleep 1
start_server
wait_for_server
launch_browser

log "🎉 SNOW Jarvis launched successfully!"
