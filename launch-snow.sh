#!/bin/bash

# Ensure standard system PATHs are set for GUI desktop launchers
export PATH="/snap/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Navigate to project directory
PROJECT_DIR="/home/snowjd/Documents/Snow Jarvis"
cd "$PROJECT_DIR" || exit 1

# Check if port 3000 is active
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "[SNOW LAUNCHER] Starting SNOW background server..."
    npm run dev > /tmp/snow-app.log 2>&1 &
    
    # Wait for server readiness
    MAX_ATTEMPTS=20
    ATTEMPT=0
    while ! curl -s http://localhost:3000 > /dev/null; do
        sleep 1
        ATTEMPT=$((ATTEMPT + 1))
        if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
            echo "[SNOW LAUNCHER] Server failed to start. Check /tmp/snow-app.log"
            exit 1
        fi
    done
fi

echo "[SNOW LAUNCHER] Launching SNOW App Window..."

# Prefer Chromium/Chrome in app mode if available
if [ -x "/snap/bin/chromium" ]; then
    /snap/bin/chromium --app=http://localhost:3000 --user-data-dir="$HOME/.config/snow-app" --class="SNOW" &
elif command -v chromium &> /dev/null; then
    chromium --app=http://localhost:3000 --user-data-dir="$HOME/.config/snow-app" --class="SNOW" &
elif command -v google-chrome &> /dev/null; then
    google-chrome --app=http://localhost:3000 --user-data-dir="$HOME/.config/snow-app" --class="SNOW" &
elif command -v firefox &> /dev/null; then
    firefox --new-window http://localhost:3000 &
else
    xdg-open http://localhost:3000 &
fi
