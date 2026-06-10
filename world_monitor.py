#!/usr/bin/env python3
"""
Snow OS - World Monitor Dashboard
=================================
An expert-level, high-tech command center UI built with PyQt5 and PyQtWebEngine.
Designed as a frameless, dark-themed dashboard for a voice-controlled AI assistant.

CRITICAL LINUX & RENDER BUG FIXES APPLIED:
1. `Qt.AA_ShareOpenGLContexts` attribute set BEFORE QApplication creation. 
   This prevents Chromium WebEngine rendering crashes and composition errors on Linux.
2. Chromium environment flag `--disable-gpu-compositing` set.
   This prevents the borderless window from flickering or freezing on GNOME/Mutter.
3. Explicit `page().setBackgroundColor(QColor(10, 11, 16))` call on each QWebEngineView.
   This overrides Chromium's default white background before rendering pages, stopping white flashes.
4. Widget styling stylesheet specifies dark backgrounds (`#0a0b10`) to ensure 
   the widget background matches the page before any HTML contents are painted.
5. All WebEngine audio streams are programmatically muted using `setAudioMuted(True)` to prevent noise.
"""

import os
import sys
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# ==========================================
# 1. APPLY CRITICAL ENVIRONMENT & RENDER FIXES
# ==========================================
# Disable GPU compositing to prevent frameless window flickering/stuck state on Linux (Mutter/KWin).
# Enable auto-play policy bypass in case widgets try to play silent video tracks.
os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--disable-gpu-compositing --autoplay-policy=no-user-gesture-required"

from PyQt5.QtCore import QUrl, Qt, QCoreApplication, pyqtSignal, QObject, QPoint
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QGridLayout, QHBoxLayout, 
    QVBoxLayout, QLabel, QPushButton, QFrame, QSizePolicy
)
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtGui import QColor, QFont, QPalette, QBrush, QMouseEvent

# Share OpenGL contexts between the GUI thread and WebEngine render threads.
# Without this, PyQtWebEngine will crash or display empty black boxes.
QCoreApplication.setAttribute(Qt.AA_ShareOpenGLContexts)
# Enable high DPI scaling to support 4K/retina displays on Linux smoothly.
QCoreApplication.setAttribute(Qt.AA_EnableHighDpiScaling)


# ==========================================
# 2. DEFINE STUNNING HIGH-TECH HTML TEMPLATES
# ==========================================

# Left Pane: Interactive World Map using Leaflet.js with CartoDB DarkMatter tiles.
MAP_HTML = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Snow OS - Global Telemetry</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        body, html, #map {
            margin: 0; padding: 0; width: 100%; height: 100%;
            background-color: #0a0b10; overflow: hidden;
            font-family: 'Courier New', Courier, monospace;
        }
        .leaflet-container { background: #0a0b10 !important; }
        
        /* Sci-Fi HUD HUD elements overlaid on the map */
        .hud-overlay {
            position: absolute;
            top: 20px; left: 20px;
            z-index: 1000;
            background: rgba(10, 11, 16, 0.85);
            border: 1px solid rgba(0, 240, 255, 0.3);
            color: #00f0ff;
            padding: 12px 18px;
            font-size: 11px;
            border-radius: 8px;
            box-shadow: 0 0 15px rgba(0, 240, 255, 0.1);
            pointer-events: none;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .hud-overlay h3 { margin: 0 0 6px 0; font-size: 13px; color: #ffffff; }
        .hud-overlay span { color: #00ff66; font-weight: bold; }
        
        /* Grid scan lines overlay for cyberpunk vibe */
        .scanlines {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(
                rgba(18, 16, 16, 0) 50%, 
                rgba(0, 0, 0, 0.25) 50%
            ), linear-gradient(
                90deg,
                rgba(255, 0, 0, 0.03),
                rgba(0, 255, 0, 0.01),
                rgba(0, 0, 255, 0.03)
            );
            background-size: 100% 4px, 3px 100%;
            z-index: 999;
            pointer-events: none;
        }

        /* Pulsing dot animation */
        @keyframes pulse {
            0% { transform: scale(0.5); opacity: 0.8; }
            100% { transform: scale(2.5); opacity: 0.0; }
        }
        .radar-marker {
            width: 14px; height: 14px;
            background-color: #00f0ff;
            border-radius: 50%;
            position: relative;
            box-shadow: 0 0 10px #00f0ff;
        }
        .radar-marker::after {
            content: '';
            position: absolute;
            top: -13px; left: -13px; width: 40px; height: 40px;
            border: 2px solid #00f0ff;
            border-radius: 50%;
            animation: pulse 1.8s infinite linear;
        }
        .custom-tooltip-tech {
            background-color: rgba(5, 6, 8, 0.9) !important;
            color: #00f0ff !important;
            border: 1px solid rgba(0, 240, 255, 0.6) !important;
            box-shadow: 0 0 8px rgba(0, 240, 255, 0.4) !important;
            font-family: 'Courier New', monospace !important;
            font-size: 10px !important;
            font-weight: bold !important;
            padding: 4px 8px !important;
            border-radius: 2px !important;
        }
        .custom-tooltip-tech::before {
            border-top-color: rgba(0, 240, 255, 0.6) !important;
        }
    </style>
</head>
<body>
    <div class="scanlines"></div>
    <div class="hud-overlay">
        <h3>Snow OS // Global Grid</h3>
        Status: <span>ONLINE & SECURE</span><br>
        Telemetry: active<br>
        Tracking: 4 primary nodes
    </div>
    <div id="map"></div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        // Create Leaflet map, disable controls for a clean HUD dashboard feel
        var map = L.map('map', {
            zoomControl: false, 
            attributionControl: false,
            doubleClickZoom: false,
            boxZoom: false
        }).setView([20, 0], 2);

        // Load premium dark tiles (CartoDB DarkMatter)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 10
        }).addTo(map);

        // Custom div icon for the pulsing radar effect
        var radarIcon = L.divIcon({
            className: 'radar-marker-container',
            html: '<div class="radar-marker"></div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        // Store current markers and lines to clear them later
        var markerGroup = L.layerGroup().addTo(map);
        var connectionLine = null;

        function drawNodes(nodeList) {
            markerGroup.clearLayers();
            if (connectionLine) {
                map.removeLayer(connectionLine);
            }
            
            var latlngs = [];
            nodeList.forEach(function(node) {
                L.marker(node.coords, {icon: radarIcon}).addTo(markerGroup)
                    .bindTooltip(node.name, {
                        permanent: true,
                        direction: 'top',
                        offset: [0, -15],
                        className: 'custom-tooltip-tech'
                    });
                latlngs.push(node.coords);
            });

            if (latlngs.length > 0) {
                connectionLine = L.polyline(latlngs, {
                    color: '#00f0ff',
                    weight: 1.5,
                    opacity: 0.4,
                    dashArray: '5, 10'
                }).addTo(map);

                if (latlngs.length > 1) {
                    map.fitBounds(connectionLine.getBounds(), {padding: [50, 50], maxZoom: 5});
                } else {
                    map.setView(latlngs[0], 5);
                }
            }
        }

        // Draw initial default nodes
        var defaultNodes = [
            { name: "Snow OS Core (London)", coords: [51.5074, -0.1278] },
            { name: "Node Alpha (Tokyo)", coords: [35.6762, 139.6503] },
            { name: "Node Beta (New York)", coords: [40.7128, -74.0060] },
            { name: "Node Gamma (Mumbai)", coords: [19.0760, 72.8777] }
        ];
        drawNodes(defaultNodes);

        // API for external updates
        window.updateTelemetryData = function(newNodes) {
            if (newNodes && newNodes.length > 0) {
                drawNodes(newNodes);
            }
        };

        // Continuous subtle rotation/pan to keep the map feeling alive
        setInterval(function() {
            map.panBy([1, 0.5], {animate: true, duration: 1});
        }, 3000);
    </script>
</body>
</html>
"""

# Monitor 1: System Events & News feed
NEWS_HTML = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            background-color: #050608; color: #4af626;
            font-family: 'Courier New', Courier, monospace;
            padding: 15px; margin: 0; font-size: 11px;
            overflow-y: hidden; height: 95vh;
            border: 1px solid rgba(74, 246, 38, 0.15);
        }
        h2 { font-size: 13px; color: #ffffff; margin-top: 0; border-bottom: 1px solid rgba(74, 246, 38, 0.3); padding-bottom: 5px; letter-spacing: 2px; }
        .log-entry { margin-bottom: 8px; line-height: 1.4; opacity: 0.9; }
        .timestamp { color: #888; }
        .highlight { color: #ff0055; font-weight: bold; }
        .info { color: #00f0ff; }
        .scan {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.2) 50%);
            background-size: 100% 4px; pointer-events: none;
        }
        #ticker { height: calc(100% - 30px); overflow-y: hidden; }
    </style>
</head>
<body>
    <div class="scan"></div>
    <h2>[MONITOR 01: SYSTEM SCROLL]</h2>
    <div id="ticker"></div>

    <script>
        const logs = [
            "Initializing Snow OS Kernel connection...",
            "Establishing neural pathway channels... SUCCESS",
            "Core network check: 12 nodes listening",
            "Incoming request from voice assistant module",
            "Synthesizing voice pattern profile: FEMALE_IE",
            "Cache cleared. 142MB memory reclaimed",
            "WARNING: Host network latency spike: 182ms",
            "AI Agent Thread ID 4981 executing search query",
            "Security shield: ACTIVE, integrity 100%",
            "Satellite sync: Core tracking established",
            "Database status: ChromaDB active - 81 vectors indexed"
        ];
        
        const ticker = document.getElementById("ticker");

        function addLog(textVal) {
            const time = new Date().toLocaleTimeString();
            const logText = textVal || logs[Math.floor(Math.random() * logs.length)];
            
            const div = document.createElement("div");
            div.className = "log-entry";
            
            let styledText = logText;
            if (logText.includes("SUCCESS")) styledText = logText.replace("SUCCESS", "<span class='info'>SUCCESS</span>");
            if (logText.includes("WARNING")) styledText = `<span class='highlight'>${logText}</span>`;
            
            div.innerHTML = `<span class="timestamp">[${time}]</span> ${styledText}`;
            ticker.appendChild(div);
            
            // Keep scroll at bottom
            if (ticker.childNodes.length > 18) {
                ticker.removeChild(ticker.childNodes[0]);
            }
        }

        // Populate initially
        for (let i = 0; i < 12; i++) {
            setTimeout(() => addLog(), i * 400);
        }
        // Continuous log feed
        let feedInterval = setInterval(() => addLog(), 2200);

        // API for external updates
        window.setLogs = function(newLogs) {
            clearInterval(feedInterval);
            ticker.innerHTML = "";
            newLogs.forEach(logText => {
                addLog(logText);
            });
            // Continue feeding from new list if available
            feedInterval = setInterval(() => {
                const randomNewLog = newLogs[Math.floor(Math.random() * newLogs.length)];
                addLog(randomNewLog);
            }, 3000);
        };
    </script>
</body>
</html>
"""

# Monitor 2: Live Network Security Threat Tracker
THREAT_HTML = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            background-color: #050608; color: #ff0055;
            font-family: 'Courier New', Courier, monospace;
            padding: 15px; margin: 0; font-size: 11px;
            overflow: hidden; height: 100%;
            border: 1px solid rgba(255, 0, 85, 0.15);
        }
        h2 { font-size: 13px; color: #ffffff; margin-top: 0; border-bottom: 1px solid rgba(255, 0, 85, 0.3); padding-bottom: 5px; letter-spacing: 2px; }
        #canvas { width: 100%; height: calc(100% - 40px); background: #000; }
    </style>
</head>
<body>
    <h2>[MONITOR 02: THREAT RADAR]</h2>
    <canvas id="canvas"></canvas>

    <script>
        const canvas = document.getElementById("canvas");
        const ctx = canvas.getContext("2d");

        function resize() {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight - 40;
        }
        window.addEventListener("resize", resize);
        resize();

        let angle = 0;
        const threats = [];

        function spawnThreat() {
            if (threats.length < 5) {
                threats.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    alpha: 1.0,
                    size: 4 + Math.random() * 4
                });
            }
        }
        setInterval(spawnThreat, 1500);

        function draw() {
            ctx.fillStyle = "rgba(5, 6, 8, 0.15)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Radar Grid lines
            ctx.strokeStyle = "rgba(255, 0, 85, 0.15)";
            ctx.lineWidth = 1;
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const maxR = Math.max(canvas.width, canvas.height) / 2;

            for (let r = 30; r < maxR; r += 40) {
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Draw Sweep radar line
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
            ctx.strokeStyle = "rgba(255, 0, 85, 0.4)";
            ctx.stroke();

            angle += 0.03;

            // Draw threats
            for (let i = threats.length - 1; i >= 0; i--) {
                const t = threats[i];
                ctx.fillStyle = `rgba(255, 0, 85, ${t.alpha})`;
                ctx.beginPath();
                ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2);
                ctx.fill();

                // Ring around threat
                ctx.strokeStyle = `rgba(255, 0, 85, ${t.alpha * 0.4})`;
                ctx.beginPath();
                ctx.arc(t.x, t.y, t.size * (2 - t.alpha), 0, Math.PI * 2);
                ctx.stroke();

                t.alpha -= 0.007;
                if (t.alpha <= 0) {
                    threats.splice(i, 1);
                }
            }

            requestAnimationFrame(draw);
        }
        draw();
    </script>
</body>
</html>
"""

# Monitor 3: Satellite orbital tracking
ORBITAL_HTML = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            background-color: #050608; color: #00f0ff;
            font-family: 'Courier New', Courier, monospace;
            padding: 15px; margin: 0; font-size: 11px;
            overflow: hidden; height: 100%;
            border: 1px solid rgba(0, 240, 255, 0.15);
        }
        h2 { font-size: 13px; color: #ffffff; margin-top: 0; border-bottom: 1px solid rgba(0, 240, 255, 0.3); padding-bottom: 5px; letter-spacing: 2px; }
        .data-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 5px; margin-top: 10px; font-size: 10px; }
        .value { color: #fff; font-weight: bold; }
        .pulse { animation: blink 1s infinite; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        canvas { width: 100%; height: calc(100% - 90px); margin-top: 5px; background: #000; }
    </style>
</head>
<body>
    <h2>[MONITOR 03: ORBITAL SWEEP]</h2>
    <canvas id="sat-canvas"></canvas>
    <div class="data-grid">
        <div>ORBIT: <span class="value">GEO-SYNC // SAT-3</span></div>
        <div>ALTITUDE: <span class="value" id="alt-val">35,786 KM</span></div>
        <div>LATITUDE: <span class="value" id="lat-val">0.0000 N</span></div>
        <div>LONGITUDE: <span class="value" id="lon-val">0.0000 E</span></div>
    </div>

    <script>
        const canvas = document.getElementById("sat-canvas");
        const ctx = canvas.getContext("2d");
        
        function resize() {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight - 95;
        }
        window.addEventListener("resize", resize);
        resize();

        let frame = 0;
        function render() {
            ctx.fillStyle = "rgba(5, 6, 8, 0.2)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            
            // Draw central target
            ctx.strokeStyle = "rgba(0, 240, 255, 0.2)";
            ctx.beginPath();
            ctx.arc(cx, cy, 15, 0, Math.PI * 2);
            ctx.stroke();

            // Draw orbits
            ctx.strokeStyle = "rgba(0, 240, 255, 0.08)";
            ctx.beginPath();
            ctx.ellipse(cx, cy, 60, 25, Math.PI/6, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.ellipse(cx, cy, 90, 40, -Math.PI/6, 0, Math.PI * 2);
            ctx.stroke();

            // Calculate moving satellite node positions
            const s1x = cx + Math.cos(frame * 0.015) * 60;
            const s1y = cy + Math.sin(frame * 0.015) * 25;
            const s2x = cx + Math.cos(-frame * 0.02) * 90;
            const s2y = cy + Math.sin(-frame * 0.02) * 40;

            // Satellites dots
            ctx.fillStyle = "#fff";
            ctx.beginPath(); ctx.arc(s1x, s1y, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(s2x, s2y, 4, 0, Math.PI * 2); ctx.fill();

            // Dynamic scan line linking them
            ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
            ctx.beginPath();
            ctx.moveTo(s1x, s1y);
            ctx.lineTo(s2x, s2y);
            ctx.stroke();

            // Coordinate shift updates
            if (frame % 15 === 0) {
                document.getElementById("lat-val").innerText = (Math.random() * 90).toFixed(4) + (Math.random() > 0.5 ? " N" : " S");
                document.getElementById("lon-val").innerText = (Math.random() * 180).toFixed(4) + (Math.random() > 0.5 ? " E" : " W");
                document.getElementById("alt-val").innerText = (35780 + Math.random()*15).toFixed(0) + " KM";
            }

            frame++;
            requestAnimationFrame(render);
        }
        render();
    </script>
</body>
</html>
"""

# Monitor 4: Audio Spectrogram & CPU Graph
SPECTRUM_HTML = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            background-color: #050608; color: #ffbb00;
            font-family: 'Courier New', Courier, monospace;
            padding: 15px; margin: 0; font-size: 11px;
            overflow: hidden; height: 100%;
            border: 1px solid rgba(255, 187, 0, 0.15);
        }
        h2 { font-size: 13px; color: #ffffff; margin-top: 0; border-bottom: 1px solid rgba(255, 187, 0, 0.3); padding-bottom: 5px; letter-spacing: 2px; }
        .bar-container {
            display: flex; justify-content: space-around; align-items: flex-end;
            height: calc(100% - 40px); width: 100%; margin-top: 10px;
        }
        .bar {
            width: 8%; background: linear-gradient(to top, #ffbb00 30%, #ff5500 80%, #ff0000 100%);
            border-radius: 2px 2px 0 0; transition: height 0.08s ease-out;
            box-shadow: 0 0 10px rgba(255, 187, 0, 0.2);
        }
    </style>
</head>
<body>
    <h2>[MONITOR 04: CORE DENSITY]</h2>
    <div class="bar-container" id="bar-box"></div>

    <script>
        const container = document.getElementById("bar-box");
        const barCount = 12;
        const bars = [];

        // Create spectrum bars
        for (let i = 0; i < barCount; i++) {
            const bar = document.createElement("div");
            bar.className = "bar";
            bar.style.height = "10%";
            container.appendChild(bar);
            bars.push(bar);
        }

        let currentValues = [25, 45, 60, 80, 95, 75, 85, 90, 70, 50, 40, 30];

        function updateBars() {
            bars.forEach((bar, idx) => {
                const base = currentValues[idx] || 30;
                const spike = Math.floor(Math.random() * 20) - 10;
                const height = Math.max(10, Math.min(95, base + spike));
                bar.style.height = height + "%";
            });
        }

        setInterval(updateBars, 120);

        window.updateDensityData = function(dataArray) {
            if (dataArray && dataArray.length) {
                currentValues = dataArray;
            }
        };
    </script>
</body>
</html>
"""


# ==========================================
# 3. DEFINE REMOTE CONTROL HTTP SERVER WORKER
# ==========================================
class DashboardSignals(QObject):
    """Signals to control the main dashboard thread-safely."""
    show_dashboard = pyqtSignal()
    hide_dashboard = pyqtSignal()
    close_dashboard = pyqtSignal()
    update_dashboard = pyqtSignal(str)


# Global signals reference
dashboard_signals = DashboardSignals()


class RemoteControlHTTPHandler(BaseHTTPRequestHandler):
    """Minimal http server request handler to support external API controls."""
    def log_message(self, format, *args):
        # Override to keep terminal output clean and silent
        return

    def do_POST(self):
        # API Routes for remote voice control (Vite App/Node.js backend interface)
        if self.path == "/dashboard/show":
            dashboard_signals.show_dashboard.emit()
            self.send_response_json(200, {"status": "success", "message": "Dashboard shown"})
        elif self.path == "/dashboard/hide":
            dashboard_signals.hide_dashboard.emit()
            self.send_response_json(200, {"status": "success", "message": "Dashboard hidden"})
        elif self.path == "/dashboard/close":
            dashboard_signals.close_dashboard.emit()
            self.send_response_json(200, {"status": "success", "message": "Dashboard terminating"})
        elif self.path == "/dashboard/update":
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length).decode('utf-8')
            dashboard_signals.update_dashboard.emit(post_data)
            self.send_response_json(200, {"status": "success", "message": "Dashboard updated"})
        else:
            self.send_response_json(404, {"status": "error", "message": "Not Found"})

    def send_response_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))


def start_remote_control_server(port=8085):
    """Starts the daemon server in a background thread."""
    server = HTTPServer(("localhost", port), RemoteControlHTTPHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    print(f"[SNOW COMMAND API] Control server listening on http://localhost:{port}")


# ==========================================
# 4. IMPLEMENT THE WINDOW COMPONENT
# ==========================================
class WorldMonitorDashboard(QMainWindow):
    def __init__(self):
        super().__init__()
        self.drag_position = QPoint()
        
        # Connect Remote Control signals
        dashboard_signals.show_dashboard.connect(self.safe_show)
        dashboard_signals.hide_dashboard.connect(self.safe_hide)
        dashboard_signals.close_dashboard.connect(self.close)
        dashboard_signals.update_dashboard.connect(self.safe_update)

        self.init_ui()

    def safe_update(self, data_str):
        try:
            data = json.loads(data_str)
            
            # Update Map (Left Pane)
            if "locations" in data:
                locs_json = json.dumps(data["locations"])
                self.map_view.page().runJavaScript(f"if (window.updateTelemetryData) window.updateTelemetryData({locs_json});")
                
            # Update Logs (Monitor 1)
            if "logs" in data:
                logs_json = json.dumps(data["logs"])
                self.monitor_1.page().runJavaScript(f"if (window.setLogs) window.setLogs({logs_json});")
                
            # Update Threat Radar Title (Monitor 2)
            if "radar_title" in data:
                title_esc = data["radar_title"].replace("'", "\\'")
                self.monitor_2.page().runJavaScript(f"document.querySelector('h2').innerText = '{title_esc}';")
                
            # Update Orbital Data Grid (Monitor 3)
            if "orbital_data" in data:
                o = data["orbital_data"]
                title_esc = o.get("title", "ORBITAL SWEEP").replace("'", "\\'")
                alt_esc = o.get("alt", "35,786 KM").replace("'", "\\'")
                lat_esc = o.get("lat", "0.0000 N").replace("'", "\\'")
                lon_esc = o.get("lon", "0.0000 E").replace("'", "\\'")
                
                self.monitor_3.page().runJavaScript(f"document.querySelector('h2').innerText = '[MONITOR 03: {title_esc}]';")
                self.monitor_3.page().runJavaScript(f"document.getElementById('alt-val').innerText = '{alt_esc}';")
                self.monitor_3.page().runJavaScript(f"document.getElementById('lat-val').innerText = '{lat_esc}';")
                self.monitor_3.page().runJavaScript(f"document.getElementById('lon-val').innerText = '{lon_esc}';")
                
            # Update Density / Core Density (Monitor 4)
            if "density_title" in data:
                title_esc = data["density_title"].replace("'", "\\'")
                self.monitor_4.page().runJavaScript(f"document.querySelector('h2').innerText = '{title_esc}';")
                
            if "density_data" in data:
                dens_json = json.dumps(data["density_data"])
                self.monitor_4.page().runJavaScript(f"if (window.updateDensityData) window.updateDensityData({dens_json});")
                
        except Exception as e:
            print("[SNOW DASHBOARD] Error updating dashboard telemetry:", e)

    def init_ui(self):
        # Make the window borderless and frameless (linux compositing friendly)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.Window)
        
        # Explicit background style to prevent flashing before rendering QWebEngine
        self.setStyleSheet("""
            QMainWindow {
                background-color: #0a0b10;
                border: 2px solid #1c1e2a;
            }
        """)

        # Set default maximized screen resolution or full screen
        self.showMaximized()

        # Core container widget
        central_widget = QWidget()
        central_widget.setObjectName("CentralWidget")
        central_layout = QVBoxLayout(central_widget)
        central_layout.setContentsMargins(0, 0, 0, 0)
        central_layout.setSpacing(0)
        self.setCentralWidget(central_widget)

        # -------------------------------------------------------------
        # Header / Snow OS Branding Bar (Matches Snow OS Layout)
        # -------------------------------------------------------------
        self.header_bar = QFrame()
        self.header_bar.setFixedHeight(60)
        self.header_bar.setStyleSheet("""
            QFrame {
                background-color: rgba(10, 11, 16, 0.95);
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
        """)
        header_layout = QHBoxLayout(self.header_bar)
        header_layout.setContentsMargins(20, 0, 20, 0)

        # Pulsing circle and main title (representing Snow OS brand)
        title_container = QWidget()
        title_layout = QHBoxLayout(title_container)
        title_layout.setContentsMargins(0, 0, 0, 0)
        title_layout.setSpacing(10)

        pulse_dot = QLabel()
        pulse_dot.setFixedSize(10, 10)
        # Snow OS glowing status node
        pulse_dot.setStyleSheet("""
            background-color: #ffffff;
            border-radius: 5px;
        """)
        
        title_label = QLabel("SNOW OS")
        title_label.setFont(QFont("Arial", 11, QFont.Bold))
        # Match text glow branding via stylesheet color & spacing
        title_label.setStyleSheet("""
            color: #ffffff;
            letter-spacing: 3px;
        """)

        title_layout.addWidget(pulse_dot)
        title_layout.addWidget(title_label)
        header_layout.addWidget(title_container)

        # Explicit placeholder branding as strictly required
        placeholder_label = QLabel("[Insert Snow OS Header Here]")
        placeholder_label.setFont(QFont("Courier New", 9))
        placeholder_label.setStyleSheet("""
            color: rgba(255, 255, 255, 0.35);
            border: 1px dashed rgba(255, 255, 255, 0.15);
            padding: 5px 15px;
            border-radius: 4px;
        """)
        header_layout.addWidget(placeholder_label, 0, Qt.AlignCenter)

        # Action Buttons (Minimize, Close)
        actions_container = QWidget()
        actions_layout = QHBoxLayout(actions_container)
        actions_layout.setContentsMargins(0, 0, 0, 0)
        actions_layout.setSpacing(10)

        btn_min = QPushButton("─")
        btn_min.setFixedSize(32, 32)
        btn_min.clicked.connect(self.showMinimized)
        btn_min.setStyleSheet(self.get_action_button_style())

        btn_close = QPushButton("✕")
        btn_close.setFixedSize(32, 32)
        btn_close.clicked.connect(self.close)
        btn_close.setStyleSheet(self.get_action_button_style(close_style=True))

        actions_layout.addWidget(btn_min)
        actions_layout.addWidget(btn_close)
        header_layout.addWidget(actions_container, 0, Qt.AlignRight)

        central_layout.addWidget(self.header_bar)

        # -------------------------------------------------------------
        # Grid Dashboard Structure (50% / 50% Division)
        # -------------------------------------------------------------
        dashboard_container = QWidget()
        grid = QGridLayout(dashboard_container)
        grid.setContentsMargins(15, 15, 15, 15)
        grid.setSpacing(15)

        # Stretch columns equally to ensure 50% left & 50% right split
        grid.setColumnStretch(0, 1)
        grid.setColumnStretch(1, 1)

        # Left Pane (50% Width) - Interactive Global Map
        self.map_view = QWebEngineView()
        self.setup_web_view_safety(self.map_view)
        # Load local Leaflet layout string
        self.map_view.setHtml(MAP_HTML)
        
        # Add frame around map for command center look
        map_frame = QFrame()
        map_frame.setStyleSheet("""
            QFrame {
                border: 1px solid rgba(0, 240, 255, 0.15);
                border-radius: 12px;
                background-color: #050608;
            }
        """)
        map_frame_layout = QVBoxLayout(map_frame)
        map_frame_layout.setContentsMargins(2, 2, 2, 2)
        map_frame_layout.addWidget(self.map_view)
        grid.addWidget(map_frame, 0, 0)

        # Right Pane (50% Width) - Nested 2x2 Grid News Monitors
        right_pane = QWidget()
        right_grid = QGridLayout(right_pane)
        right_grid.setContentsMargins(0, 0, 0, 0)
        right_grid.setSpacing(15)

        # Equidistant rows and columns for the nested grid
        right_grid.setRowStretch(0, 1)
        right_grid.setRowStretch(1, 1)
        right_grid.setColumnStretch(0, 1)
        right_grid.setColumnStretch(1, 1)

        # Initialize the 4 separate monitor views
        self.monitor_1 = QWebEngineView()
        self.monitor_2 = QWebEngineView()
        self.monitor_3 = QWebEngineView()
        self.monitor_4 = QWebEngineView()

        monitors = [
            (self.monitor_1, NEWS_HTML, 0, 0),
            (self.monitor_2, THREAT_HTML, 0, 1),
            (self.monitor_3, ORBITAL_HTML, 1, 0),
            (self.monitor_4, SPECTRUM_HTML, 1, 1),
        ]

        for view, html, row, col in monitors:
            self.setup_web_view_safety(view)
            view.setHtml(html)
            
            # Sub-frame container to mimic terminal windows
            sub_frame = QFrame()
            sub_frame.setStyleSheet("""
                QFrame {
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    background-color: #050608;
                }
            """)
            sub_layout = QVBoxLayout(sub_frame)
            sub_layout.setContentsMargins(1, 1, 1, 1)
            sub_layout.addWidget(view)
            right_grid.addWidget(sub_frame, row, col)

        grid.addWidget(right_pane, 0, 1)
        central_layout.addWidget(dashboard_container)

    def setup_web_view_safety(self, view):
        """
        Applies strict anti-flashing and performance configuration rules.
        """
        # A. Make background transparent/dark before page loaded to prevent default white flash.
        view.setStyleSheet("background-color: #0a0b10;")
        view.setAttribute(Qt.WA_TranslucentBackground, False)
        view.page().setBackgroundColor(QColor(10, 11, 16))

        # B. Set page size policy to fit layout nicely
        view.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

        # C. Critical performance mute audio constraint
        # Mute audio on page loads so live streams don't override the Snow OS voice.
        view.page().setAudioMuted(True)

    def get_action_button_style(self, close_style=False):
        if close_style:
            return """
                QPushButton {
                    background-color: transparent;
                    color: rgba(255, 255, 255, 0.4);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                }
                QPushButton:hover {
                    background-color: #ff0055;
                    color: #ffffff;
                    border: 1px solid #ff0055;
                }
            """
        return """
            QPushButton {
                background-color: transparent;
                color: rgba(255, 255, 255, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
            }
            QPushButton:hover {
                background-color: rgba(255, 255, 255, 0.08);
                color: #ffffff;
            }
        """

    # -------------------------------------------------------------
    # Drag-and-Move Support for Borderless Windows
    # -------------------------------------------------------------
    def mousePressEvent(self, event: QMouseEvent):
        if event.button() == Qt.LeftButton:
            # Check if click originated within header bar region
            if event.y() < self.header_bar.height():
                self.drag_position = event.globalPos() - self.frameGeometry().topLeft()
                event.accept()

    def mouseMoveEvent(self, event: QMouseEvent):
        if event.buttons() == Qt.LeftButton and not self.drag_position.isNull():
            self.move(event.globalPos() - self.drag_position)
            event.accept()

    def mouseReleaseEvent(self, event: QMouseEvent):
        self.drag_position = QPoint()

    # -------------------------------------------------------------
    # Keyboard Bindings & State Management
    # -------------------------------------------------------------
    def keyPressEvent(self, event):
        # Support ESC key or Ctrl+Q to exit full-screen dashboard gracefully
        if event.key() == Qt.Key_Escape:
            self.close()
        elif event.key() == Qt.Key_Q and event.modifiers() == Qt.ControlModifier:
            self.close()

    def safe_show(self):
        """API thread-safe interface to trigger window maximize display."""
        self.showMaximized()
        self.activateWindow()

    def safe_hide(self):
        """API thread-safe interface to hide dashboard window."""
        self.hide()


# ==========================================
# 5. ENTRYPOINT RUNNER
# ==========================================
def main():
    # Start the remote command API server background thread
    start_remote_control_server()

    app = QApplication(sys.argv)
    
    # Establish a sleek global dark dark theme palette 
    # to enforce application-wide dark modes
    palette = QPalette()
    palette.setColor(QPalette.Window, QColor(10, 11, 16))
    palette.setColor(QPalette.WindowText, Qt.white)
    palette.setColor(QPalette.Base, QColor(5, 6, 8))
    palette.setColor(QPalette.AlternateBase, QColor(10, 11, 16))
    palette.setColor(QPalette.ToolTipBase, Qt.white)
    palette.setColor(QPalette.ToolTipText, Qt.white)
    palette.setColor(QPalette.Text, Qt.white)
    palette.setColor(QPalette.Button, QColor(10, 11, 16))
    palette.setColor(QPalette.ButtonText, Qt.white)
    palette.setColor(QPalette.BrightText, Qt.red)
    palette.setColor(QPalette.Link, QColor(0, 240, 255))
    palette.setColor(QPalette.Highlight, QColor(0, 240, 255))
    palette.setColor(QPalette.HighlightedText, Qt.black)
    app.setPalette(palette)

    dashboard = WorldMonitorDashboard()
    dashboard.show()
    
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
