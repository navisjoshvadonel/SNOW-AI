import React, { useState, useEffect, useRef } from "react";
import { Mic, Send, Volume2, VolumeX, CloudRain, Sun, Cloud, Snowflake, CloudLightning, MapPin, Newspaper, ExternalLink, Cpu, Radio, BookOpen, Clock, Globe, Copy, ThumbsUp, ThumbsDown, Trash2, Smile, Music, TrendingUp, Trophy, LayoutGrid, Activity, Heart, History } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { VoiceConfigurator } from "./components/VoiceConfigurator";
type WeatherType = "default" | "sunny" | "rain" | "cloudy" | "snow" | "storm";

interface ChatItem {
  id: string;
  sender: "user" | "snow";
  text: string;
  widget?: {
    type: "weather" | "news" | "stock" | "sport" | "time" | "music" | "system";
    data: any;
  };
  toolActivity?: string[];
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
      
      {/* Faint, low-opacity circular audio ripples that expand outward when processing or listening */}
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
  const [inputText, setInputText] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSynthEnabled, setIsSynthEnabled] = useState(true);
  const [isBooting, setIsBooting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  
  const [groundingInfo, setGroundingInfo] = useState<GroundingMetadata | null>(null);
  const [responseStats, setResponseStats] = useState({ time: "0.00s", network: "Excellent", model: "Gemini 2.5" });

  const [weatherState, setWeatherState] = useState<WeatherType>("default");
  
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

  useEffect(() => {
    if (chatHistory.length === 0) {
      setChatHistory([{ id: "welcome-1", sender: "snow", text: "Hello! I am Snow. Ready to assist you." }]);
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

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

        // Skip explicitly male voices
        const femaleCandidates = englishVoices.filter(v => {
          const name = v.name.toLowerCase();
          return !(name.includes("male") || name.includes("david") || name.includes("george") || name.includes("ravi") || name.includes("mark") || name.includes("microsoft david") || name.includes("guy"));
        });

        if (femaleCandidates.length === 0) return englishVoices[0];

        // Rank candidates
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
          if (name.includes("susan")) score += 15;
          if (name.includes("natural")) score += 10;
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
      console.warn("Browser fallback speech synthesis error:", e);
      setIsSpeaking(false);
    }
  };

  // Strict Female Voice Selection using backend Gemini TTS and browser fallback
  const speakText = async (text: string) => {
    if (!isSynthEnabled) return;

    // Stop any currently playing audio
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

      if (!response.ok) {
        throw new Error(`TTS API returned status ${response.status}`);
      }

      const data = await response.json();
      if (data.useBrowserFallback) {
        console.warn("TTS API requested browser fallback:", data.warning);
        speakWithBrowserFallback(clean);
        return;
      }

      if (data.audio) {
        // Convert base64 to Blob URL for maximum browser compatibility
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
        audio.play().catch(e => console.error("Audio playback prevented:", e));

        audio.onended = () => {
          setIsSpeaking(false);
          audioRef.current = null;
          URL.revokeObjectURL(audioBlobUrl);
        };

        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          setIsSpeaking(false);
          audioRef.current = null;
          URL.revokeObjectURL(audioBlobUrl);
          speakWithBrowserFallback(clean);
        };

        await audio.play();
      } else {
        throw new Error("No audio payload returned from TTS API.");
      }
    } catch (err) {
      console.warn("Gemini TTS synthesis failed, falling back to browser speech:", err);
      speakWithBrowserFallback(clean);
    }
  };

  const handleToggleSynth = () => {
    const nextVal = !isSynthEnabled;
    setIsSynthEnabled(nextVal);
    if (!nextVal) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
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
        if (braceCount === 0) {
          return text.substring(startBraceIndex, i + 1);
        }
      }
    }
    return null;
  };

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend || inputText;
    if (!rawText.trim() || isLoading) return;

    // Stop any currently playing audio on new prompt
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
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
        body: JSON.stringify({ prompt: rawText.trim() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Network error");
      
      let aiText = data.text;
      setGroundingInfo(data.grounding || null);

      let widgetData: any = null;
      let widgetType: "weather" | "news" | "stock" | "sport" | "time" | "music" | "system" | null = null;

      const parseWidget = (tag: string, setter: any, type: "weather" | "news" | "stock" | "sport" | "time" | "music" | "system") => {
        const jsonStr = extractJsonFromTag(aiText, tag);
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            setter(parsed);
            widgetData = parsed;
            widgetType = type;
          } catch(e) {
            console.error("Widget parse error", e);
          }
        }
      };

      const weatherMatch = aiText.match(/\[WEATHER:\s*([A-Z]+)\]/i);
      if (weatherMatch) setWeatherState(weatherMatch[1].toLowerCase() as WeatherType);

      parseWidget("[UI_WEATHER:", setWeatherWidget, "weather");
      parseWidget("[UI_NEWS:", setNewsWidget, "news");
      parseWidget("[UI_STOCK:", setStockWidget, "stock");
      parseWidget("[UI_SPORT:", setSportWidget, "sport");
      parseWidget("[UI_TIME:", setTimeWidget, "time");
      parseWidget("[UI_MUSIC:", setMusicWidget, "music");
      parseWidget("[UI_SYSTEM:", setSystemWidget, "system");

      if (aiText.includes("[UI_JOKE:")) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }

      let cleanDisplay = aiText;
      const uiTags = ["[UI_WEATHER:", "[UI_NEWS:", "[UI_STOCK:", "[UI_SPORT:", "[UI_TIME:", "[UI_MUSIC:", "[UI_JOKE:", "[UI_SYSTEM:"];
      
      uiTags.forEach(tag => {
        const jsonStr = extractJsonFromTag(cleanDisplay, tag);
        if (jsonStr) {
          const tagIndex = cleanDisplay.indexOf(tag);
          const closingBracketIndex = cleanDisplay.indexOf("]", tagIndex + tag.length + jsonStr.length - 1);
          if (tagIndex !== -1 && closingBracketIndex !== -1) {
            cleanDisplay = cleanDisplay.substring(0, tagIndex) + cleanDisplay.substring(closingBracketIndex + 1);
          }
        }
      });

      cleanDisplay = cleanDisplay
        .replace(/\[UI_[A-Z]+:[^\]]+\]/gi, "")
        .replace(/\[WEATHER:\s*[A-Z]+\]/gi, "")
        .replace(/\s+/g, " ")
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
    } catch (err: any) {
      console.error(err);
      setChatHistory((prev) => [...prev, { id: `err-${Date.now()}`, sender: "snow", text: err.message || "I encountered an error." }]);
    } finally {
      setIsLoading(false);
      setIsBooting(false);
    }
  };

  const getPanelImage = () => {
    if (weatherWidget) {
      const cond = weatherWidget.condition.toLowerCase();
      if (cond.includes("sun") || cond.includes("clear") || cond.includes("warm")) return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80";
      if (cond.includes("rain") || cond.includes("shower") || cond.includes("drizzle") || cond.includes("wet")) return "https://images.unsplash.com/photo-1438029071396-1e831a7fa6d8?w=400&q=80";
      if (cond.includes("snow") || cond.includes("freeze") || cond.includes("ice") || cond.includes("frost")) return "https://images.unsplash.com/photo-1491002052546-bf38f186af56?w=400&q=80";
      if (cond.includes("cloud") || cond.includes("overcast") || cond.includes("mist") || cond.includes("fog")) return "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=400&q=80";
      if (cond.includes("storm") || cond.includes("thunder") || cond.includes("lightning") || cond.includes("hurricane")) return "https://images.unsplash.com/photo-1561484930-998b6a7b22e8?w=400&q=80";
    }
    if (newsWidget) return "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&q=80";
    if (stockWidget) return "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=400&q=80";
    if (timeWidget) return "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&q=80";
    if (sportWidget) return "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&q=80";
    if (musicWidget) return "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80";
    if (showConfetti) return "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&q=80";
    return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80";
  };

  const quickPrompts = ["What's the weather in Tokyo?", "Tell me a joke!", "What is Apple's stock price?", "Latest technology news"];

  const isContextActive = !!(weatherWidget || newsWidget || stockWidget || timeWidget || sportWidget || musicWidget || groundingInfo?.webSearchQueries?.length);

  return (
    <div className={`w-full h-screen flex flex-col transition-colors duration-1000 bg-weather-${weatherState} overflow-hidden font-sans text-white`}>
      {showConfetti && <Confetti />}
      
      {/* Header bar with SnowOS branding and white glow */}
      <div className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/20 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
          <span className="font-bold text-base tracking-[0.2em] uppercase text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]">SnowOS</span>
        </div>
        <div className="flex items-center gap-4">

          <button onClick={() => { setChatHistory([]); clearWidgets(); setInputText(""); }} className="p-2.5 rounded-xl glass-panel hover:bg-white/10 transition cursor-pointer" title="Clear Chat"><Trash2 className="w-4 h-4 text-white/60" /></button>
          <button onClick={handleToggleSynth} className="p-2.5 rounded-xl glass-panel hover:bg-white/10 transition cursor-pointer">
            {isSynthEnabled ? <Volume2 className="w-4 h-4 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" /> : <VolumeX className="w-4 h-4 text-white/40" />}
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden h-[calc(100vh-64px)]">
        {/* Left Panel */}
        <motion.div animate={{ opacity: isBooting ? 0.3 : 1 }} transition={{ duration: 0.5, delay: isBooting ? 0 : 0.1 }} className="col-span-3 glass-panel rounded-3xl p-6 border border-cyan-500/15 flex flex-col gap-6 overflow-y-auto">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3"><Heart className="w-4 h-4 text-rose-400" /><span className="text-xs uppercase font-bold tracking-widest text-rose-400">Snow's Heart</span></div>
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex justify-between py-2 border-b border-white/5"><span className="text-white/40">Status:</span><span className="text-emerald-400 font-semibold flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />Awake & Ready</span></div>
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
              <div className="flex flex-col gap-2 max-h-[30vh] overflow-y-auto pr-1">
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
          {/* Target Reticle / Grid Accents background */}
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
                  transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1], delay: idx === chatHistory.length - 1 ? 0 : 0 }}
                  className={`max-w-[75%] p-4 rounded-3xl text-sm leading-relaxed shadow-2xl backdrop-blur-xl group relative overflow-hidden ${msg.sender === "user" ? "bg-gradient-to-br from-white/15 to-white/5 border border-white/20 text-white rounded-br-sm shadow-[0_0_30px_rgba(255,255,255,0.08)]" : "bg-gradient-to-br from-cyan-950/40 to-black/40 text-white/90 rounded-bl-sm border border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.1)]"}`}
                >
                  {/* Subtle shine effect */}
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                  
                  {msg.sender === "snow" && msg !== chatHistory[0] ? <TypewriterText text={msg.text} /> : msg.text}
                  
                  {msg.toolActivity && msg.toolActivity.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-cyan-300 font-mono bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-1 rounded-full w-fit shadow-[0_0_12px_rgba(34,211,238,0.15)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                      <span>Executed Tool: <strong className="text-white font-bold">{msg.toolActivity.join(", ")}</strong></span>
                    </div>
                  )}

                  {msg.sender === "snow" && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-cyan-500/10 opacity-0 group-hover:opacity-100 transition duration-300">
                      <button onClick={() => navigator.clipboard.writeText(msg.text)} className="p-1.5 rounded-md hover:bg-cyan-500/20 text-cyan-200/50 hover:text-cyan-300 transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                      <button className="p-1.5 rounded-md hover:bg-cyan-500/20 text-cyan-200/50 hover:text-cyan-300 transition-colors"><ThumbsUp className="w-3.5 h-3.5" /></button>
                      <button className="p-1.5 rounded-md hover:bg-cyan-500/20 text-cyan-200/50 hover:text-cyan-300 transition-colors"><ThumbsDown className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </motion.div>
                
                {msg.widget && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }} 
                    animate={{ opacity: 1, scale: 1, y: 0 }} 
                    transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
                    className="w-full max-w-[75%] mt-1"
                  >
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
                          {/* Radar Circle */}
                          <div className="relative w-16 h-16 rounded-full border border-cyan-500/30 flex items-center justify-center bg-black/50 shadow-[0_0_15px_rgba(34,211,238,0.1)_inset]">
                            <div className="absolute inset-0 radar-sweep" />
                            <div className="w-10 h-10 border border-dashed border-cyan-500/50 rounded-full animate-[spin_10s_linear_infinite_reverse]" />
                            <div className="absolute text-cyan-300 font-bold text-[10px] drop-shadow-md bg-black/50 px-1 rounded">{msg.widget.data.temp}</div>
                          </div>
                          
                          {/* Stats Grid */}
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
                <motion.div 
                  initial={{ opacity: 0, x: -20, filter: "blur(10px)" }} 
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} 
                  exit={{ opacity: 0, scale: 0.9, filter: "blur(5px)" }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="self-start relative group flex items-center gap-4 mt-2"
                >
                  <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full" />
                  <div className="glass-panel text-cyan-300 p-4 px-6 rounded-3xl rounded-bl-sm flex items-center gap-4 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.2)] bg-black/60 backdrop-blur-md relative overflow-hidden">
                    {/* Scanning laser effect */}
                    <div className="absolute top-0 bottom-0 w-1 bg-cyan-400/50 shadow-[0_0_10px_#22d3ee] animate-[scan_2s_ease-in-out_infinite]" />
                    
                    <Cpu className="w-5 h-5 animate-pulse text-cyan-400" />
                    <span className="text-sm font-medium tracking-wide">Snow is exploring her neural networks...</span>
                    
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
            {/* Suggestion pills container grouped right above the input */}
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
              {/* Microphone button inside the pill */}
              <button 
                onClick={startSpeechRecognition} 
                className={`p-3 rounded-full transition-all duration-300 ${isListening ? "bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.5)] border border-rose-400" : "text-white/60 hover:text-white hover:bg-white/5 cursor-pointer"}`} 
                title="Speak to Snow"
              >
                <Mic className={`w-4 h-4 ${isListening ? "animate-pulse" : ""}`} />
              </button>
              
              {/* Text input inside the pill */}
              <input 
                type="text" 
                placeholder={isListening ? "Listening..." : "Message Snow..."} 
                value={inputText} 
                onChange={(e) => setInputText(e.target.value)} 
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()} 
                className="flex-1 bg-transparent border-none outline-none text-sm px-4 text-white placeholder-white/35 focus:ring-0" 
              />
              
              {/* Send button inside the pill */}
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
        {/* Right Panel with dynamic context graphics */}
        <motion.div animate={{ opacity: isBooting ? 0.3 : 1 }} transition={{ duration: 0.5, delay: isBooting ? 0 : 0.3 }} className={`col-span-3 glass-panel rounded-3xl p-6 flex flex-col gap-6 overflow-y-auto transition-all duration-500 ${isContextActive ? 'border-pulse border border-cyan-400' : 'border border-cyan-500/15'}`}>
          <div className="flex items-center gap-2 border-b border-white/5 pb-3"><Activity className="w-4 h-4 text-cyan-400" /><span className="text-xs uppercase font-bold tracking-widest text-cyan-400">Snow's Intel</span></div>
          
          {/* Dynamic Relevant Picture */}
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

          <div className="flex flex-col gap-4">
             {!isContextActive && (
               <div className="text-center text-white/30 text-xs italic mt-4">
                 No active modules. Ask Snow about the weather, news, or stocks!
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
             
             {sportWidget && (
               <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4 rounded-2xl border border-cyan-500/20 shadow-xl flex flex-col items-center gap-2 w-full">
                 <div className="flex items-center gap-2 text-orange-400 uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5 w-full justify-center"><Trophy className="w-3.5 h-3.5" /> {sportWidget.sport}</div>
                 <div className="flex justify-between w-full items-center px-2">
                   <div className="flex flex-col items-center"><span className="text-[10px] text-white/60">{sportWidget.team1}</span><span className="text-lg font-bold">{sportWidget.score1}</span></div>
                   <span className="text-white/30 font-bold text-[10px]">VS</span>
                   <div className="flex flex-col items-center"><span className="text-[10px] text-white/60">{sportWidget.team2}</span><span className="text-lg font-bold">{sportWidget.score2}</span></div>
                 </div>
               </motion.div>
             )}

             {musicWidget && (
               <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4 rounded-2xl border border-cyan-500/20 shadow-xl flex flex-col items-center gap-2 w-full">
                 <div className="flex items-center gap-2 text-pink-400 uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5 w-full justify-center"><Music className="w-3.5 h-3.5" /> Now Playing</div>
                 <div className="text-sm font-bold text-white text-center mt-1">{musicWidget.title}</div>
                 <div className="text-[10px] text-white/60">{musicWidget.artist} • {musicWidget.genre}</div>
               </motion.div>
             )}

             {systemWidget && (
               <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel p-4 rounded-2xl border border-cyan-500/40 shadow-[0_0_30px_rgba(34,211,238,0.15)] flex flex-col gap-3 w-full relative overflow-hidden tech-grid">
                 <div className="absolute -left-10 -top-10 w-32 h-32 bg-cyan-500/10 blur-2xl rounded-full" />
                 <div className="flex items-center gap-2 text-cyan-300 uppercase tracking-widest text-[10px] font-black border-b border-cyan-500/20 pb-2 w-full justify-center z-10">
                   <Cpu className="w-3.5 h-3.5 animate-pulse" /> System Core Diagnostics
                 </div>
                 
                 <div className="flex items-center justify-between px-1 z-10">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full border border-cyan-500/30 flex items-center justify-center relative bg-black/40">
                       <div className="absolute inset-0 radar-sweep opacity-70" />
                       <span className="text-[8px] font-bold text-white z-10">{systemWidget.temp}</span>
                     </div>
                     <div className="flex flex-col">
                       <span className="text-[9px] text-cyan-200/50 uppercase tracking-widest">Load</span>
                       <span className="text-lg font-bold text-white leading-tight">{systemWidget.cpu}</span>
                     </div>
                   </div>
                   
                   <div className="flex flex-col text-right">
                     <span className="text-[9px] text-cyan-200/50 uppercase tracking-widest">Memory</span>
                     <span className="text-xs font-bold text-white">{systemWidget.ram}</span>
                   </div>
                 </div>
               </motion.div>
             )}

          </div>
        </motion.div>
      </div>
    </div>
  );
}
