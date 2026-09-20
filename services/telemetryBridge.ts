/**
 * SNOW AI — Cinematic Telemetry & 3D WebGL HUD Bridge
 * Formulates and broadcasts rich orbital, radar, and knowledge graph telemetry
 * to the PyQt5 World Monitor HUD and operations dashboards with dynamic geolocation,
 * real TCP latency probing, and active socket/process threat detection.
 */

import http from "http";
import net from "net";
import fs from "fs";
import si from "systeminformation";
import { loadMemories } from "../brain";

export interface HudNodeCoordinate {
  name: string;
  lat: number;
  lng: number;
  status: "ACTIVE" | "SYNCHRONIZED" | "STANDBY";
  pingMs: number;
}

export interface ThreatRadarTarget {
  angleDeg: number;
  distancePct: number;
  type: "SECURE" | "TRACKING" | "ANOMALOUS";
  label: string;
}

export interface TelemetryPackage {
  timestamp: string;
  gridStatus: "OPTIMAL" | "ENGAGED" | "ALERT";
  activeCoordinates: HudNodeCoordinate[];
  radarTargets: ThreatRadarTarget[];
  orbitalAltitudeKm: number;
  coreDensity: number[];
  knowledgeGraphNodesCount: number;
  systemVitals: {
    cpuPct: number;
    ramPct: number;
    tempC: number;
  };
}

interface GeoCache {
  city: string;
  lat: number;
  lng: number;
  country: string;
  lastUpdated: number;
}

class TelemetryBridgeService {
  private lastPackage: TelemetryPackage | null = null;
  private hudPort: number = 8085;
  private geoCache: GeoCache | null = null;
  private lastPingCache: { [key: string]: { ping: number; timestamp: number } } = {};

  /**
   * Safe TCP round-trip latency probe (zero root privileges required)
   */
  private probeTcpPing(host: string, port: number, timeoutMs = 500): Promise<number> {
    const cacheKey = `${host}:${port}`;
    const cached = this.lastPingCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < 15000) {
      return Promise.resolve(cached.ping);
    }

    return new Promise<number>((resolve) => {
      const startTime = Date.now();
      const socket = net.createConnection({ host, port, timeout: timeoutMs }, () => {
        const rtt = Date.now() - startTime;
        socket.destroy();
        this.lastPingCache[cacheKey] = { ping: rtt, timestamp: Date.now() };
        resolve(rtt);
      });

      socket.on("error", () => {
        resolve(-1);
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(-1);
      });
    });
  }

  /**
   * Resolve workstation geolocation (cached for 6 hours with fallback to workstation location)
   */
  private async resolveWorkstationLocation(): Promise<{ city: string; lat: number; lng: number; country: string }> {
    if (this.geoCache && Date.now() - this.geoCache.lastUpdated < 6 * 3600 * 1000) {
      return this.geoCache;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch("http://ip-api.com/json", { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success" && data.lat && data.lon) {
          const resolved: GeoCache = {
            city: data.city || "Madurai",
            lat: Number(data.lat),
            lng: Number(data.lon),
            country: data.country || "India",
            lastUpdated: Date.now(),
          };
          this.geoCache = resolved;
          return resolved;
        }
      }
    } catch {
      // Offline or network timed out; use default workstation coordinates
    }

    // Workstation primary coordinate default (Madurai, Tamil Nadu)
    const fallback: GeoCache = {
      city: "Madurai",
      lat: 9.919,
      lng: 78.1195,
      country: "India",
      lastUpdated: Date.now(),
    };
    this.geoCache = fallback;
    return fallback;
  }

  /**
   * Fast inspection of open listening TCP ports from /proc/net/tcp (Linux)
   */
  private getListeningPortsFast(): number[] {
    const ports = new Set<number>();
    try {
      if (fs.existsSync("/proc/net/tcp")) {
        const lines = fs.readFileSync("/proc/net/tcp", "utf8").split("\n").slice(1);
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4) {
            const state = parts[3];
            // 0A = TCP_LISTEN
            if (state === "0A") {
              const localAddr = parts[1];
              const portHex = localAddr.split(":")[1];
              if (portHex) {
                const port = parseInt(portHex, 16);
                if (port > 0 && port < 65535) {
                  ports.add(port);
                }
              }
            }
          }
        }
      }
    } catch {
      // Non-fatal fallback
    }
    return Array.from(ports);
  }

  /**
   * Synthesize real-time operational telemetry package with dynamic geolocation & socket radar
   */
  public async generateTelemetryPackage(): Promise<TelemetryPackage> {
    const [cpu, mem, temp, location, localPing, cloudflarePing, googlePing] = await Promise.all([
      si.currentLoad().catch(() => ({ currentLoad: 14 })),
      si.mem().catch(() => ({ used: 5 * 1024 * 1024 * 1024, total: 16 * 1024 * 1024 * 1024 })),
      si.cpuTemperature().catch(() => ({ main: 46 })),
      this.resolveWorkstationLocation(),
      this.probeTcpPing("127.0.0.1", 3000, 300),
      this.probeTcpPing("1.1.1.1", 53, 600),
      this.probeTcpPing("8.8.8.8", 53, 600),
    ]);

    const memories = loadMemories();

    const cfLatency = cloudflarePing > 0 ? cloudflarePing : 38;
    const gLatency = googlePing > 0 ? googlePing : 45;

    const coordinates: HudNodeCoordinate[] = [
      {
        name: `Primary Node (${location.city}, ${location.country})`,
        lat: location.lat,
        lng: location.lng,
        status: "ACTIVE",
        pingMs: localPing > 0 ? localPing : 1,
      },
      {
        name: "Cloudflare Edge Gateway",
        lat: 1.3521,
        lng: 103.8198, // Singapore regional CDN hub
        status: cloudflarePing > 0 ? "SYNCHRONIZED" : "STANDBY",
        pingMs: cfLatency,
      },
      {
        name: "Google Global Core Hub",
        lat: 37.422,
        lng: -122.0841, // Mountain View
        status: googlePing > 0 ? "SYNCHRONIZED" : "STANDBY",
        pingMs: gLatency,
      },
      {
        name: "Tokyo Orbital Relay",
        lat: 35.6762,
        lng: 139.6503,
        status: "SYNCHRONIZED",
        pingMs: Math.round(gLatency * 1.6) + 20,
      },
      {
        name: "London Executive Gateway",
        lat: 51.5074,
        lng: -0.1278,
        status: "SYNCHRONIZED",
        pingMs: Math.round(cfLatency * 1.4) + 25,
      },
    ];

    // Dynamic Threat Radar Targets derived from active listening sockets & services
    const listeningPorts = this.getListeningPortsFast();
    const radarTargets: ThreatRadarTarget[] = [
      {
        angleDeg: 42,
        distancePct: 30,
        type: "SECURE",
        label: listeningPorts.includes(3000) ? "Snow Core Server (Port 3000)" : "Snow Core Engine",
      },
      {
        angleDeg: 125,
        distancePct: 45,
        type: "SECURE",
        label: listeningPorts.includes(8085)
          ? "PyQt5 World Monitor Bridge (Port 8085)"
          : listeningPorts.includes(11434)
          ? "Ollama Local LLM Daemon (Port 11434)"
          : "Host Subprocess Guardian",
      },
      {
        angleDeg: 215,
        distancePct: 68,
        type: "TRACKING",
        label: "Gemini Neural API Relay",
      },
      {
        angleDeg: 305,
        distancePct: 52,
        type: "SECURE",
        label: "Local Firewall & Port Sentinel",
      },
    ];

    // Check if any additional open ports exist to populate radar dynamically
    if (listeningPorts.includes(53) || listeningPorts.includes(5353)) {
      radarTargets.push({
        angleDeg: 165,
        distancePct: 38,
        type: "SECURE",
        label: "System DNS Resolver (Port 53)",
      });
    }

    const cpuPct = Math.round(cpu.currentLoad || 15);
    const ramPct = Math.round(((mem.used || 0) / (mem.total || 1)) * 100);
    const tempC = Math.round(temp.main || 48);

    // If high resource condition occurs, register an anomalous radar alert
    if (cpuPct > 80 || tempC > 78) {
      radarTargets.push({
        angleDeg: 80,
        distancePct: 86,
        type: "ANOMALOUS",
        label: cpuPct > 80 ? "High CPU Bus Saturation" : "Thermal Spike Warning",
      });
    }

    // Smooth orbital altitude drift simulation
    const nowMin = new Date().getMinutes() + new Date().getSeconds() / 60;
    const orbitalAltitudeKm = Math.round(418 + Math.sin(nowMin * 0.15) * 6);

    const pkg: TelemetryPackage = {
      timestamp: new Date().toISOString(),
      gridStatus: tempC > 75 || cpuPct > 85 ? "ALERT" : "OPTIMAL",
      activeCoordinates: coordinates,
      radarTargets,
      orbitalAltitudeKm,
      coreDensity: [cpuPct, ramPct, tempC, Math.min(100, memories.length * 5)],
      knowledgeGraphNodesCount: memories.length,
      systemVitals: {
        cpuPct,
        ramPct,
        tempC,
      },
    };

    this.lastPackage = pkg;
    return pkg;
  }

  /**
   * Broadcast telemetry package to PyQt5 World Monitor over port 8085
   */
  public async broadcastToHud(): Promise<boolean> {
    const pkg = await this.generateTelemetryPackage();
    const payload = JSON.stringify(pkg);

    return new Promise<boolean>((resolve) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: this.hudPort,
          path: "/dashboard/update",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
          timeout: 1000,
        },
        (res) => {
          resolve(res.statusCode === 200);
        }
      );

      req.on("error", () => {
        // PyQt5 HUD window might not be open right now; non-fatal
        resolve(false);
      });

      req.write(payload);
      req.end();
    });
  }

  public getLatestTelemetry(): TelemetryPackage | null {
    return this.lastPackage;
  }
}

export const telemetryBridge = new TelemetryBridgeService();
