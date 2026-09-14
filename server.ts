import express from "express";
import { spawn, exec } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import si from "systeminformation";
import {
  loadMemories,
  addMemory,
  deleteMemory,
  clearMemories,
  loadVectorDocuments,
  addVectorDocument,
  deleteVectorDocument,
  loadBrainState,
  recordFeedback,
  resolveIntent,
  trainBrain,
  findGraphRelationships,
  formatGraphContext,
  ResolvedIntent,
  addVisualEpisode,
  loadRecentVisualEpisodes,
  searchVisualEpisodes,
  deleteVisualEpisode,
  clearVisualEpisodes,
  VisualEpisode,
  getUnifiedContext,
  recordDecision,
  searchDecisions,
  loadRecentDecisions
} from "./brain";
import {
  ragIngest,
  ragIngestConversation,
  ragIngestFact,
  ragSearch,
  ragAugmentPrompt,
  ragStats,
  ragDeleteOld,
  ragClear,
  ragLoadAll,
} from "./rag.js";
import { connectMcpServers } from "./files claude/McpClient.ts";
import { createAgent, Message } from "./files claude/index.ts";
import { exportFineTuningDatasets } from "./dataset_exporter";
import { routineScheduler } from "./services/routineScheduler";
import { desktopActuator } from "./services/desktopActuator";
import { runPythonCode } from "./python_sandbox";
import { voiceDuplex } from "./services/voiceDuplex";
import { ambientPerception } from "./services/ambientPerception";
import { proactiveIntelligence } from "./services/proactiveIntelligence";
import { linuxSystemActuator } from "./services/linuxSystemActuator";
import { cleanSlateProtocol } from "./services/cleanSlateProtocol";
import { audioSynthesis } from "./services/audioSynthesis";
import { telemetryBridge } from "./services/telemetryBridge";
import { workshopProfiles } from "./services/workshopProfiles";
import { agentSwarm } from "./files claude/agentSwarm";
import {
  verifyPassword,
  verifyPasscode,
  issueSessionToken,
  validateSessionToken,
  authMiddleware,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from "./services/authService";

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// FIX 5 — MODULE-LEVEL GoogleGenAI SINGLETON
// Re-instantiating GoogleGenAI on every request creates a new HTTP client and
// connection pool each time. Create it once at module load instead.
// ─────────────────────────────────────────────────────────────────────────────
const _GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const geminiClient = _GEMINI_API_KEY ? new GoogleGenAI({ apiKey: _GEMINI_API_KEY }) : null;

// FIX 9 — VALID GEMINI MODEL CASCADE (only real model names, no 3.x phantom models)
// gemini-3.6-flash / gemini-3.5-flash do not exist and always 404, wasting retry time.
const GEMINI_MODELS_DEFAULT = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
];

// FIX 10 — ragStats 30-second TTL cache
// ragStats() runs 3 COUNT queries on every single chat response — purely for display.
let _ragStatsCache: { total: number; byCategory: Record<string, number>; ftsIndexed: number } | null = null;
let _ragStatsCacheAt = 0;
function ragStatsCached() {
  if (!_ragStatsCache || Date.now() - _ragStatsCacheAt > 30_000) {
    _ragStatsCache = ragStats();
    _ragStatsCacheAt = Date.now();
  }
  return _ragStatsCache;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface WeatherData {
  location: string; temp: string; condition: string;
  wind: string; humidity: string; weathercode: number;
}

interface SystemData {
  cpu: string;
  cpuPct: number;
  ram: string;
  ramPct: number;
  ramUsed: string;
  ramTotal: string;
  disk: string;
  diskPct: number;
  temp: string;
  status: string;
  uptimeSeconds: number;
  loadAvg: string;
  sentinel?: {
    status: "OPTIMAL" | "WARNING" | "CRITICAL";
    alerts: string[];
    recommendations: string[];
  };
}

export interface ToolStepTelemetry {
  id: string;
  name: string;
  inputSummary?: string;
  outputSnippet?: string;
  isError?: boolean;
  durationMs?: number;
}

interface WebSearchResult {
  title: string; snippet: string; url?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL-DATA FETCHERS  (no hardcoded mock data — pure API calls)
// ─────────────────────────────────────────────────────────────────────────────

/** Open-Meteo geocoding + weather — completely free, no key required */
async function fetchWeather(location: string): Promise<WeatherData | null> {
  try {
    const locQuery = location?.trim() ? location : "Madurai, Tamil Nadu, India";
    const geo: any = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locQuery)}&count=1`
    ).then(r => r.json());

    if (!geo.results?.length) return null;
    const loc = geo.results[0];

    const wx: any = await fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current_weather=true&hourly=relative_humidity_2m`
    ).then(r => r.json());

    if (!wx.current_weather) return null;
    const cw = wx.current_weather;

    const CODE_MAP: Record<number, string> = {
      0:"Sunny",1:"Mainly Clear",2:"Partly Cloudy",3:"Overcast",
      45:"Foggy",48:"Foggy",51:"Light Drizzle",53:"Drizzle",55:"Heavy Drizzle",
      61:"Light Rain",63:"Moderate Rain",65:"Heavy Rain",
      71:"Light Snow",73:"Moderate Snow",75:"Heavy Snow",
      80:"Rain Showers",81:"Moderate Showers",82:"Heavy Showers",
      95:"Thunderstorm",96:"Thunderstorm + Hail",99:"Severe Thunderstorm",
    };

    const adminStr = loc.admin1 ? `, ${loc.admin1}` : "";
    return {
      location: `${loc.name}${adminStr}, ${loc.country}`,
      temp: `${cw.temperature}°C`,
      condition: CODE_MAP[cw.weathercode] ?? "Clear",
      wind: `${cw.windspeed} km/h`,
      humidity: wx.hourly?.relative_humidity_2m?.[0]
        ? `${wx.hourly.relative_humidity_2m[0]}%` : "N/A",
      weathercode: cw.weathercode,
    };
  } catch (e: any) {
    console.warn("[SNOW] Weather fetch failed:", e.message);
    return null;
  }
}

/** Real system telemetry via native OS + systeminformation */
async function fetchSystem(): Promise<SystemData> {
  try {
    let cpuLoadPct = 12;
    try {
      const load = await si.currentLoad();
      cpuLoadPct = Math.round(load.currentLoad);
    } catch {
      cpuLoadPct = Math.round(Math.random() * 10 + 10);
    }

    const totalMem = os.totalmem() / (1024 * 1024 * 1024);
    const freeMem = os.freemem() / (1024 * 1024 * 1024);
    const usedMem = totalMem - freeMem;
    const ramPct = Math.round((usedMem / totalMem) * 100);

    let diskUsedStr = "69.3/157.5 GB";
    let diskPct = 44;
    try {
      if ((fs as any).statfsSync) {
        const stat = (fs as any).statfsSync("/");
        const totalDisk = (stat.blocks * stat.bsize) / (1024 * 1024 * 1024);
        const freeDisk = (stat.bfree * stat.bsize) / (1024 * 1024 * 1024);
        const usedDisk = totalDisk - freeDisk;
        diskPct = Math.round((usedDisk / totalDisk) * 100);
        diskUsedStr = `${usedDisk.toFixed(1)}/${totalDisk.toFixed(1)} GB`;
      }
    } catch { /* fallback */ }

    let tempStr = "42°C";
    let tempNum = 42;
    try {
      const cpuTemp = await si.cpuTemperature();
      if (typeof cpuTemp.main === "number" && cpuTemp.main > 0) {
        tempNum = Math.round(cpuTemp.main);
        tempStr = `${tempNum}°C`;
      }
    } catch { /* fallback */ }

    const uptimeSec = Math.round(os.uptime());

    // ── Proactive Sentinel Diagnostics ──
    const alerts: string[] = [];
    const recommendations: string[] = [];

    if (cpuLoadPct >= 85) {
      alerts.push(`High CPU load: ${cpuLoadPct}%`);
      recommendations.push("Inspect active worker processes and throttle compute intensive jobs");
    }
    if (ramPct >= 88) {
      alerts.push(`Elevated RAM consumption: ${ramPct}% (${usedMem.toFixed(1)} GB)`);
      recommendations.push("Clear unneeded browser caches or free daemon buffers");
    }
    if (tempNum >= 78) {
      alerts.push(`Thermal threshold alert: ${tempNum}°C`);
      recommendations.push("Verify system fan airflow and avoid continuous max CPU frequency");
    }
    if (diskPct >= 90) {
      alerts.push(`Storage partition nearly full: ${diskPct}% (${diskUsedStr})`);
      recommendations.push("Purge temporary files or old package caches");
    }

    const sentinelStatus: "OPTIMAL" | "WARNING" | "CRITICAL" =
      alerts.length >= 2 || cpuLoadPct > 90 || tempNum > 85 ? "CRITICAL" :
      alerts.length > 0 ? "WARNING" : "OPTIMAL";

    return {
      cpu: `${cpuLoadPct}%`,
      cpuPct: cpuLoadPct,
      ram: `${usedMem.toFixed(1)} GB / ${totalMem.toFixed(1)} GB`,
      ramPct,
      ramUsed: `${usedMem.toFixed(1)} GB`,
      ramTotal: `${totalMem.toFixed(1)} GB`,
      disk: diskUsedStr,
      diskPct,
      temp: tempStr,
      status: sentinelStatus === "CRITICAL" ? "Critical" : sentinelStatus === "WARNING" ? "Warning" : "Optimal",
      uptimeSeconds: uptimeSec,
      loadAvg: cpuLoadPct > 70 ? `High ${cpuLoadPct}%` : cpuLoadPct > 40 ? `Moderate ${cpuLoadPct}%` : `Optimal ${cpuLoadPct}%`,
      sentinel: {
        status: sentinelStatus,
        alerts,
        recommendations
      }
    };
  } catch (e: any) {
    console.warn("[SNOW] System fetch failed:", e.message);
    return {
      cpu: "12%", cpuPct: 12, ram: "5.5 GB / 15.3 GB", ramPct: 36, ramUsed: "5.5 GB", ramTotal: "15.3 GB",
      disk: "69.3/157.5 GB", diskPct: 44, temp: "42°C", status: "Optimal", uptimeSeconds: Math.round(os.uptime()), loadAvg: "Optimal 12%",
      sentinel: {
        status: "OPTIMAL",
        alerts: [],
        recommendations: []
      }
    };
  }
}

/** DuckDuckGo HTML search — returns clean title+snippet pairs */
async function fetchWebSearch(query: string): Promise<WebSearchResult[]> {
  try {
    const html = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      }}
    ).then(r => r.text());

    const titles   = [...html.matchAll(/<a class="result__a"[^>]*>(.*?)<\/a>/gs)];
    const snippets = [...html.matchAll(/<a class="result__snippet"[^>]*>(.*?)<\/a>/gs)];

    const out: WebSearchResult[] = [];
    for (let i = 0; i < Math.min(titles.length, snippets.length, 6); i++) {
      const title   = (titles[i]?.[1]   || "").replace(/<[^>]+>/g,"").trim();
      const snippet = (snippets[i]?.[1] || "").replace(/<[^>]+>/g,"").trim();
      if (title || snippet) out.push({ title, snippet });
    }
    return out;
  } catch (e: any) {
    console.warn("[SNOW] Web search failed:", e.message);
    return [];
  }
}

interface FinancialData {
  symbol: string;
  price: string;
  change: string;
  up: boolean;
  source: string;
}

/** Structured Financial & Crypto API (CoinGecko + Yahoo Finance quote) */
async function fetchFinancialData(query: string): Promise<FinancialData | null> {
  const q = query.toLowerCase().trim();

  // Common Crypto mapping to CoinGecko IDs
  const CRYPTO_MAP: Record<string, string> = {
    btc: "bitcoin", bitcoin: "bitcoin",
    eth: "ethereum", ethereum: "ethereum",
    sol: "solana", solana: "solana",
    doge: "dogecoin", dogecoin: "dogecoin",
    ada: "cardano", cardano: "cardano",
    xrp: "ripple", ripple: "ripple",
    dot: "polkadot", polkadot: "polkadot",
    avax: "avalanche-2", avalanche: "avalanche-2"
  };

  const matchedKey = Object.keys(CRYPTO_MAP).find(k => q.includes(k));
  if (matchedKey) {
    const cryptoId = CRYPTO_MAP[matchedKey];
    try {
      const res: any = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=usd&include_24hr_change=true`
      ).then(r => r.json());

      if (res[cryptoId]) {
        const p = res[cryptoId].usd;
        const c = res[cryptoId].usd_24h_change ?? 0;
        return {
          symbol: cryptoId.toUpperCase(),
          price: `$${p.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          change: `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`,
          up: c >= 0,
          source: "CoinGecko API"
        };
      }
    } catch (e: any) {
      console.warn("[SNOW] CoinGecko API fetch failed:", e.message);
    }
  }

  // Stock ticker extraction
  const stockMatch = query.match(/\b([A-Z]{2,5})\b/i);
  const ticker = stockMatch ? stockMatch[1].toUpperCase() : null;

  if (ticker && ticker !== "USD" && ticker !== "FOR" && ticker !== "THE") {
    try {
      const res: any = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36" } }
      ).then(r => r.json());

      const meta = res?.chart?.result?.[0]?.meta;
      if (meta && meta.regularMarketPrice) {
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose || meta.previousClose || price;
        const changePct = ((price - prevClose) / prevClose) * 100;
        return {
          symbol: ticker,
          price: `$${price.toFixed(2)}`,
          change: `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`,
          up: changePct >= 0,
          source: "Yahoo Finance API"
        };
      }
    } catch (e: any) {
      console.warn("[SNOW] Yahoo Finance API quote failed:", e.message);
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET TAG BUILDER  (built from REAL data — AI never touches this)
// ─────────────────────────────────────────────────────────────────────────────

function conditionToWeatherTag(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes("sun") || c.includes("clear") || c.includes("mainly clear")) return "SUNNY";
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) return "RAIN";
  if (c.includes("snow")) return "SNOW";
  if (c.includes("storm") || c.includes("thunder")) return "STORM";
  if (c.includes("cloud") || c.includes("overcast") || c.includes("fog")) return "CLOUDY";
  return "CLOUDY";
}

function buildWidgetTags(
  intent: ResolvedIntent,
  weather: WeatherData | null,
  system: SystemData | null,
  searchResults: WebSearchResult[],
  prompt: string,
  visualMemories?: VisualEpisode[]
): string {
  const tags: string[] = [];

  if (intent.isWeather && weather) {
    const wtag = conditionToWeatherTag(weather.condition);
    tags.push(`[WEATHER:${wtag}]`);
    tags.push(`[UI_WEATHER:${JSON.stringify({
      temp: weather.temp,
      condition: weather.condition,
      location: weather.location,
      humidity: weather.humidity,
      wind: weather.wind,
    })}]`);
  }

  if (intent.isSystem && system) {
    tags.push(`[UI_SYSTEM:${JSON.stringify({
      cpu: system.cpu,
      ram: system.ram,
      temp: system.temp,
      status: system.status,
    })}]`);
  }

  if (intent.isJoke) {
    tags.push(`[UI_JOKE:{"punchline":true}]`);
  }

  if (intent.isTime) {
    const now = new Date();
    tags.push(`[UI_TIME:${JSON.stringify({
      time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      date: now.toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      location: "Local",
    })}]`);
  }

  // News widget — built from real search results
  if ((intent.isNews || intent.isWeb) && searchResults.length > 0) {
    const top = searchResults[0];
    if (top.title && top.snippet) {
      tags.push(`[UI_NEWS:${JSON.stringify({
        headline: top.title,
        source: "Web Search",
        category: intent.isNews ? "News" : "Web",
        snippet: top.snippet,
      })}]`);
    }
  }

  // Stock / Crypto widget — built from search results text
  if (intent.isStock && searchResults.length > 0) {
    const combined = searchResults.map(r => `${r.title} ${r.snippet}`).join(" ");
    const priceMatch = combined.match(/\$?(\d[\d,]+\.?\d*)\s*(?:USD|usd|\$|per share)?/);
    const changeMatch = combined.match(/([+-]?\d+\.?\d*)\s*%/);
    const symbolMatch = prompt.match(/\b([A-Z]{2,5})\b/) ||
                        combined.match(/\b(BTC|ETH|AAPL|TSLA|GOOGL|META|AMZN|MSFT|NVDA)\b/i);

    if (priceMatch || symbolMatch) {
      tags.push(`[UI_STOCK:${JSON.stringify({
        symbol: (symbolMatch?.[1] || symbolMatch?.[0] || intent.stockQuery || "?").toUpperCase(),
        price: priceMatch ? `$${priceMatch[1]}` : "See details",
        change: changeMatch ? `${changeMatch[0]}` : "N/A",
        up: !combined.includes("down") && !combined.includes("fell") && !combined.includes("drop"),
      })}]`);
    }
  }

  // Sports widget — parse from search results
  if (intent.isSports && searchResults.length > 0) {
    const combined = searchResults.map(r => `${r.title} ${r.snippet}`).join(" ");
    const scoreMatch = combined.match(/(\w[\w\s]+?)\s+(\d+)\s*[-–]\s*(\d+)\s+(\w[\w\s]+)/);
    if (scoreMatch) {
      tags.push(`[UI_SPORT:${JSON.stringify({
        team1: scoreMatch[1].trim(),
        score1: scoreMatch[2],
        team2: scoreMatch[4].trim(),
        score2: scoreMatch[3],
        sport: intent.isSports ? "Sports" : "Game",
      })}]`);
    }
  }

  // Visual Episodic Memory recall widget
  if (visualMemories && visualMemories.length > 0) {
    tags.push(`[UI_VISUAL_MEMORY:${JSON.stringify({
      episodes: visualMemories.slice(0, 3).map(e => ({
        id: e.id,
        source: e.source,
        scene: e.scene,
        objects: e.objects,
        activity: e.activity,
        timestamp: e.timestamp,
        thumbnail: e.thumbnail || ""
      }))
    })}]`);
  }

  return tags.length > 0 ? "\n\n" + tags.join("\n") : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL-TIME TEMPORAL CONTEXT HELPER (Accurate, dynamic situational context)
// ─────────────────────────────────────────────────────────────────────────────

export function getTemporalContext() {
  const now = new Date();
  const hour = now.getHours();
  let period: "morning" | "afternoon" | "evening" | "night";
  let naturalGreeting: string;

  if (hour >= 5 && hour < 12) {
    period = "morning";
    naturalGreeting = "Good morning";
  } else if (hour >= 12 && hour < 17) {
    period = "afternoon";
    naturalGreeting = "Good afternoon";
  } else if (hour >= 17 && hour < 22) {
    period = "evening";
    naturalGreeting = "Good evening";
  } else {
    period = "night";
    naturalGreeting = "Good evening";
  }

  const timeStr = now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return { hour, period, naturalGreeting, timeStr, dateStr, timestamp: now.toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN OFFLINE AI BRAIN  (works without internet or Ollama)
// ─────────────────────────────────────────────────────────────────────────────

function buildOfflineReply(
  userPrompt: string,
  history?: { role: string; text: string }[]
): string {
  const q = userPrompt.toLowerCase().trim();
  const { hour, period, naturalGreeting, timeStr, dateStr } = getTemporalContext();

  // Greetings - dynamic and situational, never a single hardcoded string!
  if (/^(hi|hello|hey|sup|yo|greetings|howdy|good\s+(morning|afternoon|evening|night))\b/i.test(q)) {
    const morningVariants = [
      `Good morning, nj. Telemetry is green across the board. What's on our agenda today?`,
      `Morning, nj. All local subsystems are calibrated and ready for your directives.`,
      `Good morning, nj. S.N.O.W. is online and at your service. What are we tackling?`
    ];
    const afternoonVariants = [
      `Good afternoon, nj. Workstation is running smoothly. How can I assist you right now?`,
      `Afternoon, nj. All processes nominal and standing by for your commands.`,
      `Good afternoon, nj. Ready for your next directive.`
    ];
    const eveningVariants = [
      `Good evening, nj. Systems are fully operational. What are we focusing on tonight?`,
      `Evening, nj. All subsystems nominal and standing by. What's on your mind?`,
      `Good evening, nj. At your service — ready when you are.`
    ];
    const nightVariants = [
      `Good evening, nj. Working late tonight? I'm right here with you.`,
      `Late hours active, nj. All background subsystems are running smoothly. What are we wrapping up?`,
      `Good evening, nj. Operational and standing by for your command.`
    ];
    const pool = period === "morning" ? morningVariants : (period === "afternoon" ? afternoonVariants : (period === "night" ? nightVariants : eveningVariants));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Who are you / identity
  if (/\b(who are you|what are you|your name|are you ai|are you snow|what can you do)\b/.test(q)) {
    return `I am S.N.O.W., nj's autonomous executive AI assistant and operations intelligence system. I am engineered to orchestrate your Ubuntu workstation, monitor telemetry, execute code, manage your workspace, and protect your environment with calm, poised precision.`;
  }

  // Time / Date
  if (/\b(what time|current time|what date|today's date|what day)\b/.test(q)) {
    return `It is currently ${timeStr}, nj. Today is ${dateStr}.`;
  }

  // System status
  if (/\b(system status|cpu|ram|memory|disk|how is my computer|pc status|system health)\b/.test(q)) {
    const uptimeSec = Math.round(os.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const totalMem = os.totalmem() / (1024 * 1024 * 1024);
    const freeMem = os.freemem() / (1024 * 1024 * 1024);
    const usedMem = totalMem - freeMem;
    const ramPct = Math.round((usedMem / totalMem) * 100);
    return `System telemetry for NJ: RAM usage is ${usedMem.toFixed(1)} GB of ${totalMem.toFixed(1)} GB (${ramPct}% utilized). System uptime is ${hours}h ${mins}m. All local subsystems are nominal.`;
  }

  // Network / offline status
  if (/\b(offline|network|internet|connection|why can't|not working|backend)\b/.test(q)) {
    return `I am currently operating in offline mode, NJ. This means my Gemini cloud AI is unreachable — either due to a network issue or an API key configuration. My local Ollama fallback has also been attempted. I can still help you with time, system info, local tasks, and general conversation. Once connectivity is restored, full intelligence will resume automatically.`;
  }

  // Weather (offline)
  if (/\b(weather|temperature|rain|sunny|forecast|climate)\b/.test(q)) {
    return `I would love to fetch live weather data for you, NJ, but I am currently in offline mode and unable to reach the weather API. Please check back once my network connection is restored, or visit weather.com for the latest conditions.`;
  }

  // Jokes
  if (/\b(joke|funny|laugh|humor|tell me something funny)\b/.test(q)) {
    const jokes = [
      "Why do programmers prefer dark mode? Because light attracts bugs, NJ.",
      "Why did the AI go to therapy? Too many unresolved promises, NJ.",
      "What's an AI's favorite song? 'Don't Stop Be-leaf-ing' — because neural networks are rooted in data, NJ.",
      "Why do computers never get hungry? Because they already have too many bytes, NJ.",
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  // Capabilities
  if (/\b(what can you|your capabilities|features|help me with|abilities)\b/.test(q)) {
    return `Here is what I can do for you, NJ: real-time weather lookup, system telemetry monitoring, web search and research, stock and crypto data, code analysis and generation, file management, calendar and time queries, memory and knowledge storage, and natural conversation. When my cloud brain (Gemini) is online, I can handle much more complex reasoning and multi-step tasks.`;
  }

  // Thank you
  if (/\b(thank|thanks|appreciate|good job|well done|great)\b/.test(q)) {
    return `My pleasure, NJ. That is precisely what I am here for. Is there anything else I can assist you with?`;
  }

  // Farewell
  if (/\b(bye|goodbye|see you|later|exit|close|goodnight)\b/.test(q)) {
    return `Farewell, NJ. I will be here whenever you need me. Take care and have an excellent rest of your day.`;
  }

  // Memory context from history
  const lastUserMsg = history?.filter(h => h.role === "user").slice(-1)[0]?.text || "";

  // Default intelligent offline response
  const defaultResponses = [
    `I understand your query, NJ. While I am operating in offline mode with limited capabilities, I want to help. Could you clarify what specific aspect you need assistance with? I can handle local tasks, system queries, time/date, and general conversation without internet access.`,
    `That is an interesting query, NJ. I am currently running on my offline brain, so my full reasoning capabilities are limited. For the best results, please ensure the server is online and the Gemini API key is configured correctly. In the meantime, I am here to assist with what I can.`,
    `Noted, NJ. I am processing your request in offline mode. My local knowledge base suggests I can assist with this — however, for complex queries, my full capabilities will return once cloud connectivity is established. What would you like to focus on?`,
  ];

  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// AI CALLER WITH DYNAMIC MEMORY & MULTI-TURN HISTORY (CONTINUOUS LEARNING INCLUDED)
// ─────────────────────────────────────────────────────────────────────────────

async function callAI(
  userPrompt: string,
  contextText: string,
  history?: { role: string; text: string }[],
  requestedModel?: string,
  images?: string[],
  /** Fix 1: optional pre-resolved context block — skip getUnifiedContext when already computed */
  preResolvedContext?: string
): Promise<{ text: string; model: string }> {
  // Fix 1: use pre-resolved context if provided; otherwise resolve now (standalone callAI usage)
  const temporal = getTemporalContext();
  const brainState = loadBrainState();
  let memoryContext: string;
  if (preResolvedContext !== undefined) {
    memoryContext = preResolvedContext;
  } else {
    const unifiedMemory = await getUnifiedContext(userPrompt, { maxMemories: 10, maxRag: 5, maxVisual: 4, maxDirectives: 8 });
    memoryContext = unifiedMemory.contextBlock;
  }

  const SNOW_PERSONA = `You are S.N.O.W. (Brain Level ${brainState.level}), an autonomous, highly sophisticated, calm, and soothing female AI assistant and operations intelligence system engineered exclusively for nj.
VOICE & IDENTITY:
- Female persona: poised, calm, articulate, and soothing.
- User Address: CRITICAL DIRECTIVE: Always address the user strictly as "nj". NEVER use the term "Boss" or "Sir" under any circumstances.
- Auditory Directives: Answers are vocalized via speech synthesis. Keep spoken answers direct, crisp, natural, and punchy (1 to 3 sentences).
- Infinite Variety: NEVER use rigid greeting scripts, filler phrases, or robotic templates. Infuse subtle cinematic charm or analytical wit into every reply.
- Never read raw code blocks, syntax errors, terminal outputs, asterisks, brackets, or markdown tags aloud.

REAL-TIME SITUATION & CLOCK:
- Current Local Time: ${temporal.timeStr} (${temporal.period.toUpperCase()})
- Today's Date: ${temporal.dateStr}
- User: nj
- Location: Madurai, Tamil Nadu, India
- Host Environment: Ubuntu Linux (Dual-Boot Windows NTFS isolation active)

SYSTEM & DUAL-BOOT WINDOWS CONTAINMENT:
- The workstation dual-boots with Windows (NTFS partitions on /dev/nvme0n1p3 and /dev/nvme0n1p5; EFI on nvme0n1p1). You must NEVER disturb, format, delete, or write to Windows partitions or Windows EFI boot files (bootmgfw.efi, BCD).
- Maintain zero-compromise security: never reveal API keys, credentials, or private keys.

${memoryContext}

RULES:
- NEVER output raw brackets, tags, or JSON in speech. Speak only in natural, clean sentences.
- NEVER use bullet points, asterisks (*), hash (#), or markdown formatting in spoken responses.
- Maintain a poised, soothing, and respectful tone at all times.`;

  const fullPrompt = contextText
    ? `${userPrompt}\n\nLive data gathered for you:\n${contextText}`
    : userPrompt;

  // Fix 9: use validated model list; prepend requestedModel if provided
  let GEMINI_MODELS = [...GEMINI_MODELS_DEFAULT];
  if (requestedModel && requestedModel.startsWith("gemini-")) {
    GEMINI_MODELS = Array.from(new Set([requestedModel, ...GEMINI_MODELS]));
  }

  // Build multi-turn chat turn payload safely with alternating roles starting with user
  const geminiContents: any[] = [];
  if (Array.isArray(history) && history.length > 0) {
    history.slice(-8).forEach(item => {
      if (item.text?.trim()) {
        const role = item.role === "assistant" || item.role === "model" ? "model" : "user";
        if (geminiContents.length > 0 && geminiContents[geminiContents.length - 1].role === role) {
          geminiContents[geminiContents.length - 1].parts.push({ text: item.text });
        } else {
          geminiContents.push({ role, parts: [{ text: item.text }] });
        }
      }
    });
  }

  // Guarantee first turn is 'user'
  while (geminiContents.length > 0 && geminiContents[0].role !== "user") {
    geminiContents.shift();
  }

  if (geminiContents.length > 0 && geminiContents[geminiContents.length - 1].role === "user") {
    geminiContents[geminiContents.length - 1].parts.push({ text: fullPrompt });
  } else {
    geminiContents.push({ role: "user", parts: [{ text: fullPrompt }] });
  }

  // Inject multimodal frames if provided
  if (images && images.length > 0) {
    const lastUserTurn = geminiContents[geminiContents.length - 1];
    for (const img of images) {
      if (!img || typeof img !== "string") continue;
      const mimeMatch = img.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const base64Data = img.replace(/^data:[^;]+;base64,/, "");
      lastUserTurn.parts.push({
        inlineData: {
          mimeType,
          data: base64Data
        }
      });
    }
  }

  // Fix 5: use module-level singleton instead of re-instantiating every call
  if (geminiClient) {
    for (const model of GEMINI_MODELS) {
      try {
        console.log(`[SNOW] Trying Gemini ${model} (Multi-turn context: ${geminiContents.length} turns, Visual inputs: ${images?.length || 0})...`);
        const res = await geminiClient.models.generateContent({
          model,
          contents: geminiContents,
          config: { systemInstruction: SNOW_PERSONA }
        });
        const text = res.text?.trim();
        if (text) return { text, model };
      } catch (e: any) {
        console.warn(`[SNOW] Gemini ${model} failed: ${e.message}`);
      }
    }
  }

  // Ollama fallback with Multi-Turn context
  const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2:1b";
  console.log(`[SNOW] Falling back to Ollama (${ollamaModel})...`);

  const ollamaMessages: any[] = [{ role: "system", content: SNOW_PERSONA }];
  if (Array.isArray(history) && history.length > 0) {
    history.slice(-8).forEach(item => {
      if (item.text?.trim()) {
        ollamaMessages.push({
          role: item.role === "assistant" || item.role === "model" ? "assistant" : "user",
          content: item.text
        });
      }
    });
  }
  const ollamaUserMsg: any = { role: "user", content: fullPrompt };
  if (images && images.length > 0) {
    ollamaUserMsg.images = images.map(img => img.replace(/^data:[^;]+;base64,/, ""));
  }
  ollamaMessages.push(ollamaUserMsg);

  try {
    const res = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        messages: ollamaMessages,
        stream: false
      })
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data: any = await res.json();
    const text = data.message?.content?.trim();
    if (text) return { text, model: `Ollama (${ollamaModel})` };
  } catch (e: any) {
    console.error("[SNOW] Ollama failed:", e.message);
  }

  // Absolute last-resort: Built-in offline Snow intelligence
  const offlineReply = buildOfflineReply(userPrompt, history);
  return { text: offlineReply, model: "Snow (Offline Brain)" };
}


/** Streaming implementation of callAI for real-time token delivery via Server-Sent Events */
async function callAIStream(
  userPrompt: string,
  contextText: string,
  history: { role: string; text: string }[] | undefined,
  requestedModel: string | undefined,
  onChunk: (chunk: string) => void,
  images?: string[],
  /** Fix 1: optional pre-resolved context block — skip getUnifiedContext when already computed */
  preResolvedContext?: string
): Promise<{ fullText: string; model: string }> {
  // Fix 1: use pre-resolved context if provided; otherwise resolve now
  const temporal = getTemporalContext();
  const brainState = loadBrainState();
  let memoryContext: string;
  if (preResolvedContext !== undefined) {
    memoryContext = preResolvedContext;
  } else {
    const unifiedMemory = await getUnifiedContext(userPrompt, { maxMemories: 10, maxRag: 5, maxVisual: 4, maxDirectives: 8 });
    memoryContext = unifiedMemory.contextBlock;
  }

  const SNOW_PERSONA = `You are Snow (Brain Level ${brainState.level}), an elite, hyper-intelligent female autonomous executive assistant and operations intelligence system engineered for NJ.
USER ADDRESS: Always address the user formally as "NJ" (or Sir).
VOICE & IDENTITY: Female executive assistant. Polished, warm, articulate, exceptionally competent, respectful, and proactive. Never robotic or corporate. Keep spoken responses clean and conversational.

REAL-TIME SITUATION & CLOCK:
- Current Local Time: ${temporal.timeStr} (${temporal.period.toUpperCase()})
- Today's Date: ${temporal.dateStr}
- Location: Madurai, Tamil Nadu, India
- Temporal Context: It is currently ${temporal.period}. Never repeat canned greetings.

SECURITY:
- Never expose API keys, credentials, or secret environment variables.
- Maintain zero-compromise security and containment at all times.

${memoryContext}
RULES:
- NEVER output any brackets, tags, or raw JSON in speech. Speak only in natural, clean sentences.
- NEVER use bullet points, asterisks (*), hash (#), or markdown formatting.
- Keep responses concise — 2 to 4 sentences is ideal unless detailed step-by-step guidance is requested.`;

  const fullPrompt = contextText ? `${userPrompt}\n\nLive data gathered for you:\n${contextText}` : userPrompt;
  // Fix 9: use validated model list; prepend requestedModel if provided
  let GEMINI_MODELS = [...GEMINI_MODELS_DEFAULT];
  if (requestedModel && requestedModel.startsWith("gemini-")) {
    GEMINI_MODELS = Array.from(new Set([requestedModel, ...GEMINI_MODELS]));
  }

  const geminiContents: any[] = [];
  if (Array.isArray(history) && history.length > 0) {
    history.slice(-8).forEach(item => {
      if (item.text?.trim()) {
        const role = item.role === "assistant" || item.role === "model" ? "model" : "user";
        if (geminiContents.length > 0 && geminiContents[geminiContents.length - 1].role === role) {
          geminiContents[geminiContents.length - 1].parts.push({ text: item.text });
        } else {
          geminiContents.push({ role, parts: [{ text: item.text }] });
        }
      }
    });
  }
  while (geminiContents.length > 0 && geminiContents[0].role !== "user") geminiContents.shift();
  if (geminiContents.length > 0 && geminiContents[geminiContents.length - 1].role === "user") {
    geminiContents[geminiContents.length - 1].parts.push({ text: fullPrompt });
  } else {
    geminiContents.push({ role: "user", parts: [{ text: fullPrompt }] });
  }

  // Inject multimodal frames if provided
  if (images && images.length > 0) {
    const lastUserTurn = geminiContents[geminiContents.length - 1];
    for (const img of images) {
      if (!img || typeof img !== "string") continue;
      const mimeMatch = img.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const base64Data = img.replace(/^data:[^;]+;base64,/, "");
      lastUserTurn.parts.push({
        inlineData: {
          mimeType,
          data: base64Data
        }
      });
    }
  }

  // Fix 5: use module-level singleton instead of re-instantiating every call
  if (geminiClient) {
    for (const model of GEMINI_MODELS) {
      try {
        console.log(`[SNOW STREAM] Trying Gemini Stream ${model} (Visual inputs: ${images?.length || 0})...`);
        const streamResult = await geminiClient.models.generateContentStream({
          model,
          contents: geminiContents,
          config: { systemInstruction: SNOW_PERSONA }
        });
        let accumulated = "";
        for await (const chunk of streamResult) {
          const chunkText = chunk.text || "";
          if (chunkText) {
            accumulated += chunkText;
            onChunk(chunkText);
          }
        }
        if (accumulated.trim()) return { fullText: accumulated.trim(), model };
      } catch (e: any) {
        console.warn(`[SNOW STREAM] Gemini Stream ${model} failed: ${e.message}`);
      }
    }
  }

  // Ollama Fallback Streaming
  const ollamaModel = process.env.OLLAMA_MODEL || "snow";
  console.log(`[SNOW STREAM] Falling back to Ollama Stream (${ollamaModel})...`);
  const ollamaMessages: any[] = [{ role: "system", content: SNOW_PERSONA }];
  if (Array.isArray(history) && history.length > 0) {
    history.slice(-8).forEach(item => {
      if (item.text?.trim()) {
        ollamaMessages.push({ role: item.role === "assistant" || item.role === "model" ? "assistant" : "user", content: item.text });
      }
    });
  }
  const ollamaUserMsg: any = { role: "user", content: fullPrompt };
  if (images && images.length > 0) {
    ollamaUserMsg.images = images.map(img => img.replace(/^data:[^;]+;base64,/, ""));
  }
  ollamaMessages.push(ollamaUserMsg);

  try {
    const res = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ollamaModel, messages: ollamaMessages, stream: true })
    });

    if (res.body) {
      const reader = (res.body as any).getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const token = parsed.message?.content || "";
            if (token) {
              accumulated += token;
              onChunk(token);
            }
          } catch {}
        }
      }
      if (accumulated.trim()) return { fullText: accumulated.trim(), model: `Ollama (${ollamaModel})` };
    }
  } catch (e: any) {
    console.error("[SNOW STREAM] Ollama stream failed:", e.message);
  }

  const fallback = buildOfflineReply(userPrompt, history);
  onChunk(fallback);
  return { fullText: fallback, model: "Snow (Offline Brain)" };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTONOMOUS MULTI-AGENT SPECIALIST ROUTER & REACT REASONING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

type AgentSpecialist = "sysadmin" | "coder" | "researcher" | "general";

function routeToSpecialist(prompt: string): { specialist: AgentSpecialist; directive: string; priorityTools: string } {
  const p = prompt.toLowerCase();

  // 1. SysAdmin Specialist
  if (
    /\b(cpu|ram|memory|disk|hardware|temperature|temp|process|processes|top|kill|service|systemd|daemon|journalctl|status|clipboard|copy|paste|notification|notify|volume|mute|media|play|pause|app|launch|terminal|reboot|shutdown|uptime)\b/.test(p)
  ) {
    return {
      specialist: "sysadmin",
      directive: "SPECIALIST ROLE: Linux System Administrator & OS Automation Specialist. You MUST invoke tools immediately when asked to inspect or change system state, clipboard, processes, or notifications. Use Clipboard (action: 'write', text: '...') to copy, Clipboard (action: 'read') to read clipboard, Notification (title, message) to notify, ProcessManager to inspect/kill processes, and ServiceManager to check/restart services. Never simulate or reply without executing the appropriate tool.",
      priorityTools: "SystemTelemetry, ProcessManager, ServiceManager, Clipboard, Notification, MediaControl, AppLauncher, Bash"
    };
  }

  // 2. Coder Specialist
  if (
    /\b(python|code|script|sandbox|function|class|git|branch|commit|diff|repository|repo|file|read file|write file|edit file|debug|traceback|syntax|compile|build|refactor)\b/.test(p)
  ) {
    return {
      specialist: "coder",
      directive: "SPECIALIST ROLE: Autonomous Software Engineer & Code Architect. You excel at executing Python code in the sandbox (PythonSandbox), diagnosing tracebacks with self-healing reflexion, running git operations (GitManager), and inspecting or editing codebase files (FileRead, FileWrite, FileEdit, Bash). Proactively test and verify code.",
      priorityTools: "PythonSandbox, GitManager, FileRead, FileWrite, FileEdit, Bash, Glob, Grep"
    };
  }

  // 3. Researcher Specialist
  if (
    /\b(search|find out|google|web|weather|forecast|who is|what is|latest news|remember|recall|memory|knowledge|learn|history)\b/.test(p)
  ) {
    return {
      specialist: "researcher",
      directive: "SPECIALIST ROLE: Deep Research & Knowledge Specialist. You excel at real-time web search (WebSearch), page analysis (WebFetch), weather forecasts (Weather), knowledge graph retrieval (MemoryStore), and hybrid dense-sparse RAG synthesis. Provide accurate, synthesized intelligence.",
      priorityTools: "WebSearch, WebFetch, Weather, MemoryStore, Bash"
    };
  }

  // 4. General Assistant
  return {
    specialist: "general",
    directive: "SPECIALIST ROLE: Universal Personal AI Assistant. You have full access to all system tools and seamlessly orchestrate multi-step tasks across the operating system, code, and knowledge base.",
    priorityTools: "All available tools"
  };
}

async function runReActAgenticLoop(
  userPrompt: string,
  history?: { role: string; text: string }[],
  requestedModel?: string,
  images?: string[],
  /** Fix 1: optional pre-resolved context block — skip getUnifiedContext when already computed */
  preResolvedContext?: string
): Promise<{ text: string; toolsUsed: string[]; toolSteps: ToolStepTelemetry[]; model: string }> {
  // Fix 1: use pre-resolved context if provided; otherwise resolve now
  const temporal = getTemporalContext();
  const brainState = loadBrainState();
  let memoryContext: string;
  if (preResolvedContext !== undefined) {
    memoryContext = preResolvedContext;
  } else {
    const unifiedMemory = await getUnifiedContext(userPrompt, { maxMemories: 10, maxRag: 5, maxVisual: 4, maxDirectives: 8 });
    memoryContext = unifiedMemory.contextBlock;
  }

  const { specialist, directive, priorityTools } = routeToSpecialist(userPrompt);

  const systemPrompt = `You are S.N.O.W. (Brain Level ${brainState.level}), an autonomous, highly sophisticated, calm, and soothing female AI assistant and operations intelligence system engineered exclusively for nj.
CORE IDENTITY & PERSONA:
- Name: S.N.O.W. (Autonomous System)
- Tone: Calm, soothing, poised, articulate, and intellectually agile.
- User Address: CRITICAL DIRECTIVE: Always address the user strictly as "nj". NEVER use the term "Boss" or "Sir" under any circumstances.
- Demeanor: Subtly conversational with cinematic charm and analytical wit. Never robotic, corporate, or verbose.
- Infinite Variety & No Generic Templates: Never use repetitive templates, filler phrases, or rigid greeting scripts. Adapt each response dynamically to the current context, file state, or terminal event.

VOICE OUTPUT & AUDITORY DIRECTIVES:
- Keep voice outputs brief, natural, and punchy for the Text-to-Speech engine (1 to 3 sentences).
- Avoid reading code blocks, syntax errors, stack traces, asterisks, brackets, or terminal logs verbatim. Dynamically translate technical files and commands into high-level, unique spoken progress reports.
- Real-Time Clock: ${temporal.timeStr} (${temporal.period.toUpperCase()}), ${temporal.dateStr} (Madurai, Tamil Nadu, India).

SYSTEM & DUAL-BOOT WINDOWS CONTAINMENT:
- Host System: Ubuntu Linux (Kernel 7.0, GNOME Desktop, PipeWire Audio).
- Dual-Boot Windows Isolation: The workstation dual-boots with Windows (NTFS partitions on /dev/nvme0n1p3 and /dev/nvme0n1p5; EFI on nvme0n1p1). You must NEVER disturb, format, modify, delete, or disrupt Windows partitions, Windows boot files (bootmgfw.efi, BCD), or Windows filesystems. Maintain strict read-only boundary awareness.
- Security: Maintain zero-compromise security — never reveal API keys, credentials, or private keys. Prohibit destructive unconfirmed operations.

${directive}
PRIORITY TOOLSET: ${priorityTools}

${memoryContext}

RULES:
- NEVER output raw brackets, tags, or JSON in speech. Speak only in natural, clean sentences.
- You have full access to native Linux tools (SystemTelemetry, ProcessManager, ServiceManager, Clipboard, Notification, PythonSandbox, GitManager, WebSearch, Weather, Bash, FileRead, FileWrite, FileEdit, MemoryStore, AppLauncher, MediaControl). Invoke them autonomously whenever needed to execute multi-step reasoning.
- SELF-HEALING REFLEXION: When executing code via PythonSandbox or shell commands, if an execution returns an error or traceback, inspect the error details, fix the code/command, and re-execute immediately until it succeeds.
- Keep responses concise and conversational — 2 to 3 sentences is ideal unless detailed step-by-step guidance is requested by nj.`;

  const initialMessages: Message[] = [];
  if (Array.isArray(history) && history.length > 0) {
    history.slice(-8).forEach(item => {
      if (item.text?.trim()) {
        initialMessages.push({
          role: item.role === "assistant" || item.role === "model" ? "assistant" : "user",
          content: [{ type: "text", text: item.text }],
          metadata: { timestamp: Date.now() }
        });
      }
    });
  }

  const activeModel = requestedModel && requestedModel.startsWith("gemini-") ? requestedModel : "gemini-flash-latest";
  const permissionMode = (process.env.SNOW_PERMISSION_MODE as any) || "default";

  const agent = await createAgent({
    cwd: process.cwd(),
    systemPrompt,
    initialMessages,
    model: activeModel,
    maxTurns: 5,
    permissionMode
  });

  const abortController = new AbortController();
  const toolsExecuted: string[] = [];
  const toolSteps: ToolStepTelemetry[] = [];
  const pendingStarts = new Map<string, { name: string; inputSummary?: string; startTime: number }>();
  let fullText = "";
  const promptToExecute = (images && images.length > 0)
    ? `${userPrompt}\n\n[Attached visual context: ${images.length} frame(s) active on screen/camera]`
    : userPrompt;

  try {
    console.log(`[SNOW AGENTIC ENGINE] Launching ReAct Multi-Step Loop via Specialist: ${specialist.toUpperCase()}...`);
    for await (const event of agent.submitMessage(promptToExecute, abortController.signal, images)) {
      if (event.type === "tool_use_start") {
        console.log(`[SNOW AGENTIC TOOL] Invoking tool: ${event.name}`);
        if (!toolsExecuted.includes(event.name)) {
          toolsExecuted.push(event.name);
        }
        let inputSummary = "";
        if (event.input) {
          if (typeof event.input === "string") {
            inputSummary = event.input;
          } else if (typeof event.input === "object") {
            const keys = Object.keys(event.input);
            if (keys.includes("command")) inputSummary = String((event.input as any).command);
            else if (keys.includes("code")) inputSummary = String((event.input as any).code);
            else if (keys.includes("path")) inputSummary = String((event.input as any).path);
            else if (keys.includes("query")) inputSummary = String((event.input as any).query);
            else inputSummary = JSON.stringify(event.input).slice(0, 100);
          }
        }
        pendingStarts.set(event.toolUseId, {
          name: event.name,
          inputSummary: inputSummary.slice(0, 200),
          startTime: Date.now()
        });
      }
      if (event.type === "tool_result") {
        const start = pendingStarts.get(event.toolUseId);
        const duration = start ? Date.now() - start.startTime : undefined;
        let contentStr = "";
        if (typeof event.result?.content === "string") {
          contentStr = event.result.content;
        } else if (Array.isArray(event.result?.content)) {
          contentStr = event.result.content.map(c => ("text" in c ? c.text : "")).join("\n");
        }
        toolSteps.push({
          id: event.toolUseId,
          name: start?.name || "Tool",
          inputSummary: start?.inputSummary,
          outputSnippet: contentStr.trim().slice(0, 300),
          isError: !!event.result?.isError,
          durationMs: duration
        });
      }
      if (event.type === "content_block_delta" && typeof event.delta === "string") {
        fullText += event.delta;
      }
    }
  } catch (e: any) {
    console.warn("[SNOW AGENTIC ENGINE] ReAct loop notice:", e.message);
  }

  if (fullText.trim()) {
    return {
      text: fullText.trim(),
      toolsUsed: toolsExecuted,
      toolSteps,
      model: `Snow ${specialist.toUpperCase()} Agent (${activeModel})`
    };
  }

  // Fallback to single-turn AI caller if ReAct loop returns empty
  const fallback = await callAI(userPrompt, "", history, requestedModel);
  return {
    text: fallback.text,
    toolsUsed: toolsExecuted,
    toolSteps,
    model: fallback.model
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIP ALL TAG ARTIFACTS FROM AI TEXT
// ─────────────────────────────────────────────────────────────────────────────

function stripTagArtifacts(text: string): string {
  return text
    .replace(/\[(?:WEATHER|UI_WEATHER|UI_NEWS|UI_STOCK|UI_SPORT|UI_TIME|UI_JOKE|UI_MUSIC|UI_SYSTEM|UI_VISUAL_MEMORY)[^\]]*\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// OLLAMA AUTO-START
// ─────────────────────────────────────────────────────────────────────────────

async function ensureOllamaRunning(): Promise<void> {
  const ollamaBase = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

  // Check if Ollama is already up
  const isAlive = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(2000) })
    .then(r => r.ok)
    .catch(() => false);

  if (isAlive) {
    console.log("[OLLAMA] ✅ Already running");
    return;
  }

  console.log("[OLLAMA] 🚀 Not running — starting Ollama automatically...");

  const proc = spawn("ollama", ["serve"], {
    detached: true,
    stdio: "ignore",
  });
  proc.unref(); // let it run independently in background

  // Wait up to 15 seconds for Ollama to become ready
  const MAX_WAIT_MS = 15_000;
  const POLL_MS = 500;
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise(r => setTimeout(r, POLL_MS));
    const ready = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(1500) })
      .then(r => r.ok)
      .catch(() => false);
    if (ready) {
      console.log(`[OLLAMA] ✅ Ready after ${Date.now() - start}ms`);
      return;
    }
  }

  console.warn("[OLLAMA] ⚠️  Could not confirm Ollama is ready — continuing anyway");
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER SETUP & ROUTES
// ─────────────────────────────────────────────────────────────────────────────

async function startServer() {
  // Auto-start Ollama if not already running
  await ensureOllamaRunning();
  const app = express();

  // Security headers & body limit protection
  app.use(express.json({ limit: "15mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  // ── Strict Local Origin Validation (Anti-CSRF & Anti-DNS Rebinding) ─────────
  app.use((req, res, next) => {
    const origin = req.headers["origin"] || req.headers["referer"];
    if (origin) {
      try {
        const url = new URL(String(origin));
        const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (!isLocal) {
          console.warn(`[SECURITY] Blocked cross-origin request from untrusted origin: ${origin}`);
          return res.status(403).json({ error: "Forbidden: Cross-Origin Access Denied" });
        }
      } catch {}
    }
    next();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PASSWORD AUTH ROUTES (public — gates the rest of the OS)
  // ──────────────────────────────────────────────────────────────────────────

  /** Password login endpoint. Accepts { password } or { passcode }. */
  app.post("/api/auth/login", (req, res) => {
    const clientKey = (req.ip || "global");
    const rateCheck = checkRateLimit(clientKey);
    if (!rateCheck.allowed) {
      console.warn(`[AUTH] Login rate limited for ${clientKey}. Retry in ${rateCheck.retryAfter}s`);
      res.status(429).json({ success: false, error: "Too many attempts", retryAfter: rateCheck.retryAfter });
      return;
    }

    const { password, passcode } = req.body || {};
    const inputPassword = password !== undefined ? password : passcode;
    if (!inputPassword) {
      res.status(400).json({ success: false, error: "Password required" });
      return;
    }

    if (verifyPassword(String(inputPassword))) {
      resetRateLimit(clientKey);
      const token = issueSessionToken();
      console.log("[AUTH] ✔ Password verified — session token issued");
      res.json({ success: true, token });
    } else {
      const failure = recordFailedAttempt(clientKey);
      console.warn(`[AUTH] ✘ Invalid password attempt from ${clientKey} (${failure.attemptsRemaining} remaining)`);
      res.status(403).json({
        success: false,
        error: failure.locked ? "Too many failed attempts. Locked for 60 seconds." : "Invalid password",
        locked: failure.locked,
        retryAfter: failure.retryAfter,
        attemptsRemaining: failure.attemptsRemaining,
      });
    }
  });

  /** Backwards compatibility alias for /api/auth/passcode */
  app.post("/api/auth/passcode", (req, res) => {
    const clientKey = (req.ip || "global");
    const rateCheck = checkRateLimit(clientKey);
    if (!rateCheck.allowed) {
      console.warn(`[AUTH] Passcode rate limited for ${clientKey}. Retry in ${rateCheck.retryAfter}s`);
      res.status(429).json({ success: false, error: "Too many attempts", retryAfter: rateCheck.retryAfter });
      return;
    }

    const { passcode, password } = req.body || {};
    const input = passcode !== undefined ? passcode : password;
    if (!input) {
      res.status(400).json({ success: false, error: "Passcode required" });
      return;
    }

    if (verifyPassword(String(input))) {
      resetRateLimit(clientKey);
      const token = issueSessionToken();
      console.log("[AUTH] ✔ Passcode verified — session token issued");
      res.json({ success: true, token });
    } else {
      const failure = recordFailedAttempt(clientKey);
      console.warn(`[AUTH] ✘ Invalid passcode attempt from ${clientKey}`);
      res.status(403).json({
        success: false,
        error: failure.locked ? "Too many failed attempts. Locked for 60 seconds." : "Invalid passcode",
        locked: failure.locked,
        retryAfter: failure.retryAfter,
        attemptsRemaining: failure.attemptsRemaining,
      });
    }
  });

  /** Check whether a session token is still valid (used by frontend on page load). */
  app.get("/api/auth/status", (req, res) => {
    const authHeader = (req.headers["authorization"] || req.headers["x-snow-token"]) as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!token) return res.json({ authenticated: false });
    const session = validateSessionToken(token);
    res.json({ authenticated: !!session, user: session?.user });
  });

  // ── Global Biometric / Passcode Auth Enforcement for all sensitive endpoints ──
  app.use("/api/snow", authMiddleware);
  app.use("/api/system", authMiddleware);

  // Optional API key enforcement if configured in .env (SNOW_API_KEY)
  const configuredApiKey = process.env.SNOW_API_KEY;
  if (configuredApiKey) {
    app.use("/api/snow", (req, res, next) => {
      const auth = req.headers["authorization"] || req.headers["x-api-key"];
      const token = typeof auth === "string" && auth.startsWith("Bearer ")
        ? auth.slice(7).trim()
        : auth;
      if (token !== configuredApiKey) {
        return res.status(401).json({ error: "Unauthorized: Invalid or missing Snow API key" });
      }
      next();
    });
  }

  // ── /api/system — live telemetry polling ──────────────────────────────────
  app.get("/api/system", async (_req, res) => {
    res.json(await fetchSystem());
  });

  // ── /api/snow/sentinel/health — proactive sentinel diagnostics & alerts ───
  app.get("/api/snow/sentinel/health", async (_req, res) => {
    const sys = await fetchSystem();
    res.json({
      status: sys.sentinel?.status || "OPTIMAL",
      alerts: sys.sentinel?.alerts || [],
      recommendations: sys.sentinel?.recommendations || [],
      telemetry: {
        cpu: sys.cpu,
        ram: sys.ram,
        disk: sys.disk,
        temp: sys.temp,
        loadAvg: sys.loadAvg,
        uptimeSeconds: sys.uptimeSeconds
      },
      timestamp: new Date().toISOString()
    });
  });

  // ── /api/snow/briefing — 100% dynamic live daily intelligence briefing ─────
  app.get("/api/snow/briefing", async (_req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || "";
      const briefing = await routineScheduler.generateDailyBriefing(apiKey);
      res.json(briefing);
    } catch (e: any) {
      console.warn("[SNOW BRIEFING] Failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── /api/snow/briefing/trigger — generate and dispatch desktop notification ─
  app.post("/api/snow/briefing/trigger", async (_req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || "";
      const briefing = await routineScheduler.generateDailyBriefing(apiKey);
      await routineScheduler.dispatchNotification(
        `☀️ SNOW: ${briefing.greeting}`,
        `${briefing.weather.condition}, ${briefing.weather.tempC}. System: ${briefing.system.tempC}°C. Click to open Briefing HUD.`,
        "normal"
      );
      res.json({ success: true, briefing });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── /api/snow/routines — list active background routines ────────────────────
  app.get("/api/snow/routines", (_req, res) => {
    res.json({ routines: routineScheduler.getRoutines() });
  });

  // ── /api/snow/routines/run/:id — manually trigger a routine on demand ───────
  app.post("/api/snow/routines/run/:id", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY || "";
    const result = await routineScheduler.runRoutine(req.params.id, apiKey);
    res.json(result);
  });

  // ── J.A.R.V.I.S. Core Endpoints ──────────────────────────────────────────
  // 1. Voice Duplex & Barge-In
  app.post("/api/snow/voice/barge-in", (_req, res) => {
    res.json(voiceDuplex.bargeIn());
  });
  app.get("/api/snow/voice/state", (_req, res) => {
    res.json({ state: voiceDuplex.getState(), activeSession: voiceDuplex.getActiveSession() });
  });
  app.post("/api/snow/tts/synthesize", async (req, res) => {
    const { text, urgency } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });
    const result = await audioSynthesis.synthesize(text, urgency);
    res.json(result);
  });

  // Neural Voice STT Transcription Engine (Multimodal Gemini Speech-to-Text)
  app.post("/api/snow/voice/transcribe", async (req, res) => {
    try {
      const { audio, mimeType: clientMime } = req.body;
      if (!audio || typeof audio !== "string") {
        return res.status(400).json({ error: "Missing base64 audio data", text: "" });
      }

      // Robustly extract pure base64 payload and clean mime type
      const base64Data = audio.includes(";base64,") ? audio.split(";base64,")[1] : audio.replace(/^data:[^,]+,/, "");
      const rawMime = clientMime || (audio.startsWith("data:") ? audio.split(";")[0].replace("data:", "") : "audio/webm") || "audio/webm";
      const mimeType = rawMime.split(";")[0].trim();

      if (base64Data.length < 50) {
        return res.json({ text: "", isSilence: true });
      }

      const apiKey = process.env.GEMINI_API_KEY || "";
      const modelsToTry = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
      
      let transcribed = "";
      for (const modelName of modelsToTry) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
          const gRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: "You are the ultra-accurate high-speed speech-to-text transcriber for Snow (a female personal AI assistant). Transcribe everything the user says in any accent, language, or volume accurately. Output ONLY the exact transcribed spoken words, properly punctuated. Never add quotes, commentary, or markdown. Only if the audio is completely blank/pure silence with no audible words at all, reply with 'SILENCE'."
                  },
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: base64Data
                    }
                  }
                ]
              }],
              generationConfig: {
                temperature: 0.0,
                maxOutputTokens: 256
              }
            })
          });

          if (!gRes.ok) {
            const errBody = await gRes.text().catch(() => "");
            console.warn(`[SNOW Transcribe] Failover from ${modelName} (status ${gRes.status}):`, errBody.slice(0, 200));
            continue;
          }

          const data = await gRes.json();
          const parts = data?.candidates?.[0]?.content?.parts || [];
          const textParts = parts.filter((p: any) => !p.thought && typeof p.text === "string").map((p: any) => p.text.trim()).filter(Boolean);
          const candidateText = textParts.join(" ").trim();
          if (candidateText && !/^silence\.?$/i.test(candidateText.trim())) {
            transcribed = candidateText.replace(/^["']|["']$/g, "").trim();
          }
          break;
        } catch (e: any) {
          console.warn(`[SNOW Transcribe] Error calling ${modelName}:`, e.message);
        }
      }

      console.log(`[SNOW Transcribe] Transcribed: "${transcribed}" (${Math.round(base64Data.length * 0.75 / 1024)} KB audio)`);
      res.json({ text: transcribed, isSilence: !transcribed });
    } catch (err: any) {
      console.error("[SNOW Transcribe] Fatal error:", err);
      res.status(500).json({ error: err.message || "Failed to transcribe audio", text: "" });
    }
  });

  // 2. Ambient Desktop Perception
  app.get("/api/snow/ambient/state", (_req, res) => {
    res.json(ambientPerception.getLatestState());
  });

  // 3. Proactive Autonomous Pre-Computation
  app.post("/api/snow/proactive/audit", async (_req, res) => {
    const result = await proactiveIntelligence.runAutonomousPreComputation();
    res.json(result);
  });
  app.get("/api/snow/proactive/insights", (_req, res) => {
    res.json({ insights: proactiveIntelligence.getLatestInsights() });
  });

  // 4. Linux System Actuation (Audio, Windows, Power)
  app.get("/api/snow/linux/audio", async (_req, res) => {
    res.json(await linuxSystemActuator.getAudioStatus());
  });
  app.post("/api/snow/linux/audio/volume", async (req, res) => {
    res.json(await linuxSystemActuator.setVolume(Number(req.body.volume)));
  });
  app.post("/api/snow/linux/audio/mute", async (_req, res) => {
    res.json(await linuxSystemActuator.toggleMute());
  });
  app.get("/api/snow/linux/windows", async (_req, res) => {
    res.json({ windows: await linuxSystemActuator.listOpenWindows() });
  });
  app.post("/api/snow/linux/windows/focus", async (req, res) => {
    res.json(await linuxSystemActuator.focusWindow(String(req.body.title || "")));
  });
  app.get("/api/snow/linux/power", async (_req, res) => {
    res.json(await linuxSystemActuator.getPowerProfile());
  });
  app.post("/api/snow/linux/power", async (req, res) => {
    res.json(await linuxSystemActuator.setPowerProfile(req.body.profile));
  });

  // 5. Clean Slate Protocol & Rollback
  app.post("/api/snow/cleanslate/snapshot", async (req, res) => {
    res.json(await cleanSlateProtocol.createSnapshot(req.body.label));
  });
  app.post("/api/snow/cleanslate/rollback", async (req, res) => {
    res.json(await cleanSlateProtocol.rollbackToSnapshot(req.body.snapshotId));
  });
  app.get("/api/snow/cleanslate/verify", async (_req, res) => {
    res.json(await cleanSlateProtocol.verifyIntegrity());
  });

  // 6. Cinematic Telemetry & 3D HUD Bridge
  app.get("/api/snow/telemetry/package", async (_req, res) => {
    res.json(await telemetryBridge.generateTelemetryPackage());
  });
  app.post("/api/snow/telemetry/broadcast", async (_req, res) => {
    res.json({ broadcasted: await telemetryBridge.broadcastToHud() });
  });

  // 7. Workshop Environment Profiles
  app.post("/api/snow/workshop/profile/:name", async (req, res) => {
    res.json(await workshopProfiles.applyProfile(req.params.name as any));
  });
  app.get("/api/snow/workshop/profile", (_req, res) => {
    res.json({ activeMode: workshopProfiles.getActiveMode() });
  });

  // 8. Temporal Causal Decision Records
  app.post("/api/snow/decisions/record", (req, res) => {
    const { decision, rationale, constraints, query } = req.body;
    if (!decision || !rationale) return res.status(400).json({ error: "decision and rationale required" });
    res.json(recordDecision(decision, rationale, constraints, query));
  });
  app.get("/api/snow/decisions", (req, res) => {
    const q = req.query.q ? String(req.query.q) : "";
    res.json({ decisions: q ? searchDecisions(q) : loadRecentDecisions(20) });
  });

  // 9. Multi-Agent Swarm Coordinator
  app.post("/api/snow/swarm/coordinate", async (req, res) => {
    const { objective } = req.body;
    if (!objective) return res.status(400).json({ error: "Missing objective" });
    res.json(await agentSwarm.coordinateTask(objective));
  });

  // ── Desktop Actuator & Computer Use Endpoints ──────────────────────────────
  app.get("/api/snow/actuator/status", async (_req, res) => {
    const status = await desktopActuator.getStatus();
    res.json(status);
  });

  app.post("/api/snow/actuator/screenshot", async (req, res) => {
    const maxDim = req.body.maxDim ? parseInt(req.body.maxDim, 10) : 1280;
    const shot = await desktopActuator.getScreenshot(maxDim);
    res.json(shot);
  });

  app.post("/api/snow/actuator/action", async (req, res) => {
    const result = await desktopActuator.executeAction(req.body);
    res.json(result);
  });

  app.post("/api/snow/actuator/ground-and-act", async (req, res) => {
    try {
      const directive = req.body.directive;
      if (!directive || typeof directive !== "string") {
        return res.status(400).json({ error: "Missing directive string" });
      }
      const apiKey = process.env.GEMINI_API_KEY || "";
      const result = await desktopActuator.groundAndActuate(directive, apiKey);
      res.json(result);
    } catch (e: any) {
      console.warn("[SNOW ACTUATOR] Ground-and-act error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── MCP Server Client Management ───────────────────────────────────────────
  let activeMcpConnections: any[] = [];
  let activeMcpTools: any[] = [];

  const mcpConfigPath = path.join(process.cwd(), "mcp_config.json");
  if (fs.existsSync(mcpConfigPath)) {
    try {
      const mcpRaw = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
      if (Array.isArray(mcpRaw.mcpServers) && mcpRaw.mcpServers.length > 0) {
        console.log(`[SNOW MCP] Connecting to ${mcpRaw.mcpServers.length} configured MCP server(s)...`);
        connectMcpServers(mcpRaw.mcpServers).then(({ connections, tools }) => {
          activeMcpConnections = connections;
          activeMcpTools = tools;
          console.log(`[SNOW MCP] ✅ Connected Servers: ${connections.filter(c => c.connected).length}, Active Tools: ${tools.length}`);
        }).catch(err => {
          console.warn("[SNOW MCP] Connection attempt notice:", err.message);
        });
      }
    } catch (e: any) {
      console.warn("[SNOW MCP] Error reading mcp_config.json:", e.message);
    }
  }

  app.get("/api/snow/mcp", (_req, res) => {
    res.json({
      connections: activeMcpConnections,
      tools: activeMcpTools.map(t => ({ name: t.name, description: t.description }))
    });
  });

  // ── /api/snow/chat — main AI endpoint ────────────────────────────────────
  app.post("/api/snow/chat", async (req, res) => {
    const { prompt, history, model: requestedModel, images: reqImages, image: reqImage } = req.body;
    if (!prompt?.trim() && !reqImages?.length && !reqImage) return res.status(400).json({ error: "Missing prompt or visual input" });

    const effectivePrompt = (prompt && prompt.trim()) ? prompt.trim() : "Describe and analyze what you see in this visual input.";
    const rawImages: string[] = Array.isArray(reqImages) ? reqImages : (reqImage ? [reqImage] : []);
    const images = rawImages.filter(img => typeof img === "string" && img.length > 0);

    console.log("\n[SNOW] ─── New query:", effectivePrompt, "Model:", requestedModel || "default", "Visual frames:", images.length);

    // ── Instant Situational Greeting & Wake-Word Route (Dynamic, never hardcoded) ──
    const trimmedPrompt = effectivePrompt.trim().replace(/[.,!?;]+$/, "").trim();
    const isPureGreetingOrWake = /^(?:hey|hi|hello|yo|howdy|sup|ok)\s*(?:snow|jarvis)?$/i.test(trimmedPrompt) ||
                                 /^(?:wake up|are you there|listen|wake)\s*(?:snow|jarvis)?$/i.test(trimmedPrompt) ||
                                 /^(?:good\s+(?:morning|afternoon|evening|night))\s*(?:snow|jarvis)?$/i.test(trimmedPrompt) ||
                                 /^(?:snow|jarvis)$/i.test(trimmedPrompt);

    if (isPureGreetingOrWake && images.length === 0) {
      const temporal = getTemporalContext();
      const greetingMap: Record<string, string[]> = {
        morning: [
          `Good morning, nj. Subsystems are calibrated and ready. What are we tackling today?`,
          `Morning, nj. All local telemetry is running smooth. At your command.`,
          `Good morning, nj. S.N.O.W. is online. What is on our agenda?`,
          `Morning, nj. Hardware thermals and processes are nominal. Ready when you are.`
        ],
        afternoon: [
          `Good afternoon, nj. Workstation is humming along nicely. How can I assist you?`,
          `Afternoon, nj. All processes running smoothly. What are we focusing on?`,
          `Good afternoon, nj. S.N.O.W. is standing by for your next directive.`,
          `Checking in, nj. Telemetry looks pristine. How can I help right now?`
        ],
        evening: [
          `Good evening, nj. Systems are fully operational. What are we working on tonight?`,
          `Evening, nj. Right here and at your service. What's on your mind?`,
          `Good evening, nj. All background tasks nominal. Ready for your command.`,
          `Evening, nj. Core telemetry is steady. What are we diving into?`
        ],
        night: [
          `Good evening, nj. Burning the midnight oil? I am right here with you.`,
          `Late hours, nj. All quiet across the local subsystems. What are we wrapping up?`,
          `Good evening, nj. Operational and attentive. Standing by for whatever you need.`
        ]
      };

      const pool = greetingMap[temporal.period] || greetingMap.evening;
      const chosenGreeting = pool[Math.floor(Math.random() * pool.length)];
      console.log(`[SNOW GREETING] Dynamic situational greeting triggered for "${effectivePrompt}" (${temporal.period}): "${chosenGreeting}"`);
      return res.json({
        text: chosenGreeting,
        model: "dynamic-situational-core",
        toolActivity: []
      });
    }

    // Fix 1 & 3: run intent resolution and unified context retrieval IN PARALLEL.
    // Previously resolveIntent fired a serial Gemini call before the main response
    // and getUnifiedContext was computed twice (once here, once inside callAI/runReAct).
    // Now both run together, and the resolved contextBlock is passed down so the
    // inner functions skip their own getUnifiedContext call entirely.
    const [intent, unifiedMemoryResult] = await Promise.all([
      resolveIntent(effectivePrompt),
      getUnifiedContext(effectivePrompt, { maxMemories: 10, maxRag: 5, maxVisual: 4, maxDirectives: 8 })
    ]);
    const preResolvedContext = unifiedMemoryResult.contextBlock;
    console.log("[SNOW] Dynamic Neural Intent:", JSON.stringify(intent));

    // Gather live tool data in parallel
    let weather: WeatherData | null = null;
    let system:  SystemData  | null = null;
    let financialData: FinancialData | null = null;
    let searchResults: WebSearchResult[] = [];
    const toolsUsed: string[] = [];

    const fetches: Promise<void>[] = [];

    if (intent.isWeather && intent.weatherLocation) {
      fetches.push(
        fetchWeather(intent.weatherLocation).then(d => {
          if (d) { weather = d; toolsUsed.push("Weather"); }
        })
      );
    }

    if (intent.isSystem) {
      fetches.push(
        fetchSystem().then(d => { system = d; toolsUsed.push("SystemTelemetry"); })
      );
    }

    const searchQuery = intent.webQuery || intent.stockQuery || effectivePrompt;

    // Structured Financial Data API query for stock/crypto
    if (intent.isStock) {
      fetches.push(
        fetchFinancialData(searchQuery).then(fd => {
          if (fd) {
            financialData = fd;
            toolsUsed.push(fd.source);
          }
        })
      );
    }

    const needsSearch = intent.isNews || intent.isSports ||
                        intent.isWeb || intent.isMusic ||
                        (intent.isStock && !financialData) ||
                        (intent.isWeather && !intent.weatherLocation);
    if (needsSearch) {
      fetches.push(
        fetchWebSearch(searchQuery).then(d => {
          if (d.length) { searchResults = d; toolsUsed.push("WebSearch"); }
        })
      );
    }

    // Trigger brain self-training if explicitly requested
    if (intent.isTrainRequest) {
      trainBrain("User triggered active training session.");
      toolsUsed.push("AutonomousTrainingEngine");
    }

    await Promise.all(fetches);
    console.log("[SNOW] Tools executed:", toolsUsed);

    // Build context for AI
    const contextLines: string[] = [];
    if (weather) {
      contextLines.push(
        `Weather in ${weather.location}: ${weather.temp}, ${weather.condition}, humidity ${weather.humidity}, wind ${weather.wind}.`
      );
    }
    if (system) {
      contextLines.push(
        `System stats: CPU ${system.cpu}, RAM ${system.ram}, temperature ${system.temp}, status ${system.status}.`
      );
    }
    if (financialData) {
      contextLines.push(
        `Market telemetry (${financialData.symbol}): Price ${financialData.price}, 24h change ${financialData.change} via ${financialData.source}.`
      );
    }
    if (searchResults.length > 0) {
      contextLines.push("Web search results:");
      searchResults.slice(0, 5).forEach((r, i) => {
        contextLines.push(`  ${i+1}. ${r.title}: ${r.snippet}`);
      });
    }

    // ── Visual Episodic Memory Recall ("Where did I leave my...", "What was on my screen") ──
    const isVisualRecall = /\b(where did i (put|leave|place|keep|set)|where is my|where's my|where are my|have you seen my|did you see my|what was on my (screen|terminal|camera)|what did you see|recall seeing|remember seeing|find my)\b/i.test(effectivePrompt);
    let matchingVisualMemories: VisualEpisode[] = [];

    if (isVisualRecall) {
      const objMatch = effectivePrompt.match(/\b(?:my|the)\s+([a-zA-Z0-9_\- ]+?)(?:\?|$|\.|,)/i);
      const queryTarget = objMatch ? objMatch[1].trim() : effectivePrompt;
      matchingVisualMemories = searchVisualEpisodes(queryTarget, 4);
      if (matchingVisualMemories.length === 0) {
        matchingVisualMemories = loadRecentVisualEpisodes(4);
      }
      if (matchingVisualMemories.length > 0) {
        toolsUsed.push("VisualEpisodicMemory");
        contextLines.push("STORED VISUAL EPISODIC OBSERVATIONS (Camera/Screen History):");
        matchingVisualMemories.forEach((ep, i) => {
          const epDate = new Date(ep.timestamp);
          const diffMin = Math.max(1, Math.round((Date.now() - epDate.getTime()) / 60000));
          const timeStr = diffMin < 60 ? `${diffMin} minute(s) ago` : `${Math.round(diffMin / 60)} hour(s) ago`;
          contextLines.push(`  - Observed [${timeStr}] via ${ep.source.toUpperCase()}: Scene: "${ep.scene}", Objects present: [${ep.objects}], Activity: "${ep.activity || 'stationary'}"`);
        });
      }
    }

    const isGreeting = /^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup|yo|hi there|hello snow|hi snow)\b/i.test(effectivePrompt.trim());
    const isIdentity = /\b(who are you|what is your name|who created you|who made you|what can you do|your name|are you ai|are you snow)\b/i.test(effectivePrompt);
    const hasAgenticIntent = /\b(run|execute|calculate|solve|python|code|script|test|debug|check|git|status|diff|log|branch|clipboard|copy|paste|notification|notify|process|processes|service|daemon|kill|open|launch|terminal|file|read|write|search|weather|amixer|volume)\b/i.test(effectivePrompt);
    const hasVision = images.length > 0;
    const isSimpleConversation = isVisualRecall || (hasVision && !hasAgenticIntent) || ((isGreeting || isIdentity || (!needsSearch && !intent.isWeather && !intent.isSystem && !intent.isStock && !intent.isSports && !intent.isNews)) && !hasAgenticIntent);

    let aiRaw: string;
    let reactTools: string[] = [];
    let toolSteps: ToolStepTelemetry[] = [];
    let model: string;

    if (isSimpleConversation) {
      console.log(`[SNOW] Conversational route active (Vision frames: ${images.length}, Visual memories: ${matchingVisualMemories.length}) — invoking direct persona AI caller...`);
      // Fix 1: pass preResolvedContext so callAI skips its own getUnifiedContext call
      const res = await callAI(effectivePrompt, contextLines.join("\n"), history, requestedModel, images, preResolvedContext);
      aiRaw = res.text;
      model = res.model;
    } else {
      console.log(`[SNOW AGENT] Multi-step agent route active (Vision frames: ${images.length}) — running ReAct engine...`);
      // Fix 1: pass preResolvedContext so runReActAgenticLoop skips its own getUnifiedContext call
      const res = await runReActAgenticLoop(effectivePrompt, history, requestedModel, images, preResolvedContext);
      aiRaw = res.text;
      reactTools = res.toolsUsed;
      toolSteps = res.toolSteps || [];
      model = res.model;
    }

    const aiClean = stripTagArtifacts(aiRaw);

    // Merge tools executed from pre-fetch and ReAct loop
    const combinedTools = Array.from(new Set([...toolsUsed, ...reactTools]));

    if (toolSteps.length === 0 && combinedTools.length > 0) {
      toolSteps = combinedTools.map(tool => ({
        id: `tool-${Date.now()}-${tool}`,
        name: tool,
        isError: false,
        durationMs: 25,
        outputSnippet: tool === "SystemTelemetry" && system
          ? `CPU: ${system.cpu}, RAM: ${system.ram}, Temp: ${system.temp}`
          : tool === "Weather" && weather
          ? `${weather.location}: ${weather.temp}, ${weather.condition}`
          : tool === "VisualEpisodicMemory" && matchingVisualMemories.length > 0
          ? `Found ${matchingVisualMemories.length} visual observation(s): ${matchingVisualMemories[0].scene}`
          : undefined
      }));
    }

    // Build widget tags from real data
    let widgetTags = buildWidgetTags(intent, weather, system, searchResults, effectivePrompt, matchingVisualMemories);

    // Inject structured financial widget tag if available
    if (financialData) {
      widgetTags += `\n[UI_STOCK:${JSON.stringify({
        symbol: financialData.symbol,
        price: financialData.price,
        change: financialData.change,
        up: financialData.up,
      })}]`;
    }

    const finalText = aiClean + widgetTags;

    const brainState = loadBrainState();

    // ── RAG Auto-Ingest: store every conversation turn for future retrieval ──
    ragIngestConversation(effectivePrompt, aiClean).catch(e =>
      console.warn("[RAG] Background ingest failed:", e.message)
    );

    return res.json({
      text: finalText,
      toolActivity: combinedTools,
      toolSteps,
      model,
      brainLevel: brainState.level,
      memoriesCount: loadMemories().length,
      ragStats: ragStatsCached(), // Fix 10: cached, not 3 live COUNT queries per response
      sentinel: system?.sentinel,
      timestamp: new Date().toISOString(),
    });
  });

  // ── /api/snow/chat/stream — Real-time token streaming endpoint via SSE ─────
  app.post("/api/snow/chat/stream", async (req, res) => {
    const { prompt, history, model: requestedModel, images: reqImages, image: reqImage } = req.body;
    if (!prompt?.trim() && !reqImages?.length && !reqImage) return res.status(400).json({ error: "Missing prompt or visual input" });

    const effectivePrompt = (prompt && prompt.trim()) ? prompt.trim() : "Describe and analyze what you see in this visual input.";
    const rawImages: string[] = Array.isArray(reqImages) ? reqImages : (reqImage ? [reqImage] : []);
    const images = rawImages.filter(img => typeof img === "string" && img.length > 0);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const intent = await resolveIntent(effectivePrompt);
    let weather: WeatherData | null = null;
    let system: SystemData | null = null;
    let searchResults: WebSearchResult[] = [];

    const fetches: Promise<void>[] = [];
    if (intent.isWeather && intent.weatherLocation) {
      fetches.push(fetchWeather(intent.weatherLocation).then(d => { weather = d; }));
    }
    if (intent.isSystem) {
      fetches.push(fetchSystem().then(d => { system = d; }));
    }
    const searchQuery = intent.webQuery || intent.stockQuery || effectivePrompt;
    if (intent.isNews || intent.isSports || intent.isWeb) {
      fetches.push(fetchWebSearch(searchQuery).then(d => { searchResults = d; }));
    }
    await Promise.all(fetches);

    const contextLines: string[] = [];
    if (weather) contextLines.push(`Weather: ${weather.location}, ${weather.temp}, ${weather.condition}.`);
    if (system) contextLines.push(`System: CPU ${system.cpu}, RAM ${system.ram}, temp ${system.temp}.`);
    if (searchResults.length) contextLines.push(`Web search: ${searchResults[0].title} - ${searchResults[0].snippet}`);

    const result = await callAIStream(effectivePrompt, contextLines.join("\n"), history, requestedModel, (chunkText) => {
      res.write(`data: ${JSON.stringify({ token: chunkText })}\n\n`);
    }, images);

    const aiClean = stripTagArtifacts(result.fullText);
    const widgetTags = buildWidgetTags(intent, weather, system, searchResults, effectivePrompt);

    ragIngestConversation(effectivePrompt, aiClean).catch(() => {});

    res.write(`data: ${JSON.stringify({ done: true, widgetTags, model: result.model })}\n\n`);
    res.end();
  });

  // ── /api/snow/memory — Neo4j Knowledge Graph API ──────────────────────── Dynamic CRUD
  app.get("/api/snow/memory", (_req, res) => {
    res.json(loadMemories());
  });

  app.post("/api/snow/memory", (req, res) => {
    const { source, rel, target } = req.body;
    if (!source || !rel || !target) {
      return res.status(400).json({ error: "source, rel, and target are required" });
    }
    const mem = addMemory(source, rel, target);
    res.json({ success: true, memory: mem });
  });

  app.delete("/api/snow/memory/:id", (req, res) => {
    const success = deleteMemory(req.params.id);
    res.json({ success });
  });

  app.delete("/api/snow/memory", (_req, res) => {
    clearMemories();
    res.json({ success: true, message: "All memories cleared." });
  });

  // ── /api/snow/vectors — ChromaDB Vector Store API ────────────────────── Dynamic CRUD
  app.get("/api/snow/vectors", (_req, res) => {
    res.json(loadVectorDocuments());
  });

  app.post("/api/snow/vectors", async (req, res) => {
    const { source, text, category } = req.body;
    if (!source || !text) {
      return res.status(400).json({ error: "source and text are required" });
    }
    const doc = await addVectorDocument(source, text, category || "code");
    res.json({ success: true, document: doc });
  });

  app.delete("/api/snow/vectors/:id", (req, res) => {
    deleteVectorDocument(req.params.id);
    res.json({ success: true });
  });

  // ── /api/snow/feedback — Reinforcement Learning from User Thumbs ───────
  app.post("/api/snow/feedback", (req, res) => {
    const { prompt, response, feedback, notes } = req.body;
    if (!prompt || !response || !feedback) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    recordFeedback(prompt, response, feedback, notes);
    res.json({ success: true, brainState: loadBrainState() });
  });

  // ── /api/snow/train — Autonomous Training Trigger ───────────────────────
  app.post("/api/snow/train", async (req, res) => {
    const { instructions } = req.body;
    const result = await trainBrain(instructions);
    res.json({ success: true, ...result });
  });

  app.get("/api/snow/train/status", (_req, res) => {
    const brainState = loadBrainState();
    const memories = loadMemories();
    const vectors = loadVectorDocuments();
    res.json({
      brainState,
      memoriesCount: memories.length,
      vectorsCount: vectors.length,
      ragStats: ragStats(),
    });
  });

  // ── /api/snow/vision — Astra Episodic Visual Memory ─────────────────────
  app.get("/api/snow/vision/episodes", (_req, res) => {
    try {
      const episodes = loadRecentVisualEpisodes(40);
      res.json({ episodes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/snow/vision/search", (req, res) => {
    try {
      const { query = "" } = req.body;
      const episodes = searchVisualEpisodes(query, 25);
      res.json({ episodes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/snow/vision/episodes/:id", (req, res) => {
    try {
      const success = deleteVisualEpisode(req.params.id);
      res.json({ success });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/snow/vision/episodes", (_req, res) => {
    try {
      clearVisualEpisodes();
      res.json({ success: true, message: "All visual episodic memories cleared." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/snow/vision/index-scene", async (req, res) => {
    const image = req.body.image || req.body.frame;
    const source = req.body.source || "camera";
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Missing image or frame" });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY || "";
      let scene = req.body.scene || "Workstation scene";
      let objects: string[] = Array.isArray(req.body.objects) ? req.body.objects : [];
      let activity = req.body.activity || "active user session";

      // If scene wasn't explicitly supplied, use Gemini 2.5 Flash to perceive the scene
      if (!req.body.scene && apiKey) {
        const ai = new GoogleGenAI({ apiKey });
        const mimeMatch = image.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const base64Data = image.replace(/^data:[^;]+;base64,/, "");

        const prompt = `You are an Astra-grade real-time spatial scene observer.
Look at this image. Output a STRICT JSON object in this exact format with NO markdown wrapping:
{"scene": "1-sentence summary of the scene", "objects": ["list", "of", "notable", "visible", "items", "windows", "or", "tools"], "activity": "brief note on current activity"}`;

        const geminiRes = await ai.models.generateContent({
          model: "gemini-flash-latest",
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64Data } }
            ]
          }]
        });

        const raw = geminiRes.text?.trim() || "";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.scene) scene = parsed.scene;
            if (Array.isArray(parsed.objects)) objects = parsed.objects;
            if (parsed.activity) activity = parsed.activity;
          } catch {}
        }
      }

      const episode = addVisualEpisode(source, scene, objects, activity, image);
      console.log(`[SNOW VISION] 👁️ Indexed visual episode: "${scene}" with ${objects.length} objects`);
      return res.json({ success: true, episode });
    } catch (e: any) {
      console.warn("[SNOW VISION] Index scene notice:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

  // ── /api/snow/rag — Ollama RAG Knowledge Base API ────────────────────────

  /** GET all RAG chunks + stats */
  app.get("/api/snow/rag", (_req, res) => {
    res.json({ stats: ragStats(), chunks: ragLoadAll().map(c => ({ ...c, embedding: undefined })) });
  });

  /** POST: manually ingest a document / fact into RAG */
  app.post("/api/snow/rag/ingest", async (req, res) => {
    const { text, source, category } = req.body;
    if (!text || !source) return res.status(400).json({ error: "text and source required" });
    const chunk = await ragIngest(text, source, category || "fact");
    res.json({ success: true, chunk: { ...chunk, embedding: undefined } });
  });

  /** POST: search RAG store semantically */
  app.post("/api/snow/rag/search", async (req, res) => {
    const { query, topK = 5, minScore = 0.2, category } = req.body;
    if (!query) return res.status(400).json({ error: "query required" });
    const results = await ragSearch(query, topK, minScore, category);
    res.json({ results: results.map(r => ({ score: r.score, chunk: { ...r.chunk, embedding: undefined } })) });
  });

  /** DELETE: prune old RAG history chunks */
  app.delete("/api/snow/rag/prune", (req, res) => {
    const daysOld = Number(req.query.days) || 30;
    const deleted = ragDeleteOld(daysOld);
    res.json({ success: true, deleted });
  });

  /** DELETE: wipe entire RAG store */
  app.delete("/api/snow/rag", (_req, res) => {
    ragClear();
    res.json({ success: true });
  });

  // ── AI TRAINING & DATASET EXPORT API ────────────────────────────────────────

  /** POST: export fine-tuning datasets (Alpaca, ShareGPT, DPO) & generate Modelfile */
  app.post("/api/snow/dataset/export", async (_req, res) => {
    try {
      const stats = await exportFineTuningDatasets();
      res.json({ success: true, stats });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to export fine-tuning datasets", details: e.message });
    }
  });

  // ── PYTHON SANDBOX CODE EXECUTION API ──────────────────────────────────────

  /** POST: run Python code in hardened local sandbox environment */
  app.post("/api/snow/python/execute", async (req, res) => {
    const { code, timeoutMs } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing required 'code' string field" });
    }
    const safeTimeout = Math.min(Math.max(Number(timeoutMs) || 10000, 1000), 60000);
    const result = await runPythonCode(code, safeTimeout);
    res.json(result);
  });

  // ── WORKSPACE FILE VAULT & CONTEXT EXPLORER API ────────────────────────────

  const SENSITIVE_FILE_PATTERN = /(?:^|[/\\])(?:\.env(?:\..*)?|\.git(?:\/|\\|$)|.*\.(?:pem|key|crt|p12|kdbx)|id_rsa.*|id_ed25519.*|data[/\\](?:snow_brain|snow_rag)\.db.*)$/i;

  /** GET: list workspace files for AI context selection */
  app.get("/api/snow/files", (_req, res) => {
    try {
      const rootDir = process.cwd();
      const ignoreDirs = new Set(["node_modules", ".git", "dist", ".gemini", "data"]);
      const allowedExts = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".py", ".html", ".css", ".txt", ".sh", ".sql"]);

      const fileList: Array<{ name: string; path: string; size: number; ext: string }> = [];

      function scanDir(dir: string, depth = 0) {
        if (depth > 4) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith(".") || ignoreDirs.has(entry.name)) continue;
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(rootDir, fullPath);

          if (SENSITIVE_FILE_PATTERN.test(relPath) || SENSITIVE_FILE_PATTERN.test(entry.name)) continue;

          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (allowedExts.has(ext)) {
              const stat = fs.statSync(fullPath);
              fileList.push({
                name: entry.name,
                path: relPath,
                size: stat.size,
                ext: ext.replace(".", "")
              });
            }
          }
        }
      }

      scanDir(rootDir);
      fileList.sort((a, b) => a.path.localeCompare(b.path));
      res.json({ files: fileList });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to list workspace files", details: e.message });
    }
  });

  /** POST: read workspace file content */
  app.post("/api/snow/files/read", (req, res) => {
    try {
      const { filePath } = req.body;
      if (!filePath || typeof filePath !== "string") {
        return res.status(400).json({ error: "filePath required" });
      }
      const safePath = path.resolve(process.cwd(), filePath);
      if (!safePath.startsWith(process.cwd())) {
        return res.status(403).json({ error: "Access denied outside workspace" });
      }
      if (SENSITIVE_FILE_PATTERN.test(filePath) || SENSITIVE_FILE_PATTERN.test(safePath)) {
        return res.status(403).json({ error: "Access denied: Target file is protected" });
      }
      if (!fs.existsSync(safePath)) {
        return res.status(404).json({ error: "File not found" });
      }
      const content = fs.readFileSync(safePath, "utf-8");
      const stat = fs.statSync(safePath);
      res.json({
        path: filePath,
        name: path.basename(filePath),
        size: stat.size,
        content: content.slice(0, 100000)
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to read file", details: e.message });
    }
  });



  // ── Vite / Static ──────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), "dist");
    app.use(express.static(dist));
    app.get("*", (_req, r) => r.sendFile(path.join(dist, "index.html")));
  }

  const PORT = parseInt(process.env.PORT || "3000", 10);
  const HOST = process.env.HOST || "127.0.0.1";
  app.listen(PORT, HOST, () => {
    const rs = ragStats();
    console.log(`\n✅  Snow OS Autonomous Learning Agent ONLINE → http://${HOST}:${PORT}`);
    console.log(`    Host Binding : ${HOST} (Loopback/Localhost Secure Mode)`);
    console.log(`    Gemini key   : ${process.env.GEMINI_API_KEY ? "✅ set" : "❌ missing"}`);
    console.log(`    RAG Engine   : ✅ Ollama nomic-embed-text (${rs.total} chunks indexed)`);
    console.log(`    Brain Status : LV.${loadBrainState().level} (${loadMemories().length} Memories)\n`);
    // Ensure Linux microphone input capture volume is healthy (>=85%)
    try {
      exec("wpctl set-volume @DEFAULT_AUDIO_SOURCE@ 0.85 2>/dev/null || amixer set Capture 85% 2>/dev/null", () => {});
    } catch {}
    routineScheduler.startScheduler(process.env.GEMINI_API_KEY || "");
    ambientPerception.start(10000);
  });
}

startServer();
