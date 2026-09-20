/**
 * SNOW AI — Deep Linux System & D-Bus Actuator Service
 * Grants J.A.R.V.I.S.-grade direct control over native Linux audio routing,
 * multi-monitor displays, window tiling, power profiles, MPRIS media playback,
 * session security, and user services.
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface AudioDeviceStatus {
  volumePct: number;
  muted: boolean;
  activeSink?: string;
  success: boolean;
}

export interface WindowInfo {
  id: string;
  desktop: number;
  title: string;
}

export interface PowerProfileStatus {
  activeProfile: string;
  availableProfiles: string[];
}

export interface MediaPlaybackStatus {
  player: string;
  playbackStatus: "Playing" | "Paused" | "Stopped" | "Unknown";
  title?: string;
  artist?: string;
  album?: string;
}

export interface SystemActuatorState {
  audio: AudioDeviceStatus;
  power: PowerProfileStatus;
  media: MediaPlaybackStatus | null;
  windowsCount: number;
  timestamp: string;
}

class LinuxSystemActuatorService {
  /**
   * 1. Audio Control via PipeWire (wpctl) or PulseAudio (pactl)
   */
  public async getAudioStatus(): Promise<AudioDeviceStatus> {
    try {
      const { stdout } = await execAsync("wpctl get-volume @DEFAULT_AUDIO_SINK@ 2>/dev/null || echo ''");
      if (stdout.includes("Volume:")) {
        const match = stdout.match(/Volume:\s+([0-9.]+)/);
        const vol = match ? Math.round(parseFloat(match[1]) * 100) : 50;
        const muted = stdout.includes("[MUTED]");
        return { success: true, volumePct: vol, muted };
      }
    } catch {}

    // PulseAudio fallback
    try {
      const { stdout } = await execAsync("pactl get-sink-volume @DEFAULT_SINK@ 2>/dev/null || echo ''");
      const match = stdout.match(/([0-9]+)%/);
      const vol = match ? parseInt(match[1], 10) : 50;
      const { stdout: muteOut } = await execAsync("pactl get-sink-mute @DEFAULT_SINK@ 2>/dev/null || echo ''");
      const muted = muteOut.includes("yes");
      return { success: true, volumePct: vol, muted };
    } catch {
      return { success: false, volumePct: 50, muted: false };
    }
  }

  public async setVolume(pct: number): Promise<{ success: boolean; volumePct: number }> {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    try {
      await execAsync(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${clamped / 100} 2>/dev/null || pactl set-sink-volume @DEFAULT_SINK@ ${clamped}% 2>/dev/null`);
      return { success: true, volumePct: clamped };
    } catch {
      return { success: false, volumePct: clamped };
    }
  }

  public async toggleMute(): Promise<{ success: boolean; muted: boolean }> {
    try {
      await execAsync("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle 2>/dev/null || pactl set-sink-mute @DEFAULT_SINK@ toggle 2>/dev/null");
      const status = await this.getAudioStatus();
      return { success: true, muted: status.muted };
    } catch {
      return { success: false, muted: false };
    }
  }

  /**
   * 2. Window Management (wmctrl / xdotool)
   */
  public async listOpenWindows(): Promise<WindowInfo[]> {
    try {
      const { stdout } = await execAsync("wmctrl -l 2>/dev/null || echo ''");
      const lines = stdout.split("\n").filter(l => l.trim().length > 0);
      return lines.map(line => {
        const parts = line.split(/\s+/);
        const id = parts[0] || "";
        const desktop = parseInt(parts[1] || "0", 10);
        const title = parts.slice(3).join(" ");
        return { id, desktop, title };
      });
    } catch {
      return [];
    }
  }

  public async focusWindow(titleSubstr: string): Promise<{ success: boolean; title: string }> {
    if (!titleSubstr || typeof titleSubstr !== "string") {
      return { success: false, title: "" };
    }
    const safeTitle = titleSubstr.replace(/[^a-zA-Z0-9\s_-]/g, "");
    try {
      await execAsync(`wmctrl -a "${safeTitle}" 2>/dev/null || xdotool search --name "${safeTitle}" windowactivate 2>/dev/null`);
      return { success: true, title: safeTitle };
    } catch {
      return { success: false, title: safeTitle };
    }
  }

  public async closeWindow(titleSubstr: string): Promise<{ success: boolean; title: string }> {
    if (!titleSubstr || typeof titleSubstr !== "string") {
      return { success: false, title: "" };
    }
    const safeTitle = titleSubstr.replace(/[^a-zA-Z0-9\s_-]/g, "");
    try {
      await execAsync(`wmctrl -c "${safeTitle}" 2>/dev/null`);
      return { success: true, title: safeTitle };
    } catch {
      return { success: false, title: safeTitle };
    }
  }

  /**
   * 3. Power Profile Management (powerprofilesctl)
   */
  public async getPowerProfile(): Promise<PowerProfileStatus> {
    try {
      const { stdout } = await execAsync("powerprofilesctl get 2>/dev/null || echo 'balanced'");
      return {
        activeProfile: stdout.trim() || "balanced",
        availableProfiles: ["performance", "balanced", "power-saver"],
      };
    } catch {
      return { activeProfile: "balanced", availableProfiles: ["balanced"] };
    }
  }

  public async setPowerProfile(profile: "performance" | "balanced" | "power-saver"): Promise<{ success: boolean; profile: string }> {
    try {
      await execAsync(`powerprofilesctl set ${profile} 2>/dev/null`);
      return { success: true, profile };
    } catch {
      return { success: false, profile };
    }
  }

  /**
   * 4. MPRIS Media Playback Control via D-Bus (Spotify, YouTube, Firefox, VLC, Chromium)
   */
  public async listMprisPlayers(): Promise<string[]> {
    try {
      const { stdout } = await execAsync("gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.ListNames 2>/dev/null || echo ''");
      const matches = stdout.match(/org\.mpris\.MediaPlayer2\.[a-zA-Z0-9._-]+/g) || [];
      return Array.from(new Set(matches));
    } catch {
      return [];
    }
  }

  public async mediaControl(action: "play-pause" | "next" | "previous" | "stop"): Promise<{ success: boolean; action: string; player?: string }> {
    const players = await this.listMprisPlayers();
    if (players.length === 0) {
      return { success: false, action, player: undefined };
    }

    const targetPlayer = players[0];
    let method = "PlayPause";
    if (action === "next") method = "Next";
    else if (action === "previous") method = "Previous";
    else if (action === "stop") method = "Stop";

    try {
      await execAsync(`gdbus call --session --dest "${targetPlayer}" --object-path /org/mpris/MediaPlayer2 --method org.mpris.MediaPlayer2.Player.${method} 2>/dev/null`);
      return { success: true, action, player: targetPlayer };
    } catch {
      return { success: false, action, player: targetPlayer };
    }
  }

  public async getMediaStatus(): Promise<MediaPlaybackStatus | null> {
    const players = await this.listMprisPlayers();
    if (players.length === 0) return null;

    const player = players[0];
    try {
      const { stdout } = await execAsync(`gdbus call --session --dest "${player}" --object-path /org/mpris/MediaPlayer2 --method org.freedesktop.DBus.Properties.Get org.mpris.MediaPlayer2.Player PlaybackStatus 2>/dev/null || echo ''`);
      const statusMatch = stdout.match(/'([A-Za-z]+)'/);
      const playbackStatus = (statusMatch?.[1] || "Unknown") as any;

      // Extract metadata if playing
      let title: string | undefined;
      let artist: string | undefined;

      try {
        const { stdout: metaOut } = await execAsync(`gdbus call --session --dest "${player}" --object-path /org/mpris/MediaPlayer2 --method org.freedesktop.DBus.Properties.Get org.mpris.MediaPlayer2.Player Metadata 2>/dev/null || echo ''`);
        const titleMatch = metaOut.match(/'xesam:title':\s*<'(.*?)'>/);
        const artistMatch = metaOut.match(/'xesam:artist':\s*<\['(.*?)'\]>/);
        if (titleMatch) title = titleMatch[1];
        if (artistMatch) artist = artistMatch[1];
      } catch {}

      return {
        player: player.replace("org.mpris.MediaPlayer2.", ""),
        playbackStatus,
        title,
        artist,
      };
    } catch {
      return null;
    }
  }

  /**
   * 5. Session Security & Screen Lock
   */
  public async lockScreen(): Promise<{ success: boolean }> {
    try {
      await execAsync("loginctl lock-session 2>/dev/null || gdbus call --session --dest org.gnome.ScreenSaver --object-path /org/gnome/ScreenSaver --method org.gnome.ScreenSaver.Lock 2>/dev/null");
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * 6. Desktop Notification Dispatch
   */
  public async dispatchNotification(
    title: string,
    message: string,
    urgency: "low" | "normal" | "critical" = "normal"
  ): Promise<{ success: boolean }> {
    const safeTitle = title.replace(/"/g, '\\"');
    const safeMsg = message.replace(/"/g, '\\"');
    try {
      await execAsync(`notify-send -u "${urgency}" -a "Snow OS" "${safeTitle}" "${safeMsg}" 2>/dev/null`);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * 7. Application Launching via xdg-open / gio launch
   */
  public async launchApplication(appNameOrPath: string): Promise<{ success: boolean; app: string }> {
    if (!appNameOrPath || typeof appNameOrPath !== "string") {
      return { success: false, app: "" };
    }
    const safeApp = appNameOrPath.replace(/[^a-zA-Z0-9._/-]/g, "");
    try {
      await execAsync(`gtk-launch "${safeApp}" 2>/dev/null || gio launch "${safeApp}" 2>/dev/null || xdg-open "${safeApp}" 2>/dev/null &`);
      return { success: true, app: safeApp };
    } catch {
      return { success: false, app: safeApp };
    }
  }

  /**
   * 8. Unified System Actuator State Snapshot
   */
  public async getSystemActuatorState(): Promise<SystemActuatorState> {
    const [audio, power, media, windows] = await Promise.all([
      this.getAudioStatus(),
      this.getPowerProfile(),
      this.getMediaStatus().catch(() => null),
      this.listOpenWindows(),
    ]);

    return {
      audio,
      power,
      media,
      windowsCount: windows.length,
      timestamp: new Date().toISOString(),
    };
  }
}

export const linuxSystemActuator = new LinuxSystemActuatorService();
