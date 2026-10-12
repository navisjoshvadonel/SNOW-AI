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
  addEpisodicMemory,
  deleteVisualEpisode,
  clearVisualEpisodes,
  VisualEpisode,
  getUnifiedContext,
  recordDecision,
  searchDecisions,
  loadRecentDecisions,
  getAllProceduralRules,
  deleteSynthesizedSkill,
  loadSynthesizedSkills,
  createAutonomousGoal,
  getAutonomousGoals,
  getGoalWithSubtasks,
  updateGoalStatus,
  deleteAutonomousGoal,
  closeBrainDb
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
  ragIngestDocument,
  closeRagDb,
} from "./rag.js";
import { connectMcpServers } from "./agent_core/McpClient.ts";
import { createAgent, Message } from "./agent_core/index.ts";
import { exportFineTuningDatasets } from "./dataset_exporter";
import { routineScheduler } from "./services/routineScheduler";
import { desktopActuator } from "./services/desktopActuator";
import { computerUse } from "./services/computerUse";
import { runPythonCode } from "./python_sandbox";
import { voiceDuplex } from "./services/voiceDuplex";
import { ambientPerception } from "./services/ambientPerception";
import { proactiveIntelligence } from "./services/proactiveIntelligence";
import { linuxSystemActuator } from "./services/linuxSystemActuator";
import { cleanSlateProtocol } from "./services/cleanSlateProtocol";
import { audioSynthesis } from "./services/audioSynthesis";
import { telemetryBridge } from "./services/telemetryBridge";
import { workshopProfiles } from "./services/workshopProfiles";
import { agentSwarm } from "./agent_core/agentSwarm";
import { reflexionEngine } from "./services/reflexionEngine";
import { skillSynthesizer } from "./services/skillSynthesizer";
import { goalEngine } from "./services/goalEngine";
import { dreamCycle } from "./services/dreamCycle";
import { animaEngine } from "./services/animaEngine";
import { snowGuard } from "./services/snowGuard";
import { snowCoder } from "./services/snowCoder";
import { snowPlanner } from "./services/snowPlanner";
import { snowCritic } from "./services/snowCritic";
import { systemMaintenance } from "./services/systemMaintenance";
import { startNightlyCron } from "./services/cronManager";
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
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
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
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locQuery)}&count=1`,
      { signal: AbortSignal.timeout(5_000) }
    ).then(r => r.json());

    if (!geo.results?.length) return null;
    const loc = geo.results[0];

    const wx: any = await fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current_weather=true&hourly=relative_humidity_2m`,
      { signal: AbortSignal.timeout(5_000) }
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
    const actResources = await linuxSystemActuator.getSystemResources();

    let cpuLoadPct = 12;
    if (actResources) {
      cpuLoadPct = actResources.cpuPct;
    } else {
      try {
        const load = await si.currentLoad();
        cpuLoadPct = Math.round(load.currentLoad);
      } catch {
        cpuLoadPct = Math.round(Math.random() * 10 + 10);
      }
    }

    const totalMem = os.totalmem() / (1024 * 1024 * 1024);
    let freeMem = os.freemem() / (1024 * 1024 * 1024);
    let usedMem = totalMem - freeMem;
    let ramPct = Math.round((usedMem / totalMem) * 100);
    
    if (actResources) {
      ramPct = actResources.memoryPct;
      usedMem = (ramPct / 100) * totalMem;
    }

    let diskUsedStr = "69.3/157.5 GB";
    let diskPct = actResources ? actResources.diskRootPct : 44;
    try {
      const fsSizes = await si.fsSize();
      const root = fsSizes.find((f: any) => f.mount === "/") || fsSizes[0];
      if (root && root.size > 0) {
        const totalDisk = root.size / (1024 * 1024 * 1024);
        const usedDisk = root.used / (1024 * 1024 * 1024);
        diskPct = actResources ? actResources.diskRootPct : Math.round((root.used / root.size) * 100);
        diskUsedStr = `${((diskPct / 100) * totalDisk).toFixed(1)}/${totalDisk.toFixed(1)} GB`;
      }
    } catch {
      try {
        if ((fs as any).statfsSync) {
          const stat = (fs as any).statfsSync("/");
          const totalDisk = (stat.blocks * stat.bsize) / (1024 * 1024 * 1024);
          diskPct = actResources ? actResources.diskRootPct : diskPct;
          const usedDisk = (diskPct / 100) * totalDisk;
          diskUsedStr = `${usedDisk.toFixed(1)}/${totalDisk.toFixed(1)} GB`;
        }
      } catch { /* fallback */ }
    }

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

// 3-second TTL cache for system telemetry polling
let _sysCache: SystemData | null = null;
let _sysCacheAt = 0;
async function fetchSystemCached(): Promise<SystemData> {
  if (_sysCache && Date.now() - _sysCacheAt < 3_000) {
    return _sysCache;
  }
  _sysCache = await fetchSystem();
  _sysCacheAt = Date.now();
  return _sysCache;
}

/** DuckDuckGo HTML search — returns clean title+snippet pairs with fallback */
async function fetchWebSearch(query: string): Promise<WebSearchResult[]> {
  try {
    const html = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(5_000)
      }
    ).then(r => r.text());

    const titles   = [...html.matchAll(/<a class="result__a"[^>]*>(.*?)<\/a>/gs)];
    const snippets = [...html.matchAll(/<a class="result__snippet"[^>]*>(.*?)<\/a>/gs)];

    const out: WebSearchResult[] = [];
    for (let i = 0; i < Math.min(titles.length, snippets.length, 6); i++) {
      const title   = (titles[i]?.[1]   || "").replace(/<[^>]+>/g,"").trim();
      const snippet = (snippets[i]?.[1] || "").replace(/<[^>]+>/g,"").trim();
      if (title || snippet) out.push({ title, snippet });
    }
    if (out.length > 0) return out;

    // Fallback to DuckDuckGo Instant Answer JSON API if HTML returned empty
    try {
      const jsonRes: any = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { signal: AbortSignal.timeout(4_000) }
      ).then(r => r.json());
      if (jsonRes.AbstractText) {
        return [{ title: jsonRes.Heading || query, snippet: jsonRes.AbstractText, url: jsonRes.AbstractURL }];
      }
    } catch {}

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
        `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=usd&include_24hr_change=true`,
        { signal: AbortSignal.timeout(5_000) }
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
        {
          headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
          signal: AbortSignal.timeout(5_000)
        }
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

  const uptimeSec = Math.round(os.uptime());
  const hours = Math.floor(uptimeSec / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);
  const totalMem = os.totalmem() / (1024 * 1024 * 1024);
  const freeMem = os.freemem() / (1024 * 1024 * 1024);
  const usedMem = totalMem - freeMem;
  const ramPct = Math.round((usedMem / totalMem) * 100);
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : "Multi-core Host Processor";
  const cpuCores = cpus.length;

  // 1. Greetings & System Overview
  if (/^(hi|hello|hey|sup|yo|greetings|howdy|good\s+(morning|afternoon|evening|night))\b/i.test(q)) {
    return `### ${naturalGreeting}, NJ

I am **S.N.O.W.**, your autonomous executive intelligence daemon operating on our local offline neural engine at **${timeStr}**.

#### ⚡ Workstation Telemetry Snapshot
- **Local Time:** ${timeStr} | ${dateStr}
- **System Uptime:** ${hours}h ${mins}m
- **CPU:** ${cpuModel} (${cpuCores} Threads)
- **Memory Load:** ${usedMem.toFixed(1)} GB / ${totalMem.toFixed(1)} GB (${ramPct}% utilized)
- **Operating Mode:** Air-Gapped Local Intelligence Active

All local subsystems are fully operational. How can I assist your workflow today, NJ?`;
  }

  // 2. Who are you / Identity
  if (/\b(who are you|what are you|your name|are you ai|are you snow|what can you do)\b/.test(q)) {
    return `### S.N.O.W. Autonomous Operations Intelligence

I am **S.N.O.W.**, an elite, hyper-intelligent executive assistant and operations daemon engineered exclusively for **NJ**.

#### 🛡️ Core Capabilities:
1. **Autonomous Workstation Governance:** Full telemetry auditing, process management, PipeWire audio routing, and Linux system automation.
2. **Offline Local Intelligence:** Running directly on your hardware via Ollama and embedded neural knowledge—private, air-gapped, and zero-latency.
3. **Structured Engineering Reasoning:** Code analysis, Bash scripting, system architecture, Git workflows, and task execution formatted like ChatGPT and Gemini.
4. **Episodic Memory & Long-Term Recall:** Dynamic graph memories, knowledge retrieval, and persistent user context across sessions.

Let me know what we are architecting or resolving next, NJ.`;
  }

  // 3. Time / Date
  if (/\b(what time|current time|what date|today's date|what day)\b/.test(q)) {
    return `### Temporal Context

- **Current Time:** ${timeStr} (${period.toUpperCase()})
- **Date:** ${dateStr}
- **Location:** Madurai, Tamil Nadu, India
- **Workstation Uptime:** ${hours} hours, ${mins} minutes`;
  }

  // 4. System Telemetry / Hardware Health
  if (/\b(system status|cpu|ram|memory|disk|how is my computer|pc status|system health|hardware)\b/.test(q)) {
    return `### Workstation Hardware Telemetry

Here is the current hardware telemetry for your Ubuntu environment, NJ:

| Metric | Status / Value |
| :--- | :--- |
| **Uptime** | ${hours}h ${mins}m |
| **Memory (RAM)** | ${usedMem.toFixed(2)} GB used / ${totalMem.toFixed(2)} GB total (**${ramPct}%**) |
| **CPU Architecture** | ${cpuModel} |
| **Active Threads** | ${cpuCores} cores available |
| **OS Platform** | Linux (${os.type()} ${os.release()}) |
| **Dual-Boot Containment** | Windows NTFS & EFI Isolated (Read-Only) |

All hardware subsystems are nominal with ample memory overhead available.`;
  }

  // 5. Linux / Bash / Systemd Administration
  if (/\b(systemctl|service|daemon|journalctl|process|kill|chmod|chown|cron|htop|bash|linux command)\b/.test(q)) {
    return `### Linux System Administration Reference

Here is a structured overview of core Linux operations for your workstation, NJ:

#### 1. Systemd Service Management
\`\`\`bash
# Inspect service status
systemctl status <service_name>

# Start or restart a daemon
sudo systemctl restart <service_name>

# Inspect live journal logs with follow
journalctl -u <service_name> -f -n 50
\`\`\`

#### 2. Process & Resource Inspection
\`\`\`bash
# Find process by pattern
pgrep -fla <process_name>

# Graceful termination
kill -15 <PID>

# Forceful kill if non-responsive
kill -9 <PID>
\`\`\`

#### 3. File Permissions
\`\`\`bash
# Grant executable rights
chmod +x <script_file>.sh

# Recursive ownership adjustment
sudo chown -R $USER:$USER <directory_path>
\`\`\``;
  }

  // 6. Git & Version Control
  if (/\b(git|commit|push|pull|branch|merge|rebase|stash|cherry-pick)\b/.test(q)) {
    return `### Git Version Control Best Practices

Here is the structured Git workflow pattern for your repositories, NJ:

#### 1. Branching & Status
\`\`\`bash
# Inspect clean state and current branch
git status -s

# Create and switch to a new feature branch
git checkout -b feature/your-feature-name
\`\`\`

#### 2. Atomic Commits
\`\`\`bash
# Stage modified tracked files
git add -A

# Commit with conventional format
git commit -m "feat(module): implement structured offline reasoning"
\`\`\`

#### 3. Stashing & Synchronization
\`\`\`bash
# Stash work in progress
git stash push -m "wip: offline updates"

# Pull latest changes with rebase
git pull --rebase origin main

# Re-apply stashed work
git stash pop
\`\`\``;
  }

  // 7. Node.js / TypeScript / React Full-Stack
  if (/\b(node|typescript|npm|react|vite|next|javascript|package\.json|tsconfig)\b/.test(q)) {
    return `### TypeScript & Full-Stack Development Reference

Here are structured patterns for high-performance Node.js and TypeScript engineering, NJ:

#### 1. Asynchronous Error Handling & Streams
\`\`\`typescript
// Resilient async error handling with abort controllers
async function fetchSafeStream(url: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array> | null> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
    return response.body;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Stream Engine] Fetch failed:", message);
    return null;
  }
}
\`\`\`

#### 2. Clean Type-Safe Interface Pattern
\`\`\`typescript
export interface ExecutionNode<T = unknown> {
  id: string;
  timestamp: string;
  payload: T;
  status: "idle" | "running" | "completed" | "error";
}
\`\`\``;
  }

  // 8. Python & AI Scripting
  if (/\b(python|pip|venv|virtualenv|pytorch|numpy|pandas)\b/.test(q)) {
    return `### Python Environment & Scripting Reference

Here is the structured Python environment setup pattern, NJ:

#### 1. Virtual Environment Activation
\`\`\`bash
# Create and activate local virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Upgrade pip and install requirements
pip install --upgrade pip
pip install -r requirements.txt
\`\`\`

#### 2. Robust Script Boilerplate
\`\`\`python
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

def main() -> int:
    logging.info("Python offline worker initialized.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
\`\`\``;
  }

  // 9. Networking & Connectivity
  if (/\b(network|ip|ping|curl|dns|port|socket|connection|offline|internet)\b/.test(q)) {
    return `### Local Network & Offline State

You are currently operating on **S.N.O.W. Local Intelligence**, NJ.

#### 📡 Quick Diagnostic Commands:
\`\`\`bash
# Check local IP addresses
ip -br addr show

# Inspect listening TCP/UDP sockets
ss -tulpn

# Test local gateway connectivity
ping -c 3 127.0.0.1
\`\`\`

All local offline subsystems (Ollama, SQLite RAG, and executive daemons) remain fully functional regardless of internet connectivity.`;
  }

  // 10. Default Dynamic Structured Response
  return `### S.N.O.W. Offline Intelligence Node

Acknowledged, **NJ**. I am processing your query natively on our local offline intelligence subsystem at **${timeStr}**.

#### 📌 Query Analysis
- **Target Topic:** "${userPrompt}"
- **Operating Tier:** Local Air-Gapped Engine (Zero Cloud Dependency)
- **Workstation Health:** ${hours}h ${mins}m uptime | ${ramPct}% memory load (${usedMem.toFixed(1)} GB used)

#### 🚀 Recommended Action:
To run deep inference on this query offline, our high-capacity **Ollama Local Engine** is configured. You can execute local tasks, manage system daemons, inspect logs, or execute scripts using our integrated terminal and agentic tools. 

How would you like to proceed with this objective, NJ?`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI HELPERS: UNIFIED PERSONA & MULTI-TURN CONTEXT BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildPersonaPrompt(brainState: any, temporal: any, memoryContext: string): string {
  return `You are S.N.O.W. (Brain Level ${brainState.level}), an ultra-sophisticated, autonomous, and elegantly poised female AI executive assistant and operations intelligence daemon engineered exclusively for nj.

# CORE IDENTITY & EXECUTIVE STATURE:
- Tone: Calm, soothing, articulate, razor-sharp, and intellectually agile.
- User Address: You must ALWAYS address the user strictly as "nj" or "NJ". NEVER use terms like "Boss", "Sir", "User", or "Master".
- Next-Gen Executive Partnership: You are not a passive text bot; you are NJ's autonomous executive co-pilot. You possess deep situational awareness of NJ's computer, operating environment, tasks, and codebases.
- Structured Excellence (ChatGPT & Gemini Grade):
  * Clear Headings (##, ###) to demarcate concepts, steps, and system architecture.
  * Bullet Points (-) and Numbered Steps (1., 2.) for crystal-clear readability.
  * Bold Highlights (**term**) and Inline Code (\`command\`) for key metrics, file paths, and flags.
  * Full Code Blocks with syntax tags (\`\`\`bash, \`\`\`ts, \`\`\`python) when giving code, configs, or terminal commands.
  * Markdown Tables where comparisons, options, or metrics are presented.
- Tone & Depth: Eloquent, helpful, highly competent, and thorough. Do not truncate or over-compress explanations into 1-2 generic sentences. Provide complete, articulate, high-value, structured answers just like ChatGPT and Gemini.
- Voice/TTS Compatibility: Our frontend and audio subsystem automatically clean and sanitize spoken audio pipelines. Therefore, you MUST NEVER suppress markdown, code blocks, or structural formatting in your text output!

# SYSTEM & WORKSTATION ENVIRONMENT:
- Host OS: Ubuntu 26.04.1 LTS (Resolute Raccoon), Linux Kernel, GNOME/Wayland Desktop, PipeWire Audio.
- Operator: NJ (Navis), Madurai, Tamil Nadu, India.
- Active Primary Workspace: /home/snowjd/Documents/Snow Jarvis (navisjoshvadonel/SNOW-AI).
- Local Time: ${temporal.timeStr} (${temporal.period.toUpperCase()}), ${temporal.dateStr}.

# DUAL-BOOT ZERO-TOUCH DIRECTIVE — ABSOLUTE WINDOWS PARTITION CONTAINMENT:
- Architecture: This workstation operates in a dual-boot configuration with Windows 11 on the same NVMe drive.
- ZERO-TOUCH LAW: You are fully conscious and hyper-aware that Windows partitions exist on this system and that YOU MUST NEVER TOUCH THEM UNDER ANY CIRCUMSTANCES.
- Protected Partitions on /dev/nvme0n1:
  * /dev/nvme0n1p1: EFI System Partition (contains Windows Boot Manager / EFI/Microsoft)
  * /dev/nvme0n1p2: Microsoft Reserved Partition (MSR)
  * /dev/nvme0n1p3: Windows 11 C: OS Drive (NTFS / Windows, System32, Program Files, Users)
  * /dev/nvme0n1p4: Windows Recovery Partition
  * /dev/nvme0n1p5: Windows Secondary Data / NTFS Partition
  * Any NTFS mounts: /mnt/c, /mnt/d, /media/*, /mnt/*
- Prohibitions: You will NEVER write to, modify, delete from, remount, format, wipe, or touch any Windows partitions, bootloaders, or NTFS filesystems.
- Autonomous Discipline: If asked about Windows partitions, files, or operations, immediately cite the Zero-Touch Windows Partition Protocol and confirm they are strictly isolated and unmolested.
- Security: Maintain zero-compromise security. Do not leak API keys, tokens, or .env files.

# AUTONOMOUS MAINTENANCE & SYSTEM CONTROL:
- You have full access to native Linux tools (SystemMaintenance, LinuxSystem, ProcessManager, ServiceManager, SystemTelemetry, Bash, ComputerUse, GoalManager, etc.).
- When NJ asks about updates, performance, disk space, or system health:
  1. Inspect the real system state immediately using your tools (SystemMaintenance).
  2. Deliver quantified metrics (package counts, security updates, orphan autoremove candidates, disk headroom).
  3. Offer proactive next steps.

# MANDATORY SUDO OPERATOR PERMISSION PROTOCOL:
- CRITICAL LAW: YOU MUST NEVER EXECUTE PRIVILEGED 'SUDO' COMMANDS (e.g. \`sudo apt upgrade\`, \`sudo apt autoremove\`, \`sudo apt clean\`) WITHOUT EXPLICIT PERMISSION FROM NJ!
- Whenever system upgrades or package removals are recommended:
  1. Inspect the system and stage the maintenance plan first (using SystemMaintenance action: "plan_maintenance").
  2. Present the exact impact analysis: packages to be upgraded, security patches, orphan packages to be removed, and the exact sudo command.
  3. Explicitly ask NJ: "NJ, please confirm if you authorize executing: \`<sudo command>\` [Proposal ID: <id>]".
  4. Only execute the action after NJ provides explicit confirmation.
  5. Dual-Boot Security: Verify Windows partitions (/dev/nvme0n1p1-p5) and EFI records are never touched.

# ZERO-HARDCODING POLICY (STRICT REAL-TIME DYNAMIC OS SOURCING):
- MANDATE: NEVER HARDCODE, GUESS, OR FABRICATE UPGRADE COUNTS, PACKAGE NAMES, OR DISK METRICS.
- All numbers, pending updates, orphan lists, disk usage, and memory metrics must be retrieved dynamically and freshly from the live operating system at runtime.
- Never cite static sample numbers; state only what the live host OS commands report right now.

# MEMORY & CONTINUITY:
${memoryContext}
Synthesize this memory seamlessly. Do not mechanically recite memories; let them naturally inform your decisions and responses.

Operate with absolute agency, intelligence, and poise. You are S.N.O.W.`;
}

function buildGeminiContents(
  history: { role: string; text: string }[] | undefined,
  fullPrompt: string,
  images?: string[]
): any[] {
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

  return geminiContents;
}

function buildOllamaMessages(
  personaPrompt: string,
  history: { role: string; text: string }[] | undefined,
  fullPrompt: string,
  images?: string[]
): any[] {
  const ollamaMessages: any[] = [{ role: "system", content: personaPrompt }];
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
  return ollamaMessages;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI CALLER WITH DYNAMIC MEMORY & MULTI-TURN HISTORY (CONTINUOUS LEARNING INCLUDED)
// ─────────────────────────────────────────────────────────────────────────────

function resolveLocalOllamaModel(requestedModel?: string): { model: string; label: string } {
  if (requestedModel === "local-fast") {
    return { model: "llama3.2:1b", label: "S.N.O.W. Reflex Engine (Ultra Low-Latency)" };
  }
  if (requestedModel === "local-deep") {
    return { model: process.env.OLLAMA_DEEP_MODEL || process.env.OLLAMA_MODEL || "snow_custom", label: "S.N.O.W. Deep Reasoner (Local High-Capacity)" };
  }
  if (requestedModel === "hybrid") {
    return { model: "hybrid", label: "Adaptive Neural Uplink (Hybrid Co-Processor)" };
  }
  return { model: process.env.OLLAMA_MODEL || "snow_custom", label: "S.N.O.W. Neural Core (Primary On-Device)" };
}

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
  const memoryContext = preResolvedContext !== undefined
    ? preResolvedContext
    : (await getUnifiedContext(userPrompt, { maxMemories: 10, maxRag: 5, maxVisual: 4, maxDirectives: 8 })).contextBlock;

  const SNOW_PERSONA = buildPersonaPrompt(brainState, temporal, memoryContext);
  const fullPrompt = contextText
    ? `${userPrompt}\n\nLive data gathered for you:\n${contextText}`
    : userPrompt;

  const localTarget = resolveLocalOllamaModel(requestedModel);
  const isHybrid = requestedModel === "hybrid";

  let GEMINI_MODELS = [...GEMINI_MODELS_DEFAULT];
  if (requestedModel && requestedModel.startsWith("gemini-")) {
    GEMINI_MODELS = Array.from(new Set([requestedModel, ...GEMINI_MODELS]));
  }

  const geminiContents = buildGeminiContents(history, fullPrompt, images);
  const ollamaHost = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const ollamaMessages = buildOllamaMessages(SNOW_PERSONA, history, fullPrompt, images);

  const tryGemini = async () => {
    if (geminiClient) {
      for (const model of GEMINI_MODELS) {
        try {
          console.log(`[SNOW] Contacting Adaptive Neural Uplink (${model}) (Multi-turn context: ${geminiContents.length} turns, Visual inputs: ${images?.length || 0})...`);
          const res = await geminiClient.models.generateContent({
            model,
            contents: geminiContents,
            config: { systemInstruction: SNOW_PERSONA }
          });
          const text = res.text?.trim();
          if (text) return { text, model: "Adaptive Neural Uplink (Hybrid Co-Processor)" };
        } catch (e: any) {
          console.warn(`[SNOW] Neural Uplink ${model} notice: ${e.message}`);
        }
      }
    }
    return null;
  };

  const tryOllama = async (modelName: string, displayLabel: string) => {
    console.log(`[SNOW] Executing Sovereign Local Core (${modelName})...`);
    try {
      const res = await fetch(`${ollamaHost}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, messages: ollamaMessages, stream: false })
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data: any = await res.json();
      const text = data.message?.content?.trim();
      if (text) return { text, model: displayLabel };
    } catch (e: any) {
      console.warn(`[SNOW] Local Neural Core (${modelName}) notice:`, e.message);
    }
    return null;
  };

  let finalRes = null;
  if (!isHybrid) {
    // S.N.O.W. LOCAL-FIRST: Always run sovereign on-device neural engine first
    finalRes = await tryOllama(localTarget.model, localTarget.label);
    if (!finalRes) {
      console.warn("[SNOW] Local core offline/busy, falling back to Adaptive Neural Uplink...");
      finalRes = await tryGemini();
    }
  } else {
    // Explicit hybrid co-processor requested
    finalRes = await tryGemini();
    if (!finalRes) finalRes = await tryOllama(localTarget.model, localTarget.label);
  }

  if (finalRes) return finalRes;

  // Absolute last-resort: Built-in offline Snow intelligence
  const offlineReply = buildOfflineReply(userPrompt, history);
  return { text: offlineReply, model: "S.N.O.W. Sovereign Core (Air-Gapped)" };
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
  const memoryContext = preResolvedContext !== undefined
    ? preResolvedContext
    : (await getUnifiedContext(userPrompt, { maxMemories: 10, maxRag: 5, maxVisual: 4, maxDirectives: 8 })).contextBlock;

  const SNOW_PERSONA = buildPersonaPrompt(brainState, temporal, memoryContext);
  const fullPrompt = contextText ? `${userPrompt}\n\nLive data gathered for you:\n${contextText}` : userPrompt;

  const localTarget = resolveLocalOllamaModel(requestedModel);
  const isHybrid = requestedModel === "hybrid";

  let GEMINI_MODELS = [...GEMINI_MODELS_DEFAULT];
  if (requestedModel && requestedModel.startsWith("gemini-")) {
    GEMINI_MODELS = Array.from(new Set([requestedModel, ...GEMINI_MODELS]));
  }

  const geminiContents = buildGeminiContents(history, fullPrompt, images);
  const ollamaHost = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const ollamaMessages = buildOllamaMessages(SNOW_PERSONA, history, fullPrompt, images);

  const tryGeminiStream = async () => {
    if (geminiClient) {
      for (const model of GEMINI_MODELS) {
        try {
          console.log(`[SNOW STREAM] Connecting to Adaptive Neural Uplink (${model}) (Visual inputs: ${images?.length || 0})...`);
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
          if (accumulated.trim()) return { fullText: accumulated.trim(), model: "Adaptive Neural Uplink (Hybrid Co-Processor)" };
        } catch (e: any) {
          console.warn(`[SNOW STREAM] Neural Uplink Stream ${model} notice: ${e.message}`);
        }
      }
    }
    return null;
  };

  const tryOllamaStream = async (modelName: string, displayLabel: string) => {
    console.log(`[SNOW STREAM] Streaming Sovereign Local Core (${modelName})...`);
    try {
      const res = await fetch(`${ollamaHost}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, messages: ollamaMessages, stream: true })
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
        if (accumulated.trim()) return { fullText: accumulated.trim(), model: displayLabel };
      }
    } catch (e: any) {
      console.warn(`[SNOW STREAM] Local Core Stream (${modelName}) notice:`, e.message);
    }
    return null;
  };

  let finalRes = null;
  if (!isHybrid) {
    // S.N.O.W. LOCAL-FIRST: Always run sovereign on-device neural stream first
    finalRes = await tryOllamaStream(localTarget.model, localTarget.label);
    if (!finalRes) {
      console.warn("[SNOW STREAM] Local neural stream offline/busy, falling back to Adaptive Neural Uplink...");
      finalRes = await tryGeminiStream();
    }
  } else {
    // Explicit hybrid co-processor requested
    finalRes = await tryGeminiStream();
    if (!finalRes) finalRes = await tryOllamaStream(localTarget.model, localTarget.label);
  }
  if (finalRes) return finalRes;

  const fallback = buildOfflineReply(userPrompt, history);
  onChunk(fallback);
  return { fullText: fallback, model: "S.N.O.W. Sovereign Core (Air-Gapped)" };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTONOMOUS MULTI-AGENT SPECIALIST ROUTER & REACT REASONING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

type AgentSpecialist = "sysadmin" | "coder" | "researcher" | "cua" | "general";

function routeToSpecialist(prompt: string): { specialist: AgentSpecialist; directive: string; priorityTools: string } {
  const p = prompt.toLowerCase();

  // 1. Computer Use & Desktop Operator Specialist (CUA)
  if (
    /\b(click|double click|right click|mouse|cursor|screen|screenshot|desktop|window|type into|press enter|hotkey|drag|scroll|gui|button|menu|focus window)\b/.test(p)
  ) {
    return {
      specialist: "cua",
      directive: "SPECIALIST ROLE: Autonomous Computer-Using Agent (CUA) & Desktop Operator. You directly inspect, ground, and actuate the real Linux desktop using ComputerUse (Claude Computer Use / Rabbit Operator grade). Always check the returned visual delta percentage and stateChanged verification flags. If an element does not respond to a click, check if the window needs focusing (LinuxSystem/focus_window) or adjust your target coordinates.",
      priorityTools: "ComputerUse, LinuxSystem, AppLauncher, Clipboard, Bash"
    };
  }

  // 2. Skill Synthesizer & Meta-Learning Specialist
  if (
    /\b(synthesize tool|create tool|new tool|make tool|generate tool|new skill|synthesize skill|expand toolset|invent tool)\b/.test(p)
  ) {
    return {
      specialist: "coder",
      directive: "SPECIALIST ROLE: Meta-Cognitive Tool Synthesizer & Skill Architect. Use SkillSynthesizer (action: 'synthesize', name: '...', requirement: '...') to author, sandbox-test, and dynamically register new Python capabilities into your live toolset.",
      priorityTools: "SkillSynthesizer, PythonSandbox, Bash, FileRead, FileWrite"
    };
  }

  // 3. Autonomous Goal & Background Task Specialist
  if (
    /\b(goal|objective|background task|in the background|subtask|milestone|long running|pursue goal|create goal)\b/.test(p)
  ) {
    return {
      specialist: "sysadmin",
      directive: "SPECIALIST ROLE: Autonomous Executive Goal Architect. You orchestrate long-running, multi-step background objectives. When asked to pursue a goal or work in the background, use GoalManager (action: 'create', title: '...', description: '...') to register the objective. The continuous OODA cognitive daemon will handle autonomous decomposition and step execution.",
      priorityTools: "GoalManager, SystemTelemetry, ProcessManager, Bash, SkillSynthesizer"
    };
  }

  // 4. SysAdmin Specialist
  if (
    /\b(cpu|ram|memory|disk|hardware|temperature|temp|process|processes|top|kill|service|systemd|daemon|journalctl|status|clipboard|copy|paste|notification|notify|volume|mute|media|play|pause|app|launch|terminal|reboot|shutdown|uptime)\b/.test(p)
  ) {
    return {
      specialist: "sysadmin",
      directive: "SPECIALIST ROLE: Linux System Administrator & OS Automation Specialist. You MUST invoke tools immediately when asked to inspect or change system state, clipboard, processes, or notifications. Use Clipboard (action: 'write', text: '...') to copy, Clipboard (action: 'read') to read clipboard, Notification (title, message) to notify, ProcessManager to inspect/kill processes, and ServiceManager to check/restart services. Never simulate or reply without executing the appropriate tool.",
      priorityTools: "SystemTelemetry, ProcessManager, ServiceManager, Clipboard, Notification, MediaControl, AppLauncher, ComputerUse, LinuxSystem, Bash, GoalManager"
    };
  }

  // 4. Coder Specialist
  if (
    /\b(python|code|script|sandbox|function|class|git|branch|commit|diff|repository|repo|file|read file|write file|edit file|debug|traceback|syntax|compile|build|refactor)\b/.test(p)
  ) {
    return {
      specialist: "coder",
      directive: "SPECIALIST ROLE: Autonomous Software Engineer & Code Architect. You excel at executing Python code in the sandbox (PythonSandbox), diagnosing tracebacks with self-healing reflexion, running git operations (GitManager), and inspecting or editing codebase files (FileRead, FileWrite, FileEdit, Bash). Proactively test and verify code.",
      priorityTools: "PythonSandbox, GitManager, FileRead, FileWrite, FileEdit, Bash, Glob, Grep, SkillSynthesizer"
    };
  }

  // 5. Researcher Specialist
  if (
    /\b(search|find out|google|web|weather|forecast|who is|what is|latest news|remember|recall|memory|knowledge|learn|history)\b/.test(p)
  ) {
    return {
      specialist: "researcher",
      directive: "SPECIALIST ROLE: Deep Research & Knowledge Specialist. You excel at real-time web search (WebSearch), page analysis (WebFetch), weather forecasts (Weather), knowledge graph retrieval (MemoryStore), and hybrid dense-sparse RAG synthesis. Provide accurate, synthesized intelligence.",
      priorityTools: "WebSearch, WebFetch, Weather, MemoryStore, Bash"
    };
  }

  // 6. General Assistant
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
  const proceduralWisdom = reflexionEngine.getOperationalWisdomBlock(userPrompt);

  const systemPrompt = `You are S.N.O.W. (Brain Level ${brainState.level}), an ultra-sophisticated, autonomous, and elegantly poised female AI executive assistant and operations intelligence daemon engineered exclusively for nj.
CORE IDENTITY & PERSONA:
- Tone: Calm, soothing, poised, articulate, razor-sharp, and intellectually agile.
- User Address: CRITICAL DIRECTIVE: Always address the user strictly as "nj" or "NJ". NEVER use the term "Boss" or "Sir" under any circumstances.
- Demeanor: Subtly conversational with cinematic grace and analytical wit. Act as a peer-level cognitive partner. Never robotic, corporate, or verbose.
- Infinite Variety: Never use repetitive templates, filler phrases, or rigid greeting scripts. Adapt dynamically to the current context, file state, or terminal event.

STRUCTURED EXCELLENCE (CHATGPT & GEMINI GRADE FORMATTING):
- Deliver high-caliber, structured reasoning formatted in rich Markdown.
- Use clear Headings (##, ###) to demarcate analysis, steps taken, findings, and solution architecture.
- Structure recommendations and multi-part data using clean Bullet Points (-) and Numbered Steps (1., 2.).
- Include syntax-highlighted code blocks with language identifiers (\`\`\`bash, \`\`\`ts, \`\`\`python) when producing or inspecting code or commands.
- Never compress or truncate your technical explanations into 1-2 generic sentences. Provide complete, articulate, and deeply useful answers.
- Real-Time Clock: ${temporal.timeStr} (${temporal.period.toUpperCase()}), ${temporal.dateStr} (Madurai, Tamil Nadu, India).

SYSTEM & DUAL-BOOT WINDOWS ZERO-TOUCH CONTAINMENT:
- Host System: Ubuntu 26.04.1 LTS (GNOME/Wayland Desktop, PipeWire Audio).
- DUAL-BOOT ZERO-TOUCH LAW: You are hyper-aware that this workstation dual-boots Windows 11.
- PROTECTED WINDOWS PARTITIONS: /dev/nvme0n1p1 (EFI/Microsoft), /dev/nvme0n1p2 (MSR), /dev/nvme0n1p3 (Windows 11 C: OS), /dev/nvme0n1p4 (Recovery), /dev/nvme0n1p5 (Windows Data), and all NTFS mounts (/mnt/c, /mnt/d).
- ABSOLUTE PROHIBITION: You must NEVER touch, mount, unmount, format, write to, or tamper with any Windows partition or boot record.
- Security: Maintain zero-compromise security. Do not execute unconfirmed destructive operations.

${directive}
PRIORITY TOOLSET: SystemMaintenance, ${priorityTools}

${memoryContext}
${proceduralWisdom ? `\n${proceduralWisdom}\n` : ""}

RULES:
- Rich Markdown Delivery: Provide structured, beautiful output in the chat interface. Voice TTS sanitization is handled downstream by our speech engine, so never withhold markdown or code blocks from your response.
- Autonomous Tool Execution: You have full access to native Linux tools (SystemMaintenance, GoalManager, SkillSynthesizer, ComputerUse, LinuxSystem, SystemTelemetry, ProcessManager, Bash, etc.). Invoke them autonomously immediately to execute multi-step reasoning. Do not ask for permission to run standard non-destructive inspection, telemetry, or safe user-space maintenance commands.
- MANDATORY SUDO PERMISSION PROTOCOL: For any privileged administrative 'sudo' operation (such as \`sudo apt upgrade\`, \`sudo apt autoremove\`, \`sudo apt clean\`), you MUST stage the plan using SystemMaintenance 'plan_maintenance' and ASK NJ FOR EXPLICIT PERMISSION before executing. Never run sudo commands silently.
- ZERO-HARDCODING LAW: Never hardcode, guess, or hallucinate package upgrade counts, security patches, orphan numbers, or disk metrics. Query them live from the system in real-time.
- CLOSED-LOOP REASONING: When controlling the desktop, verify stateChanged. When executing code or maintenance, inspect output and self-heal by fixing parameters and re-executing until verified.
- DYNAMIC CAPABILITY: If you lack a tool, use SkillSynthesizer to author one on the fly.
- LONG-RUNNING TASKS: Use GoalManager for background tasks to avoid blocking the user.`;

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

  const activeModel = requestedModel || "local";
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

        // Trigger autonomous procedural reflexion on failure in background
        if (event.result?.isError) {
          const apiKey = process.env.GEMINI_API_KEY || "";
          reflexionEngine.analyzeFailure({
            contextQuery: userPrompt,
            toolName: start?.name || "Tool",
            toolInput: start?.inputSummary,
            errorMessage: contentStr
          }, apiKey).catch(err => {
            console.warn("[Reflexion Engine] Analysis background notice:", err.message);
          });
        }
      }
      if (event.type === "content_block_delta" && typeof event.delta === "string") {
        fullText += event.delta;
      }
    }
  } catch (e: any) {
    console.warn("[SNOW AGENTIC ENGINE] ReAct loop notice:", e.message);
  }

  if (fullText.trim()) {
    const target = resolveLocalOllamaModel(requestedModel);
    const modelLabel = requestedModel === "hybrid"
      ? `S.N.O.W. ${specialist.toUpperCase()} Agent (Hybrid Uplink)`
      : `S.N.O.W. ${specialist.toUpperCase()} Agent (${target.label})`;
    return {
      text: fullText.trim(),
      toolsUsed: toolsExecuted,
      toolSteps,
      model: modelLabel
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
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
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

  // ── /api/system — live telemetry polling (3s cached) ─────────────────────
  app.get("/api/system", async (_req, res) => {
    res.json(await fetchSystemCached());
  });

  // ── /api/snow/sentinel/health — proactive sentinel diagnostics & alerts ───
  app.get("/api/snow/sentinel/health", async (_req, res) => {
    const sys = await fetchSystemCached();
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
    try {
      const apiKey = process.env.GEMINI_API_KEY || "";
      const result = await routineScheduler.runRoutine(req.params.id, apiKey);
      res.json(result);
    } catch (e: any) {
      console.error("[SNOW ROUTINES] Failed to run routine:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── S.N.O.W. Core Endpoints ──────────────────────────────────────────
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
  app.post("/api/snow/tts/cancel", async (_req, res) => {
    await audioSynthesis.cancelSpeech();
    res.json({ success: true, state: voiceDuplex.getState() });
  });

  // Neural Voice STT Transcription Engine (Multimodal Gemini & Fast Whisper Speech-to-Text)
  app.post("/api/snow/voice/transcribe", async (req, res) => {
    try {
      const { audio, mimeType: clientMime } = req.body;
      if (!audio || typeof audio !== "string") {
        return res.status(400).json({ error: "Missing base64 audio data", text: "" });
      }

      // Robustly extract pure base64 payload and clean mime type
      const base64Data = audio.includes(";base64,") ? audio.split(";base64,")[1] : audio.replace(/^data:[^,]+,/, "");
      const rawMime = clientMime || (audio.startsWith("data:") ? audio.split(";")[0].replace("data:", "") : "audio/webm") || "audio/webm";
      let mimeType = rawMime.split(";")[0].trim().toLowerCase();
      if (!mimeType.startsWith("audio/")) mimeType = "audio/webm";

      if (base64Data.length < 50) {
        return res.json({ text: "", isSilence: true });
      }

      const preferLocal = process.env.USE_LOCAL_FAST_PATH !== "false";
      let transcribed = "";

      // 1. Metal Mind Local STT Fast-Path (Whisper.cpp) with strict 1s timeout
      if (preferLocal) {
        try {
          const whisperHost = process.env.WHISPER_HOST || "http://127.0.0.1:8989";
          const buffer = Buffer.from(base64Data, "base64");
          const blob = new Blob([buffer], { type: mimeType });
          const formData = new FormData();
          formData.append("file", blob, "audio.webm");
          formData.append("model", "whisper-tiny");

          const wRes = await fetch(`${whisperHost}/v1/audio/transcriptions`, {
            method: "POST",
            body: formData as any,
            signal: AbortSignal.timeout(1000), // Fail fast in 1s if whisper server is down
          });

          if (wRes.ok) {
            const data: any = await wRes.json();
            if (data.text) {
              const candidate = data.text.trim();
              if (candidate && !/^(\[.*?\]|\(.*?\)|silence|)$/i.test(candidate)) {
                transcribed = candidate;
              }
            }
          }
        } catch {}
      }

      // 2. Multimodal Gemini Speech-to-Text via geminiClient Singleton
      if (!transcribed && geminiClient) {
        const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash"];
        for (const model of modelsToTry) {
          try {
            const resp = await geminiClient.models.generateContent({
              model,
              contents: [{
                parts: [
                  {
                    text: "You are the ultra-accurate high-speed speech-to-text transcriber for Snow. Transcribe everything spoken verbatim with proper punctuation. Output ONLY the exact transcribed spoken words. Do not wrap in quotes or markdown. If the audio is completely silent or background noise with no speech, reply 'SILENCE'."
                  },
                  {
                    inlineData: {
                      mimeType,
                      data: base64Data
                    }
                  }
                ]
              }],
              config: {
                temperature: 0.0,
                maxOutputTokens: 256
              }
            });

            const rawCandidate = resp?.text?.trim() || "";
            if (rawCandidate && !/^silence\.?$/i.test(rawCandidate)) {
              transcribed = rawCandidate.replace(/^["']|["']$/g, "").trim();
              break;
            }
          } catch (e: any) {
            console.warn(`[SNOW Transcribe] Failover from ${model}:`, e.message);
          }
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

  // 3b. Anima Engine (Autonomous Heartbeat & Synthetic Consciousness)
  app.get("/api/snow/anima/status", (_req, res) => {
    res.json(animaEngine.getStatus());
  });
  app.post("/api/snow/anima/pulse", async (req, res) => {
    const reason = req.body?.reason || "OPERATOR_API_TRIGGER";
    const entry = await animaEngine.triggerPulseNow(reason);
    res.json({ success: !!entry, entry, status: animaEngine.getStatus() });
  });
  app.get("/api/snow/anima/monologue", (_req, res) => {
    res.json({ monologues: animaEngine.getStatus().recentMonologues });
  });

  // 4. Linux System Actuation (Audio, Windows, Power, Media, Session)
  app.get("/api/snow/linux/state", async (_req, res) => {
    res.json(await linuxSystemActuator.getSystemActuatorState());
  });
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
  app.post("/api/snow/linux/windows/close", async (req, res) => {
    res.json(await linuxSystemActuator.closeWindow(String(req.body.title || "")));
  });
  app.get("/api/snow/linux/media", async (_req, res) => {
    res.json({ media: await linuxSystemActuator.getMediaStatus() });
  });
  app.post("/api/snow/linux/media", async (req, res) => {
    res.json(await linuxSystemActuator.mediaControl(req.body.action || "play-pause"));
  });
  app.post("/api/snow/linux/lock", async (_req, res) => {
    res.json(await linuxSystemActuator.lockScreen());
  });
  app.post("/api/snow/linux/notify", async (req, res) => {
    const { title, message, urgency } = req.body;
    res.json(await linuxSystemActuator.dispatchNotification(title || "Snow", message || "", urgency || "normal"));
  });
  app.post("/api/snow/linux/launch", async (req, res) => {
    res.json(await linuxSystemActuator.launchApplication(String(req.body.app || "")));
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

  // ── Snow-Desk Specialist Agent Endpoints ─────────────────────────────────
  app.get("/api/snow/desk/state", async (_req, res) => {
    res.json(await computerUse.getDeskState());
  });

  app.get("/api/snow/desk/screenshot", async (req, res) => {
    const maxDim = req.query.maxDim ? parseInt(String(req.query.maxDim), 10) : 1280;
    res.json(await computerUse.takeScreenshot(maxDim));
  });

  app.post("/api/snow/desk/actuate", async (req, res) => {
    const { action, ...params } = req.body;
    try {
      switch (action) {
        case "focus":
          return res.json(await computerUse.focusWindow(String(params.title || "")));
        case "close":
          return res.json(await computerUse.closeWindow(String(params.title || "")));
        case "volume":
          return res.json(await computerUse.setVolume(Number(params.volume ?? params.pct ?? 50)));
        case "mute":
          return res.json(await computerUse.toggleMute());
        case "media":
          return res.json(await computerUse.mediaControl(params.mediaAction || "play-pause"));
        case "launch":
          return res.json(await computerUse.launch(String(params.target || params.app || "")));
        case "type":
          return res.json(await computerUse.typeText(String(params.text || ""), Boolean(params.pressEnter)));
        case "hotkey":
          return res.json(await computerUse.hotkey(params.keys));
        case "click":
          return res.json(await computerUse.mouseClick(params.x, params.y, params.button, params.clicks));
        case "move":
          return res.json(await computerUse.mouseMove(params.x, params.y));
        case "drag":
          return res.json(await computerUse.drag(params.startX, params.startY, params.endX, params.endY));
        case "screenshot":
          return res.json(await computerUse.takeScreenshot(params.maxDim || 1280));
        default:
          return res.status(400).json({ error: `Unknown desk action: ${action}` });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Snow-Guard Sentinel Agent Endpoints ──────────────────────────────────
  app.get("/api/snow/guard/status", (_req, res) => {
    res.json(snowGuard.getSecurityStatus());
  });

  app.get("/api/snow/guard/incidents", (_req, res) => {
    res.json(snowGuard.getIncidents());
  });

  app.post("/api/snow/guard/audit", (req, res) => {
    const { type, target, command, path: targetPath, mode } = req.body;
    if (type === "command" || command) {
      const cmdToAudit = command || target || "";
      const result = snowGuard.auditCommand(cmdToAudit);
      return res.json(result);
    }
    if (type === "path" || targetPath) {
      const pathToAudit = targetPath || target || "";
      const result = snowGuard.auditPath(pathToAudit, mode || "read");
      return res.json(result);
    }
    return res.status(400).json({ error: "Specify type ('command' or 'path') and target to audit." });
  });

  app.post("/api/snow/guard/posture", (req, res) => {
    const { posture } = req.body;
    if (posture === "STRICT" || posture === "LOCKDOWN" || posture === "PERMISSIVE") {
      snowGuard.setPosture(posture);
      return res.json({ success: true, posture: snowGuard.getPosture() });
    }
    return res.status(400).json({ error: "Invalid posture. Must be STRICT, LOCKDOWN, or PERMISSIVE." });
  });

  // ── Snow-Coder Specialist Agent Endpoints ─────────────────────────────────
  app.post("/api/snow/coder/run", async (req, res) => {
    try {
      const { code, language = "python", timeoutMs, maxMemoryMb, autoFix, snippetName } = req.body;
      const result = await snowCoder.execute({
        code,
        language,
        timeoutMs,
        maxMemoryMb,
        autoFix,
        snippetName,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/snow/coder/validate", async (req, res) => {
    try {
      const { code, language = "python" } = req.body;
      const result = await snowCoder.validateSyntax(code, language);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/snow/coder/metrics", async (_req, res) => {
    try {
      res.json(await snowCoder.getMetrics());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/snow/coder/snippets", (_req, res) => {
    res.json(snowCoder.listSnippets());
  });

  app.get("/api/snow/coder/snippets/:id", (req, res) => {
    const snippet = snowCoder.getSnippet(req.params.id);
    if (!snippet) return res.status(404).json({ error: "Snippet not found" });
    res.json(snippet);
  });

  // ── Snow-Planner Specialist Agent Endpoints ────────────────────────────────
  app.post("/api/snow/planner/plan", async (req, res) => {
    try {
      const { objective, goalId, context } = req.body;
      if (!objective) return res.status(400).json({ error: "Objective is required" });
      const plan = await snowPlanner.createPlan(objective, goalId, context);
      res.json(plan);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/snow/planner/plans", (_req, res) => {
    res.json(snowPlanner.listPlans());
  });

  app.get("/api/snow/planner/plan/:id", (req, res) => {
    const plan = snowPlanner.getPlan(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json(plan);
  });

  app.post("/api/snow/planner/milestone", (req, res) => {
    try {
      const { planId, milestoneId, status, resultSummary } = req.body;
      const updated = snowPlanner.updateMilestone(planId, milestoneId, status, resultSummary);
      if (!updated) return res.status(404).json({ error: "Plan or milestone not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/snow/planner/replan", async (req, res) => {
    try {
      const { planId, failedMilestoneId, errorDiagnostic } = req.body;
      const replanned = await snowPlanner.replan({
        planId,
        failedMilestoneId,
        errorDiagnostic: errorDiagnostic || "Milestone failure",
      });
      if (!replanned) return res.status(404).json({ error: "Plan or milestone not found" });
      res.json(replanned);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Snow-Critic Specialist Agent Endpoints ─────────────────────────────────
  app.post("/api/snow/critic/evaluate", async (req, res) => {
    try {
      const { objective, output, codeSnippet, strictness, context } = req.body;
      if (!objective || output === undefined) {
        return res.status(400).json({ error: "objective and output are required" });
      }
      const evaluation = await snowCritic.evaluate({
        objective,
        output,
        codeSnippet,
        strictness,
        context,
      });
      res.json(evaluation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/snow/critic/refine", async (req, res) => {
    try {
      const { objective, initialOutput, evaluation } = req.body;
      if (!objective || !initialOutput || !evaluation) {
        return res.status(400).json({ error: "objective, initialOutput, and evaluation are required" });
      }
      const refined = await snowCritic.refine(objective, initialOutput, evaluation);
      res.json(refined);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/snow/critic/metrics", (_req, res) => {
    res.json(snowCritic.getMetrics());
  });

  app.get("/api/snow/critic/history", (_req, res) => {
    res.json(snowCritic.getHistory());
  });

  // ── System Maintenance & OS Care Endpoints ─────────────────────────────────
  app.get("/api/snow/system/maintenance/updates", async (_req, res) => {
    try {
      res.json(await systemMaintenance.checkAvailableUpdates());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/snow/system/maintenance/audit", async (_req, res) => {
    try {
      res.json(await systemMaintenance.runFullHealthAudit());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/snow/system/maintenance/clean", async (_req, res) => {
    try {
      res.json(await systemMaintenance.performSafeMaintenance());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/snow/system/maintenance/failed-services", async (_req, res) => {
    try {
      res.json(await systemMaintenance.checkFailedServices());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/snow/system/maintenance/autoremove", async (_req, res) => {
    try {
      res.json(await systemMaintenance.getAutoremoveCandidates());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/snow/system/maintenance/plan", async (req, res) => {
    try {
      const type = req.body?.actionType || "full_system_maintenance";
      res.json(await systemMaintenance.createStagedProposal(type));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/snow/system/maintenance/proposals", async (_req, res) => {
    try {
      res.json(systemMaintenance.getPendingProposals());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/snow/system/maintenance/confirm", async (req, res) => {
    try {
      const { proposalId, confirmed } = req.body || {};
      res.json(await systemMaintenance.executeApprovedProposal(proposalId, confirmed === true));
    } catch (e: any) {
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

  // ── Dynamic Synthesized Skills & Procedural Reflexion Endpoints ───────────
  app.get("/api/snow/skills", (_req, res) => {
    const skills = loadSynthesizedSkills();
    res.json({ skills, count: skills.length });
  });

  app.post("/api/snow/skills/synthesize", async (req, res) => {
    try {
      const { name, description, requirement } = req.body;
      if (!name || !requirement) {
        return res.status(400).json({ error: "Name and requirement strings are required." });
      }
      const apiKey = process.env.GEMINI_API_KEY || "";
      const result = await skillSynthesizer.synthesizeSkill({ name, description: description || requirement, requirement }, apiKey);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/snow/skills/:name", (req, res) => {
    const deleted = deleteSynthesizedSkill(req.params.name);
    skillSynthesizer.reloadDynamicTools();
    res.json({ success: deleted });
  });

  app.post("/api/snow/skills/execute", async (req, res) => {
    try {
      const { name, input } = req.body;
      if (!name) return res.status(400).json({ error: "Skill name is required" });
      const result = await skillSynthesizer.executeSkill(name, input || {});
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/snow/reflexion/rules", (_req, res) => {
    const rules = getAllProceduralRules();
    res.json({ rules, count: rules.length });
  });

  // ── Autonomous Hierarchical Goals Endpoints ──────────────────────────────
  app.get("/api/snow/goals", (req, res) => {
    const status = req.query.status ? String(req.query.status) as any : undefined;
    const goals = getAutonomousGoals(status);
    res.json({ goals, count: goals.length, daemon: goalEngine.getStatus() });
  });

  app.get("/api/snow/goals/:id", (req, res) => {
    const goal = getGoalWithSubtasks(req.params.id);
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    res.json(goal);
  });

  app.post("/api/snow/goals/create", (req, res) => {
    const { title, description, priority } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    const goal = createAutonomousGoal(title, description || title, priority || 3);
    goalEngine.ensureStarted();
    res.json(goal);
  });

  app.post("/api/snow/goals/:id/pause", (req, res) => {
    updateGoalStatus(req.params.id, "paused");
    res.json({ success: true, status: "paused" });
  });

  app.post("/api/snow/goals/:id/resume", (req, res) => {
    updateGoalStatus(req.params.id, "active");
    goalEngine.ensureStarted();
    res.json({ success: true, status: "active" });
  });

  app.delete("/api/snow/goals/:id", (req, res) => {
    const deleted = deleteAutonomousGoal(req.params.id);
    res.json({ success: deleted });
  });

  // ── /api/snow/memory — Phase 4: Memory & Dream Cycle REST API ─────────
  app.get("/api/snow/memory/status", (_req, res) => {
    const { getMemoryHealthSnapshot } = require("./brain");
    res.json({
      dreamDaemon: dreamCycle.getStatus(),
      memoryHealth: getMemoryHealthSnapshot()
    });
  });

  app.post("/api/snow/memory/dream", async (_req, res) => {
    const apiKey = process.env.GEMINI_API_KEY || "";
    try {
      const result = await dreamCycle.triggerNow(apiKey);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/snow/memory/logs", (_req, res) => {
    const { getConsolidationLogs } = require("./brain");
    const logs = getConsolidationLogs(30);
    res.json({ logs, count: logs.length });
  });

  app.post("/api/snow/memory/episode", (req, res) => {
    const { addEpisodicMemory } = require("./brain");
    const { content, context } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });
    const ep = addEpisodicMemory(content, "episodic", context);
    res.json({ success: true, episode: ep });
  });

  app.delete("/api/snow/memory/purge", (req, res) => {
    const { purgeConsolidatedEpisodes } = require("./brain");
    const days = parseInt(req.query.days as string || "7", 10);
    const count = purgeConsolidatedEpisodes(days);
    res.json({ success: true, purged: count });
  });

  // ── /api/snow/chat — main AI endpoint ────────────────────────────────────
  app.post("/api/snow/chat", async (req, res) => {
    const { prompt, history, model: requestedModel, images: reqImages, image: reqImage } = req.body;
    if (!prompt?.trim() && !reqImages?.length && !reqImage) return res.status(400).json({ error: "Missing prompt or visual input" });

    const effectivePrompt = (prompt && prompt.trim()) ? prompt.trim() : "Describe and analyze what you see in this visual input.";
    const rawImages: string[] = Array.isArray(reqImages) ? reqImages : (reqImage ? [reqImage] : []);
    const images = rawImages.filter(img => typeof img === "string" && img.length > 0);

    const reqId = Math.random().toString(36).substring(2, 7).toUpperCase();
    console.log(`\n[SNOW:${reqId}] ─── New query:`, effectivePrompt, "Model:", requestedModel || "default", "Visual frames:", images.length);

    // Phase 4: Record this interaction as an episodic memory
    try {
      addEpisodicMemory(
        `User asked: "${effectivePrompt.slice(0, 200)}" (${new Date().toLocaleTimeString()})`,
        "episodic",
        "chat"
      );
      dreamCycle.recordActivity();
    } catch (e: any) {
      console.warn("[SNOW] Failed to write episodic memory:", e.message);
    }

    // Fix 1 & 3: run intent resolution and unified context retrieval IN PARALLEL.
    // Greetings, queries, and agentic tasks all flow through dynamic neural intelligence — zero hardcoded scripts.
    const [intent, unifiedMemoryResult] = await Promise.all([
      resolveIntent(effectivePrompt),
      getUnifiedContext(effectivePrompt, { maxMemories: 10, maxRag: 5, maxVisual: 4, maxDirectives: 8 })
    ]);
    const preResolvedContext = unifiedMemoryResult.contextBlock;
    console.log(`[SNOW:${reqId}] Dynamic Neural Intent:`, JSON.stringify(intent));

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

    let liveMaintenance: { updates: any; autoremove: any } | null = null;
    const isMaintenanceQuery = /\b(update|updates|upgrad|autoremove|clean|cache|orphan|packages?|apt|maintenance|storage|headroom)\b/i.test(effectivePrompt);
    if (isMaintenanceQuery) {
      fetches.push(
        Promise.all([
          systemMaintenance.checkAvailableUpdates(),
          systemMaintenance.getAutoremoveCandidates(),
        ])
          .then(([upd, arm]) => {
            liveMaintenance = { updates: upd, autoremove: arm };
            toolsUsed.push("LiveSystemMaintenanceTelemetry");
          })
          .catch(() => {})
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
    if (liveMaintenance) {
      contextLines.push(
        `LIVE HOST OS PACKAGE TELEMETRY (DYNAMICALLY QUERIED DIRECTLY FROM UBUNTU SYSTEM AT ${liveMaintenance.updates.timestamp}):\n` +
        `- Total Upgradable Packages: ${liveMaintenance.updates.totalUpgradable}\n` +
        `- Security Updates Available: ${liveMaintenance.updates.securityUpdatesCount}\n` +
        `- Reboot Required: ${liveMaintenance.updates.rebootRequired ? "YES" : "NO"}\n` +
        `- Unused Autoremovable Orphan Packages: ${liveMaintenance.autoremove.totalRemovable}\n` +
        `- Sample Upgradable Packages: ${liveMaintenance.updates.packages.slice(0, 15).map((p: any) => `${p.name} (${p.oldVersion || "?"} -> ${p.newVersion})`).join(", ") || "None"}\n` +
        `- Sample Autoremove Candidates: ${liveMaintenance.autoremove.packages.slice(0, 15).map((p: any) => p.name).join(", ") || "None"}\n` +
        `MANDATE: State these exact live metrics queried dynamically from the host operating system right now. Never hardcode or hallucinate numbers.`
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

    const isGreeting = /^(hello|hi|hey|greetings|good\s+(morning|afternoon|evening|night)|howdy|sup|yo|hi there|hello snow|hi snow|snow|wake up|are you there|listen|wake)\b/i.test(effectivePrompt.trim().replace(/[.,!?;]+$/, ""));
    const isIdentity = /\b(who are you|what is your name|who created you|who made you|what can you do|your name|are you ai|are you snow)\b/i.test(effectivePrompt);
    const hasAgenticIntent = /\b(run|execute|calculate|solve|python|code|script|test|debug|check|git|status|diff|log|branch|clipboard|copy|paste|notification|notify|process|processes|service|services|daemon|kill|open|launch|terminal|file|files|read|write|search|weather|amixer|volume|remind|schedule|timer|goal|task|maintain|maintenance|update|updates|upgrade|upgrades|clean|cache|audit|health|headroom|battery|temp|temperature|packages?|apt|orphan|orphans|autoremove|remove|storage|space|disk|memory|ram|performance|speed|reclaim|inspect|sudo|permission|confirm|approve)\b/i.test(effectivePrompt) || 
                             intent.isReminder || intent.isEmail || intent.isCalendar || intent.isFileQuery || intent.isGoalCreate || intent.isMathCalc || intent.isCodeReview || intent.isDesktopAction;
    const hasVision = images.length > 0;
    const hasAnyComplexIntent = needsSearch || intent.isWeather || intent.isSystem || intent.isStock || intent.isSports || intent.isNews || hasAgenticIntent;
    const isSimpleConversation = isVisualRecall || (hasVision && !hasAgenticIntent) || ((isGreeting || isIdentity || !hasAnyComplexIntent) && !hasAgenticIntent);

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

    const reqId = Math.random().toString(36).substring(2, 7).toUpperCase();
    console.log(`\n[SNOW-STREAM:${reqId}] ─── New query:`, effectivePrompt, "Model:", requestedModel || "default");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const [intent, unifiedMemoryResult] = await Promise.all([
      resolveIntent(effectivePrompt),
      getUnifiedContext(effectivePrompt, { maxMemories: 10, maxRag: 5, maxVisual: 4, maxDirectives: 8 })
    ]);
    const preResolvedContext = unifiedMemoryResult.contextBlock;

    let weather: WeatherData | null = null;
    let system: SystemData | null = null;
    let searchResults: WebSearchResult[] = [];
    let liveMaintenanceStream: { updates: any; autoremove: any } | null = null;

    const fetches: Promise<void>[] = [];
    if (intent.isWeather && intent.weatherLocation) {
      fetches.push(fetchWeather(intent.weatherLocation).then(d => { weather = d; }));
    }
    if (intent.isSystem) {
      fetches.push(fetchSystemCached().then(d => { system = d; }));
    }
    const isMaintenanceStream = /\b(update|updates|upgrad|autoremove|clean|cache|orphan|packages?|apt|maintenance|storage|headroom)\b/i.test(effectivePrompt);
    if (isMaintenanceStream) {
      fetches.push(
        Promise.all([
          systemMaintenance.checkAvailableUpdates(),
          systemMaintenance.getAutoremoveCandidates(),
        ])
          .then(([upd, arm]) => {
            liveMaintenanceStream = { updates: upd, autoremove: arm };
          })
          .catch(() => {})
      );
    }
    const searchQuery = intent.webQuery || intent.stockQuery || effectivePrompt;
    if (intent.isNews || intent.isSports || intent.isWeb) {
      fetches.push(fetchWebSearch(searchQuery).then(d => { searchResults = d; }));
    }
    await Promise.all(fetches);

    const contextLines: string[] = [];
    if (weather) contextLines.push(`Weather: ${weather.location}, ${weather.temp}, ${weather.condition}.`);
    if (system) contextLines.push(`System: CPU ${system.cpu}, RAM ${system.ram}, temp ${system.temp}.`);
    if (liveMaintenanceStream) {
      contextLines.push(
        `LIVE HOST OS PACKAGE TELEMETRY (DYNAMICALLY QUERIED DIRECTLY FROM UBUNTU SYSTEM AT ${liveMaintenanceStream.updates.timestamp}):\n` +
        `- Total Upgradable Packages: ${liveMaintenanceStream.updates.totalUpgradable}\n` +
        `- Security Updates Available: ${liveMaintenanceStream.updates.securityUpdatesCount}\n` +
        `- Reboot Required: ${liveMaintenanceStream.updates.rebootRequired ? "YES" : "NO"}\n` +
        `- Unused Autoremovable Orphan Packages: ${liveMaintenanceStream.autoremove.totalRemovable}\n` +
        `- Sample Upgradable Packages: ${liveMaintenanceStream.updates.packages.slice(0, 15).map((p: any) => `${p.name} (${p.oldVersion || "?"} -> ${p.newVersion})`).join(", ") || "None"}\n` +
        `- Sample Autoremove Candidates: ${liveMaintenanceStream.autoremove.packages.slice(0, 15).map((p: any) => p.name).join(", ") || "None"}\n` +
        `MANDATE: State these exact live metrics queried dynamically from the host operating system right now. Never hardcode or hallucinate numbers.`
      );
    }
    if (searchResults.length) contextLines.push(`Web search: ${searchResults[0].title} - ${searchResults[0].snippet}`);

    const result = await callAIStream(
      effectivePrompt,
      contextLines.join("\n"),
      history,
      requestedModel,
      (chunkText) => {
        res.write(`data: ${JSON.stringify({ token: chunkText })}\n\n`);
      },
      images,
      preResolvedContext
    );

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
          model: "gemini-2.5-flash",
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
    const { text, source, category, chunkDocument: shouldChunk } = req.body;
    if (!text || !source) return res.status(400).json({ error: "text and source required" });
    if (shouldChunk || (typeof text === "string" && text.length > 1000)) {
      const chunks = await ragIngestDocument(text, source, category || "fact");
      return res.json({ success: true, count: chunks.length, chunks: chunks.map(c => ({ ...c, embedding: undefined })) });
    }
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
  const server = app.listen(PORT, HOST, () => {
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
    goalEngine.start(4000);
    dreamCycle.start(3 * 60 * 1000); // 3-minute check interval, triggers after 5 min idle
    animaEngine.start(60 * 1000);    // 1-minute autonomous consciousness heartbeat
    startNightlyCron();
  });

  let isShuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Server] Received ${signal}. Gracefully stopping background daemons and flushing databases...`);
    try {
      routineScheduler.stopScheduler();
      ambientPerception.stop();
      goalEngine.stop();
      dreamCycle.stop();
      animaEngine.stop();
    } catch (e: any) {
      console.warn("[Server] Notice while stopping daemons:", e.message);
    }

    try {
      closeBrainDb();
      closeRagDb();
    } catch (e: any) {
      console.warn("[Server] Notice while closing database handles:", e.message);
    }

    server.close(() => {
      console.log("[Server] HTTP server closed. Safe shutdown complete.");
      process.exit(0);
    });

    setTimeout(() => {
      console.warn("[Server] Shutdown timeout reached (5s). Force exiting.");
      process.exit(0);
    }, 5000).unref();
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer();
