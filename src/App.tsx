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
    type: "weather" | "news" | "stock" | "sport" | "time" | "music";
    data: any;
  };
}

interface WeatherData { temp: string; condition: string; location: string; humidity?: string; wind?: string; }
interface NewsData { headline: string; source: string; category?: string; }
interface StockData { symbol: string; price: string; change: string; up: boolean; }
interface SportData { team1: string; score1: string; team2: string; score2: string; sport: string; }
interface TimeData { time: string; timezone: string; location: string; date: string; }
interface MusicData { title: string; artist: string; genre: string; }

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
      const utterance = new SpeechSynthesisUtterance(text);
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
        audio.playbackRate = 1.05;

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
      let widgetType: "weather" | "news" | "stock" | "sport" | "time" | "music" | null = null;

      const parseWidget = (tag: string, setter: any, type: "weather" | "news" | "stock" | "sport" | "time" | "music") => {
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

      if (aiText.includes("[UI_JOKE:")) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }

      let cleanDisplay = aiText;
      const uiTags = ["[UI_WEATHER:", "[UI_NEWS:", "[UI_STOCK:", "[UI_SPORT:", "[UI_TIME:", "[UI_MUSIC:", "[UI_JOKE:"];
      
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
        .replace(/\[WEATHER:\s*[A-Z]+\]/gi, "")
        .trim();

      setResponseStats({ time: ((Date.now() - startTime) / 1000).toFixed(2) + "s", network: "Excellent", model: "Gemini 2.5" });

      setChatHistory((prev) => [
        ...prev,
        {
          id: `snow-${Date.now()}`,
          sender: "snow",
          text: cleanDisplay,
          widget: widgetType ? { type: widgetType, data: widgetData } : undefined
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
        <div className="col-span-9 flex flex-col justify-between overflow-hidden relative">
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
            {chatHistory.map((msg) => (
              <div key={msg.id} className={`w-full flex flex-col gap-2 ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className={`max-w-[75%] p-4 rounded-3xl text-sm leading-relaxed shadow-lg backdrop-blur-xl group ${msg.sender === "user" ? "bg-white/10 border border-white/20 text-white rounded-br-sm shadow-[0_0_20px_rgba(255,255,255,0.05)]" : "glass-panel text-white/90 rounded-bl-sm border border-cyan-500/10"}`}
                >
                  {msg.sender === "snow" && msg !== chatHistory[0] ? <TypewriterText text={msg.text} /> : msg.text}
                  {msg.sender === "snow" && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-white/5 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => navigator.clipboard.writeText(msg.text)} className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
                      <button className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white"><ThumbsUp className="w-3.5 h-3.5" /></button>
                      <button className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white"><ThumbsDown className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </motion.div>
                
                {msg.widget && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    className="w-full max-w-[75%] mt-1"
                  >
                    {msg.widget.type === "weather" && (
                      <div className="glass-panel p-5 rounded-3xl border border-cyan-500/20 shadow-xl flex flex-col items-center gap-3 w-full">
                        <div className="flex items-center gap-2 text-white uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5 justify-center w-full"><MapPin className="w-3.5 h-3.5" /> {msg.widget.data.location}</div>
                        <div className="flex items-center gap-4 py-1">
                          {msg.widget.data.condition.toLowerCase().includes('snow') ? <div className="scale-75"><Snowflake3D /></div> : <Sun className="w-10 h-10 text-yellow-300 animate-pulse" />}
                          <div className="flex flex-col"><span className="text-3xl font-extrabold text-white">{msg.widget.data.temp}</span><span className="text-xs text-white/60 capitalize">{msg.widget.data.condition}</span></div>
                        </div>
                      </div>
                    )}
                    {msg.widget.type === "news" && (
                      <div className="glass-panel p-5 rounded-3xl border border-cyan-500/20 shadow-xl flex flex-col gap-2 w-full">
                        <div className="flex justify-between text-white uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5"><div className="flex gap-2"><Newspaper className="w-3.5 h-3.5" /> News</div><span className="text-[9px] text-white/40">{msg.widget.data.source}</span></div>
                        <div className="py-1 text-white text-sm leading-relaxed font-serif text-center">"{msg.widget.data.headline}"</div>
                      </div>
                    )}
                    {msg.widget.type === "stock" && (
                      <div className="glass-panel p-5 rounded-3xl border border-cyan-500/20 shadow-xl flex flex-col items-center gap-2 w-full">
                        <div className="flex items-center gap-2 text-white/60 uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5 w-full justify-center"><TrendingUp className="w-3.5 h-3.5" /> Market Data</div>
                        <div className="text-xl font-bold text-white mt-1 ticker-value">{msg.widget.data.symbol}</div>
                        <div className="flex items-baseline gap-2"><span className="text-3xl font-bold">{msg.widget.data.price}</span><span className={`text-sm font-semibold ${msg.widget.data.up ? 'text-green-400' : 'text-red-400'}`}>{msg.widget.data.change}</span></div>
                      </div>
                    )}
                    {msg.widget.type === "time" && (
                      <div className="glass-panel p-5 rounded-3xl border border-cyan-500/20 shadow-xl flex flex-col items-center gap-1.5 w-full">
                        <div className="flex items-center gap-2 text-white uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5 w-full justify-center"><Clock className="w-3.5 h-3.5" /> {msg.widget.data.location} ({msg.widget.data.timezone})</div>
                        <div className="text-4xl font-mono font-bold text-white tracking-wider my-2">{msg.widget.data.time}</div>
                        <div className="text-xs text-white/60">{msg.widget.data.date}</div>
                      </div>
                    )}
                    {msg.widget.type === "sport" && (
                      <div className="glass-panel p-5 rounded-3xl border border-cyan-500/20 shadow-xl flex flex-col items-center gap-3 w-full">
                        <div className="flex items-center gap-2 text-orange-400 uppercase tracking-widest text-[10px] font-bold border-b border-white/10 pb-1.5 w-full justify-center"><Trophy className="w-3.5 h-3.5" /> {msg.widget.data.sport}</div>
                        <div className="flex justify-between w-full items-center px-4"><div className="flex flex-col items-center"><span className="text-sm font-bold">{msg.widget.data.team1}</span><span className="text-2xl font-black text-white">{msg.widget.data.score1}</span></div><span className="text-white/30 font-bold text-xs">VS</span><div className="flex flex-col items-center"><span className="text-sm font-bold">{msg.widget.data.team2}</span><span className="text-2xl font-black text-white">{msg.widget.data.score2}</span></div></div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            ))}
            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-start glass-panel text-white/80 p-4 rounded-3xl rounded-bl-sm flex items-center gap-2 border border-white/10 mr-auto">
                <div className="w-2.5 h-2.5 bg-white/60 rounded-full animate-bounce" /><div className="w-2.5 h-2.5 bg-white/60 rounded-full animate-bounce delay-100" /><div className="w-2.5 h-2.5 bg-white/60 rounded-full animate-bounce delay-200" />
              </motion.div>
            )}
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
      </div>
    </div>
  );
}
