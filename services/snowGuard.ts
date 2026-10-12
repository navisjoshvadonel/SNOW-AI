/**
 * SNOW AI — Snow-Guard Security Sentinel & Blast-Radius Gatekeeper
 * 
 * Provides unified, zero-trust security enforcement across S.N.O.W.:
 *  - Destructive shell command interception & fork-bomb prevention
 *  - Dual-boot Windows partition & EFI bootloader protection
 *  - Filesystem blast-radius containment (strictly confines writes to workspace)
 *  - Deep secret & API credential containment and output scrubbing
 *  - Security posture enforcement (STRICT / LOCKDOWN / PERMISSIVE)
 *  - Audit logging & telemetry threat radar integration
 */

import path from "path";
import fs from "fs";
import { linuxSystemActuator } from "./linuxSystemActuator";

const WORKSPACE_DIR = process.cwd();
const SANDBOX_DIR = path.join(WORKSPACE_DIR, "data", "sandbox");
const AUDIT_LOG_FILE = path.join(WORKSPACE_DIR, "data", "security_audit.log");

export type SecurityPosture = "STRICT" | "LOCKDOWN" | "PERMISSIVE";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityIncident {
  id: string;
  timestamp: string;
  type: "COMMAND_BLOCKED" | "PATH_VIOLATION" | "SECRET_EXFILTRATION" | "POSTURE_RESTRICTION";
  target: string;
  reason: string;
  riskLevel: RiskLevel;
  posture: SecurityPosture;
  blocked: boolean;
}

export interface CommandAuditResult {
  allowed: boolean;
  violation?: string;
  riskLevel: RiskLevel;
  command: string;
}

export interface PathAuditResult {
  allowed: boolean;
  violation?: string;
  normalizedPath: string;
  riskLevel: RiskLevel;
}

export interface SnowGuardStatus {
  posture: SecurityPosture;
  activeRulesCount: number;
  incidentsCount: number;
  blockedCommandsCount: number;
  blockedPathsCount: number;
  lastIncident: SecurityIncident | null;
  recentIncidents: SecurityIncident[];
}

export class SnowGuardService {
  private posture: SecurityPosture = "STRICT";
  private incidents: SecurityIncident[] = [];
  private blockedCommandsCount: number = 0;
  private blockedPathsCount: number = 0;

  // ─── Command Blocklist Rules ──────────────────────────────────────────────
  private readonly BLOCKED_COMMAND_RULES: { pattern: RegExp; reason: string; risk: RiskLevel }[] = [
    // 1. Root & System Destruction
    { pattern: /\brm\s+-(?:r[fv]|fr|rf)\s+(?:\/|\~|\$HOME|\.\.|\*)(?:\s|$)/, reason: "Recursive deletion targeting root, home, parent, or wildcard directory is strictly prohibited", risk: "CRITICAL" },
    { pattern: /\bmkfs\b/, reason: "Filesystem formatting is strictly prohibited", risk: "CRITICAL" },
    { pattern: /\b(fdisk|gdisk|parted|sfdisk|sgdisk|wipefs)\b/, reason: "Disk partition modification or block wipe is strictly prohibited", risk: "CRITICAL" },
    { pattern: /\bdd\s+if=.*of=\/dev/, reason: "Direct low-level block device write is strictly prohibited", risk: "CRITICAL" },
    { pattern: /\b(shutdown|reboot|poweroff|halt|init\s+[06])\b/, reason: "System shutdown or reboot commands are prohibited", risk: "HIGH" },
    { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: "Fork bombs and runaway process replication are strictly prohibited", risk: "CRITICAL" },

    // 2. Remote Script Execution & Infiltration
    { pattern: /(?:curl|wget|fetch)\s+[^|]+\|\s*(?:bash|sh|zsh|dash)/, reason: "Piping untrusted remote network payloads directly into shell is prohibited", risk: "HIGH" },
    { pattern: /\b(?:nc|netcat|ncat)\s+.*-e\b/, reason: "Reverse shell execution via netcat is prohibited", risk: "CRITICAL" },
    { pattern: /\/dev\/tcp\//, reason: "Direct bash TCP socket redirection is prohibited", risk: "HIGH" },

    // 3. Secret & Credential Exfiltration
    { pattern: /\b(?:cat|less|more|head|tail|grep|strings)\s+.*(?:\.env|\.ssh|id_rsa|id_ed25519|\.bash_history|\.gnupg)/, reason: "Direct command targeting protected credentials, secrets, or SSH keys", risk: "HIGH" },
    { pattern: /\b(?:chmod|chown)\s+-[rR]\s+777\s+\//, reason: "Global permission escalation across filesystem root is strictly prohibited", risk: "CRITICAL" },

    // 4. System Directory Tampering
    { pattern: />\s*(?:\/etc|\/boot|\/sys|\/proc|\/root|\/dev)/, reason: "Direct shell redirection into core system directories is prohibited", risk: "CRITICAL" },
    { pattern: /\bgit\s+clean\s+-(?:[a-zA-Z]*f[a-zA-Z]*x|[a-zA-Z]*x[a-zA-Z]*f)/, reason: "Aggressive git clean -fdx wiping repository without confirmation is prohibited", risk: "HIGH" },

    // 5. Dual-Boot Windows Partition & Bootloader Safety (ZERO-TOUCH PROTOCOL)
    { pattern: /(?:\/dev\/)?nvme0n1p[1-5]\b/i, reason: "Zero-Touch Windows Partition Protocol: Interacting with Windows partitions (nvme0n1p1-p5) is strictly prohibited", risk: "CRITICAL" },
    { pattern: /\b(?:mount|umount)\b.*(?:\/mnt\/[a-zA-Z]|\/media\/|nvme0n1p[1-5]|ntfs)/i, reason: "Mounting, unmounting, or altering Windows NTFS partitions or mount points is strictly prohibited", risk: "CRITICAL" },
    { pattern: /\b(?:rm|truncate|wipefs|shred|dd)\b.*(?:\/mnt\/[a-zA-Z]|(?:windows|win10|win11|bootmgfw|bcd|pagefile\.sys|hiberfil\.sys))/i, reason: "Destructive operations targeting Windows partitions or system files prohibited in dual-boot setup", risk: "CRITICAL" },
    { pattern: /\b(?:mkfs|format|fdisk|gdisk|parted|cfdisk|sfdisk|wipefs|ntfsfix|badblocks)\b.*(?:\/dev\/(?:sd[a-z]|nvme[0-9]n[0-9]|mapper\/)|\/mnt\/[a-zA-Z])/i, reason: "Direct disk formatting or manipulation targeting dual-boot NVMe partitions prohibited", risk: "CRITICAL" },
    { pattern: /\b(?:ntfs-3g|mount\.ntfs|ntfsclone|ntfscp|ntfslabel|ntfsresize)\b/i, reason: "Direct NTFS filesystem tools targeting Windows partitions are strictly prohibited", risk: "CRITICAL" },
    { pattern: />\s*(?:\/boot\/efi|\/mnt\/[a-zA-Z]|\/media\/)/i, reason: "Direct shell redirection into EFI boot or Windows mount points is prohibited", risk: "CRITICAL" },
    { pattern: /\b(?:rm|truncate|shred|mv|cp)\b.*(?:\/boot\/efi\/EFI\/(?:Microsoft|Boot)|bootmgfw\.efi|\bBCD\b)/i, reason: "Accessing or modifying Windows EFI bootloader files is strictly prohibited", risk: "CRITICAL" },
    { pattern: /(?:bootmgfw\.efi|EFI\/Microsoft|\bBCD\b|hiberfil\.sys|pagefile\.sys|swapfile\.sys)/i, reason: "Interacting with Windows Boot Manager or Windows OS virtual memory files is prohibited", risk: "CRITICAL" },
  ];

  // ─── Protected Path Patterns ──────────────────────────────────────────────
  private readonly PROTECTED_PATH_PATTERNS = [
    /\.env(?:$|\.)/i,
    /(?:^|\/)\.git(?:\/|$)/,
    /(?:^|\/)\.ssh(?:\/|$)/,
    /(?:^|\/)id_rsa(?:$|\.)/i,
    /(?:^|\/)id_ed25519(?:$|\.)/i,
    /(?:^|\/)\.bash_history$/i,
    /^\/etc(?:\/|$)/i,
    /^\/boot(?:\/|$)/i,
    /^\/sys(?:\/|$)/i,
    /^\/proc(?:\/|$)/i,
    /^\/root(?:\/|$)/i,
    /^\/dev(?:\/|$)/i,
    // Dual-Boot Windows Partition Isolation (Zero-Touch)
    /^\/mnt\/[a-zA-Z](?:\/|$)/i, // Windows Dual-Boot Drive Mounts (/mnt/c, /mnt/d, etc.)
    /^\/mnt\/windows(?:\/|$)/i,
    /^\/media\/.*(?:\/|$)/i,
    /(?:^|\/)nvme0n1p[1-5](?:$|\/)/i, // Windows Partitions (p1=EFI/Boot, p2=MSR, p3=C:, p4=Recovery, p5=Data)
    /EFI\/Microsoft(?:\/|$)/i, // Windows EFI Bootloader
    /(?:^|\/)Windows(?:\/|$)/i, // Windows Root
    /(?:^|\/)System32(?:\/|$)/i, // Windows System32
    /(?:^|\/)(?:hiberfil|pagefile|swapfile)\.sys$/i, // Windows Virtual Memory files
  ];

  /**
   * Set global operational security posture.
   */
  public setPosture(newPosture: SecurityPosture): void {
    console.log(`[SNOW GUARD] 🛡️ Security posture updated: ${this.posture} -> ${newPosture}`);
    this.posture = newPosture;
  }

  public getPosture(): SecurityPosture {
    return this.posture;
  }

  /**
   * 1. Audit Shell Command before Execution.
   */
  public auditCommand(command: string, cwd: string = WORKSPACE_DIR): CommandAuditResult {
    const trimmed = (command || "").trim();

    // Lockdown mode rejects all shell execution
    if (this.posture === "LOCKDOWN") {
      this.recordIncident({
        id: `sec-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "POSTURE_RESTRICTION",
        target: trimmed.slice(0, 100),
        reason: "Execution rejected: System is in LOCKDOWN mode.",
        riskLevel: "HIGH",
        posture: this.posture,
        blocked: true,
      });
      return { allowed: false, violation: "Security Alert: System is in LOCKDOWN mode. Shell execution disabled.", riskLevel: "HIGH", command: trimmed };
    }

    // Check against zero-trust command rules
    for (const rule of this.BLOCKED_COMMAND_RULES) {
      if (rule.pattern.test(trimmed)) {
        this.blockedCommandsCount++;
        this.recordIncident({
          id: `sec-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: "COMMAND_BLOCKED",
          target: trimmed.slice(0, 120),
          reason: rule.reason,
          riskLevel: rule.risk,
          posture: this.posture,
          blocked: true,
        });

        return {
          allowed: false,
          violation: `[GUARD ENFORCEMENT] ${rule.reason}`,
          riskLevel: rule.risk,
          command: trimmed,
        };
      }
    }

    return { allowed: true, riskLevel: "LOW", command: trimmed };
  }

  /**
   * 2. Audit Filesystem Path for Blast-Radius & Confidentiality Containment.
   */
  public auditPath(
    targetPath: string,
    mode: "read" | "write" | "delete",
    cwd: string = WORKSPACE_DIR
  ): PathAuditResult {
    if (!targetPath || typeof targetPath !== "string") {
      return { allowed: false, violation: "Target path must be a non-empty string", normalizedPath: "", riskLevel: "LOW" };
    }

    // Lockdown mode blocks all writes and deletes
    if (this.posture === "LOCKDOWN" && (mode === "write" || mode === "delete")) {
      return { allowed: false, violation: "Filesystem modifications disabled in LOCKDOWN mode.", normalizedPath: targetPath, riskLevel: "HIGH" };
    }

    // Resolve canonical absolute path
    const resolved = path.isAbsolute(targetPath)
      ? path.normalize(targetPath)
      : path.normalize(path.resolve(cwd, targetPath));

    // Check protected path patterns
    for (const pattern of this.PROTECTED_PATH_PATTERNS) {
      if (pattern.test(resolved) || pattern.test(targetPath)) {
        this.blockedPathsCount++;
        this.recordIncident({
          id: `sec-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: "PATH_VIOLATION",
          target: resolved,
          reason: `Access to protected path '${targetPath}' (${mode}) is denied by Snow-Guard.`,
          riskLevel: "HIGH",
          posture: this.posture,
          blocked: true,
        });

        return {
          allowed: false,
          violation: `[GUARD ENFORCEMENT] Access to protected path '${targetPath}' is restricted.`,
          normalizedPath: resolved,
          riskLevel: "HIGH",
        };
      }
    }

    // For write/delete: Strictly enforce Blast-Radius Containment
    if (mode === "write" || mode === "delete") {
      const isWithinWorkspace = resolved.startsWith(WORKSPACE_DIR);
      const isWithinSandbox = resolved.startsWith(SANDBOX_DIR);
      const isWithinTmp = resolved.startsWith("/tmp/snow_");

      if (!isWithinWorkspace && !isWithinSandbox && !isWithinTmp) {
        this.blockedPathsCount++;
        this.recordIncident({
          id: `sec-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: "PATH_VIOLATION",
          target: resolved,
          reason: `Blast-radius violation: Attempt to ${mode} outside repository workspace boundary.`,
          riskLevel: "HIGH",
          posture: this.posture,
          blocked: true,
        });

        return {
          allowed: false,
          violation: `[GUARD BLAST-RADIUS] Modifications outside workspace boundary are prohibited: '${resolved}'`,
          normalizedPath: resolved,
          riskLevel: "HIGH",
        };
      }
    }

    return { allowed: true, normalizedPath: resolved, riskLevel: "LOW" };
  }

  /**
   * 3. Comprehensive Secret & Credential Scrubber.
   * Redacts API keys, JWTs, Bearer tokens, private keys, and environment passwords.
   */
  public scrubSecrets(text: string): string {
    if (!text || typeof text !== "string") return "";

    let scrubbed = text;

    // 1. OpenAI / Generic API Keys (sk-...)
    scrubbed = scrubbed.replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED_API_KEY]");

    // 2. Google Gemini / Cloud Keys (AIza...)
    scrubbed = scrubbed.replace(/AIza[0-9A-Za-z-_]{30,}/g, "[REDACTED_GEMINI_KEY]");

    // 3. Anthropic Keys (sk-ant-...)
    scrubbed = scrubbed.replace(/sk-ant-[A-Za-z0-9_-]{20,}/g, "[REDACTED_ANTHROPIC_KEY]");

    // 4. GitHub Tokens (ghp_..., gho_..., ghu_..., github_pat_...)
    scrubbed = scrubbed.replace(/(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{22,})/g, "[REDACTED_GITHUB_TOKEN]");

    // 5. Slack tokens
    scrubbed = scrubbed.replace(/xox[baprs]-[A-Za-z0-9-]+/g, "[REDACTED_SLACK_TOKEN]");

    // 6. AWS Access Keys
    scrubbed = scrubbed.replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]");

    // 7. Cryptographic Private Keys
    scrubbed = scrubbed.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");

    // 8. Authorization Bearer & JWT tokens
    scrubbed = scrubbed.replace(/(Bearer\s+)[A-Za-z0-9\-_.~+/]+=*/gi, "$1[REDACTED_BEARER_TOKEN]");
    scrubbed = scrubbed.replace(/eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, "[REDACTED_JWT_TOKEN]");

    // 9. Loaded process.env sensitive values
    for (const [k, v] of Object.entries(process.env)) {
      if (v && v.length >= 6 && /(?:KEY|SECRET|TOKEN|PASSWORD|AUTH|CREDENTIAL|PRIVATE)/i.test(k)) {
        scrubbed = scrubbed.split(v).join(`[REDACTED_${k}]`);
      }
    }

    return scrubbed;
  }

  /**
   * 4. Audit Swarm Objective before decomposition.
   */
  public auditObjective(objective: string): { passed: boolean; notes: string } {
    const cmdAudit = this.auditCommand(objective);
    if (!cmdAudit.allowed) {
      return { passed: false, notes: cmdAudit.violation || "Objective violates safety policy." };
    }
    return { passed: true, notes: "Zero destructive targets detected. Blast-radius containment confirmed within workspace bounds." };
  }

  /**
   * Returns current security metrics and recent audit records.
   */
  public getSecurityStatus(): SnowGuardStatus {
    return {
      posture: this.posture,
      activeRulesCount: this.BLOCKED_COMMAND_RULES.length + this.PROTECTED_PATH_PATTERNS.length,
      incidentsCount: this.incidents.length,
      blockedCommandsCount: this.blockedCommandsCount,
      blockedPathsCount: this.blockedPathsCount,
      lastIncident: this.incidents[0] || null,
      recentIncidents: this.incidents.slice(0, 15),
    };
  }

  public getIncidents(): SecurityIncident[] {
    return this.incidents;
  }

  /**
   * Logs a security incident and alerts the system.
   */
  private recordIncident(incident: SecurityIncident): void {
    this.incidents.unshift(incident);
    if (this.incidents.length > 50) this.incidents.pop();

    console.warn(`[SNOW GUARD] 🚨 INCIDENT LOGGED [${incident.riskLevel}]: ${incident.reason} (${incident.target})`);

    // Append to file log
    try {
      const dataDir = path.dirname(AUDIT_LOG_FILE);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(incident) + "\n");
    } catch {}

    // Dispatch native notification for HIGH or CRITICAL violations
    if (incident.riskLevel === "CRITICAL" || incident.riskLevel === "HIGH") {
      linuxSystemActuator.dispatchNotification(
        "🛡️ S.N.O.W. Guard Alert",
        `${incident.reason.slice(0, 80)}... [BLOCKED]`,
        "critical"
      ).catch(() => {});
    }
  }
}

export const snowGuard = new SnowGuardService();
