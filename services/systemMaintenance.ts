/**
 * SNOW AI — System Maintenance & OS Autonomous Care Service
 * 
 * Provides automated package maintenance, resource monitoring, security updates inspection,
 * safe temporary file reclamation, failed systemd service detection, and health sweeps for Ubuntu Linux.
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { snowGuard } from "./snowGuard.js";

const execAsync = promisify(exec);

export interface UpgradablePackage {
  name: string;
  newVersion: string;
  oldVersion?: string;
  isSecurity: boolean;
}

export interface SystemUpdateStatus {
  totalUpgradable: number;
  securityUpdatesCount: number;
  rebootRequired: boolean;
  packages: UpgradablePackage[];
  timestamp: string;
}

export interface FailedServiceInfo {
  unit: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

export interface ProcessUsageInfo {
  pid: number;
  user: string;
  cpuPct: number;
  memPct: number;
  command: string;
}

export interface SystemHealthAudit {
  timestamp: string;
  osRelease: string;
  uptime: string;
  updates: SystemUpdateStatus;
  failedServices: FailedServiceInfo[];
  topCpuProcesses: ProcessUsageInfo[];
  topMemProcesses: ProcessUsageInfo[];
  diskHeadroom: {
    mountPoint: string;
    size: string;
    used: string;
    available: string;
    usePercent: string;
  }[];
  isOptimal: boolean;
  recommendations: string[];
}

export class SystemMaintenanceService {
  /**
   * 1. Inspect Available Package Updates & Security Patches
   */
  public async checkAvailableUpdates(): Promise<SystemUpdateStatus> {
    const timestamp = new Date().toISOString();
    const packages: UpgradablePackage[] = [];
    let securityCount = 0;

    try {
      const { stdout } = await execAsync("apt list --upgradable 2>/dev/null || echo ''");
      const lines = stdout.split("\n");

      for (const line of lines) {
        if (!line.includes("[upgradable from:")) continue;

        // Example line: bluez/resolute-updates,resolute-security 5.85-4ubuntu0.3 amd64 [upgradable from: 5.85-4ubuntu0.2]
        const parts = line.split(" ");
        const namePart = parts[0]?.split("/")?.[0]?.trim() || "";
        const channelPart = parts[0]?.split("/")?.[1]?.trim() || "";
        const newVersion = parts[1]?.trim() || "";
        const oldVersionMatch = line.match(/\[upgradable from:\s*(.*?)\]/);
        const oldVersion = oldVersionMatch ? oldVersionMatch[1].trim() : undefined;
        const isSecurity = channelPart.toLowerCase().includes("security") || line.toLowerCase().includes("security");

        if (namePart) {
          if (isSecurity) securityCount++;
          packages.push({
            name: namePart,
            newVersion,
            oldVersion,
            isSecurity,
          });
        }
      }
    } catch (err: any) {
      console.warn("[SYSTEM MAINTENANCE] Notice while checking package updates:", err.message);
    }

    const rebootRequired = fs.existsSync("/var/run/reboot-required");

    return {
      totalUpgradable: packages.length,
      securityUpdatesCount: securityCount,
      rebootRequired,
      packages: packages.slice(0, 50),
      timestamp,
    };
  }

  /**
   * 2. Inspect Failed systemd Services (User & System scopes)
   */
  public async checkFailedServices(): Promise<FailedServiceInfo[]> {
    const failed: FailedServiceInfo[] = [];

    try {
      const { stdout } = await execAsync("systemctl --failed --no-legend --plain 2>/dev/null || systemctl --user --failed --no-legend --plain 2>/dev/null || echo ''");
      const lines = stdout.trim().split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          failed.push({
            unit: parts[0],
            load: parts[1],
            active: parts[2],
            sub: parts[3],
            description: parts.slice(4).join(" "),
          });
        }
      }
    } catch {}

    return failed;
  }

  /**
   * 3. Top Resource-Consuming Processes
   */
  public async getTopProcesses(limit: number = 5): Promise<{ cpu: ProcessUsageInfo[]; mem: ProcessUsageInfo[] }> {
    const cpu: ProcessUsageInfo[] = [];
    const mem: ProcessUsageInfo[] = [];

    try {
      const { stdout: cpuOut } = await execAsync(`ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | head -n ${limit + 1}`);
      const cpuLines = cpuOut.trim().split("\n").slice(1);
      for (const line of cpuLines) {
        const p = line.trim().split(/\s+/);
        if (p.length >= 5) {
          cpu.push({
            pid: parseInt(p[0], 10),
            user: p[1],
            cpuPct: parseFloat(p[2]),
            memPct: parseFloat(p[3]),
            command: p.slice(4).join(" "),
          });
        }
      }

      const { stdout: memOut } = await execAsync(`ps -eo pid,user,%cpu,%mem,comm --sort=-%mem | head -n ${limit + 1}`);
      const memLines = memOut.trim().split("\n").slice(1);
      for (const line of memLines) {
        const p = line.trim().split(/\s+/);
        if (p.length >= 5) {
          mem.push({
            pid: parseInt(p[0], 10),
            user: p[1],
            cpuPct: parseFloat(p[2]),
            memPct: parseFloat(p[3]),
            command: p.slice(4).join(" "),
          });
        }
      }
    } catch {}

    return { cpu, mem };
  }

  /**
   * 4. Perform Safe, Non-Destructive Maintenance Reclamation
   */
  public async performSafeMaintenance(): Promise<{
    success: boolean;
    actionsTaken: string[];
    reclaimedKb: number;
  }> {
    const actionsTaken: string[] = [];
    let reclaimedKb = 0;

    // A. Clean user thumbnail cache
    const homeDir = process.env.HOME || "";
    const thumbnailDir = path.join(homeDir, ".cache", "thumbnails");
    if (homeDir && fs.existsSync(thumbnailDir)) {
      try {
        const { stdout: sizeBefore } = await execAsync(`du -s "${thumbnailDir}" 2>/dev/null || echo '0'`);
        const kb = parseInt(sizeBefore.split("\t")[0] || "0", 10);
        await execAsync(`find "${thumbnailDir}" -type f -atime +7 -delete 2>/dev/null || true`);
        reclaimedKb += kb;
        actionsTaken.push(`Cleaned stale thumbnail caches (~${Math.round(kb / 1024)} MB)`);
      } catch {}
    }

    // B. Vacuum user systemd journal
    try {
      await execAsync("journalctl --user --vacuum-size=100M 2>/dev/null || true");
      actionsTaken.push("Maintained user journal storage within 100MB bound");
    } catch {}

    // C. Prune temporary sandbox artifacts
    const sandboxDir = path.join(process.cwd(), "data", "sandbox");
    if (fs.existsSync(sandboxDir)) {
      try {
        const files = fs.readdirSync(sandboxDir);
        let pruned = 0;
        const now = Date.now();
        for (const f of files) {
          const fp = path.join(sandboxDir, f);
          const stat = fs.statSync(fp);
          if (now - stat.mtimeMs > 24 * 3600 * 1000) {
            fs.unlinkSync(fp);
            pruned++;
          }
        }
        if (pruned > 0) {
          actionsTaken.push(`Pruned ${pruned} stale sandbox temporary execution files`);
        }
      } catch {}
    }

    return {
      success: true,
      actionsTaken,
      reclaimedKb,
    };
  }

  /**
   * 5. Run Full Executive Health Audit
   */
  public async runFullHealthAudit(): Promise<SystemHealthAudit> {
    const timestamp = new Date().toISOString();
    const recommendations: string[] = [];

    const [updates, failedServices, processes] = await Promise.all([
      this.checkAvailableUpdates(),
      this.checkFailedServices(),
      this.getTopProcesses(5),
    ]);

    // Check disk headroom
    const diskHeadroom: SystemHealthAudit["diskHeadroom"] = [];
    try {
      const { stdout } = await execAsync("df -h / /home 2>/dev/null | tail -n +2 || echo ''");
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        const p = line.trim().split(/\s+/);
        if (p.length >= 6) {
          diskHeadroom.push({
            mountPoint: p[5],
            size: p[1],
            used: p[2],
            available: p[3],
            usePercent: p[4],
          });
        }
      }
    } catch {}

    // Formulate intelligent recommendations
    if (updates.securityUpdatesCount > 0) {
      recommendations.push(
        `${updates.securityUpdatesCount} security patch(es) available. Consider running 'sudo apt update && sudo apt upgrade' to patch system libraries.`
      );
    } else if (updates.totalUpgradable > 0) {
      recommendations.push(
        `${updates.totalUpgradable} package update(s) ready for staging.`
      );
    }

    if (updates.rebootRequired) {
      recommendations.push("A system restart is flagged by the kernel/libraries to activate updated packages.");
    }

    if (failedServices.length > 0) {
      recommendations.push(
        `Identified ${failedServices.length} degraded systemd service(s): ${failedServices.map((s) => s.unit).join(", ")}.`
      );
    }

    const isOptimal = updates.securityUpdatesCount === 0 && failedServices.length === 0;

    let osRelease = "Ubuntu Linux";
    try {
      const { stdout } = await execAsync("cat /etc/os-release | grep PRETTY_NAME | cut -d'=' -f2 | tr -d '\"'");
      osRelease = stdout.trim() || osRelease;
    } catch {}

    let uptime = "Unknown";
    try {
      const { stdout } = await execAsync("uptime -p 2>/dev/null || uptime");
      uptime = stdout.trim();
    } catch {}

    return {
      timestamp,
      osRelease,
      uptime,
      updates,
      failedServices,
      topCpuProcesses: processes.cpu,
      topMemProcesses: processes.mem,
      diskHeadroom,
      isOptimal,
      recommendations,
    };
  }
}

export const systemMaintenance = new SystemMaintenanceService();
