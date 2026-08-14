import React, { useState, useEffect, useRef } from "react";
import {
  Send, CloudRain, Sun, Cloud, Snowflake, MapPin,
  Newspaper, Cpu, Clock, Copy, ThumbsUp,
  ThumbsDown, Trash2, TrendingUp, Activity,
  BrainCircuit, Database, Sparkles, Code,
  Zap, RefreshCw, Camera, Mic, MicOff, Video, VideoOff,
  Power, Download, Settings, Layers, Maximize2,
  Keyboard, BarChart3, ShieldCheck, Play, Pause, X, Terminal
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import NetworkGraph from "./components/NetworkGraph";
import ChromaDBStore, { ChromaDocument } from "./components/ChromaDBStore";
import PromptCompiler from "./components/PromptCompiler";
import CodeSandbox from "./components/CodeSandbox";
import ModelStatus from "./components/ModelStatus";
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

interface WeatherData { temp: string; condition: string; location: string; humidity?: string; wind?: string; feelsLike?: string; }
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

const TypewriterText = ({ text }: { text: string }) => {
  const [displayedText, setDisplayedText] = useState("");
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      setDisplayedText(text.slice(0, i));
      i++;
      if (i > text.length) clearInterval(t);
    }, 15);
    return () => clearInterval(t);
  }, [text]);
  return <span className={displayedText.length < text.length ? "typewriter-cursor" : ""}>{displayedText}</span>;
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
          setLiveWeather({
            temp: `${cw.temperature}°C`,
            condition: cw.weathercode === 0 ? "Clear Sky" : cw.weathercode <= 3 ? "Partly Cloudy" : cw.weathercode >= 61 ? "Rainy" : "Overcast",
            location: `${l.name}${adminStr}, ${l.country || "India"}`,
            humidity: wx.hourly?.relative_humidity_2m?.[0] ? `${wx.hourly.relative_humidity_2m[0]}%` : "78%",
            wind: `${cw.windspeed} km/h`,
            feelsLike: `${(cw.temperature + 1.2).toFixed(1)}°C`
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

  // Initial greeting
  useEffect(() => {
    if (chatHistory.length === 0) {
      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      setChatHistory([
        {
          id: "welcome-1",
          sender: "snow",
          text: "Hello, I am SNOW. SNOW neural core is online. How can I assist you today sir?",
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
          prompt: rawText.trim(),
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
          <div className="flex items-center gap-2 bg-slate-900/80 border border-cyan-500/20 px-3 py-1 rounded-xl text-xs">
            <Cloud className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-white">{liveWeather.temp}</span>
            <span className="text-slate-400 text-[11px]">{liveWeather.location.split(",")[0]}</span>
          </div>

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
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.05)] space-y-3">
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                    <Cloud className="w-4 h-4 text-cyan-400" />
                    <span>Weather</span>
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
                    <div className="text-[11px] text-slate-400 capitalize">{liveWeather.condition}</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Cloud className="w-8 h-8 text-cyan-300 animate-pulse" />
                  </div>
                </div>

                {/* Weather Details */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-cyan-500/15 text-center">
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block">Humidity</span>
                    <span className="text-xs font-mono font-bold text-cyan-200">{liveWeather.humidity}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block">Wind</span>
                    <span className="text-xs font-mono font-bold text-cyan-200">{liveWeather.wind}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block">Feels Like</span>
                    <span className="text-xs font-mono font-bold text-cyan-200">{liveWeather.feelsLike}</span>
                  </div>
                </div>
              </div>

              {/* WIDGET 3: Camera */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.05)] space-y-3">
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                    <Camera className="w-4 h-4 text-cyan-400" />
                    <span>Camera</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCameraActive && (
                      <button onClick={captureSnapshot} className="text-cyan-400 hover:text-white p-1" title="Take Snapshot">
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={toggleCamera}
                      className={`p-1 rounded-lg border transition ${
                        isCameraActive ? "border-rose-500/50 bg-rose-500/20 text-rose-300" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                      }`}
                      title={isCameraActive ? "Turn Off Camera" : "Turn On Camera"}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Viewport Frame */}
                <div className="w-full h-36 rounded-xl bg-slate-950 border border-cyan-500/30 relative flex flex-col items-center justify-center overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isCameraActive ? "block" : "hidden"}`}
                  />

                  {!isCameraActive && (
                    <div className="flex flex-col items-center gap-2 text-center p-3">
                      <div className="p-3 rounded-full bg-slate-900 border border-cyan-500/20">
                        <VideoOff className="w-6 h-6 text-slate-500" />
                      </div>
                      <span className="text-xs font-semibold text-slate-400">Camera Off</span>
                      <p className="text-[10px] text-slate-500 max-w-[180px]">
                        Camera is inactive. Click the power button to start.
                      </p>
                    </div>
                  )}
                </div>

                {/* Captured Snapshots Row */}
                {snapshots.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pt-1">
                    {snapshots.map((snap, idx) => (
                      <img key={idx} src={snap} alt="snap" className="w-10 h-10 rounded-lg object-cover border border-cyan-500/30 flex-shrink-0" />
                    ))}
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
                CENTER COLUMN: HERO CORE VISUALIZER & BRANDING (5 Cols)
            ───────────────────────────────────────────────────────────────────────────── */}
            <div className="col-span-5 flex flex-col items-center justify-between p-6 rounded-3xl bg-slate-900/40 border border-cyan-500/20 shadow-[0_0_50px_rgba(6,182,212,0.05)] relative overflow-hidden">
              
              {/* Background Holographic Grid Accent */}
              <div className="absolute inset-0 hologram-bg opacity-30 pointer-events-none" />

              <div className="w-full flex justify-between items-center z-10">
                <span className="text-[10px] font-mono tracking-widest text-cyan-500/60 uppercase">NEURAL ENGINE // SNOW v3.6</span>
                <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">STATUS: OPTIMAL</span>
              </div>

              {/* Arc Reactor Center Core */}
              <div className="my-auto py-8 z-10 flex flex-col items-center gap-6">
                <SnowArcCore state={isLoading ? "thinking" : isListening ? "listening" : "standby"} />

                {/* S N O W Title */}
                <div className="flex flex-col items-center gap-2">
                  <h1 className="text-4xl font-extrabold tracking-[0.35em] text-white drop-shadow-[0_0_25px_rgba(34,211,238,0.8)] font-mono">
                    S N O W
                  </h1>

                  {/* Status Indicator Pill */}
                  <div className={`flex items-center gap-2 px-4 py-1 rounded-full border text-xs font-semibold backdrop-blur-md transition-all ${
                    isListening ? "bg-rose-500/10 border-rose-500/40 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.3)]" :
                    isLoading ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]" :
                    "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      isListening ? "bg-rose-400 animate-pulse" :
                      isLoading ? "bg-cyan-400 animate-spin" : "bg-emerald-400 animate-pulse"
                    }`} />
                    <span>
                      {isListening ? "Listening for speech..." :
                       isLoading ? "Processing query..." : "• Listening for wake word..."}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Quick Action Floating Dock */}
              <div className="flex items-center gap-4 z-10 bg-slate-950/80 border border-cyan-500/30 p-2.5 rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.15)]">
                <button
                  onClick={toggleCamera}
                  className={`p-3 rounded-xl transition cursor-pointer border ${
                    isCameraActive ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.3)]" : "bg-slate-900 border-cyan-500/20 text-slate-400 hover:text-white"
                  }`}
                  title="Toggle Camera"
                >
                  <Camera className="w-5 h-5" />
                </button>

                <button
                  onClick={toggleSpeechRecognition}
                  className={`p-4 rounded-xl transition cursor-pointer border ${
                    isListening ? "bg-rose-500/30 border-rose-400 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-pulse" : "bg-slate-900 border-cyan-500/20 text-slate-400 hover:text-white"
                  }`}
                  title="Toggle Voice Input"
                >
                  {isListening ? <Mic className="w-6 h-6 text-rose-400" /> : <Mic className="w-6 h-6 text-cyan-400" />}
                </button>

                <button
                  onClick={() => {
                    const el = document.getElementById("chat-input-field");
                    if (el) el.focus();
                  }}
                  className="p-3 rounded-xl bg-slate-900 border border-cyan-500/20 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Keyboard Focus"
                >
                  <Keyboard className="w-5 h-5" />
                </button>
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
                      {msg.sender === "snow" && msg !== chatHistory[0] ? (
                        <TypewriterText text={msg.text} />
                      ) : (
                        msg.text
                      )}

                      {msg.sender === "snow" && (
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-cyan-500/15 text-xs">
                          <span className="text-cyan-400/70 font-mono font-semibold tracking-wider text-[11px] flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-cyan-400 animate-pulse" />
                            SNOW CORE
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
                        {msg.widget.type === "weather" && (
                          <div className="p-4 rounded-2xl border border-cyan-500/30 bg-slate-950/90 text-cyan-200 text-xs">
                            <div className="font-bold border-b border-cyan-500/20 pb-1 mb-2 uppercase">{msg.widget.data.location}</div>
                            <div className="text-2xl font-bold text-white">{msg.widget.data.temp} — {msg.widget.data.condition}</div>
                          </div>
                        )}
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
              <div className="p-3.5 border-t border-cyan-500/20 bg-slate-950/95 relative">
                <div className="flex items-center gap-2 rounded-2xl bg-slate-900 border border-cyan-500/35 p-2 px-4 shadow-[inset_0_0_15px_rgba(6,182,212,0.05)] focus-within:border-cyan-400 focus-within:shadow-[0_0_25px_rgba(34,211,238,0.25)] transition-all">
                  <input
                    id="chat-input-field"
                    type="text"
                    placeholder="Ask SNOW anything..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-slate-500 focus:ring-0 font-sans"
                  />

                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputText.trim() || isLoading}
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
