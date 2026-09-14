import React, { useState, useEffect, useRef } from "react";
import {
  Send, CloudRain, Sun, Cloud, Snowflake, MapPin,
  Newspaper, Cpu, Clock, Copy, ThumbsUp,
  ThumbsDown, Trash2, TrendingUp, Activity,
  BrainCircuit, Database, Sparkles, Code,
  Zap, RefreshCw, Camera, Mic, MicOff, Video, VideoOff,
  Power, Download, Settings, Layers, Maximize2,
  Keyboard, BarChart3, Play, Pause, X,
  CloudLightning, CloudFog, SunMedium, Moon, Wind,
  FolderOpen, FileText, FileCode, Paperclip, Upload, FilePlus,
  Volume2, VolumeX, ShieldCheck, Compass, Radio
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import NetworkGraph from "./components/NetworkGraph";
import ChromaDBStore, { ChromaDocument } from "./components/ChromaDBStore";
import PromptCompiler from "./components/PromptCompiler";
import CodeSandbox from "./components/CodeSandbox";
import ModelStatus from "./components/ModelStatus";
import MatrixSnowHUD from "./components/MatrixSnowHUD";
import QuantumArcCore from "./components/QuantumArcCore";
import TacticalTelemetryHUD from "./components/TacticalTelemetryHUD";
import HolographicMissionLog from "./components/HolographicMissionLog";
import SnowfallBackground from "./components/SnowfallBackground";
import { MemoryNode, CodeFile } from "./types";
import PasswordGate from "./components/PasswordGate";

type WeatherType = "default" | "sunny" | "rain" | "cloudy" | "snow" | "storm";
type ActiveTab = "hud" | "graph" | "vector" | "compiler" | "sandbox" | "models";

interface ChatItem {
  id: string;
  sender: "user" | "snow";
  text: string;
  timestamp: string;
  widget?: {
    type: "weather" | "news" | "stock" | "sport" | "time" | "music" | "system";
    data: any;
  };
  toolActivity?: string[];
  userPrompt?: string;
  feedbackGiven?: "thumbs_up" | "thumbs_down";
}

interface WeatherData {
  temp: string;
  condition: string;
  location: string;
  humidity?: string;
  wind?: string;
  feelsLike?: string;
  isDay?: boolean;
  windSpeedKm?: number;
  weatherCode?: number;
}
interface NewsData { headline: string; source: string; category?: string; }
interface StockData { symbol: string; price: string; change: string; up: boolean; }
interface SportData { team1: string; score1: string; team2: string; score2: string; sport: string; }
interface TimeData { time: string; timezone: string; location: string; date: string; }
interface SystemData {
  cpu: string;
  cpuPct?: number;
  ram: string;
  ramPct?: number;
  ramUsed?: string;
  ramTotal?: string;
  disk?: string;
  diskPct?: number;
  temp: string;
  status: string;
  uptimeSeconds?: number;
  loadAvg?: string;
}

const getWeatherVisual = (conditionStr: string, isDay: boolean = true, windSpeedKm: number = 0) => {
  const c = (conditionStr || "").toLowerCase();
  const isNight = !isDay;
  const isHighWind = windSpeedKm >= 18 || c.includes("wind") || c.includes("gale") || c.includes("breezy");

  // 1. NIGHT TIME & CLEAR / SKY
  if (isNight && (c.includes("clear") || c.includes("sky"))) {
    return {
      icon: <Moon className="w-8 h-8 text-indigo-300 animate-pulse drop-shadow-[0_0_15px_rgba(165,180,252,0.9)]" />,
      smallIcon: <Moon className="w-4 h-4 text-indigo-300" />,
      bgGradient: "bg-gradient-to-br from-indigo-950/70 via-slate-900/90 to-slate-950/95 border-indigo-500/40 shadow-[0_0_30px_rgba(99,102,241,0.2)]",
      badgeColor: "bg-indigo-500/15 border-indigo-500/40 text-indigo-200",
      accentText: "text-indigo-300",
      tag: "CLEAR NIGHT"
    };
  }

  // 2. DAY TIME CLEAR / SUNNY
  if (c.includes("clear") || c.includes("sun") || c.includes("sunny")) {
    if (isNight) {
      return {
        icon: <Moon className="w-8 h-8 text-indigo-300 animate-pulse drop-shadow-[0_0_15px_rgba(165,180,252,0.9)]" />,
        smallIcon: <Moon className="w-4 h-4 text-indigo-300" />,
        bgGradient: "bg-gradient-to-br from-indigo-950/70 via-slate-900/90 to-slate-950/95 border-indigo-500/40 shadow-[0_0_30px_rgba(99,102,241,0.2)]",
        badgeColor: "bg-indigo-500/15 border-indigo-500/40 text-indigo-200",
        accentText: "text-indigo-300",
        tag: "CLEAR NIGHT"
      };
    }
    return {
      icon: <Sun className="w-8 h-8 text-amber-400 animate-spin-slow drop-shadow-[0_0_14px_rgba(251,191,36,0.9)]" />,
      smallIcon: <Sun className="w-4 h-4 text-amber-400" />,
      bgGradient: "bg-gradient-to-br from-amber-950/50 via-slate-900/80 to-slate-950/90 border-amber-500/35 shadow-[0_0_25px_rgba(251,191,36,0.2)]",
      badgeColor: "bg-amber-500/15 border-amber-500/35 text-amber-300",
      accentText: "text-amber-300",
      tag: "SUNNY DAY"
    };
  }

  // 3. THUNDERSTORM
  if (c.includes("storm") || c.includes("thunder") || c.includes("lightning")) {
    return {
      icon: <CloudLightning className="w-8 h-8 text-purple-400 animate-bounce drop-shadow-[0_0_15px_rgba(192,132,252,0.9)]" />,
      smallIcon: <CloudLightning className="w-4 h-4 text-purple-400" />,
      bgGradient: "bg-gradient-to-br from-purple-950/60 via-slate-900/90 to-slate-950/95 border-purple-500/40 shadow-[0_0_30px_rgba(192,132,252,0.25)]",
      badgeColor: "bg-purple-500/15 border-purple-500/40 text-purple-300",
      accentText: "text-purple-300",
      tag: "THUNDERSTORM"
    };
  }

  // 4. RAINY / DRIZZLE / SHOWERS
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) {
    return {
      icon: <CloudRain className="w-8 h-8 text-blue-400 animate-pulse drop-shadow-[0_0_15px_rgba(96,165,250,0.9)]" />,
      smallIcon: <CloudRain className="w-4 h-4 text-blue-400" />,
      bgGradient: "bg-gradient-to-br from-blue-950/60 via-slate-900/85 to-slate-950/95 border-blue-500/40 shadow-[0_0_25px_rgba(96,165,250,0.2)]",
      badgeColor: "bg-blue-500/15 border-blue-500/40 text-blue-300",
      accentText: "text-blue-300",
      tag: "RAINY"
    };
  }

  // 5. HIGH WIND / GALE / BREEZY
  if (isHighWind && !c.includes("snow") && !c.includes("rain")) {
    return {
      icon: <Wind className="w-8 h-8 text-teal-300 animate-pulse drop-shadow-[0_0_12px_rgba(94,234,212,0.8)]" />,
      smallIcon: <Wind className="w-4 h-4 text-teal-300" />,
      bgGradient: "bg-gradient-to-br from-teal-950/50 via-slate-900/80 to-slate-950/90 border-teal-500/35 shadow-[0_0_25px_rgba(94,234,212,0.18)]",
      badgeColor: "bg-teal-500/15 border-teal-500/35 text-teal-300",
      accentText: "text-teal-300",
      tag: "WINDY"
    };
  }

  // 6. SNOW / ICE
  if (c.includes("snow") || c.includes("ice") || c.includes("frost")) {
    return {
      icon: <Snowflake className="w-8 h-8 text-cyan-200 animate-pulse drop-shadow-[0_0_15px_rgba(165,243,252,0.9)]" />,
      smallIcon: <Snowflake className="w-4 h-4 text-cyan-200" />,
      bgGradient: "bg-gradient-to-br from-cyan-950/50 via-slate-900/85 to-slate-950/90 border-cyan-500/40 shadow-[0_0_25px_rgba(165,243,252,0.2)]",
      badgeColor: "bg-cyan-500/15 border-cyan-500/40 text-cyan-200",
      accentText: "text-cyan-200",
      tag: "SNOWY"
    };
  }

  // 7. FOG / MIST / HAZE
  if (c.includes("fog") || c.includes("mist") || c.includes("haze")) {
    return {
      icon: <CloudFog className="w-8 h-8 text-slate-300 animate-pulse drop-shadow-[0_0_12px_rgba(203,213,225,0.7)]" />,
      smallIcon: <CloudFog className="w-4 h-4 text-slate-300" />,
      bgGradient: "bg-gradient-to-br from-slate-900/90 via-slate-900/85 to-slate-950/95 border-slate-500/35 shadow-[0_0_20px_rgba(203,213,225,0.1)]",
      badgeColor: "bg-slate-500/15 border-slate-500/35 text-slate-300",
      accentText: "text-slate-300",
      tag: "FOGGY"
    };
  }

  // 8. CLOUDY / OVERCAST FALLBACK
  return {
    icon: isNight ? <Moon className="w-8 h-8 text-indigo-300 animate-pulse drop-shadow-[0_0_12px_rgba(165,180,252,0.7)]" /> : <Cloud className="w-8 h-8 text-cyan-300 animate-pulse drop-shadow-[0_0_12px_rgba(34,211,238,0.7)]" />,
    smallIcon: isNight ? <Moon className="w-4 h-4 text-indigo-300" /> : <Cloud className="w-4 h-4 text-cyan-400" />,
    bgGradient: "bg-slate-900/75 border-cyan-500/25 shadow-[0_0_20px_rgba(6,182,212,0.08)]",
    badgeColor: "bg-cyan-500/10 border-cyan-500/25 text-cyan-300",
    accentText: "text-cyan-200",
    tag: isNight ? "CLOUDY NIGHT" : "CLOUDY"
  };
};

interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: Array<{ web?: { uri: string; title: string; } }>;
}

const Snowflake3D = () => (
  <div className="relative w-32 h-32 flex items-center justify-center transform-3d" style={{ perspective: 800 }}>
    <motion.div
      animate={{ rotateY: 360, rotateX: [0, 25, -25, 0], rotateZ: [0, 10, -10, 0] }}
      transition={{ rotateY: { duration: 8, repeat: Infinity, ease: "linear" }, rotateX: { duration: 6, repeat: Infinity, ease: "easeInOut" }, rotateZ: { duration: 7, repeat: Infinity, ease: "easeInOut" } }}
      className="absolute inset-0 flex items-center justify-center transform-3d"
    >
      <Snowflake className="w-24 h-24 text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.9)]" style={{ transform: 'translateZ(0px)' }} />
      <Snowflake className="w-24 h-24 text-cyan-200 absolute opacity-70 drop-shadow-[0_0_15px_rgba(165,243,252,0.8)]" style={{ transform: 'translateZ(25px) rotate(45deg)' }} />
      <Snowflake className="w-24 h-24 text-blue-400 absolute opacity-40 blur-[1px]" style={{ transform: 'translateZ(-25px) rotate(-45deg)' }} />
    </motion.div>
  </div>
);



const FormattedMessage = ({ text }: { text: string }) => {
  if (!text) return null;

  // Split squished inline numbers like "1. **Title**: text 2. **Title**: text"
  let formatted = text.replace(/(\d+)\.\s+(\*\*.*?\*\*|[A-Z]\w+)/g, "\n\n$1. $2");
  formatted = formatted.replace(/\s+(\d+)\.\s+/g, "\n\n$1. ");

  const blocks = formatted.split("\n\n").filter(Boolean);

  const renderInline = (str: string) => {
    const parts = str.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
        return (
          <strong key={idx} className="text-cyan-300 font-bold tracking-wide font-sans">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return (
          <em key={idx} className="text-slate-300 italic font-sans">
            {part.slice(1, -1)}
          </em>
        );
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return (
          <code key={idx} className="bg-slate-900 border border-cyan-500/30 text-cyan-300 px-1.5 py-0.5 rounded font-mono text-[12px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <div className="markdown-body space-y-3 font-sans text-[14px] leading-relaxed text-slate-100 select-text">
      {blocks.map((block, bIdx) => {
        const trimmed = block.trim();

        // Code block
        if (trimmed.startsWith("```")) {
          const lines = trimmed.split("\n");
          const lang = lines[0].replace("```", "").trim();
          const codeContent = lines.slice(1, lines[lines.length - 1] === "```" ? -1 : lines.length).join("\n");
          return (
            <div key={bIdx} className="my-3 rounded-xl border border-cyan-500/30 bg-slate-950 overflow-hidden shadow-lg font-mono text-xs">
              {lang && (
                <div className="bg-slate-900/90 border-b border-cyan-500/20 px-3 py-1.5 text-[11px] text-cyan-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                  <span>{lang}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(codeContent)}
                    className="text-slate-400 hover:text-cyan-300 transition text-[10px] uppercase font-mono cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              )}
              <pre className="p-3.5 overflow-x-auto text-cyan-100 leading-relaxed">
                <code>{codeContent}</code>
              </pre>
            </div>
          );
        }

        // Headings
        if (trimmed.startsWith("#")) {
          const match = trimmed.match(/^(#{1,3})\s+(.*)$/);
          if (match) {
            const level = match[1].length;
            const headingText = match[2];
            if (level === 1) return <h1 key={bIdx} className="text-lg font-extrabold text-cyan-300 border-b border-cyan-500/20 pb-1 mt-2">{renderInline(headingText)}</h1>;
            if (level === 2) return <h2 key={bIdx} className="text-base font-bold text-cyan-200 mt-2">{renderInline(headingText)}</h2>;
            return <h3 key={bIdx} className="text-sm font-semibold text-cyan-100 mt-1">{renderInline(headingText)}</h3>;
          }
        }

        // Numbered item
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/s);
        if (numMatch) {
          const stepNum = numMatch[1];
          const itemContent = numMatch[2];
          return (
            <div key={bIdx} className="flex gap-3 items-start p-3.5 rounded-xl bg-slate-900/70 border border-cyan-500/20 shadow-[0_2px_12px_rgba(0,0,0,0.3)] hover:border-cyan-500/40 transition my-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono font-bold text-xs flex items-center justify-center shadow-[0_0_8px_rgba(34,211,238,0.3)] mt-0.5">
                #{stepNum}
              </span>
              <div className="flex-1 text-slate-100 text-[13.5px] leading-relaxed font-sans">
                {renderInline(itemContent)}
              </div>
            </div>
          );
        }

        // Bullet item
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const lines = trimmed.split("\n");
          return (
            <ul key={bIdx} className="space-y-2 my-2 pl-1">
              {lines.map((l, lIdx) => {
                const cleanLine = l.replace(/^[-*]\s+/, "");
                return (
                  <li key={lIdx} className="flex items-start gap-2.5 text-[13.5px] text-slate-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0 shadow-[0_0_6px_#22d3ee]" />
                    <div>{renderInline(cleanLine)}</div>
                  </li>
                );
              })}
            </ul>
          );
        }

        // Paragraph
        return (
          <p key={bIdx} className="text-slate-100 text-[13.5px] leading-relaxed">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
};

const TypewriterText = ({ text }: { text: string }) => {
  const [displayedText, setDisplayedText] = useState("");
  useEffect(() => {
    let i = 0;
    const step = Math.max(1, Math.floor(text.length / 40));
    const t = setInterval(() => {
      i += step;
      if (i >= text.length) {
        setDisplayedText(text);
        clearInterval(t);
      } else {
        setDisplayedText(text.slice(0, i));
      }
    }, 12);
    return () => clearInterval(t);
  }, [text]);

  return <FormattedMessage text={displayedText} />;
};

const Confetti = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-50 flex items-center justify-center">
      {[...Array(30)].map((_, i) => (
        <div key={i} className="confetti-piece" style={{
          left: `${Math.random() * 100}%`,
          top: `-${Math.random() * 20}%`,
          backgroundColor: ['#22d3ee', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'][Math.floor(Math.random() * 5)],
          animationDelay: `${Math.random() * 0.5}s`
        }} />
      ))}
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("hud");
  const [inputText, setInputText] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isJarvisMode, setIsJarvisMode] = useState(true);
  const [micVolume, setMicVolume] = useState(0);

  const isJarvisModeRef = useRef<boolean>(true);
  const isSpeakingRef = useRef<boolean>(false);
  const shouldKeepListeningRef = useRef<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const accumulatedTranscriptRef = useRef<string>("");
  const hasSpokenRef = useRef<boolean>(false);
  const lastSpeechTimestampRef = useRef<number>(0);
  const webSpeechDisabledRef = useRef<boolean>(false);
  const firstSpeechTimestampRef = useRef<number>(0);
  const hasAutoStartedVoiceRef = useRef<boolean>(false);
  const speechWatchdogRef = useRef<any>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const availableVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const lastSpacePressRef = useRef<number>(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // ── Biometric Auth Gate ────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // On mount: check if a valid session token already exists in sessionStorage
  useEffect(() => {
    const existing = sessionStorage.getItem("snow_auth_token");
    if (!existing) return;
    fetch("/api/auth/status", {
      headers: { "Authorization": `Bearer ${existing}` }
    })
      .then(r => r.json())
      .then(d => {
        if (d.authenticated) {
          setAuthToken(existing);
          setIsAuthenticated(true);
        } else {
          sessionStorage.removeItem("snow_auth_token");
        }
      })
      .catch(() => sessionStorage.removeItem("snow_auth_token"));
  }, []);

  // Global fetch interceptor: automatically attaches session token to all /api/snow and /api/system calls
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.href : (input as any)?.url || "");
      if (url.startsWith("/api/snow") || url.startsWith("/api/system")) {
        const token = sessionStorage.getItem("snow_auth_token");
        if (token) {
          const headers = new Headers(init?.headers);
          if (!headers.has("Authorization") && !headers.has("x-snow-token")) {
            headers.set("Authorization", `Bearer ${token}`);
          }
          const resp = await originalFetch(input, { ...init, headers });
          if (resp.status === 401) {
            sessionStorage.removeItem("snow_auth_token");
            setIsAuthenticated(false);
            setAuthToken(null);
          }
          return resp;
        }
      }
      return originalFetch(input, init);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const handleAuthenticated = (token: string) => {
    setAuthToken(token);
    setIsAuthenticated(true);
  };

  // Live System Stats & Telemetry
  const [liveStats, setLiveStats] = useState<SystemData>({
    cpu: "12%",
    cpuPct: 12,
    ram: "5.5 GB / 15.3 GB",
    ramPct: 36,
    ramUsed: "5.5 GB",
    ramTotal: "15.3 GB",
    disk: "69.3/157.5 GB",
    diskPct: 44,
    temp: "42°C",
    status: "Optimal",
    uptimeSeconds: 5800,
    loadAvg: "Optimal 12%"
  });
  const [systemLoadPct, setSystemLoadPct] = useState(12);

  // Weather State
  const [weatherState, setWeatherState] = useState<WeatherType>("default");
  const [liveWeather, setLiveWeather] = useState<WeatherData>({
    temp: "28.2°C",
    condition: "Overcast",
    location: "Madurai, Tamil Nadu, India",
    humidity: "78%",
    wind: "16.5 km/h",
    feelsLike: "29.5°C"
  });

  // Camera State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Workspace File Vault & Context Attachment State
  const [workspaceFiles, setWorkspaceFiles] = useState<Array<{ name: string; path: string; size: number; ext: string }>>([]);
  const [selectedVaultPath, setSelectedVaultPath] = useState<string>("");
  const [activeFileContent, setActiveFileContent] = useState<string>("");
  const [attachedContextFiles, setAttachedContextFiles] = useState<Array<{ name: string; path: string; content: string }>>([]);
  const [fileSearchQuery, setFileSearchQuery] = useState<string>("");
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);

  const fetchWorkspaceFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch("/api/snow/files");
      const data = await res.json();
      if (data.files) {
        setWorkspaceFiles(data.files);
        if (data.files.length > 0 && !selectedVaultPath) {
          handleSelectVaultFile(data.files[0].path);
        }
      }
    } catch (e) {
      console.error("Failed to load workspace files:", e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleSelectVaultFile = async (filePath: string) => {
    setSelectedVaultPath(filePath);
    try {
      const res = await fetch("/api/snow/files/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath })
      });
      const data = await res.json();
      if (data.content !== undefined) {
        setActiveFileContent(data.content);
      }
    } catch (e) {
      console.error("Failed to read file content:", e);
    }
  };

  const handleAttachFileToContext = (name: string, pathStr: string, content: string) => {
    if (!attachedContextFiles.some(f => f.path === pathStr)) {
      setAttachedContextFiles(prev => [...prev, { name, path: pathStr, content }]);
      triggerToast(`Attached ${name} to Snow prompt context.`);
    }
  };

  const handleRemoveAttachedFile = (pathStr: string) => {
    setAttachedContextFiles(prev => prev.filter(f => f.path !== pathStr));
  };

  const handleIngestFileToRAG = async (name: string, content: string) => {
    try {
      await fetch("/api/snow/rag/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, source: name, category: "code" })
      });
      triggerToast(`Indexed ${name} into RAG Vector Memory.`);
    } catch (e) {
      triggerToast(`Failed to index ${name}`);
    }
  };

  const handleAskSnowAboutFile = (name: string, pathStr: string, content: string) => {
    const fileExt = pathStr.split('.').pop() || 'text';
    handleSendMessage(`Please analyze the codebase file "${name}" (${pathStr}) and provide key structural insights, bug fixes, or performance optimization recommendations:\n\n\`\`\`${fileExt}\n${content.slice(0, 15000)}\n\`\`\``);
  };

  const handleCustomFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (text) {
          handleAttachFileToContext(file.name, file.name, text);
        }
      };
      reader.readAsText(file);
    }
  };

  // Uptime Counter
  const [uptimeSeconds, setUptimeSeconds] = useState(439); // starts around 00:07:19
  const [commandCount, setCommandCount] = useState(0);

  // Brain & Dynamic Memory State
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [vectorDocs, setVectorDocs] = useState<ChromaDocument[]>([]);
  const [brainStatus, setBrainStatus] = useState<any>({
    brainState: { level: 5, xp: 450, totalChats: 12, positiveFeedback: 8, negativeFeedback: 1, learnedDirectives: [] },
    memoriesCount: 4,
    vectorsCount: 2
  });
  const [selectedModel, setSelectedModel] = useState<string>("gemini-flash-latest");
  const [compilerMode, setCompilerMode] = useState<"general" | "education" | "debugging" | "context_awareness">("general");

  // Code Sandbox State
  const [sandboxFiles, setSandboxFiles] = useState<CodeFile[]>([
    {
      name: "calculate_shares.js",
      code: `function evaluateWeights(sharesCount, stockValue) {\n  const totalValue = sharesCount * stockValue;\n  if (totalValue === 0) return 0;\n  return stockValue * (100 / totalValue);\n}\nconsole.log("Weight:", evaluateWeights(10, 150));`
    }
  ]);

  const [groundingInfo, setGroundingInfo] = useState<GroundingMetadata | null>(null);
  const [responseStats, setResponseStats] = useState({ time: "0.00s", network: "Excellent", model: "Gemini 2.5" });

  // Widget states for conversation
  const [weatherWidget, setWeatherWidget] = useState<WeatherData | null>(null);
  const [newsWidget, setNewsWidget] = useState<NewsData | null>(null);
  const [stockWidget, setStockWidget] = useState<StockData | null>(null);
  const [sportWidget, setSportWidget] = useState<SportData | null>(null);
  const [timeWidget, setTimeWidget] = useState<TimeData | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory, isLoading]);

  // Uptime Timer Loop
  useEffect(() => {
    const timer = setInterval(() => setUptimeSeconds(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600).toString().padStart(2, "0");
    const mins = Math.floor((totalSec % 3600) / 60).toString().padStart(2, "0");
    const secs = (totalSec % 60).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  };

  // Toast notifier helper
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch Live Memories from backend
  const fetchMemories = async () => {
    try {
      const res = await fetch("/api/snow/memory");
      if (res.ok) setMemories(await res.json());
    } catch (e) {
      console.warn("Failed to fetch memories:", e);
    }
  };

  // Fetch Vectors from backend
  const fetchVectors = async () => {
    try {
      const res = await fetch("/api/snow/vectors");
      if (res.ok) setVectorDocs(await res.json());
    } catch (e) {
      console.warn("Failed to fetch vectors:", e);
    }
  };

  // Fetch Brain Training Status
  const fetchBrainStatus = async () => {
    try {
      const res = await fetch("/api/snow/train/status");
      if (res.ok) setBrainStatus(await res.json());
    } catch (e) {
      console.warn("Failed to fetch brain status:", e);
    }
  };

  // Add Memory Handler
  const handleAddMemory = async (source: string, rel: string, target: string) => {
    try {
      const res = await fetch("/api/snow/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, rel, target })
      });
      if (res.ok) {
        fetchMemories();
        fetchBrainStatus();
        triggerToast(`Memory mapped: [${source}] ${rel} [${target}]`);
      }
    } catch (e) {
      console.error("Add memory failed", e);
    }
  };

  // Delete Memory Handler
  const handleDeleteMemory = async (id: string) => {
    try {
      await fetch(`/api/snow/memory/${id}`, { method: "DELETE" });
      fetchMemories();
      fetchBrainStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearMemories = async () => {
    try {
      await fetch("/api/snow/memory", { method: "DELETE" });
      fetchMemories();
      fetchBrainStatus();
      triggerToast("All memory graph entries cleared.");
    } catch (e) {
      console.error(e);
    }
  };

  // Vector store handlers
  const handleAddVectorDoc = async (doc: Omit<ChromaDocument, "id" | "timestamp" | "embedding">) => {
    try {
      const res = await fetch("/api/snow/vectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc)
      });
      if (res.ok) {
        fetchVectors();
        fetchBrainStatus();
        triggerToast("Vector document indexed to ChromaDB store.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveVectorDoc = async (id: string) => {
    try {
      await fetch(`/api/snow/vectors/${id}`, { method: "DELETE" });
      fetchVectors();
      fetchBrainStatus();
    } catch (e) {
      console.error(e);
    }
  };


  // Live Weather Fetcher
  const fetchLiveWeather = async (loc = "Madurai, Tamil Nadu, India") => {
    try {
      const geo: any = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1`).then(r => r.json());
      if (geo.results?.length) {
        const l = geo.results[0];
        const wx: any = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${l.latitude}&longitude=${l.longitude}&current_weather=true&hourly=relative_humidity_2m`).then(r => r.json());
        if (wx.current_weather) {
          const cw = wx.current_weather;
          const adminStr = l.admin1 ? `, ${l.admin1}` : "";

          const CODE_MAP: Record<number, string> = {
            0: "Clear Sky", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
            45: "Foggy", 48: "Depositing Rime Fog", 51: "Light Drizzle", 53: "Moderate Drizzle", 55: "Dense Drizzle",
            61: "Slight Rain", 63: "Moderate Rain", 65: "Heavy Rain", 71: "Slight Snow", 73: "Moderate Snow", 75: "Heavy Snow",
            80: "Slight Rain Showers", 81: "Moderate Rain Showers", 82: "Violent Rain Showers", 95: "Thunderstorm", 96: "Thunderstorm with Hail", 99: "Heavy Thunderstorm"
          };

          const conditionText = CODE_MAP[cw.weathercode] || (cw.weathercode === 0 ? "Clear Sky" : cw.weathercode <= 3 ? "Partly Cloudy" : "Overcast");

          const isDay = cw.is_day === 1;
          const windSpeedKm = cw.windspeed || 0;

          if (!isDay) setWeatherState("storm");
          else if (cw.weathercode === 0 || cw.weathercode === 1) setWeatherState("sunny");
          else if (cw.weathercode >= 51 && cw.weathercode <= 82) setWeatherState("rain");
          else if (cw.weathercode >= 95) setWeatherState("storm");
          else if (cw.weathercode >= 71 && cw.weathercode <= 75) setWeatherState("snow");
          else setWeatherState("cloudy");

          setLiveWeather({
            temp: `${cw.temperature}°C`,
            condition: conditionText,
            location: `${l.name}${adminStr}, ${l.country || "India"}`,
            humidity: wx.hourly?.relative_humidity_2m?.[0] ? `${wx.hourly.relative_humidity_2m[0]}%` : "78%",
            wind: `${cw.windspeed} km/h`,
            feelsLike: `${(cw.temperature + 1.2).toFixed(1)}°C`,
            isDay,
            windSpeedKm,
            weatherCode: cw.weathercode
          });
        }
      }
    } catch (e) {
      console.warn("Live weather fetch fail:", e);
    }
  };

  useEffect(() => {
    fetchMemories();
    fetchVectors();
    fetchBrainStatus();
    fetchLiveWeather("Madurai, Tamil Nadu, India");
  }, []);

  // Poll live system stats every 5 seconds
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/system");
        if (res.ok) {
          const data = await res.json();
          setLiveStats(data);
          const cpuVal = parseInt(data.cpu) || data.cpuPct || 12;
          setSystemLoadPct(cpuVal);
          if (data.uptimeSeconds) {
            setUptimeSeconds(data.uptimeSeconds);
          }
        }
      } catch { /* ignore */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Initial dynamic, situation-aware greeting for NJ
  useEffect(() => {
    if (chatHistory.length === 0) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      const hour = now.getHours();
      let timeGreeting = "Good morning, Boss";
      let period = "morning";
      if (hour >= 12 && hour < 17) {
        timeGreeting = "Good afternoon, Boss";
        period = "afternoon";
      } else if (hour >= 17 && hour < 22) {
        timeGreeting = "Good evening, Boss";
        period = "evening";
      } else if (hour >= 22 || hour < 5) {
        timeGreeting = "Good evening, Boss";
        period = "tonight";
      }

      const welcomePool = [
        `${timeGreeting}. S.N.O.W. is online and operational. What are we focusing on ${period === "tonight" ? "tonight" : `this ${period}`}?`,
        `${timeGreeting}. All local systems nominal and ready for your directives.`,
        `${timeGreeting}. S.N.O.W. is standing by — what's on your mind?`,
        `Good ${period}, Boss. All telemetry is nominal. Ready for your next directive.`
      ];
      const selectedWelcome = welcomePool[Math.floor(Math.random() * welcomePool.length)];

      setChatHistory([
        {
          id: "welcome-1",
          sender: "snow",
          text: selectedWelcome,
          timestamp: timeStr
        }
      ]);
    }
  }, []);

  // Webcam Camera Toggle
  const toggleCamera = async () => {
    if (isCameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setIsCameraActive(false);
      triggerToast("Camera disabled.");
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsCameraActive(true);
        triggerToast("Camera stream activated.");
      } catch (e: any) {
        console.error("Camera access failed:", e);
        triggerToast("Webcam access restricted or unavailable.");
      }
    }
  };

  // Capture Snapshot
  const captureSnapshot = () => {
    if (!videoRef.current || !isCameraActive) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      setSnapshots(prev => [dataUrl, ...prev.slice(0, 3)]);
      triggerToast("Snapshot captured successfully.");
    }
  };

  // ─── Snow Web Audio Futuristic Wake Chime ────────────────────────────────────
  const playSnowWakeChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      // High-tech Snow 4-tone ascending sweep: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.055);
        gain.gain.setValueAtTime(0.001, now + idx * 0.055);
        gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.055 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.055 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.055);
        osc.stop(now + idx * 0.055 + 0.23);
      });
    } catch (e) {
      console.warn("Snow chime error:", e);
    }
  };

  // ─── Speech Text Cleaner (Strips Markdown/Code/Tags for Crisp Voice) ─────────
  const cleanForSpeech = (rawText: string): string => {
    if (!rawText) return "";
    return rawText
      // Strip markdown code blocks
      .replace(/```[\s\S]*?```/g, "Code omitted for speech.")
      // Strip inline code
      .replace(/`([^`]+)`/g, "$1")
      // Strip markdown bold/italics/headers
      .replace(/[#*_~>]/g, "")
      // Strip bracketed widgets/tags like [UI_WEATHER: ...] or [WEATHER: ...]
      .replace(/\[(?:WEATHER|UI_[A-Z_]+)\s*:?[^\]]*\]/gi, "")
      .replace(/\[[^\]]*\]/g, "")
      // Strip URLs
      .replace(/https?:\/\/\S+/g, "")
      // Strip raw JSON
      .replace(/\{[^{}]*\}/g, "")
      // Collapse multiple whitespace
      .replace(/\s+/g, " ")
      .trim();
  };

  // Keep voice refs synchronized with component state
  useEffect(() => {
    isJarvisModeRef.current = isJarvisMode;
  }, [isJarvisMode]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // ─── Stop Ongoing Snow Speech (Barge-In) ─────────────────────────────────────
  const stopSnowSpeech = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    fetch("/api/snow/voice/barge-in", { method: "POST" }).catch(() => {});
  };

  // Cache available synthesis voices on load & voice changes
  useEffect(() => {
    if ("speechSynthesis" in window) {
      const updateVoices = () => {
        availableVoicesRef.current = window.speechSynthesis.getVoices();
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  // ─── Speak Response as Snow (Articulate Female Voice) ────────────────────────
  const speakSnow = (textToSpeak: string) => {
    if (isMuted || !("speechSynthesis" in window)) {
      if (isJarvisModeRef.current) {
        setTimeout(() => {
          if (isJarvisModeRef.current && !isSpeakingRef.current) {
            startSnowVoiceListening(true);
          }
        }, 1200);
      }
      return;
    }

    try {
      window.speechSynthesis.cancel();
      if (speechWatchdogRef.current) clearTimeout(speechWatchdogRef.current);

      const cleaned = cleanForSpeech(textToSpeak);
      if (!cleaned) {
        if (isJarvisModeRef.current && !isSpeakingRef.current) {
          setTimeout(() => startSnowVoiceListening(true), 400);
        }
        return;
      }

      // Extract first 2-3 sentences for concise, crisp spoken delivery
      const sentenceMatches = cleaned.match(/[^.!?]+[.!?]+/g);
      const spokenSummary = sentenceMatches && sentenceMatches.length > 0 
        ? sentenceMatches.slice(0, 3).join(" ").trim() 
        : cleaned.slice(0, 260).trim();

      const utterance = new SpeechSynthesisUtterance(spokenSummary);
      utterance.rate = 1.02; // Elegant, fluid conversational pace
      utterance.pitch = 1.14; // Melodic, crystal-clear feminine register

      // Select female voice with prioritized fallback chain
      const voices = (availableVoicesRef.current && availableVoicesRef.current.length > 0)
        ? availableVoicesRef.current
        : window.speechSynthesis.getVoices();

      const femaleVoice = voices.find(v => 
        v.lang.startsWith("en") && (
          /female|samantha|victoria|karen|zira|jenny|aria|sonia|ava|emma|natasha|susan|moira|tessa|stephanie|allison|fiona|veena|catherine|linda/i.test(v.name)
        )
      ) || voices.find(v =>
        v.lang.startsWith("en") && (
          v.name.includes("Google UK English Female") ||
          v.name.includes("Google US English") ||
          v.name.includes("Natural") ||
          v.name.includes("Online")
        )
      ) || voices.find(v =>
        v.lang.startsWith("en") && !/male|david|daniel|george|arthur|oliver|mark|richard|james|brian|guy/i.test(v.name)
      ) || voices.find(v => v.lang.startsWith("en")) || voices[0];

      if (femaleVoice) utterance.voice = femaleVoice;

      // Pin utterance to prevent Chromium GC freeze bug
      activeUtteranceRef.current = utterance;
      (window as any)._snowActiveUtterance = utterance;

      utterance.onstart = () => {
        setIsSpeaking(true);
        isSpeakingRef.current = true;
      };

      const handleSpeechDone = () => {
        if (speechWatchdogRef.current) clearTimeout(speechWatchdogRef.current);
        activeUtteranceRef.current = null;
        (window as any)._snowActiveUtterance = null;
        setIsSpeaking(false);
        isSpeakingRef.current = false;

        // J.A.R.V.I.S. Continuous Conversational Loop:
        // Automatically resume listening for follow-up immediately after speech finishes!
        if (isJarvisModeRef.current && !isMuted) {
          setTimeout(() => {
            if (isJarvisModeRef.current && !isSpeakingRef.current) {
              startSnowVoiceListening(true);
            }
          }, 350);
        }
      };

      utterance.onend = handleSpeechDone;
      utterance.onerror = (err) => {
        console.warn("[Snow Voice] Speech synthesis notice:", err);
        handleSpeechDone();
      };

      // Watchdog timer: Auto-recover if browser speech stalls or misses onend
      const maxSpeechMs = Math.max(3500, (spokenSummary.length * 90) + 1500);
      speechWatchdogRef.current = setTimeout(() => {
        if (isSpeakingRef.current) {
          console.log("[Snow Voice] Speech watchdog auto-recovered state.");
          handleSpeechDone();
        }
      }, maxSpeechMs);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      if (isJarvisModeRef.current && !isMuted) {
        setTimeout(() => startSnowVoiceListening(true), 350);
      }
    }
  };

  // Ref to handleSendMessage to avoid stale closures in voice timers
  const handleSendMessageRef = useRef<(text?: string) => Promise<void>>(async () => {});

  // ─── Native Audio Cleanup Helper ─────────────────────────────────────────────
  const cleanupAudioStreams = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setMicVolume(0);
  };

  // ─── Neural Server-Side Transcription (Gemini STT) ──────────────────────────
  const transcribeAudioBlob = async (audioBlob: Blob): Promise<string> => {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;

      const res = await fetch("/api/snow/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64Audio, mimeType: audioBlob.type || "audio/webm" })
      });

      if (!res.ok) return "";
      const data = await res.json();
      return data.text || "";
    } catch (err) {
      console.warn("[Snow Voice] Transcription request notice:", err);
      return "";
    }
  };

  // ─── Continuous Voice Engine (Dual-Mode: Native Audio + WebSpeech API) ──────
  const stopSnowVoiceListening = (preserveJarvisMode = false) => {
    shouldKeepListeningRef.current = false;
    if (!preserveJarvisMode) {
      setIsJarvisMode(false);
      isJarvisModeRef.current = false;
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    cleanupAudioStreams();
    setIsListening(false);
    accumulatedTranscriptRef.current = "";
    hasSpokenRef.current = false;
    lastSpeechTimestampRef.current = 0;
  };

  const startSnowVoiceListening = async (isAutoSilent = false) => {
    // Barge-in: immediately stop ongoing speech if any
    stopSnowSpeech();

    shouldKeepListeningRef.current = true;
    accumulatedTranscriptRef.current = "";
    hasSpokenRef.current = false;
    lastSpeechTimestampRef.current = 0;
    audioChunksRef.current = [];

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // Only chime and toast on explicit user activation, never repeatedly in Jarvis loop
    if (!isAutoSilent) {
      playSnowWakeChime();
      triggerToast(isJarvisModeRef.current ? "⚡ J.A.R.V.I.S. Loop Active (Speak freely)..." : "⚡ Snow Listening...");
    }

    setIsListening(true);

    // ── 1. Setup Native Microphone & Web Audio Analyser (Works in all browsers) ──
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      audioStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateAudioMetrics = () => {
          if (!shouldKeepListeningRef.current) return;
          analyser.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalizedVol = Math.min(100, Math.round((avg / 128) * 100));
          setMicVolume(normalizedVol);

          // Barge-in check: If Snow starts speaking and user speaks aloud
          if (isSpeakingRef.current && normalizedVol > 18) {
            stopSnowSpeech();
          }

          // Voice Activity Detection (VAD) - sensitive threshold for crisp speech detection
          if (normalizedVol > 6) {
            if (!hasSpokenRef.current) {
              firstSpeechTimestampRef.current = Date.now();
            }
            hasSpokenRef.current = true;
            lastSpeechTimestampRef.current = Date.now();
          }

          // Adaptive conversational silence detection:
          // 1,800ms of sustained pause after speaking (or 2,400ms if ending on a connecting thought)
          // Extended maximum speaking duration: 25,000ms (25 seconds) to allow complete thoughts without cutoff
          if (hasSpokenRef.current && lastSpeechTimestampRef.current > 0) {
            const silentDuration = Date.now() - lastSpeechTimestampRef.current;
            const totalSpeakingDuration = firstSpeechTimestampRef.current > 0 ? (Date.now() - firstSpeechTimestampRef.current) : 0;
            const currentTranscript = accumulatedTranscriptRef.current.trim();
            const endsWithConnector = /(?:and|or|then|but|if|because|like|with|also|to|for)\s*$/i.test(currentTranscript);
            const silenceThreshold = endsWithConnector ? 2400 : 1800;

            if (silentDuration > silenceThreshold || totalSpeakingDuration > 25000) {
              hasSpokenRef.current = false;
              lastSpeechTimestampRef.current = 0;
              firstSpeechTimestampRef.current = 0;

              // Check if Web Speech transcript is already available
              if (currentTranscript) {
                const toSubmit = currentTranscript;
                stopSnowVoiceListening(true);
                handleSendMessageRef.current(toSubmit);
                return;
              }

              // Otherwise stop recorder to trigger Neural Gemini transcription
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                try { mediaRecorderRef.current.stop(); } catch {}
                return;
              }
            }
          }

          animFrameRef.current = requestAnimationFrame(updateAudioMetrics);
        };
        animFrameRef.current = requestAnimationFrame(updateAudioMetrics);
      }

      // Initialize MediaRecorder for neural audio streaming
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg")
        ? "audio/ogg"
        : "";

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
          audioChunksRef.current = [];

          if (!accumulatedTranscriptRef.current.trim()) {
            triggerToast("⚡ Processing your voice directive...");
            const transcribed = await transcribeAudioBlob(blob);
            if (transcribed && transcribed.trim()) {
              setInputText(transcribed.trim());
              stopSnowVoiceListening(true);
              handleSendMessageRef.current(transcribed.trim());
              return;
            }
          }
        }

        // If still listening and no command was submitted, restart recorder chunking
        if (shouldKeepListeningRef.current && stream.active) {
          try {
            audioChunksRef.current = [];
            mediaRecorder.start(250);
          } catch {}
        }
      };

      mediaRecorder.start(250);
    } catch (micErr) {
      console.warn("[Snow Voice] Mic capture notice:", micErr);
      triggerToast("Microphone access denied or unavailable.");
      setIsListening(false);
      shouldKeepListeningRef.current = false;
      return;
    }

    // ── 2. Setup Web Speech Recognition (Secondary Instant Interim Stream) ──────
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition && !webSpeechDisabledRef.current) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let interimTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const text = event.results[i][0]?.transcript || "";
            if (event.results[i].isFinal) {
              accumulatedTranscriptRef.current += (accumulatedTranscriptRef.current ? " " : "") + text.trim();
            } else {
              interimTranscript += text;
            }
          }

          const activeSpeech = (
            accumulatedTranscriptRef.current + (interimTranscript ? " " + interimTranscript.trim() : "")
          ).trim();

          if (activeSpeech) {
            setInputText(activeSpeech);
            hasSpokenRef.current = true;
            lastSpeechTimestampRef.current = Date.now();

            // Instant wake-word trigger on Web Speech API
            if (/^(?:hey|hi|hello|yo|ok)?\s*(?:snow|jarvis)[.!?]*$/i.test(activeSpeech.trim())) {
              stopSnowVoiceListening(true);
              handleSendMessageRef.current(activeSpeech.trim());
              return;
            }
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === "no-speech" || event.error === "aborted") {
            return;
          }
          if (event.error === "network") {
            // Distro/Snap Chromium without Google speech keys: gracefully rely on Native MediaRecorder Neural Engine
            console.log("[Snow Voice] Web Speech network notice — using Native Neural Voice Engine.");
            webSpeechDisabledRef.current = true;
            try { recognition.abort(); } catch {}
            recognitionRef.current = null;
            return;
          }
          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            webSpeechDisabledRef.current = true;
            try { recognition.abort(); } catch {}
            recognitionRef.current = null;
          }
        };

        recognition.onend = () => {
          // Graceful re-initialization without dead-instance start() or recursive flapping
          if (shouldKeepListeningRef.current && !webSpeechDisabledRef.current) {
            try {
              const freshRec = new SpeechRecognition();
              freshRec.continuous = true;
              freshRec.interimResults = true;
              freshRec.lang = "en-US";
              freshRec.onresult = recognition.onresult;
              freshRec.onerror = recognition.onerror;
              freshRec.onend = recognition.onend;
              recognitionRef.current = freshRec;
              freshRec.start();
            } catch {}
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (recErr) {
        console.warn("[Snow Voice] SpeechRecognition startup notice:", recErr);
      }
    }
  };

  const toggleSpeechRecognition = () => {
    if (isListening || shouldKeepListeningRef.current) {
      stopSnowVoiceListening(false);
      triggerToast("Voice input paused.");
    } else {
      setIsJarvisMode(true);
      isJarvisModeRef.current = true;
      startSnowVoiceListening(false);
    }
  };

  const toggleJarvisMode = () => {
    const next = !isJarvisMode;
    setIsJarvisMode(next);
    isJarvisModeRef.current = next;
    if (next) {
      triggerToast("⚡ J.A.R.V.I.S. Continuous Conversation Mode Enabled.");
      if (!isListening) {
        startSnowVoiceListening(false);
      }
    } else {
      triggerToast("Push-to-Talk Mode Enabled.");
    }
  };

  // ─── Double-Space Auto-Wake Global Listener ─────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const target = e.target as HTMLElement;
        const isInputField = target && (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        );

        if (isInputField) {
          const inputElem = target as HTMLInputElement;
          const hasContent = inputElem.value && inputElem.value.trim().length > 0;
          if (hasContent && !e.ctrlKey && !e.altKey) {
            return;
          }
        }

        const now = Date.now();
        const diff = now - lastSpacePressRef.current;
        lastSpacePressRef.current = now;

        if (diff > 50 && diff < 400) {
          // Rapid Double-Space detected!
          e.preventDefault();
          lastSpacePressRef.current = 0;
          if (isListening || shouldKeepListeningRef.current) {
            stopSnowVoiceListening(false);
            triggerToast("Voice input paused.");
          } else {
            setIsJarvisMode(true);
            isJarvisModeRef.current = true;
            startSnowVoiceListening(false);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isListening, isMuted]);

  // ─── Auto-Wake Voice Initialization on Startup & Interaction ───────────────
  useEffect(() => {
    const attemptAutoListen = async () => {
      if (hasAutoStartedVoiceRef.current) return;
      hasAutoStartedVoiceRef.current = true;
      try {
        await startSnowVoiceListening(true);
      } catch (err) {
        console.log("[Snow Voice] Initial auto-listen waiting for user interaction:", err);
      }
    };

    // Auto-listen shortly after UI mount
    const timer = setTimeout(attemptAutoListen, 800);

    // Fallback: If browser audio policy requires user gesture, start on first click/key
    const handleFirstGesture = () => {
      if (!isListening && !shouldKeepListeningRef.current) {
        startSnowVoiceListening(true);
      }
      window.removeEventListener("click", handleFirstGesture);
      window.removeEventListener("keydown", handleFirstGesture);
    };

    window.addEventListener("click", handleFirstGesture);
    window.addEventListener("keydown", handleFirstGesture);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleFirstGesture);
      window.removeEventListener("keydown", handleFirstGesture);
    };
  }, []);

  // Export Conversation Transcript
  const handleExtractConversation = () => {
    if (chatHistory.length === 0) return;
    const header = `====================================================\nSNOW NEURAL CONVERSATION TRANSCRIPT\nExported: ${new Date().toLocaleString()}\n====================================================\n\n`;
    const body = chatHistory
      .map(m => `[${m.timestamp}] ${m.sender.toUpperCase()}: ${m.text}`)
      .join("\n\n");

    const blob = new Blob([header + body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snow_conversation_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast("Conversation transcript extracted!");
  };

  // Send Feedback (Thumbs up / down)
  const handleSendFeedback = async (msgId: string, feedbackType: "thumbs_up" | "thumbs_down") => {
    const item = chatHistory.find(m => m.id === msgId);
    if (!item) return;

    const itemIdx = chatHistory.findIndex(m => m.id === msgId);
    const userPrompt = itemIdx > 0 ? chatHistory[itemIdx - 1]?.text : "User interaction";

    try {
      const res = await fetch("/api/snow/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, response: item.text, feedback: feedbackType })
      });

      if (res.ok) {
        setChatHistory(prev => prev.map(m => m.id === msgId ? { ...m, feedbackGiven: feedbackType } : m));
        fetchBrainStatus();
        triggerToast(feedbackType === "thumbs_up" ? "👍 Positive feedback logged. SNOW +50 XP!" : "👎 Feedback logged. SNOW updated directives.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const clearWidgets = () => {
    setWeatherWidget(null); setNewsWidget(null); setStockWidget(null);
    setSportWidget(null); setTimeWidget(null);
    setWeatherState("default");
    setShowConfetti(false);
  };

  const extractJsonFromTag = (text: string, tag: string): string | null => {
    const tagIndex = text.indexOf(tag);
    if (tagIndex === -1) return null;
    const startBraceIndex = text.indexOf("{", tagIndex);
    if (startBraceIndex === -1) return null;

    let braceCount = 0;
    for (let i = startBraceIndex; i < text.length; i++) {
      if (text[i] === "{") braceCount++;
      else if (text[i] === "}") {
        braceCount--;
        if (braceCount === 0) return text.substring(startBraceIndex, i + 1);
      }
    }
    return null;
  };

  // Send Message Handler
  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend || inputText;
    if (!rawText.trim() || isLoading) return;

    // Barge-in: immediately stop any active Snow speech
    stopSnowSpeech();

    let promptForBackend = rawText.trim();
    if (attachedContextFiles.length > 0) {
      const attachmentBlock = attachedContextFiles
        .map(f => `--- ATTACHED FILE: ${f.name} (${f.path}) ---\n${f.content.slice(0, 15000)}\n--- END OF ATTACHED FILE ---`)
        .join("\n\n");
      promptForBackend = `${attachmentBlock}\n\nUSER QUERY: ${rawText.trim()}`;
      setAttachedContextFiles([]);
    }

    stopSnowVoiceListening(true);

    const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    setChatHistory((prev) => [...prev, { id: `user-${Date.now()}`, sender: "user", text: rawText.trim(), timestamp: now }]);
    setInputText("");
    setIsLoading(true);
    setCommandCount(c => c + 1);
    clearWidgets();

    const startTime = Date.now();
    try {
      const res = await fetch("/api/snow/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          prompt: promptForBackend,
          model: selectedModel,
          images: snapshots.length > 0 ? snapshots : undefined,
          history: chatHistory.slice(-10).map(m => ({
            role: m.sender === "snow" ? "model" : "user",
            text: m.text
          }))
        })
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      
      const aiText = data.text;
      setGroundingInfo(data.grounding || null);

      let widgetData: any = null;
      let widgetType: "weather" | "news" | "stock" | "sport" | "time" | "system" | null = null;

      const parseTagJson = (raw: string, tagName: string): any | null => {
        const rx = new RegExp(`\\[${tagName}\\s*:?\\s*(\\{[\\s\\S]*?\\})\\s*\\]`, "i");
        const m = raw.match(rx);
        if (m?.[1]) { try { return JSON.parse(m[1]); } catch {} }
        const jsonStr = extractJsonFromTag(raw, `[${tagName}:`);
        if (jsonStr) { try { return JSON.parse(jsonStr); } catch {} }
        return null;
      };

      const tryWidget = (tagName: string, setter: (v: any) => void, type: typeof widgetType) => {
        const parsed = parseTagJson(aiText, tagName);
        if (parsed) { setter(parsed); widgetData = parsed; widgetType = type; }
      };

      const wxStateM = aiText.match(/\[WEATHER\s*:?\s*([A-Z]+)\]/i);
      if (wxStateM) setWeatherState(wxStateM[1].toLowerCase() as WeatherType);

      tryWidget("UI_WEATHER", setWeatherWidget, "weather");
      tryWidget("UI_NEWS",    setNewsWidget,    "news");
      tryWidget("UI_STOCK",   setStockWidget,   "stock");
      tryWidget("UI_SPORT",   setSportWidget,   "sport");
      tryWidget("UI_TIME",    setTimeWidget,    "time");

      if (/\[UI_JOKE/i.test(aiText)) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }

      let cleanDisplay = aiText
        .replace(/\[(?:WEATHER|UI_[A-Z_]+)\s*:?[^\]]*\]/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

      setResponseStats({ time: ((Date.now() - startTime) / 1000).toFixed(2) + "s", network: "Optimal", model: data.model || selectedModel });

      const replyTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      setChatHistory((prev) => [
        ...prev,
        {
          id: `snow-${Date.now()}`,
          sender: "snow",
          text: cleanDisplay,
          timestamp: replyTime,
          widget: widgetType ? { type: widgetType, data: widgetData } : undefined,
          toolActivity: data.toolActivity || []
        }
      ]);

      fetchMemories();
      fetchBrainStatus();

      // Verbal speech delivery for all responses (always speak response aloud)
      const spokenText = cleanDisplay || "Understood, NJ. Directive processed.";
      speakSnow(spokenText);
    } catch (err: any) {
      console.error("[Snow Chat Error]", err);
      const isNetworkError = err instanceof TypeError && (
        err.message === "Failed to fetch" ||
        err.message.includes("NetworkError") ||
        err.message.includes("net::ERR") ||
        err.message.includes("Connection refused")
      );

      let friendlyMsg: string;
      if (isNetworkError) {
        const hour = new Date().getHours();
        const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        friendlyMsg = `${greet}, NJ. I am Snow, operating in standalone mode. My server is starting up — this usually takes about 15-20 seconds on first launch. Please send your message again in a moment, and I will be fully ready to assist you.`;
      } else {
        friendlyMsg = err.message || "Encountered a processing anomaly. Please try again.";
      }
      
      const errTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      setChatHistory((prev) => [...prev, { id: `err-${Date.now()}`, sender: "snow", text: friendlyMsg, timestamp: errTime }]);
      speakSnow(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

  // Date and Time formatting for Header
  const [currentDateTime, setCurrentDateTime] = useState({
    time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime({
        time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const renderWidgetContent = (widget: { type: string; data: any }) => {
    return (
      <div className="mt-2.5 p-3 rounded-xl bg-slate-950/80 border border-cyan-500/25 shadow-inner">
        {widget.type === "weather" && (() => {
          const isDay = widget.data.isDay !== undefined ? widget.data.isDay : true;
          const windSpeed = widget.data.windSpeedKm || 0;
          const visual = getWeatherVisual(widget.data.condition || "Clear", isDay, windSpeed);
          return (
            <div className="space-y-2 font-mono">
              <div className="flex items-center justify-between border-b border-cyan-500/15 pb-1">
                <span className="font-bold uppercase tracking-wider text-slate-300 text-[11px]">{widget.data.location}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${visual.badgeColor} border`}>
                  {visual.tag}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-bold text-white tracking-tight">{widget.data.temp}</div>
                  <div className={`text-xs capitalize font-semibold ${visual.accentText}`}>{widget.data.condition}</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-900 border border-white/10 shadow-inner">
                  {visual.smallIcon}
                </div>
              </div>
              {(widget.data.humidity || widget.data.wind) && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-cyan-500/10 text-[10px]">
                  {widget.data.humidity && <div><span className="text-slate-400">Humidity:</span> <span className="font-bold text-white">{widget.data.humidity}</span></div>}
                  {widget.data.wind && <div><span className="text-slate-400">Wind:</span> <span className="font-bold text-white">{widget.data.wind}</span></div>}
                </div>
              )}
            </div>
          );
        })()}
        {widget.type === "stock" && (
          <div className="font-mono">
            <div className="font-bold border-b border-emerald-500/20 pb-1 mb-1 text-xs text-slate-300">{widget.data.symbol}</div>
            <div className="text-xl font-bold text-white">{widget.data.price} <span className="text-xs text-emerald-400">{widget.data.change}</span></div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Password authentication gate — shown until access key is verified */}
      <AnimatePresence>
        {!isAuthenticated && (
          <PasswordGate onAuthenticated={handleAuthenticated} />
        )}
      </AnimatePresence>

      {/* Main Snow UI — rendered but hidden until gate clears */}
      <motion.div
        animate={{ opacity: isAuthenticated ? 1 : 0, scale: isAuthenticated ? 1 : 0.98 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{ pointerEvents: isAuthenticated ? "auto" : "none" }}
      >
    <div className={`w-full h-screen flex flex-col transition-colors duration-1000 bg-weather-${weatherState} overflow-hidden font-sans text-white relative bg-slate-950`}>
      {/* Dynamic Cognitive State Ambient Aura */}
      <div
        className={`absolute inset-0 pointer-events-none transition-all duration-1000 z-0 ${
          isLoading
            ? "bg-[radial-gradient(ellipse_at_50%_40%,_rgba(6,182,212,0.14)_0%,_rgba(15,23,42,0.6)_50%,_rgba(2,6,23,0.95)_100%)]"
            : isListening
            ? "bg-[radial-gradient(ellipse_at_50%_40%,_rgba(244,63,94,0.14)_0%,_rgba(15,23,42,0.6)_50%,_rgba(2,6,23,0.95)_100%)]"
            : isSpeaking
            ? "bg-[radial-gradient(ellipse_at_50%_40%,_rgba(16,185,129,0.14)_0%,_rgba(15,23,42,0.6)_50%,_rgba(2,6,23,0.95)_100%)]"
            : "bg-[radial-gradient(ellipse_at_50%_40%,_rgba(14,165,233,0.06)_0%,_rgba(15,23,42,0.4)_60%,_rgba(2,6,23,0.95)_100%)]"
        }`}
      />

      <SnowfallBackground />
      {showConfetti && <Confetti />}

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-cyan-950/90 border border-cyan-400/50 backdrop-blur-xl px-5 py-2.5 rounded-full text-xs font-bold text-cyan-200 shadow-[0_0_25px_rgba(34,211,238,0.4)] flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────────────────────
          TOP CYBER HEADER BAR
      ───────────────────────────────────────────────────────────────────────────── */}
      <header className="h-14 border-b border-cyan-500/25 flex items-center justify-between px-6 bg-slate-950/85 backdrop-blur-xl z-30 select-none relative shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        {/* Subtle Top Glowing Line */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

        {/* Left Logo + Tactical Coordinates */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_12px_#22d3ee]" />
              <div className="absolute inset-0 rounded-full border border-cyan-400 animate-ping opacity-60" />
            </div>
            <span className="font-extrabold text-xl tracking-[0.35em] text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)] font-mono">
              S N O W
            </span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/30 text-cyan-300">
              MK-V
            </span>
          </div>

          <div className="h-4 w-[1px] bg-cyan-500/20" />

          <div className="hidden lg:flex items-center gap-2 text-[10px] font-mono text-slate-400">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>Madurai, India · 09°55'N 78°07'E</span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[10px] text-emerald-300 font-mono font-semibold">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>SECURE</span>
          </div>
        </div>

        {/* Center Digital Clock, Date & Dynamic Cognitive Mode Pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-slate-900/90 border border-cyan-500/25 px-4 py-1 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.12)]">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-sm font-bold tracking-wider text-cyan-100">{currentDateTime.time}</span>
            <span className="text-cyan-500/40 font-mono text-xs">|</span>
            <span className="text-xs text-slate-300 font-medium">{currentDateTime.date}</span>
          </div>

          {/* Cognitive State Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl border text-[10px] font-mono font-bold tracking-wider transition-colors duration-500 backdrop-blur-md">
            {isLoading ? (
              <span className="flex items-center gap-1.5 text-cyan-300 border-cyan-500/40 bg-cyan-500/15">
                <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />
                <span>THINKING...</span>
              </span>
            ) : isListening ? (
              <span className="flex items-center gap-1.5 text-rose-300 border-rose-500/40 bg-rose-500/15">
                <Radio className="w-3 h-3 text-rose-400 animate-pulse" />
                <span>LISTENING...</span>
              </span>
            ) : isSpeaking ? (
              <span className="flex items-center gap-1.5 text-emerald-300 border-emerald-500/40 bg-emerald-500/15">
                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>SPEAKING...</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-400 border-slate-700/40 bg-slate-900/60">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
                <span>READY</span>
              </span>
            )}
          </div>
        </div>

        {/* Right Info Badges */}
        <div className="flex items-center gap-3">
          {/* Audio Mic State Pill */}
          <div
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-mono font-bold ${
              isMuted
                ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
            }`}
          >
            {isMuted ? <VolumeX className="w-3 h-3 text-amber-400" /> : <Volume2 className="w-3 h-3 text-cyan-400" />}
            <span>{isMuted ? "MUTED" : "VOICE ON"}</span>
          </div>

          {/* Quick Weather Badge */}
          {(() => {
            const wxVisual = getWeatherVisual(liveWeather.condition, liveWeather.isDay, liveWeather.windSpeedKm);
            return (
              <div className="flex items-center gap-2 bg-slate-900/80 border border-cyan-500/20 px-3 py-1 rounded-xl text-xs">
                {wxVisual.smallIcon}
                <span className="font-bold text-white">{liveWeather.temp}</span>
                <span className="text-slate-400 text-[11px] hidden sm:inline">{liveWeather.location.split(",")[0]}</span>
              </div>
            );
          })()}

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl border border-cyan-500/30 bg-slate-900/80 hover:bg-cyan-500/15 text-cyan-400 hover:text-cyan-300 transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.1)] hover:shadow-[0_0_15px_rgba(6,182,212,0.25)]"
            title="Settings & System Configuration"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute top-16 right-6 z-50 w-80 p-5 rounded-2xl bg-slate-900/95 border border-cyan-500/30 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] text-xs space-y-4"
          >
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
              <span className="font-bold text-cyan-300 uppercase tracking-widest text-[11px] flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-cyan-400" /> SNOW Configuration
              </span>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-bold block mb-1">Target Intelligence Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-slate-950 border border-cyan-500/30 rounded-lg p-2 text-cyan-200 outline-none focus:border-cyan-400"
                >
                  <option value="gemini-flash-latest">Gemini Flash Latest (Active Core)</option>
                  <option value="gemini-3.6-flash">Gemini 3.6 Flash (Ultra Fast)</option>
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash (Reliable)</option>
                  <option value="ollama">Ollama Local Engine (Offline)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase font-bold block mb-1">Weather Location Override</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter city..."
                    onKeyDown={(e) => { if (e.key === "Enter") fetchLiveWeather((e.target as HTMLInputElement).value); }}
                    className="flex-1 bg-slate-950 border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-white outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-cyan-500/20 flex justify-between items-center text-slate-400">
                <span>RAG Chunks Indexed:</span>
                <span className="text-cyan-300 font-mono font-bold">{brainStatus.ragStats?.total || 42}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────────────────────
          MAIN VIEW CONTAINER (HUD)
      ───────────────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        <div className="w-full h-full grid grid-cols-12 gap-4 p-4">
            
            {/* ─────────────────────────────────────────────────────────────────────────────
                LEFT COLUMN: TACTICAL TELEMETRY & SENTINEL RADAR (3 Cols)
            ───────────────────────────────────────────────────────────────────────────── */}
            <TacticalTelemetryHUD
              cpuPct={systemLoadPct}
              ramPct={liveStats.ramPct || 36}
              ramUsed={liveStats.ramUsed || "5.5 GB"}
              ramTotal={liveStats.ramTotal || "15.3 GB"}
              diskUsage={liveStats.disk || "84.1/157.5 GB"}
              uptimeFormatted={formatUptime(uptimeSeconds)}
              commandCount={commandCount}
              weather={{
                temp: liveWeather.temp,
                condition: liveWeather.condition,
                location: liveWeather.location,
                humidity: liveWeather.humidity,
                wind: liveWeather.wind,
                feelsLike: liveWeather.feelsLike,
                visualIcon: getWeatherVisual(liveWeather.condition, liveWeather.isDay, liveWeather.windSpeedKm).smallIcon,
              }}
              workspaceFiles={workspaceFiles}
              selectedVaultPath={selectedVaultPath}
              activeFileContent={activeFileContent}
              vaultSearchQuery={fileSearchQuery}
              attachedContextFiles={attachedContextFiles}
              onSelectVaultFile={handleSelectVaultFile}
              onVaultSearchChange={setFileSearchQuery}
              onAttachFile={handleAttachFileToContext}
              onAskSnowAboutFile={handleAskSnowAboutFile}
              onIngestFileToRAG={handleIngestFileToRAG}
              onRefreshStats={() => {
                triggerToast("Tactical telemetry updated.");
                fetchLiveWeather();
                fetchBrainStatus();
              }}
            />

            {/* ─────────────────────────────────────────────────────────────────────────────
                CENTER COLUMN: HERO CORE VISUALIZER & MATRIX SNOW HUD (5 Cols)
            ───────────────────────────────────────────────────────────────────────────── */}
            <div className="col-span-5 flex flex-col items-center justify-center p-5 rounded-3xl bg-slate-900/60 border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.08)] relative overflow-hidden backdrop-blur-md">
              
              {/* Matrix Code Rain & Snowfall HUD Corner Animation Overlay */}
              <MatrixSnowHUD />

              {/* Background Holographic Grid Accent */}
              <div className="absolute inset-0 hologram-bg opacity-30 pointer-events-none" />
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent animate-pulse" />

              {/* Quantum Cognitive Core Centerpiece */}
              <div className="z-10 w-full flex flex-col items-center justify-center">
                <QuantumArcCore
                  state={isLoading ? "thinking" : isListening ? "listening" : isSpeaking ? "speaking" : "standby"}
                  cpuPct={liveStats.cpuPct || 12}
                  isMuted={isMuted}
                  micVolume={micVolume}
                />
              </div>

            </div>

            {/* ─────────────────────────────────────────────────────────────────────────────
                RIGHT COLUMN: HOLOGRAPHIC MISSION LOG & DIRECTIVE STREAM (4 Cols)
            ───────────────────────────────────────────────────────────────────────────── */}
            <HolographicMissionLog
              chatHistory={chatHistory}
              inputText={inputText}
              isLoading={isLoading}
              isListening={isListening}
              isSpeaking={isSpeaking}
              isMuted={isMuted}
              attachedContextFiles={attachedContextFiles}
              isJarvisMode={isJarvisMode}
              onToggleJarvisMode={toggleJarvisMode}
              micVolume={micVolume}
              onInputChange={setInputText}
              onSendMessage={handleSendMessage}
              onToggleListening={toggleSpeechRecognition}
              onToggleMute={() => {
                if (!isMuted) stopSnowSpeech();
                setIsMuted(!isMuted);
                triggerToast(!isMuted ? "Snow Voice Muted." : "Snow Voice Unmuted.");
              }}
              onClearHistory={() => {
                setChatHistory([]);
                clearWidgets();
                setInputText("");
              }}
              onExtractConversation={handleExtractConversation}
              onRemoveAttachment={(path) =>
                setAttachedContextFiles((prev) => prev.filter((f) => f.path !== path))
              }
              onSendFeedback={handleSendFeedback}
              renderFormattedMessage={(text) => <FormattedMessage text={text} />}
              renderWidgetContent={renderWidgetContent}
            />

          </div>
      </div>
    </div>
      </motion.div>
    </>
  );
}
