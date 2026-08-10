import React, { useState, useEffect, useRef } from "react";
import {
  Mic, Send, Volume2, VolumeX, CloudRain, Sun, Cloud, Snowflake, MapPin,
  Newspaper, ExternalLink, Cpu, Radio, BookOpen, Clock, Globe, Copy, ThumbsUp,
  ThumbsDown, Trash2, Smile, Music, TrendingUp, Trophy, LayoutGrid, Activity,
  Heart, History, BrainCircuit, Database, Sparkles, Terminal, Code, CheckCircle2,
  Zap, RefreshCw, ShieldAlert, Award
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { VoiceConfigurator } from "./components/VoiceConfigurator";
import NetworkGraph from "./components/NetworkGraph";
import ChromaDBStore, { ChromaDocument } from "./components/ChromaDBStore";
import PromptCompiler from "./components/PromptCompiler";
import CodeSandbox from "./components/CodeSandbox";
import ModelStatus from "./components/ModelStatus";
import { MemoryNode, CodeFile } from "./types";

type WeatherType = "default" | "sunny" | "rain" | "cloudy" | "snow" | "storm";
type ActiveTab = "hud" | "graph" | "vector" | "compiler" | "sandbox" | "training" | "models";

interface ChatItem {
  id: string;
  sender: "user" | "snow";
  text: string;
  widget?: {
    type: "weather" | "news" | "stock" | "sport" | "time" | "music" | "system";
    data: any;
  };
  toolActivity?: string[];
  userPrompt?: string; // stored for feedback reference
  feedbackGiven?: "thumbs_up" | "thumbs_down";
}

interface WeatherData { temp: string; condition: string; location: string; humidity?: string; wind?: string; }
interface NewsData { headline: string; source: string; category?: string; }
interface StockData { symbol: string; price: string; change: string; up: boolean; }
interface SportData { team1: string; score1: string; team2: string; score2: string; sport: string; }
interface TimeData { time: string; timezone: string; location: string; date: string; }
interface MusicData { title: string; artist: string; genre: string; }
interface SystemData { cpu: string; ram: string; temp: string; status: string; }

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

const SnowflakeCore = ({ state }: { state: "standby" | "thinking" | "listening" | "speaking" }) => {
  const className = `w-44 h-44 transition-all duration-700 ${state === "listening" ? "snow-core-listening" : state === "thinking" ? "snow-core-thinking" : "snow-core-standby"}`;
  return (
    <div className="relative flex items-center justify-center w-56 h-56">
      {state === "speaking" && <div className="ripple-ring inset-0 absolute" />}
      <div className="absolute inset-0 rounded-full border border-white/5 animate-pulse" />
      <div className="absolute inset-4 rounded-full border border-cyan-500/10 animate-spin [animation-duration:20s]" />
      <div className="absolute inset-8 rounded-full border border-dashed border-white/10 animate-spin [animation-duration:15s] [animation-direction:reverse]" />
      <div className={`absolute inset-12 rounded-full blur-3xl transition-all duration-700 ${state === "listening" ? "bg-rose-500/30 scale-125" : state === "thinking" ? "bg-cyan-500/40 scale-110" : "bg-cyan-500/15"}`} />
      
      {(state === "listening" || state === "thinking" || state === "speaking") && (
        <>
          <div className="absolute inset-0 border border-cyan-500/20 rounded-full animate-ping [animation-duration:2.5s]" />
          <div className="absolute inset-4 border border-cyan-500/15 rounded-full animate-ping [animation-duration:2.5s] [animation-delay:0.6s]" />
          <div className="absolute inset-8 border border-cyan-500/10 rounded-full animate-ping [animation-duration:2.5s] [animation-delay:1.2s]" />
        </>
      )}

      <svg viewBox="0 0 100 100" className={className} id="snow-core">
        <path d="M 50 10 L 50 90 M 10 50 L 90 50 M 21.7 21.7 L 78.3 78.3 M 21.7 78.3 L 78.3 21.7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M 50 22 L 40 32 M 50 22 L 60 32 M 50 78 L 40 68 M 50 78 L 60 68 M 22 50 L 32 40 M 22 50 L 32 60 M 78 50 L 68 40 M 78 50 L 68 60" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="50" cy="50" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="50" cy="50" r="16" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3,3" />
      </svg>
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
    }, 20);
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
          backgroundColor: ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][Math.floor(Math.random() * 5)],
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
  const [isSynthEnabled, setIsSynthEnabled] = useState(true);
  const [isBooting, setIsBooting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Brain & Dynamic Memory State
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [vectorDocs, setVectorDocs] = useState<ChromaDocument[]>([]);
  const [brainStatus, setBrainStatus] = useState<any>({
    brainState: { level: 5, xp: 450, totalChats: 12, positiveFeedback: 8, negativeFeedback: 1, learnedDirectives: [] },
    memoriesCount: 4,
    vectorsCount: 2
  });
  const [compilerMode, setCompilerMode] = useState<"general" | "education" | "debugging" | "context_awareness">("general");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.5-flash");

  // Code Sandbox State
  const [sandboxFiles, setSandboxFiles] = useState<CodeFile[]>([
    {
      name: "calculate_shares.js",
      code: `function evaluateWeights(sharesCount, stockValue) {\n  const totalValue = sharesCount * stockValue;\n  if (totalValue === 0) return 0;\n  return stockValue * (100 / totalValue);\n}\nconsole.log("Weight:", evaluateWeights(10, 150));`
    }
  ]);

  const [groundingInfo, setGroundingInfo] = useState<GroundingMetadata | null>(null);
  const [responseStats, setResponseStats] = useState({ time: "0.00s", network: "Excellent", model: "Gemini 2.5" });
  const [weatherState, setWeatherState] = useState<WeatherType>("default");
  const [liveStats, setLiveStats] = useState<SystemData | null>(null);
  
  // Widget states
  const [weatherWidget, setWeatherWidget] = useState<WeatherData | null>(null);
  const [newsWidget, setNewsWidget] = useState<NewsData | null>(null);
  const [stockWidget, setStockWidget] = useState<StockData | null>(null);
  const [sportWidget, setSportWidget] = useState<SportData | null>(null);
  const [timeWidget, setTimeWidget] = useState<TimeData | null>(null);
  const [musicWidget, setMusicWidget] = useState<MusicData | null>(null);
  const [systemWidget, setSystemWidget] = useState<SystemData | null>(null);

  const [selectedVoice, setSelectedVoice] = useState("Aoede");
  const [voiceSpeed, setVoiceSpeed] = useState(1.05);
  const [isBackendVoice, setIsBackendVoice] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory, isLoading]);

  // Toast notifier helper
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch Live Memories from backend
  const fetchMemories = async () => {
    try {
      const res = await fetch("/api/snow/memory");
      if (res.ok) {
        const data = await res.json();
        setMemories(data);
      }
    } catch (e) {
      console.warn("Failed to fetch memories:", e);
    }
  };

  // Fetch Vectors from backend
  const fetchVectors = async () => {
    try {
      const res = await fetch("/api/snow/vectors");
      if (res.ok) {
        const data = await res.json();
        setVectorDocs(data);
      }
    } catch (e) {
      console.warn("Failed to fetch vectors:", e);
    }
  };

  // Fetch Brain Training Status
  const fetchBrainStatus = async () => {
    try {
      const res = await fetch("/api/snow/train/status");
      if (res.ok) {
        const data = await res.json();
        setBrainStatus(data);
      }
    } catch (e) {
      console.warn("Failed to fetch brain status:", e);
    }
  };

  useEffect(() => {
    fetchMemories();
    fetchVectors();
    fetchBrainStatus();
  }, []);

  // Poll live system stats every 10 seconds
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/system");
        if (res.ok) {
          const data = await res.json();
          setLiveStats(data);
        }
      } catch { /* ignore */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (chatHistory.length === 0) {
      setChatHistory([{ id: "welcome-1", sender: "snow", text: "Hey there! I'm Snow, your continuous learning AI. I adapt dynamically from our conversations, retrieve memories, analyze system stats, check weather, and learn continuously without hardcoding! What can I help you with?" }]);
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

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

  // Continuous Training trigger
  const handleTrainSnowHarder = async (instructions?: string) => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/snow/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: instructions || "Train harder and refine neural accuracy" })
      });
      const data = await res.json();
      if (data.success) {
        fetchBrainStatus();
        fetchMemories();
        triggerToast(`🧠 Snow Brain Level Up! Upgraded to Level ${data.brainState.level}`);
      }
    } catch (e) {
      console.error("Training failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Feedback handler (Thumbs up / Thumbs down)
  const handleSendFeedback = async (msgId: string, feedbackType: "thumbs_up" | "thumbs_down") => {
    const item = chatHistory.find(m => m.id === msgId);
    if (!item) return;

    // Find preceding user prompt
    const itemIdx = chatHistory.findIndex(m => m.id === msgId);
    const userPrompt = itemIdx > 0 ? chatHistory[itemIdx - 1]?.text : "User session interaction";

    try {
      const res = await fetch("/api/snow/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt,
          response: item.text,
          feedback: feedbackType
        })
      });

      if (res.ok) {
        setChatHistory(prev => prev.map(m => m.id === msgId ? { ...m, feedbackGiven: feedbackType } : m));
        fetchBrainStatus();
        triggerToast(feedbackType === "thumbs_up" ? "👍 Positive feedback recorded! Snow gained +50 XP." : "👎 Correction recorded! Snow adaptively updated directives.");
      }
    } catch (e) {
      console.error("Feedback submission failed:", e);
    }
  };

  const speakWithBrowserFallback = (text: string) => {
    if (!window.speechSynthesis) {
      setIsSpeaking(false);
      return;
    }
    try {
      const sanitizedText = text
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/[*#`_\-~]/g, "")
        .replace(/\[WEATHER:[^\]]+\]/gi, "")
        .replace(/\[UI_[A-Z]+:[^\]]+\]/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      const utterance = new SpeechSynthesisUtterance(sanitizedText);
      const voices = window.speechSynthesis.getVoices();

      const getBestFemaleVoice = (voicesList: SpeechSynthesisVoice[]) => {
        const englishVoices = voicesList.filter(v => v.lang.toLowerCase().startsWith("en"));
        if (englishVoices.length === 0) return null;

        const femaleCandidates = englishVoices.filter(v => {
          const name = v.name.toLowerCase();
          return !(name.includes("male") || name.includes("david") || name.includes("george") || name.includes("ravi") || name.includes("mark") || name.includes("microsoft david") || name.includes("guy"));
        });

        if (femaleCandidates.length === 0) return englishVoices[0];

        const scoring = (v: SpeechSynthesisVoice) => {
          const name = v.name.toLowerCase();
          const lang = v.lang.toLowerCase();
          let score = 0;
          if (lang.startsWith("en-ie")) score += 100;
          if (lang.startsWith("en-gb")) score += 80;
          if (lang.startsWith("en-us")) score += 50;
          if (name.includes("female")) score += 20;
          if (name.includes("hazel")) score += 15;
          if (name.includes("samantha")) score += 15;
          if (name.includes("zira")) score += 15;
          return score;
        };

        femaleCandidates.sort((a, b) => scoring(b) - scoring(a));
        return femaleCandidates[0];
      };

      const chosenVoice = getBestFemaleVoice(voices);
      if (chosenVoice) utterance.voice = chosenVoice;

      utterance.rate = voiceSpeed;
      utterance.pitch = 1.15;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Browser speech synthesis error:", e);
      setIsSpeaking(false);
    }
  };

  const speakText = async (text: string) => {
    if (!isSynthEnabled) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setIsSpeaking(true);

    const clean = text
      .replace(/\[WEATHER:[^\]]+\]/g, "")
      .replace(/\[UI_[A-Z]+:[^\]]+\]/g, "")
      .replace(/[*`#_]/g, "")
      .trim();

    if (!isBackendVoice) {
      speakWithBrowserFallback(clean);
      return;
    }

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, voice: selectedVoice }),
      });

      if (!response.ok) throw new Error(`TTS API returned status ${response.status}`);

      const data = await response.json();
      if (data.useBrowserFallback) {
        speakWithBrowserFallback(clean);
        return;
      }

      if (data.audio) {
        const byteCharacters = atob(data.audio);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const audioBlob = new Blob([byteArray], { type: "audio/mp3" });
        const audioBlobUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioBlobUrl);
        audioRef.current = audio;
        audio.playbackRate = voiceSpeed;

        audio.onended = () => {
          setIsSpeaking(false);
          audioRef.current = null;
          URL.revokeObjectURL(audioBlobUrl);
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          audioRef.current = null;
          URL.revokeObjectURL(audioBlobUrl);
          speakWithBrowserFallback(clean);
        };

        await audio.play();
      } else {
        throw new Error("No audio payload");
      }
    } catch (err) {
      speakWithBrowserFallback(clean);
    }
  };

  const handleToggleSynth = () => {
    const nextVal = !isSynthEnabled;
    setIsSynthEnabled(nextVal);
    if (!nextVal) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (window.speechSynthesis) { window.speechSynthesis.cancel(); }
      setIsSpeaking(false);
    }
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Speech recognition not supported in this browser.");
    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join("");
        setInputText(transcript);
        if (e.results[0].isFinal) {
           handleSendMessage(transcript);
        }
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch (err) { console.error(err); setIsListening(false); }
  };

  const clearWidgets = () => {
    setWeatherWidget(null); setNewsWidget(null); setStockWidget(null);
    setSportWidget(null); setTimeWidget(null); setMusicWidget(null);
    setSystemWidget(null);
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

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend || inputText;
    if (!rawText.trim() || isLoading) return;

    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (window.speechSynthesis) { window.speechSynthesis.cancel(); }
    setIsSpeaking(false);

    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    setChatHistory((prev) => [...prev, { id: `user-${Date.now()}`, sender: "user", text: rawText.trim() }]);
    setInputText("");
    setIsLoading(true);
    setIsBooting(true);
    clearWidgets();

    const startTime = Date.now();
    try {
      const res = await fetch("/api/snow/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: rawText.trim(),
          history: chatHistory.slice(-10).map(m => ({
            role: m.sender === "snow" ? "model" : "user",
            text: m.text
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Network error");
      
      const aiText = data.text;
      setGroundingInfo(data.grounding || null);

      let widgetData: any = null;
      let widgetType: "weather" | "news" | "stock" | "sport" | "time" | "music" | "system" | null = null;

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
      tryWidget("UI_MUSIC",   setMusicWidget,   "music");
      tryWidget("UI_SYSTEM",  setSystemWidget,  "system");

      if (/\[UI_JOKE/i.test(aiText)) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }

      let cleanDisplay = aiText
        .replace(/\[WEATHER\s*:?[^\]]*\]/gi, "")
        .replace(/\[UI_[A-Z_]+\s*:?\s*\{[\s\S]*?\}\s*\]/gi, "")
        .replace(/\{\s*"(?:temp|cpu|ram|headline|symbol|team1|time|title|punchline)[^}]*\}/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

      setResponseStats({ time: ((Date.now() - startTime) / 1000).toFixed(2) + "s", network: "Excellent", model: data.model || "Gemini 2.5" });

      setChatHistory((prev) => [
        ...prev,
        {
          id: `snow-${Date.now()}`,
          sender: "snow",
          text: cleanDisplay,
          widget: widgetType ? { type: widgetType, data: widgetData } : undefined,
          toolActivity: data.toolActivity || []
        }
      ]);
      speakText(cleanDisplay);

      // Refresh memory & brain status
      fetchMemories();
      fetchBrainStatus();
    } catch (err: any) {
      console.error(err);
      const isOffline = err instanceof TypeError && (err.message === "Failed to fetch" || err.message.includes("NetworkError"));
      const friendlyMsg = isOffline
        ? "I can't reach my brain right now — looks like the Snow server is offline. Try restarting it and I'll be right back!"
        : err.message || "I encountered an error.";
      setChatHistory((prev) => [...prev, { id: `err-${Date.now()}`, sender: "snow", text: friendlyMsg }]);
    } finally {
      setIsLoading(false);
      setIsBooting(false);
    }
  };

  const getPanelImage = () => {
    if (weatherWidget) {
      const cond = (weatherWidget.condition || "").toLowerCase();
      if (cond.includes("sun") || cond.includes("clear") || cond.includes("mainly clear"))
        return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80";
      if (cond.includes("rain") || cond.includes("drizzle") || cond.includes("shower"))
        return "https://images.unsplash.com/photo-1438029071396-1e831a7fa6d8?w=600&q=80";
      if (cond.includes("snow") || cond.includes("blizzard") || cond.includes("frost"))
        return "https://images.unsplash.com/photo-1491002052546-bf38f186af56?w=600&q=80";
      if (cond.includes("storm") || cond.includes("thunder") || cond.includes("lightning"))
        return "https://images.unsplash.com/photo-1561484930-998b6a7b22e8?w=600&q=80";
      return "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=600&q=80";
    }
    if (systemWidget) return "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80";
    if (newsWidget)   return "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&q=80";
    if (stockWidget)  return "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=600&q=80";
    if (sportWidget)  return "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600&q=80";
    if (timeWidget)   return "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&q=80";
    if (musicWidget)  return "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&q=80";
    if (showConfetti) return "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&q=80";
    return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80";
  };

  const quickPrompts = [
    "What's the weather in Tokyo?",
    "Tell me a joke!",
    "What is Apple's stock price?",
    "Train your brain harder and learn!",
    "What facts do you remember about me?"
  ];

  const isContextActive = !!(weatherWidget || newsWidget || stockWidget || timeWidget || sportWidget || musicWidget || groundingInfo?.webSearchQueries?.length);

  return (
    <div className={`w-full h-screen flex flex-col transition-colors duration-1000 bg-weather-${weatherState} overflow-hidden font-sans text-white relative`}>
      {showConfetti && <Confetti />}

      {/* Floating Notification Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-cyan-400/50 backdrop-blur-xl px-5 py-2.5 rounded-full text-xs font-bold text-cyan-300 shadow-[0_0_25px_rgba(34,211,238,0.4)] flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Futuristic Header with Dynamic Navigation Tabs */}
      <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
          <span className="font-bold text-base tracking-[0.2em] uppercase text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]">SnowOS</span>
          <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-[10px] font-bold text-cyan-300 uppercase tracking-widest flex items-center gap-1">
            <Award className="w-3 h-3" /> LV.{brainStatus.brainState?.level || 5} BRAIN
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-2xl border border-white/10">
          <button
            onClick={() => setActiveTab("hud")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeTab === "hud" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.3)]" : "text-white/60 hover:text-white"}`}
          >
            <Radio className="w-3.5 h-3.5" /> HUD Voice
          </button>
          <button
            onClick={() => setActiveTab("graph")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeTab === "graph" ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.3)]" : "text-white/60 hover:text-white"}`}
          >
            <BrainCircuit className="w-3.5 h-3.5" /> Graph Memory ({memories.length})
          </button>
          <button
            onClick={() => setActiveTab("vector")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeTab === "vector" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "text-white/60 hover:text-white"}`}
          >
            <Database className="w-3.5 h-3.5" /> Chroma Vectors ({vectorDocs.length})
          </button>
          <button
            onClick={() => setActiveTab("compiler")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeTab === "compiler" ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.3)]" : "text-white/60 hover:text-white"}`}
          >
            <Cpu className="w-3.5 h-3.5" /> Prompt Matrix
          </button>
          <button
            onClick={() => setActiveTab("sandbox")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeTab === "sandbox" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "text-white/60 hover:text-white"}`}
          >
            <Code className="w-3.5 h-3.5" /> Code Sandbox
          </button>
          <button
            onClick={() => setActiveTab("training")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeTab === "training" ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.3)]" : "text-white/60 hover:text-white"}`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Continuous Studio
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => { setChatHistory([]); clearWidgets(); setInputText(""); }} className="p-2.5 rounded-xl glass-panel hover:bg-white/10 transition cursor-pointer" title="Clear Chat">
            <Trash2 className="w-4 h-4 text-white/60" />
          </button>
          <button onClick={handleToggleSynth} className="p-2.5 rounded-xl glass-panel hover:bg-white/10 transition cursor-pointer">
            {isSynthEnabled ? <Volume2 className="w-4 h-4 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" /> : <VolumeX className="w-4 h-4 text-white/40" />}
          </button>
        </div>
      </div>

      {/* Main Container Views */}
      <div className="flex-1 p-6 overflow-hidden h-[calc(100vh-64px)]">
        {activeTab === "hud" && (
          <div className="w-full h-full grid grid-cols-12 gap-6">
            {/* Left Panel */}
            <motion.div animate={{ opacity: isBooting ? 0.3 : 1 }} transition={{ duration: 0.5 }} className="col-span-3 glass-panel rounded-3xl p-6 border border-cyan-500/15 flex flex-col gap-6 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2"><Heart className="w-4 h-4 text-rose-400" /><span className="text-xs uppercase font-bold tracking-widest text-rose-400">Snow's Heart</span></div>
                <button onClick={() => handleTrainSnowHarder()} className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-bold uppercase hover:bg-cyan-500/40 transition cursor-pointer flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Train Harder
                </button>
              </div>

              <div className="flex flex-col gap-4 text-sm">
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-white/40">Status:</span><span className="text-emerald-400 font-semibold flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />Awake & Learning</span></div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40">Brain Level:</span>
                  <span className="font-mono text-cyan-300 font-bold">LV. {brainStatus.brainState?.level || 5} ({brainStatus.brainState?.xp || 450} XP)</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40">Response Time:</span>
                  {responseStats.time === "0.00s" ? (
                    <span className="font-mono text-cyan-400/60 animate-pulse font-bold">---</span>
                  ) : (
                    <span className="font-mono text-cyan-400 font-bold">Last: {responseStats.time}</span>
                  )}
                </div>
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-white/40">Connection:</span><span className="text-white/80 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Connected</span></div>
              </div>

              {/* Live System Stats */}
              {liveStats && (
                <div className="flex flex-col gap-2 p-3 rounded-2xl bg-cyan-950/30 border border-cyan-500/20">
                  <span className="text-[9px] text-cyan-400 uppercase font-bold tracking-widest flex items-center gap-1"><Cpu className="w-3 h-3" /> Live Sys Telemetry</span>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="flex flex-col gap-0.5 bg-black/30 rounded-lg p-1.5">
                      <span className="text-[8px] text-white/40 uppercase">CPU</span>
                      <span className="text-xs font-bold text-cyan-300">{liveStats.cpu}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 bg-black/30 rounded-lg p-1.5">
                      <span className="text-[8px] text-white/40 uppercase">Temp</span>
                      <span className="text-xs font-bold text-orange-300">{liveStats.temp}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 bg-black/30 rounded-lg p-1.5 col-span-3">
                      <span className="text-[8px] text-white/40 uppercase">RAM</span>
                      <span className="text-xs font-bold text-emerald-300">{liveStats.ram}</span>
                    </div>
                  </div>
                </div>
              )}

              <VoiceConfigurator 
                selectedVoice={selectedVoice}
                onVoiceChange={setSelectedVoice}
                voiceSpeed={voiceSpeed}
                onVoiceSpeedChange={setVoiceSpeed}
                isBackendVoice={isBackendVoice}
                onBackendToggle={setIsBackendVoice}
              />

              {/* Recent Prompts History */}
              <div className="flex flex-col gap-3 mt-2 border-t border-white/5 pt-4">
                <span className="text-xs text-white/40 uppercase font-bold tracking-wider flex items-center gap-1"><History className="w-3.5 h-3.5" /> Recent Prompts</span>
                {chatHistory.filter(msg => msg.sender === 'user').length > 0 ? (
                  <div className="flex flex-col gap-2 max-h-[25vh] overflow-y-auto pr-1">
                    {chatHistory.filter(msg => msg.sender === 'user').slice(-5).map((msg) => (
                      <button 
                        key={msg.id}
                        onClick={() => handleSendMessage(msg.text)}
                        className="text-left text-xs p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition text-white/70 hover:text-white truncate"
                        title={msg.text}
                      >
                        {msg.text}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-white/30 italic">No recent prompts.</span>
                )}
              </div>
            </motion.div>

            {/* Center Panel */}
            <div className="col-span-6 flex flex-col justify-between overflow-hidden relative">
              <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:30px_30px] flex items-center justify-center z-0">
                <div className="w-96 h-96 border border-dashed border-cyan-500/25 rounded-full flex items-center justify-center relative">
                  <div className="w-[110%] h-[1px] bg-cyan-500/15 absolute" />
                  <div className="h-[110%] w-[1px] bg-cyan-500/15 absolute" />
                  <div className="w-64 h-64 border border-cyan-500/20 rounded-full flex items-center justify-center">
                    <div className="w-32 h-32 border border-dashed border-cyan-500/10 rounded-full" />
                  </div>
                </div>
              </div>

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <AnimatePresence>
                  {weatherState !== "default" && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 0.15, scale: 1 }} exit={{ opacity: 0 }} className="drop-shadow-2xl">
                      {weatherState === "sunny" && <Sun className="w-48 h-48 text-yellow-300 animate-pulse" />}
                      {weatherState === "rain" && <CloudRain className="w-48 h-48 text-blue-300 animate-bounce" />}
                      {weatherState === "snow" && <Snowflake3D />}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-col items-center justify-center py-6 z-10">
                <SnowflakeCore state={isListening ? "listening" : isLoading ? "thinking" : isSpeaking ? "speaking" : "standby"} />
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 flex flex-col z-10 scrollbar-none pb-20 chat-fade-mask">
                {chatHistory.map((msg, idx) => (
                  <div key={msg.id} className={`w-full flex flex-col gap-2 ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                    <motion.div 
                      initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(10px)" }} 
                      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} 
                      transition={{ duration: 0.5 }}
                      className={`max-w-[75%] p-4 rounded-3xl text-sm leading-relaxed shadow-2xl backdrop-blur-xl group relative overflow-hidden ${msg.sender === "user" ? "bg-gradient-to-br from-white/15 to-white/5 border border-white/20 text-white rounded-br-sm shadow-[0_0_30px_rgba(255,255,255,0.08)]" : "bg-gradient-to-br from-cyan-950/40 to-black/40 text-white/90 rounded-bl-sm border border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.1)]"}`}
                    >
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                      
                      {msg.sender === "snow" && msg !== chatHistory[0] ? <TypewriterText text={msg.text} /> : msg.text}
                      
                      {msg.toolActivity && msg.toolActivity.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-cyan-300 font-mono bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-1 rounded-full w-fit shadow-[0_0_12px_rgba(34,211,238,0.15)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                          <span>Executed Tool: <strong className="text-white font-bold">{msg.toolActivity.join(", ")}</strong></span>
                        </div>
                      )}

                      {/* Interactive Reinforcement Feedback Buttons */}
                      {msg.sender === "snow" && (
                        <div className="flex gap-2 mt-2 pt-2 border-t border-cyan-500/10 items-center justify-between">
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition duration-300">
                            <button onClick={() => navigator.clipboard.writeText(msg.text)} className="p-1.5 rounded-md hover:bg-cyan-500/20 text-cyan-200/50 hover:text-cyan-300 transition-colors" title="Copy text"><Copy className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleSendFeedback(msg.id, "thumbs_up")} className={`p-1.5 rounded-md hover:bg-emerald-500/20 transition-colors ${msg.feedbackGiven === "thumbs_up" ? "text-emerald-400 font-bold" : "text-cyan-200/50 hover:text-emerald-300"}`} title="Thumbs up (Train Snow)"><ThumbsUp className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleSendFeedback(msg.id, "thumbs_down")} className={`p-1.5 rounded-md hover:bg-rose-500/20 transition-colors ${msg.feedbackGiven === "thumbs_down" ? "text-rose-400 font-bold" : "text-cyan-200/50 hover:text-rose-300"}`} title="Thumbs down (Correct Snow)"><ThumbsDown className="w-3.5 h-3.5" /></button>
                          </div>
                          {msg.feedbackGiven && (
                            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Learned
                            </span>
                          )}
                        </div>
                      )}
                    </motion.div>
                    
                    {msg.widget && (
                      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 20 }} className="w-full max-w-[75%] mt-1">
                        {msg.widget.type === "weather" && (
                          <div className="glass-panel p-5 rounded-3xl border border-cyan-500/20 shadow-[0_0_40px_rgba(6,182,212,0.15)] flex flex-col items-center gap-3 w-full bg-black/40 backdrop-blur-2xl">
                            <div className="flex items-center gap-2 text-cyan-300 uppercase tracking-widest text-[10px] font-bold border-b border-cyan-500/20 pb-1.5 justify-center w-full"><MapPin className="w-3.5 h-3.5" /> {msg.widget.data.location}</div>
                            <div className="flex items-center gap-4 py-1">
                              {msg.widget.data.condition.toLowerCase().includes('snow') ? <div className="scale-75"><Snowflake3D /></div> : <Sun className="w-10 h-10 text-yellow-300 animate-[spin_10s_linear_infinite]" />}
                              <div className="flex flex-col"><span className="text-3xl font-extrabold text-white drop-shadow-md">{msg.widget.data.temp}</span><span className="text-xs text-cyan-100/60 capitalize">{msg.widget.data.condition}</span></div>
                            </div>
                          </div>
                        )}
                        {msg.widget.type === "news" && (
                          <div className="glass-panel p-5 rounded-3xl border border-cyan-500/20 shadow-[0_0_40px_rgba(168,85,247,0.15)] flex flex-col gap-2 w-full bg-black/40 backdrop-blur-2xl">
                            <div className="flex justify-between text-purple-300 uppercase tracking-widest text-[10px] font-bold border-b border-purple-500/20 pb-1.5"><div className="flex gap-2"><Newspaper className="w-3.5 h-3.5" /> News</div><span className="text-[9px] text-purple-200/40">{msg.widget.data.source}</span></div>
                            <div className="py-1 text-white text-sm leading-relaxed font-serif text-center">"{msg.widget.data.headline}"</div>
                          </div>
                        )}
                        {msg.widget.type === "stock" && (
                          <div className="glass-panel p-5 rounded-3xl border border-cyan-500/20 shadow-[0_0_40px_rgba(16,185,129,0.15)] flex flex-col items-center gap-2 w-full bg-black/40 backdrop-blur-2xl">
                            <div className="flex items-center gap-2 text-emerald-300 uppercase tracking-widest text-[10px] font-bold border-b border-emerald-500/20 pb-1.5 w-full justify-center"><TrendingUp className="w-3.5 h-3.5" /> Market Data</div>
                            <div className="text-xl font-bold text-white mt-1 ticker-value">{msg.widget.data.symbol}</div>
                            <div className="flex items-baseline gap-2"><span className="text-3xl font-bold">{msg.widget.data.price}</span><span className={`text-sm font-semibold ${msg.widget.data.up ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]'}`}>{msg.widget.data.change}</span></div>
                          </div>
                        )}
                        {msg.widget.type === "time" && (
                          <div className="glass-panel p-5 rounded-3xl border border-cyan-500/20 shadow-[0_0_40px_rgba(99,102,241,0.15)] flex flex-col items-center gap-1.5 w-full bg-black/40 backdrop-blur-2xl">
                            <div className="flex items-center gap-2 text-indigo-300 uppercase tracking-widest text-[10px] font-bold border-b border-indigo-500/20 pb-1.5 w-full justify-center"><Clock className="w-3.5 h-3.5" /> {msg.widget.data.location} ({msg.widget.data.timezone})</div>
                            <div className="text-4xl font-mono font-bold text-white tracking-wider my-2 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]">{msg.widget.data.time}</div>
                            <div className="text-xs text-indigo-200/60">{msg.widget.data.date}</div>
                          </div>
                        )}
                        {msg.widget.type === "sport" && (
                          <div className="glass-panel p-5 rounded-3xl border border-cyan-500/20 shadow-[0_0_40px_rgba(249,115,22,0.15)] flex flex-col items-center gap-3 w-full bg-black/40 backdrop-blur-2xl">
                            <div className="flex items-center gap-2 text-orange-300 uppercase tracking-widest text-[10px] font-bold border-b border-orange-500/20 pb-1.5 w-full justify-center"><Trophy className="w-3.5 h-3.5" /> {msg.widget.data.sport}</div>
                            <div className="flex justify-between w-full items-center px-4"><div className="flex flex-col items-center"><span className="text-sm font-bold text-orange-100">{msg.widget.data.team1}</span><span className="text-2xl font-black text-white">{msg.widget.data.score1}</span></div><span className="text-orange-500/40 font-bold text-xs">VS</span><div className="flex flex-col items-center"><span className="text-sm font-bold text-orange-100">{msg.widget.data.team2}</span><span className="text-2xl font-black text-white">{msg.widget.data.score2}</span></div></div>
                          </div>
                        )}
                        {msg.widget.type === "system" && (
                          <div className="glass-panel p-5 rounded-3xl border border-cyan-500/40 shadow-[0_0_50px_rgba(34,211,238,0.2)] flex flex-col items-center gap-4 w-full bg-black/60 backdrop-blur-3xl relative overflow-hidden tech-grid">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-50" />
                            <div className="flex items-center gap-2 text-cyan-300 uppercase tracking-widest text-[11px] font-black border-b border-cyan-500/30 pb-2 w-full justify-center z-10 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
                              <Cpu className="w-4 h-4 animate-pulse" /> System Core Diagnostics
                            </div>
                            <div className="flex gap-6 w-full items-center justify-center z-10 mt-2">
                              <div className="relative w-16 h-16 rounded-full border border-cyan-500/30 flex items-center justify-center bg-black/50 shadow-[0_0_15px_rgba(34,211,238,0.1)_inset]">
                                <div className="absolute inset-0 radar-sweep" />
                                <div className="w-10 h-10 border border-dashed border-cyan-500/50 rounded-full animate-[spin_10s_linear_infinite_reverse]" />
                                <div className="absolute text-cyan-300 font-bold text-[10px] drop-shadow-md bg-black/50 px-1 rounded">{msg.widget.data.temp}</div>
                              </div>
                              <div className="flex flex-col gap-3 flex-1">
                                <div className="flex justify-between items-end border-b border-cyan-500/10 pb-1">
                                  <span className="text-[9px] text-cyan-200/50 uppercase tracking-wider">CPU Load</span>
                                  <span className="text-xl font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">{msg.widget.data.cpu}</span>
                                </div>
                                <div className="flex justify-between items-end border-b border-cyan-500/10 pb-1">
                                  <span className="text-[9px] text-cyan-200/50 uppercase tracking-wider">RAM Alloc</span>
                                  <span className="text-sm font-bold text-white tracking-wide">{msg.widget.data.ram}</span>
                                </div>
                              </div>
                            </div>
                            <div className="w-full flex justify-between items-center bg-cyan-950/30 rounded-lg p-2 px-3 border border-cyan-500/20 z-10 mt-1">
                              <span className="text-[9px] uppercase tracking-widest text-cyan-500 font-bold">Sys. Status</span>
                              <span className="text-[10px] text-cyan-300 font-bold flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> {msg.widget.data.status}</span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                ))}
                
                <AnimatePresence>
                  {isLoading && (
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="self-start relative group flex items-center gap-4 mt-2">
                      <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full" />
                      <div className="glass-panel text-cyan-300 p-4 px-6 rounded-3xl rounded-bl-sm flex items-center gap-4 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.2)] bg-black/60 backdrop-blur-md relative overflow-hidden">
                        <div className="absolute top-0 bottom-0 w-1 bg-cyan-400/50 shadow-[0_0_10px_#22d3ee] animate-[scan_2s_ease-in-out_infinite]" />
                        <Cpu className="w-5 h-5 animate-pulse text-cyan-400" />
                        <span className="text-sm font-medium tracking-wide">Snow is exploring her neural memory networks...</span>
                        <div className="flex gap-1 ml-2">
                          <motion.div animate={{ height: [4, 16, 4] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-1 bg-cyan-400 rounded-full" />
                          <motion.div animate={{ height: [4, 24, 4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 bg-cyan-400 rounded-full" />
                          <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 bg-cyan-400 rounded-full" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={chatEndRef} />
              </div>

              <div className="absolute bottom-4 inset-x-4 z-20 flex flex-col gap-3">
                {chatHistory.length === 1 && (
                  <div className="flex flex-wrap gap-2 justify-center bg-black/40 p-2.5 rounded-2xl border border-cyan-500/10 backdrop-blur-md">
                    {quickPrompts.map(p => (
                      <button
                        key={p}
                        onClick={() => handleSendMessage(p)}
                        className="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-cyan-500/10 text-[10.5px] text-white/70 hover:text-cyan-400 transition cursor-pointer border border-white/5 hover:border-cyan-500/20"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 rounded-full glass-input p-2 px-5 shadow-xl border border-white/10 relative">
                  <button 
                    onClick={startSpeechRecognition} 
                    className={`p-3 rounded-full transition-all duration-300 ${isListening ? "bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.5)] border border-rose-400" : "text-white/60 hover:text-white hover:bg-white/5 cursor-pointer"}`} 
                    title="Speak to Snow"
                  >
                    <Mic className={`w-4 h-4 ${isListening ? "animate-pulse" : ""}`} />
                  </button>
                  
                  <input 
                    type="text" 
                    placeholder={isListening ? "Listening..." : "Message Snow..."} 
                    value={inputText} 
                    onChange={(e) => setInputText(e.target.value)} 
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()} 
                    className="flex-1 bg-transparent border-none outline-none text-sm px-4 text-white placeholder-white/35 focus:ring-0" 
                  />
                  
                  <button 
                    onClick={() => handleSendMessage()} 
                    disabled={!inputText.trim() || isLoading} 
                    className="p-3 rounded-full bg-white text-black hover:bg-white/90 disabled:opacity-30 transition-all duration-300 disabled:shadow-none cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right Panel */}
            <motion.div animate={{ opacity: isBooting ? 0.3 : 1 }} transition={{ duration: 0.5 }} className={`col-span-3 glass-panel rounded-3xl p-6 flex flex-col gap-6 overflow-y-auto transition-all duration-500 ${isContextActive ? 'border-pulse border border-cyan-400' : 'border border-cyan-500/15'}`}>
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-400" /><span className="text-xs uppercase font-bold tracking-widest text-cyan-400">Snow's Intel</span></div>
                <span className="text-[9px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded-full font-bold uppercase">{memories.length} Memories</span>
              </div>
              
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/40 h-44 relative group select-none flex-shrink-0">
                <img 
                  src={getPanelImage()} 
                  alt="Context Visual" 
                  className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                  <span className="text-[10px] font-bold tracking-wider text-white uppercase bg-black/50 px-2.5 py-1 rounded-full backdrop-blur-md border border-white/10">
                    Active Visual Context
                  </span>
                </div>
              </div>

              {/* Memory Preview Card */}
              <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20 flex flex-col gap-2">
                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-cyan-300 font-bold border-b border-white/10 pb-1.5">
                  <span>Learned Memories</span>
                  <button onClick={() => setActiveTab("graph")} className="text-[9px] text-cyan-400 underline hover:text-cyan-200 cursor-pointer">View Graph</button>
                </div>
                <div className="flex flex-col gap-1.5 max-h-[150px] overflow-y-auto pr-1 text-[11px]">
                  {memories.length > 0 ? (
                    memories.slice(0, 4).map(m => (
                      <div key={m.id} className="p-1.5 rounded-lg bg-white/5 border border-white/5 flex justify-between items-center text-white/80">
                        <span className="truncate">[{m.source}] {m.rel} {m.target}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-white/30 text-xs italic">No memories recorded yet.</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                 {!isContextActive && (
                   <div className="text-center text-white/30 text-xs italic mt-2">
                     No active widgets. Ask Snow about the weather, news, or stocks!
                   </div>
                 )}

                 {weatherWidget && (
                   <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4 rounded-2xl border border-cyan-500/20 shadow-xl flex flex-col items-center gap-3 w-full">
                     <div className="flex items-center gap-2 text-cyan-300 uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5 justify-center w-full"><MapPin className="w-3.5 h-3.5" /> {weatherWidget.location}</div>
                     <div className="flex items-center gap-4 py-1">
                       {weatherWidget.condition.toLowerCase().includes('snow') ? <Snowflake className="w-8 h-8 text-cyan-200" /> : <Sun className="w-8 h-8 text-yellow-300 animate-pulse" />}
                       <div className="flex flex-col"><span className="text-2xl font-extrabold text-white">{weatherWidget.temp}</span><span className="text-[10px] text-white/60 capitalize">{weatherWidget.condition}</span></div>
                     </div>
                   </motion.div>
                 )}

                 {newsWidget && (
                   <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4 rounded-2xl border border-cyan-500/20 shadow-xl flex flex-col gap-2 w-full">
                     <div className="flex justify-between text-purple-400 uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5"><div className="flex gap-2"><Newspaper className="w-3.5 h-3.5" /> Headlines</div><span className="text-[9px] text-white/40">{newsWidget.source}</span></div>
                     <div className="py-1 text-white/90 text-xs leading-relaxed">"{newsWidget.headline}"</div>
                   </motion.div>
                 )}

                 {stockWidget && (
                   <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4 rounded-2xl border border-cyan-500/20 shadow-xl flex flex-col items-center gap-2 w-full">
                     <div className="flex items-center gap-2 text-emerald-400 uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5 w-full justify-center"><TrendingUp className="w-3.5 h-3.5" /> Market Data</div>
                     <div className="flex items-baseline gap-3 mt-1"><span className="text-xl font-bold">{stockWidget.symbol}</span><span className="text-2xl font-bold">{stockWidget.price}</span></div>
                     <div className={`text-xs font-semibold ${stockWidget.up ? 'text-green-400' : 'text-red-400'}`}>{stockWidget.change} Today</div>
                   </motion.div>
                 )}

                 {timeWidget && (
                   <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4 rounded-2xl border border-cyan-500/20 shadow-xl flex flex-col items-center gap-1.5 w-full">
                     <div className="flex items-center gap-2 text-indigo-400 uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5 w-full justify-center"><Clock className="w-3.5 h-3.5" /> {timeWidget.location}</div>
                     <div className="text-2xl font-mono font-bold text-white my-1">{timeWidget.time}</div>
                     <div className="text-[10px] text-white/60">{timeWidget.date} ({timeWidget.timezone})</div>
                   </motion.div>
                 )}
              </div>
            </motion.div>
          </div>
        )}

        {/* Tab 2: Neo4j Knowledge Graph View */}
        {activeTab === "graph" && (
          <div className="w-full h-full glass-panel rounded-3xl border border-blue-500/20 overflow-hidden p-2">
            <NetworkGraph
              memories={memories}
              onAddMemory={handleAddMemory}
              onDeleteMemory={handleDeleteMemory}
              onClearMemories={handleClearMemories}
            />
          </div>
        )}

        {/* Tab 3: ChromaDB Vector Store View */}
        {activeTab === "vector" && (
          <div className="w-full h-full glass-panel rounded-3xl border border-emerald-500/20 overflow-hidden p-2">
            <ChromaDBStore
              documents={vectorDocs}
              onAddDocument={handleAddVectorDoc}
              onRemoveDocument={handleRemoveVectorDoc}
              onClearDocuments={async () => {
                vectorDocs.forEach(d => handleRemoveVectorDoc(d.id));
              }}
            />
          </div>
        )}

        {/* Tab 4: Prompt Agent Compiler View */}
        {activeTab === "compiler" && (
          <div className="w-full h-full glass-panel rounded-3xl border border-purple-500/20 overflow-hidden p-2">
            <PromptCompiler
              mode={compilerMode}
              onChangeMode={setCompilerMode}
              memories={memories}
              modelSelected={selectedModel}
            />
          </div>
        )}

        {/* Tab 5: Code Sandbox E2B View */}
        {activeTab === "sandbox" && (
          <div className="w-full h-full glass-panel rounded-3xl border border-amber-500/20 overflow-hidden p-2">
            <CodeSandbox
              files={sandboxFiles}
              onUpdateFile={(name, code) => {
                setSandboxFiles(prev => prev.map(f => f.name === name ? { ...f, code } : f));
              }}
              onSendToSnow={(fileName, content) => {
                setActiveTab("hud");
                handleSendMessage(`Please analyze and debug this code file (${fileName}):\n\`\`\`javascript\n${content}\n\`\`\``);
              }}
            />
          </div>
        )}

        {/* Tab 6: Continuous Brain Training Studio */}
        {activeTab === "training" && (
          <div className="w-full h-full glass-panel rounded-3xl border border-rose-500/20 overflow-hidden p-6 flex flex-col gap-6 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-rose-400 animate-spin" />
                <div className="flex flex-col">
                  <h2 className="text-lg font-bold text-white tracking-wide">Snow Autonomous Brain Training Studio</h2>
                  <p className="text-xs text-white/50">Continuous online learning engine — no hardcoding, real-time reinforcement</p>
                </div>
              </div>
              <button
                onClick={() => handleTrainSnowHarder("Manual user trigger from Training Studio")}
                disabled={isLoading}
                className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-cyan-500 text-white font-bold text-xs uppercase tracking-widest hover:opacity-90 transition cursor-pointer shadow-[0_0_25px_rgba(244,63,94,0.4)] disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "Training Brain..." : "Train Snow Harder Now"}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="glass-panel p-4 rounded-2xl border border-rose-500/30 flex flex-col gap-1">
                <span className="text-[10px] uppercase text-white/40 font-bold">Brain Level</span>
                <span className="text-3xl font-extrabold text-rose-400">LV. {brainStatus.brainState?.level || 5}</span>
                <span className="text-[10px] text-white/60">XP: {brainStatus.brainState?.xp || 450} points</span>
              </div>

              <div className="glass-panel p-4 rounded-2xl border border-cyan-500/30 flex flex-col gap-1">
                <span className="text-[10px] uppercase text-white/40 font-bold">Memory Graph Nodes</span>
                <span className="text-3xl font-extrabold text-cyan-300">{memories.length}</span>
                <span className="text-[10px] text-white/60">Indexed in Neo4j graph</span>
              </div>

              <div className="glass-panel p-4 rounded-2xl border border-emerald-500/30 flex flex-col gap-1">
                <span className="text-[10px] uppercase text-white/40 font-bold">Positive Signals</span>
                <span className="text-3xl font-extrabold text-emerald-400">{brainStatus.brainState?.positiveFeedback || 8}</span>
                <span className="text-[10px] text-white/60">Thumbs up reinforcements</span>
              </div>

              <div className="glass-panel p-4 rounded-2xl border border-purple-500/30 flex flex-col gap-1">
                <span className="text-[10px] uppercase text-white/40 font-bold">Total Interactions</span>
                <span className="text-3xl font-extrabold text-purple-300">{brainStatus.brainState?.totalChats || 12}</span>
                <span className="text-[10px] text-white/60">Evaluated turns</span>
              </div>
            </div>

            {/* Learned Directives Section */}
            <div className="glass-panel p-5 rounded-2xl border border-white/10 flex flex-col gap-3">
              <span className="text-xs uppercase font-bold tracking-widest text-cyan-300 flex items-center gap-2">
                <Award className="w-4 h-4 text-cyan-400" /> Active Learned Directives & Persona Calibration
              </span>
              <div className="flex flex-col gap-2">
                {brainStatus.brainState?.learnedDirectives?.map((d: string, idx: number) => (
                  <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/90 font-mono flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span>{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
