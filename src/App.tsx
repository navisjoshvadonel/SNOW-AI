import React, { useState, useEffect, useRef } from "react";
import {
  Send, CloudRain, Sun, Cloud, Snowflake, MapPin,
  Newspaper, Cpu, Clock, Copy, ThumbsUp,
  ThumbsDown, Trash2, TrendingUp, Activity,
  BrainCircuit, Database, Sparkles, Code,
  Zap, RefreshCw, Camera, Mic, MicOff, Video, VideoOff,
  Power, Download, Settings, Layers, Maximize2,
  Keyboard, BarChart3, ShieldCheck, Play, Pause, X, Terminal,
  CloudLightning, CloudFog, SunMedium, Moon, Wind,
  FolderOpen, FileText, FileCode, Paperclip, Upload, FilePlus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import NetworkGraph from "./components/NetworkGraph";
import ChromaDBStore, { ChromaDocument } from "./components/ChromaDBStore";
import PromptCompiler from "./components/PromptCompiler";
import CodeSandbox from "./components/CodeSandbox";
import ModelStatus from "./components/ModelStatus";
import SnowfallBackground from "./components/SnowfallBackground";
import { MemoryNode, CodeFile } from "./types";

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

// Cyber Arc Reactor Core Visualizer with Rotating Snowflake Engine
const SnowArcCore = ({ state }: { state: "standby" | "thinking" | "listening" }) => {
  return (
    <div className="relative flex items-center justify-center w-64 h-64 select-none">
      {/* Outer Glow Ring */}
      <div className={`absolute inset-0 rounded-full blur-2xl transition-all duration-700 ${
        state === "thinking" ? "bg-cyan-500/40 scale-110" :
        state === "listening" ? "bg-rose-500/40 scale-110" : "bg-cyan-500/20 opacity-70"
      }`} />

      {/* Rotating Outer Tech Dash Ring */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: state === "thinking" ? 4 : 20, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 rounded-full border border-dashed border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
      />

      {/* Counter-Rotating Mid Tech Ring */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: state === "thinking" ? 6 : 25, repeat: Infinity, ease: "linear" }}
        className="absolute inset-3 rounded-full border border-cyan-400/20 border-t-cyan-400/80 border-b-cyan-400/80"
      />

      {/* Radar Sweep Circle */}
      <div className="absolute inset-6 rounded-full border border-cyan-500/15 overflow-hidden">
        <div className="w-full h-full radar-sweep opacity-40" />
      </div>

      {/* Listening Pulse Rings */}
      {state === "listening" && (
        <>
          <div className="absolute inset-0 border border-rose-500/50 rounded-full animate-ping [animation-duration:1.8s]" />
          <div className="absolute inset-4 border border-rose-500/30 rounded-full animate-ping [animation-duration:1.8s] [animation-delay:0.4s]" />
        </>
      )}

      {/* Thinking Pulse Rings */}
      {state === "thinking" && (
        <>
          <div className="absolute inset-0 border border-cyan-400/50 rounded-full animate-ping [animation-duration:2s]" />
          <div className="absolute inset-4 border border-cyan-400/30 rounded-full animate-ping [animation-duration:2s] [animation-delay:0.5s]" />
        </>
      )}

      {/* Inner Glowing Reactor Rings */}
      <div className="relative w-44 h-44 rounded-full bg-gradient-to-b from-cyan-950/90 to-slate-950 border border-cyan-500/50 flex items-center justify-center shadow-[inset_0_0_35px_rgba(6,182,212,0.4)] overflow-hidden">
        
        {/* 3D Holographic Rotating Snowflake Visualizer */}
        <div className="relative w-36 h-36 flex items-center justify-center pointer-events-none">
          <motion.div
            animate={{
              rotateY: 360,
              rotateZ: state === "thinking" ? [0, 180, 360] : [0, 15, -15, 0],
              scale: state === "thinking" ? [0.95, 1.08, 0.95] : state === "listening" ? [1, 1.1, 1] : 1
            }}
            transition={{
              rotateY: { duration: state === "thinking" ? 4 : 8, repeat: Infinity, ease: "linear" },
              rotateZ: { duration: state === "thinking" ? 3 : 10, repeat: Infinity, ease: "easeInOut" },
              scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
            }}
            className="relative flex items-center justify-center w-full h-full"
          >
            {/* Primary Glowing Snowflake */}
            <Snowflake
              className={`w-20 h-20 transition-all duration-500 ${
                state === "listening" ? "text-rose-400 drop-shadow-[0_0_25px_rgba(244,63,94,0.9)]" :
                state === "thinking" ? "text-cyan-200 drop-shadow-[0_0_30px_rgba(34,211,238,0.95)] scale-110" :
                "text-cyan-300 drop-shadow-[0_0_20px_rgba(34,211,238,0.7)]"
              }`}
            />

            {/* Layer 2: Counter-Rotated Crystal Snowflake */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              className="absolute"
            >
              <Snowflake
                className={`w-24 h-24 opacity-60 transition-colors duration-500 ${
                  state === "listening" ? "text-rose-300 drop-shadow-[0_0_15px_rgba(251,113,133,0.6)]" :
                  "text-blue-300 drop-shadow-[0_0_15px_rgba(147,197,253,0.6)]"
                }`}
              />
            </motion.div>

            {/* Layer 3: Outer Geometric Sparkle Ring */}
            <motion.div
              animate={{ rotate: 360, scale: [0.9, 1.05, 0.9] }}
              transition={{
                rotate: { duration: 16, repeat: Infinity, ease: "linear" },
                scale: { duration: 3, repeat: Infinity, ease: "easeInOut" }
              }}
              className="absolute"
            >
              <Sparkles
                className={`w-28 h-28 opacity-40 ${
                  state === "listening" ? "text-rose-400" : "text-cyan-400"
                }`}
              />
            </motion.div>
          </motion.div>

          {/* Central Waveform Overlay */}
          <div className="absolute inset-0 flex items-center justify-center gap-1 z-20 pointer-events-none opacity-80">
            {[...Array(7)].map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  height: state === "thinking" ? [4, 20, 4] :
                          state === "listening" ? [6, 26, 6] : [4, 12, 4]
                }}
                transition={{
                  duration: 0.6 + (i % 3) * 0.15,
                  repeat: Infinity,
                  repeatType: "reverse",
                  delay: i * 0.05
                }}
                className={`w-1 rounded-full ${
                  state === "listening" ? "bg-rose-200 shadow-[0_0_8px_#fecdd3]" :
                  state === "thinking" ? "bg-white shadow-[0_0_8px_#ffffff]" : "bg-cyan-100/90 shadow-[0_0_6px_#cff4fc]"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Central Core Glowing Overlay */}
        <div className="absolute inset-4 rounded-full border border-cyan-400/20 bg-cyan-500/5 pointer-events-none" />
      </div>
    </div>
  );
};

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
  const [showConfetti, setShowConfetti] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.0-flash");
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
  const recognitionRef = useRef<any>(null);

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

  // Initial formal time-aware greeting for NJ
  useEffect(() => {
    if (chatHistory.length === 0) {
      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      const hour = new Date().getHours();
      let timeGreeting = "Good morning, NJ.";
      if (hour >= 12 && hour < 17) {
        timeGreeting = "Good afternoon, NJ.";
      } else if (hour >= 17 && hour < 22) {
        timeGreeting = "Good evening, NJ.";
      } else if (hour >= 22 || hour < 5) {
        timeGreeting = "Good evening, NJ.";
      }

      setChatHistory([
        {
          id: "welcome-1",
          sender: "snow",
          text: `${timeGreeting} I am at your service. How may I assist you today?`,
          timestamp: now
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

  // Web Speech API Voice Recognition Toggle
  const toggleSpeechRecognition = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        triggerToast("Web Speech Recognition is not supported in this browser.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        triggerToast("Listening for speech input...");
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join("");
        setInputText(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

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

    let promptForBackend = rawText.trim();
    if (attachedContextFiles.length > 0) {
      const attachmentBlock = attachedContextFiles
        .map(f => `--- ATTACHED FILE: ${f.name} (${f.path}) ---\n${f.content.slice(0, 15000)}\n--- END OF ATTACHED FILE ---`)
        .join("\n\n");
      promptForBackend = `${attachmentBlock}\n\nUSER QUERY: ${rawText.trim()}`;
      setAttachedContextFiles([]);
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptForBackend,
          model: selectedModel,
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
    } catch (err: any) {
      console.error(err);
      const isOffline = err instanceof TypeError && (err.message === "Failed to fetch" || err.message.includes("NetworkError"));
      const friendlyMsg = isOffline
        ? "SNOW backend is offline. Some features may be limited. How can I assist you today sir?"
        : err.message || "Encountered a processing anomaly.";
      
      const errTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      setChatHistory((prev) => [...prev, { id: `err-${Date.now()}`, sender: "snow", text: friendlyMsg, timestamp: errTime }]);
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <div className={`w-full h-screen flex flex-col transition-colors duration-1000 bg-weather-${weatherState} overflow-hidden font-sans text-white relative bg-slate-950`}>
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
      <header className="h-14 border-b border-cyan-500/20 flex items-center justify-between px-6 bg-slate-950/80 backdrop-blur-md z-30 select-none">
        {/* Left Logo + Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_12px_#34d399]" />
              <div className="absolute inset-0 rounded-full border border-emerald-400 animate-ping opacity-75" />
            </div>
            <span className="font-extrabold text-xl tracking-[0.3em] text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.7)] font-mono">
              S N O W
            </span>
          </div>

          <div className="h-4 w-[1px] bg-cyan-500/20" />

          <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-0.5 rounded-full text-[11px] text-cyan-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Online</span>
          </div>
        </div>

        {/* Center Digital Clock & Date */}
        <div className="flex items-center gap-3 bg-slate-900/90 border border-cyan-500/20 px-5 py-1 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.1)]">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="font-mono text-sm font-bold tracking-wider text-cyan-100">{currentDateTime.time}</span>
          <span className="text-cyan-500/40">|</span>
          <span className="text-xs text-slate-300 font-medium">{currentDateTime.date}</span>
        </div>

        {/* Right Info Badges & Navigation Tabs */}
        <div className="flex items-center gap-3">
          {/* Quick Weather Badge */}
          {(() => {
            const wxVisual = getWeatherVisual(liveWeather.condition, liveWeather.isDay, liveWeather.windSpeedKm);
            return (
              <div className="flex items-center gap-2 bg-slate-900/80 border border-cyan-500/20 px-3 py-1 rounded-xl text-xs">
                {wxVisual.smallIcon}
                <span className="font-bold text-white">{liveWeather.temp}</span>
                <span className="text-slate-400 text-[11px]">{liveWeather.location.split(",")[0]}</span>
              </div>
            );
          })()}

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl border border-cyan-500/20 bg-slate-900/80 hover:bg-cyan-500/10 text-cyan-400 transition cursor-pointer"
            title="Settings"
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
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fast & Smart)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep Logic)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Lightweight)</option>
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
          MAIN VIEW CONTAINER (HUD OR OTHER TABS)
      ───────────────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === "graph" && (
          <div className="w-full h-full p-4">
            <NetworkGraph
              memories={memories}
              onAddMemory={handleAddMemory}
              onDeleteMemory={handleDeleteMemory}
              onClearMemories={handleClearMemories}
            />
          </div>
        )}
        {activeTab === "vector" && (
          <div className="w-full h-full p-4">
            <ChromaDBStore
              documents={vectorDocs}
              onAddDocument={handleAddVectorDoc}
              onRemoveDocument={handleRemoveVectorDoc}
              onClearDocuments={() => setVectorDocs([])}
            />
          </div>
        )}
        {activeTab === "compiler" && (
          <div className="w-full h-full p-4">
            <PromptCompiler
              mode={compilerMode}
              onChangeMode={setCompilerMode}
              memories={memories}
              modelSelected={selectedModel}
            />
          </div>
        )}
        {activeTab === "sandbox" && (
          <div className="w-full h-full p-4">
            <CodeSandbox
              files={sandboxFiles}
              onUpdateFile={(name, code) => {
                setSandboxFiles(prev => prev.map(f => f.name === name ? { ...f, code } : f));
              }}
              onSendToSnow={(fileName, fileContent) => {
                setActiveTab("hud");
                handleSendMessage(`Please help me debug ${fileName}:\n\n\`\`\`javascript\n${fileContent}\n\`\`\``);
              }}
            />
          </div>
        )}
        {activeTab === "models" && (
          <div className="w-full h-full p-4">
            <ModelStatus modelSelected={selectedModel} onChangeModel={setSelectedModel} />
          </div>
        )}

        {activeTab === "hud" && (
          <div className="w-full h-full grid grid-cols-12 gap-4 p-4">
            
            {/* ─────────────────────────────────────────────────────────────────────────────
                LEFT COLUMN: WIDGET PANELS (4 Cols)
            ───────────────────────────────────────────────────────────────────────────── */}
            <div className="col-span-3 flex flex-col gap-3.5 overflow-y-auto pr-1">
              
              {/* WIDGET 1: System Stats */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.05)] space-y-3">
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>System Stats</span>
                  </div>
                  <button onClick={() => triggerToast("System stats updated.")} className="text-cyan-400/60 hover:text-cyan-300 transition">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Progress Bar 1: CPU */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">CPU Usage</span>
                    <span className="font-mono text-cyan-300 font-bold">{liveStats.cpu}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-950 border border-cyan-500/20 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 transition-all duration-1000 shadow-[0_0_8px_#22d3ee]"
                      style={{ width: `${systemLoadPct}%` }}
                    />
                  </div>
                </div>

                {/* Progress Bar 2: RAM */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">RAM Usage</span>
                    <span className="font-mono text-cyan-300 font-bold">{liveStats.ram.split("/")[0]}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-950 border border-cyan-500/20 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 transition-all duration-1000 shadow-[0_0_8px_#60a5fa]"
                      style={{ width: `${liveStats.ramPct || 36}%` }}
                    />
                  </div>
                </div>

                {/* 3 Metric Mini Cards */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="p-2 rounded-xl bg-slate-950/70 border border-cyan-500/15 text-center">
                    <span className="text-[9px] text-slate-400 uppercase font-bold block">CPU</span>
                    <span className="text-xs font-mono font-bold text-cyan-300">{liveStats.cpu}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/70 border border-cyan-500/15 text-center">
                    <span className="text-[9px] text-slate-400 uppercase font-bold block">Memory</span>
                    <span className="text-xs font-mono font-bold text-cyan-300">{liveStats.ramPct || 36}%</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/70 border border-cyan-500/15 text-center">
                    <span className="text-[9px] text-slate-400 uppercase font-bold block">Disk</span>
                    <span className="text-[10px] font-mono font-bold text-cyan-300">{liveStats.disk || "69.3/157.5 GB"}</span>
                  </div>
                </div>
              </div>

              {/* WIDGET 2: Weather */}
              {(() => {
                const wxVisual = getWeatherVisual(liveWeather.condition, liveWeather.isDay, liveWeather.windSpeedKm);
                return (
                  <div className={`p-4 rounded-2xl ${wxVisual.bgGradient} space-y-3 transition-all duration-700`}>
                    <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                      <div className={`flex items-center gap-2 font-bold text-xs uppercase tracking-wider ${wxVisual.accentText}`}>
                        {wxVisual.smallIcon}
                        <span>Weather</span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-extrabold ${wxVisual.badgeColor} border`}>
                          {wxVisual.tag}
                        </span>
                      </div>
                      <button onClick={() => fetchLiveWeather()} className="text-cyan-400/60 hover:text-cyan-300 transition">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <div>
                        <div className="text-3xl font-extrabold text-white tracking-tight font-mono drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                          {liveWeather.temp}
                        </div>
                        <div className="text-xs font-medium text-cyan-200 mt-0.5">{liveWeather.location}</div>
                        <div className={`text-[11px] font-bold capitalize mt-0.5 ${wxVisual.accentText}`}>{liveWeather.condition}</div>
                      </div>

                      <div className={`p-3.5 rounded-2xl ${wxVisual.badgeColor} border flex items-center justify-center shadow-lg`}>
                        {wxVisual.icon}
                      </div>
                    </div>

                    {/* Weather Details */}
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-cyan-500/15 text-center">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">Humidity</span>
                        <span className="text-xs font-mono font-bold text-cyan-200">{liveWeather.humidity}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">Wind</span>
                        <span className="text-xs font-mono font-bold text-cyan-200">{liveWeather.wind}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block font-semibold">Feels Like</span>
                        <span className="text-xs font-mono font-bold text-cyan-200">{liveWeather.feelsLike}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* WIDGET 3: File Vault & AI Context Explorer */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.05)] space-y-3">
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                    <FolderOpen className="w-4 h-4 text-cyan-400" />
                    <span>Workspace Vault</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="widget-file-upload" className="text-cyan-400/70 hover:text-cyan-300 transition cursor-pointer p-1" title="Upload Local File">
                      <Upload className="w-3.5 h-3.5" />
                      <input id="widget-file-upload" type="file" onChange={handleCustomFileUpload} className="hidden" />
                    </label>
                    <button onClick={fetchWorkspaceFiles} className="text-cyan-400/70 hover:text-cyan-300 transition p-1" title="Refresh Workspace Files">
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Search Bar & File Selector */}
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Search files (e.g. App.tsx)..."
                    value={fileSearchQuery}
                    onChange={(e) => setFileSearchQuery(e.target.value)}
                    className="w-full bg-slate-950/80 border border-cyan-500/20 rounded-xl px-3 py-1 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400 transition"
                  />

                  {/* Scrollable File List */}
                  <div className="h-28 overflow-y-auto space-y-1 pr-1 font-mono text-[11px] scrollbar-none">
                    {workspaceFiles
                      .filter(f => f.name.toLowerCase().includes(fileSearchQuery.toLowerCase()) || f.path.toLowerCase().includes(fileSearchQuery.toLowerCase()))
                      .map((file) => {
                        const isSelected = selectedVaultPath === file.path;
                        const isAttached = attachedContextFiles.some(af => af.path === file.path);
                        return (
                          <div
                            key={file.path}
                            onClick={() => handleSelectVaultFile(file.path)}
                            className={`flex items-center justify-between p-1.5 rounded-lg border transition cursor-pointer ${
                              isSelected
                                ? "bg-cyan-950/80 border-cyan-500/50 text-cyan-200"
                                : "bg-slate-950/40 border-cyan-500/10 hover:bg-slate-900 text-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <FileCode className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                              <span className="truncate">{file.name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-900 text-cyan-400/70 border border-cyan-500/20 font-sans font-bold">
                                {file.ext}
                              </span>
                              {isAttached && <Paperclip className="w-3 h-3 text-cyan-400" />}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Selected File Action Panel */}
                {selectedVaultPath && (
                  <div className="pt-2 border-t border-cyan-500/15 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-cyan-300 font-bold truncate max-w-[150px]">{selectedVaultPath.split('/').pop()}</span>
                      <span className="text-[10px] text-slate-400">{activeFileContent.length} chars</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => handleAttachFileToContext(selectedVaultPath.split('/').pop() || selectedVaultPath, selectedVaultPath, activeFileContent)}
                        className="p-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                        title="Attach file to prompt context"
                      >
                        <Paperclip className="w-3 h-3" />
                        <span>Attach</span>
                      </button>

                      <button
                        onClick={() => handleAskSnowAboutFile(selectedVaultPath.split('/').pop() || selectedVaultPath, selectedVaultPath, activeFileContent)}
                        className="p-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                        title="Ask Snow for code suggestions & audit"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Suggest</span>
                      </button>

                      <button
                        onClick={() => handleIngestFileToRAG(selectedVaultPath, activeFileContent)}
                        className="p-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                        title="Index into RAG vector memory"
                      >
                        <Database className="w-3 h-3" />
                        <span>RAG</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* WIDGET 4: System Uptime */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.05)] space-y-3">
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span>System Uptime</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-cyan-300">{formatUptime(uptimeSeconds)}</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">System Running For:</span>
                    <span className="font-mono font-bold text-white">{formatUptime(uptimeSeconds)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="p-2 rounded-xl bg-slate-950 border border-cyan-500/15 text-center">
                      <span className="text-[9px] text-slate-400 uppercase block">Session</span>
                      <span className="text-xs font-bold text-cyan-300">1</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950 border border-cyan-500/15 text-center">
                      <span className="text-[9px] text-slate-400 uppercase block">Commands</span>
                      <span className="text-xs font-bold text-cyan-300">{commandCount}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-cyan-500/15">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">System Load</span>
                      <span className="text-cyan-400 font-bold font-mono">{liveStats.loadAvg || `Optimal ${systemLoadPct}%`}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-950 border border-cyan-500/20 overflow-hidden">
                      <div className="h-full bg-cyan-400 transition-all duration-700" style={{ width: `${systemLoadPct}%` }} />
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* ─────────────────────────────────────────────────────────────────────────────
                CENTER COLUMN: HERO CORE VISUALIZER & EXECUTIVE DASHBOARD (5 Cols)
            ───────────────────────────────────────────────────────────────────────────── */}
            <div className="col-span-5 flex flex-col justify-between p-5 rounded-3xl bg-slate-900/60 border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.08)] relative overflow-hidden backdrop-blur-md">
              
              {/* Background Holographic Grid Accent */}
              <div className="absolute inset-0 hologram-bg opacity-30 pointer-events-none" />
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent animate-pulse" />

              {/* Top Bar Status Header */}
              <div className="w-full flex justify-between items-center z-10 border-b border-cyan-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                  <span className="text-xs font-mono font-bold tracking-widest text-cyan-200 uppercase">
                    SNOW INTELLIGENCE SYSTEM
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-semibold text-cyan-400 bg-cyan-950/80 px-2.5 py-1 rounded-full border border-cyan-500/40 shadow-sm">
                    {selectedModel.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                    LVL {brainStatus?.brainState?.level || 9}
                  </span>
                </div>
              </div>

              {/* Arc Reactor Center Core */}
              <div className="my-auto py-3 z-10 flex flex-col items-center gap-3">
                <SnowArcCore state={isLoading ? "thinking" : isListening ? "listening" : "standby"} />

                {/* S N O W Title */}
                <div className="flex flex-col items-center gap-1.5">
                  <h1 className="text-4xl font-black tracking-[0.4em] text-white drop-shadow-[0_0_30px_rgba(34,211,238,0.9)] font-mono">
                    S N O W
                  </h1>
                  <span className="text-[11px] font-mono tracking-widest text-cyan-400/70 font-semibold uppercase">
                    Personal Executive Assistant
                  </span>

                  {/* Status Indicator Pill */}
                  <div className={`flex items-center gap-2 px-4 py-1 mt-1 rounded-full border text-xs font-semibold backdrop-blur-md transition-all ${
                    isListening ? "bg-rose-500/10 border-rose-500/40 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.3)]" :
                    isLoading ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]" :
                    "bg-cyan-950/80 border-cyan-500/30 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      isListening ? "bg-rose-400 animate-pulse" :
                      isLoading ? "bg-cyan-400 animate-spin" : "bg-emerald-400 animate-pulse"
                    }`} />
                    <span>
                      {isListening ? "Listening for speech..." :
                       isLoading ? "Processing directive..." : "Ready for directive"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Executive Quick Command Cards Grid */}
              <div className="grid grid-cols-2 gap-2.5 z-10 my-2">
                <button
                  onClick={() => handleSendMessage("NJ requested daily executive briefing on system metrics, weather, and active tasks.")}
                  className="p-3 rounded-2xl bg-slate-950/80 hover:bg-cyan-950/60 border border-cyan-500/25 hover:border-cyan-400/60 text-left transition-all group shadow-md cursor-pointer flex items-start gap-3"
                >
                  <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 group-hover:bg-cyan-400 group-hover:text-slate-950 transition">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition">Executive Briefing</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">Summarize status, weather & tasks</div>
                  </div>
                </button>

                <button
                  onClick={() => handleSendMessage("Perform an immediate code audit on active workspace files and point out optimizations.")}
                  className="p-3 rounded-2xl bg-slate-950/80 hover:bg-cyan-950/60 border border-cyan-500/25 hover:border-cyan-400/60 text-left transition-all group shadow-md cursor-pointer flex items-start gap-3"
                >
                  <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 group-hover:bg-cyan-400 group-hover:text-slate-950 transition">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition">Codebase Audit</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">Review & optimize project files</div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab("sandbox")}
                  className="p-3 rounded-2xl bg-slate-950/80 hover:bg-cyan-950/60 border border-cyan-500/25 hover:border-cyan-400/60 text-left transition-all group shadow-md cursor-pointer flex items-start gap-3"
                >
                  <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 group-hover:bg-cyan-400 group-hover:text-slate-950 transition">
                    <Terminal className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition">Python Sandbox</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">Execute code in isolated sandbox</div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab("vector")}
                  className="p-3 rounded-2xl bg-slate-950/80 hover:bg-cyan-950/60 border border-cyan-500/25 hover:border-cyan-400/60 text-left transition-all group shadow-md cursor-pointer flex items-start gap-3"
                >
                  <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 group-hover:bg-cyan-400 group-hover:text-slate-950 transition">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition">Vector RAG Memory</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">Inspect 20+ indexed memory chunks</div>
                  </div>
                </button>
              </div>

              {/* Bottom Live System Telemetry Bar */}
              <div className="w-full grid grid-cols-3 gap-2 pt-3 border-t border-cyan-500/20 z-10 text-[11px] font-mono">
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950/80 border border-cyan-500/20 text-cyan-300">
                  <span className="text-slate-400 flex items-center gap-1"><Cpu className="w-3 h-3 text-cyan-400" /> CPU</span>
                  <span className="font-bold">{systemLoadPct}%</span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950/80 border border-cyan-500/20 text-cyan-300">
                  <span className="text-slate-400 flex items-center gap-1"><Database className="w-3 h-3 text-cyan-400" /> RAG</span>
                  <span className="font-bold">{vectorDocs.length || 20} Chunks</span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950/80 border border-cyan-500/20 text-emerald-400">
                  <span className="text-slate-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-400" /> STATUS</span>
                  <span className="font-bold">OPTIMAL</span>
                </div>
              </div>

            </div>

            {/* ─────────────────────────────────────────────────────────────────────────────
                RIGHT COLUMN: CONVERSATION PANEL (4 Cols)
            ───────────────────────────────────────────────────────────────────────────── */}
            <div className="col-span-4 flex flex-col rounded-3xl bg-slate-900/80 border border-cyan-500/30 shadow-[0_0_35px_rgba(6,182,212,0.1)] overflow-hidden relative group">
              
              {/* Top Cyber Animated Glow Accent Line */}
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse" />

              {/* Conversation Top Header */}
              <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-slate-950/80 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                  </span>
                  <span className="font-extrabold text-sm text-cyan-200 tracking-wider uppercase font-mono">Conversation Log</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setChatHistory([]); clearWidgets(); setInputText(""); }}
                    className="px-3 py-1.5 rounded-xl border border-cyan-500/20 bg-slate-900 text-xs font-semibold text-slate-300 hover:text-white hover:border-cyan-400/40 transition cursor-pointer"
                  >
                    Clear
                  </button>

                  <button
                    onClick={handleExtractConversation}
                    className="px-3 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Extract</span>
                  </button>
                </div>
              </div>

              {/* Chat Message Scrollable Feed */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans scrollbar-none">
                {chatHistory.map((msg) => (
                  <div key={msg.id} className={`w-full flex flex-col gap-1.5 ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                    <div className="text-xs text-slate-400 px-1 font-mono flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${msg.sender === "user" ? "bg-cyan-400" : "bg-emerald-400"}`} />
                      <span>{msg.timestamp}</span>
                    </div>

                    <motion.div
                      initial={{ opacity: 0, y: 15, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className={`max-w-[90%] p-4 rounded-2xl leading-relaxed text-sm shadow-xl backdrop-blur-md relative transition-all duration-300 ${
                        msg.sender === "user"
                          ? "bg-gradient-to-br from-cyan-950/80 to-slate-900/90 border border-cyan-500/40 text-cyan-50 rounded-tr-none shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:border-cyan-400"
                          : "bg-slate-950/90 border border-cyan-500/25 text-slate-100 rounded-tl-none shadow-[0_0_20px_rgba(0,0,0,0.5)] hover:border-cyan-500/40"
                      }`}
                    >
                      {msg.sender === "snow" ? (
                        <TypewriterText text={msg.text} />
                      ) : (
                        <FormattedMessage text={msg.text} />
                      )}

                      {msg.sender === "snow" && (
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-cyan-500/15 text-xs">
                          <span className="text-cyan-400/70 font-mono font-semibold tracking-wider text-[11px] flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-cyan-400 animate-pulse" />
                            SNOW
                          </span>
                          <div className="flex gap-2.5">
                            <button onClick={() => navigator.clipboard.writeText(msg.text)} className="text-slate-400 hover:text-cyan-300 transition" title="Copy">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleSendFeedback(msg.id, "thumbs_up")} className={`hover:text-emerald-400 transition ${msg.feedbackGiven === "thumbs_up" ? "text-emerald-400 font-bold" : "text-slate-400"}`} title="Thumbs Up">
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleSendFeedback(msg.id, "thumbs_down")} className={`hover:text-rose-400 transition ${msg.feedbackGiven === "thumbs_down" ? "text-rose-400 font-bold" : "text-slate-400"}`} title="Thumbs Down">
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>

                    {/* Render Rich Widgets inside conversation */}
                    {msg.widget && (
                      <div className="w-full max-w-[90%] mt-1">
                        {msg.widget.type === "weather" && (() => {
                          const isDay = msg.widget.data.isDay !== undefined ? msg.widget.data.isDay : true;
                          const windSpeed = msg.widget.data.windSpeedKm || 0;
                          const visual = getWeatherVisual(msg.widget.data.condition || "Clear", isDay, windSpeed);
                          return (
                            <div className={`p-4 rounded-2xl border ${visual.bgGradient} text-cyan-200 text-xs shadow-lg`}>
                              <div className="flex justify-between items-center border-b border-cyan-500/20 pb-1.5 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold uppercase tracking-wider text-slate-300">{msg.widget.data.location}</span>
                                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-extrabold ${visual.badgeColor} border`}>{visual.tag}</span>
                                </div>
                                {visual.smallIcon}
                              </div>
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-2xl font-bold text-white font-mono">{msg.widget.data.temp}</div>
                                  <div className={`text-xs capitalize font-semibold ${visual.accentText}`}>{msg.widget.data.condition}</div>
                                </div>
                                <div className={`p-2.5 rounded-xl ${visual.badgeColor} border`}>
                                  {visual.icon}
                                </div>
                              </div>
                              {(msg.widget.data.humidity || msg.widget.data.wind) && (
                                <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-cyan-500/15 text-[11px]">
                                  {msg.widget.data.humidity && <div><span className="text-slate-400">Humidity:</span> <span className="font-mono font-bold text-white">{msg.widget.data.humidity}</span></div>}
                                  {msg.widget.data.wind && <div><span className="text-slate-400">Wind:</span> <span className="font-mono font-bold text-white">{msg.widget.data.wind}</span></div>}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {msg.widget.type === "stock" && (
                          <div className="p-4 rounded-2xl border border-emerald-500/30 bg-slate-950/90 text-emerald-200 text-xs">
                            <div className="font-bold border-b border-emerald-500/20 pb-1 mb-2">{msg.widget.data.symbol}</div>
                            <div className="text-2xl font-bold text-white">{msg.widget.data.price} <span className="text-xs text-emerald-400">{msg.widget.data.change}</span></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex items-center gap-2 p-3.5 rounded-xl bg-slate-950/90 border border-cyan-500/40 text-cyan-300 w-max shadow-[0_0_15px_rgba(34,211,238,0.2)] text-xs font-semibold">
                    <Cpu className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>SNOW is thinking...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Container */}
              <div className="p-3.5 border-t border-cyan-500/20 bg-slate-950/95 relative space-y-2">
                {/* Attached Context Files Bar (Gemini / Claude Style) */}
                {attachedContextFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 pb-1">
                    {attachedContextFiles.map((file) => (
                      <div key={file.path} className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-950/90 border border-cyan-400/40 text-cyan-300 text-xs shadow-md font-mono">
                        <Paperclip className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="font-semibold max-w-[140px] truncate">{file.name}</span>
                        <button
                          onClick={() => handleRemoveAttachedFile(file.path)}
                          className="text-cyan-400/60 hover:text-rose-400 transition ml-1 cursor-pointer"
                          title="Remove Attachment"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 rounded-2xl bg-slate-900 border border-cyan-500/35 p-2 px-3 shadow-[inset_0_0_15px_rgba(6,182,212,0.05)] focus-within:border-cyan-400 focus-within:shadow-[0_0_25px_rgba(34,211,238,0.25)] transition-all">
                  <label htmlFor="chat-file-attachment" className="p-1.5 text-cyan-400/70 hover:text-cyan-300 transition cursor-pointer" title="Attach Workspace / Local File">
                    <Paperclip className="w-4 h-4" />
                    <input id="chat-file-attachment" type="file" onChange={handleCustomFileUpload} className="hidden" />
                  </label>

                  <input
                    id="chat-input-field"
                    type="text"
                    placeholder={attachedContextFiles.length > 0 ? "Ask SNOW about attached files..." : "Ask SNOW anything..."}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-slate-500 focus:ring-0 font-sans"
                  />

                  <button
                    onClick={() => handleSendMessage()}
                    disabled={(!inputText.trim() && attachedContextFiles.length === 0) || isLoading}
                    className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 disabled:opacity-30 transition cursor-pointer font-bold shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
}
