/**
 * SNOW AI — Cinematic Telemetry & 3D WebGL HUD Bridge
 * Formulates and broadcasts rich orbital, radar, and knowledge graph telemetry
 * to the PyQt5 World Monitor HUD and operations dashboards.
 */

import http from "http";
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

class TelemetryBridgeService {
  private lastPackage: TelemetryPackage | null = null;
  private hudPort: number = 8085;

  /**
   * Synthesize real-time operational telemetry package
   */
  public async generateTelemetryPackage(): Promise<TelemetryPackage> {
    const [cpu, mem, temp] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.cpuTemperature(),
    ]);

    const memories = loadMemories();

    const coordinates: HudNodeCoordinate[] = [
      { name: "Primary Node (Local Workstation)", lat: 12.9716, lng: 77.5946, status: "ACTIVE", pingMs: 1 },
      { name: "Cupertino Core Hub", lat: 37.3318, lng: -122.0312, status: "SYNCHRONIZED", pingMs: 142 },
      { name: "Tokyo Orbital Relay", lat: 35.6762, lng: 139.6503, status: "SYNCHRONIZED", pingMs: 98 },
      { name: "London Executive Gateway", lat: 51.5074, lng: -0.1278, status: "STANDBY", pingMs: 110 },
    ];

    const radarTargets: ThreatRadarTarget[] = [
      { angleDeg: 45, distancePct: 62, type: "SECURE", label: "Local Firewall Boundary" },
      { angleDeg: 190, distancePct: 84, type: "TRACKING", label: "Encrypted Cloud Sync" },
      { angleDeg: 315, distancePct: 40, type: "SECURE", label: "Host Subprocess Guardian" },
    ];

    const cpuPct = Math.round(cpu.currentLoad || 15);
    const ramPct = Math.round((mem.used / (mem.total || 1)) * 100);
    const tempC = Math.round(temp.main || 48);

    const pkg: TelemetryPackage = {
      timestamp: new Date().toISOString(),
      gridStatus: tempC > 75 || cpuPct > 85 ? "ALERT" : "OPTIMAL",
      activeCoordinates: coordinates,
      radarTargets,
      orbitalAltitudeKm: 420 + Math.round(Math.random() * 10),
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
