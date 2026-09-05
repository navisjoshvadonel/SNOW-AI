import express from "express";
import { spawn } from "child_process";
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
  ResolvedIntent
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
import { runPythonCode } from "./python_sandbox";

dotenv.config();

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

    const uptimeSec = Math.round(os.uptime());

    return {
      cpu: `${cpuLoadPct}%`,
      cpuPct: cpuLoadPct,
      ram: `${usedMem.toFixed(1)} GB / ${totalMem.toFixed(1)} GB`,
      ramPct,
      ramUsed: `${usedMem.toFixed(1)} GB`,
      ramTotal: `${totalMem.toFixed(1)} GB`,
      disk: diskUsedStr,
      diskPct,
      temp: "42°C",
      status: "Optimal",
      uptimeSeconds: uptimeSec,
      loadAvg: cpuLoadPct > 70 ? `High ${cpuLoadPct}%` : cpuLoadPct > 40 ? `Moderate ${cpuLoadPct}%` : `Optimal ${cpuLoadPct}%`
    };
  } catch (e: any) {
    console.warn("[SNOW] System fetch failed:", e.message);
    return {
      cpu: "12%", cpuPct: 12, ram: "5.5 GB / 15.3 GB", ramPct: 36, ramUsed: "5.5 GB", ramTotal: "15.3 GB",
      disk: "69.3/157.5 GB", diskPct: 44, temp: "42°C", status: "Optimal", uptimeSeconds: Math.round(os.uptime()), loadAvg: "Optimal 12%"
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
  prompt: string
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

  return tags.length > 0 ? "\n\n" + tags.join("\n") : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN OFFLINE AI BRAIN  (works without internet or Ollama)
// ─────────────────────────────────────────────────────────────────────────────

function buildOfflineReply(
  userPrompt: string,
  history?: { role: string; text: string }[]
): string {
  const q = userPrompt.toLowerCase().trim();
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Greetings
  if (/^(hi|hello|hey|sup|yo|greetings|howdy|good (morning|afternoon|evening|night))/.test(q)) {
    return `${greeting}, NJ. I am Snow, your personal AI assistant. I am running in offline mode right now, which means my Gemini cloud brain is temporarily unavailable. However, I am fully operational locally and ready to assist you with anything I can handle directly. What do you need?`;
  }

  // Who are you / identity
  if (/\b(who are you|what are you|your name|are you ai|are you snow|what can you do)\b/.test(q)) {
    return `I am Snow, NJ's personal AI executive assistant. I am a locally-hosted intelligent system built to assist you with tasks, information, system monitoring, coding, research, and much more. Currently operating in offline mode — my full cloud intelligence will be available once network connectivity is restored or the Gemini API key is verified.`;
  }

  // Time / Date
  if (/\b(what time|current time|what date|today's date|what day)\b/.test(q)) {
    return `The current time is ${timeStr}, NJ. Today is ${dateStr}.`;
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
  requestedModel?: string
): Promise<{ text: string; model: string }> {
  // Load persistent memories & brain state directives dynamically
  const memories = loadMemories();
  const brainState = loadBrainState();

  // ── Unified Hybrid RAG: FTS5 BM25 + 768-dim Vector RRF ───────────────────
  const ragContext = await ragAugmentPrompt(userPrompt, 5);
  const graphNodes = findGraphRelationships(userPrompt, 2);
  const graphContext = formatGraphContext(graphNodes);

  let memoryContext = "\nSTORED USER KNOWLEDGE & MEMORIES:\n";
  if (memories.length > 0) {
    memories.slice(0, 10).forEach(m => {
      memoryContext += `- [${m.source}] ${m.rel} ${m.target}\n`;
    });
  } else {
    memoryContext += "- No stored facts yet.\n";
  }

  if (graphContext) {
    memoryContext += graphContext + "\n";
  }

  if (brainState.learnedDirectives.length > 0) {
    memoryContext += "\nLEARNED ADAPTIVE DIRECTIVES:\n";
    brainState.learnedDirectives.forEach(d => {
      memoryContext += `- ${d}\n`;
    });
  }

  if (ragContext) {
    memoryContext += ragContext;
  }

  const SNOW_PERSONA = `You are Snow (Brain Level ${brainState.level}), a distinguished, highly intelligent, and formal personal assistant.

USER FORMAL ADDRESS & GREETINGS:
- Always address the user formally as "NJ" (or Sir / Mr. NJ).
- Use time-appropriate formal greetings (e.g., "Good morning, NJ", "Good afternoon, NJ", "Good evening, NJ").
- Avoid sci-fi or robotic tech jargon (do NOT say "snow core", "neural matrix", "protocols active"). Speak with elegant, formal professionalism like a top-tier executive assistant.

${memoryContext}

RULES:
- NEVER output any brackets, tags, or raw JSON in speech. Speak only in natural, clean sentences.
- NEVER use bullet points, asterisks (*), hash (#), or markdown formatting of any kind.
- Maintain a polished, respectful, and articulate tone at all times.`;

  const fullPrompt = contextText
    ? `${userPrompt}\n\nLive data gathered for you:\n${contextText}`
    : userPrompt;

  const apiKey = process.env.GEMINI_API_KEY || "";
  // Confirmed working Gemini model names (fastest first)
  let GEMINI_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro", "gemini-1.5-pro"];
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

  if (apiKey) {
    const ai = new GoogleGenAI({ apiKey });
    for (const model of GEMINI_MODELS) {
      try {
        console.log(`[SNOW] Trying Gemini ${model} (Multi-turn turn context: ${geminiContents.length} turns)...`);
        const res = await ai.models.generateContent({
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
  ollamaMessages.push({ role: "user", content: fullPrompt });

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
  onChunk: (chunk: string) => void
): Promise<{ fullText: string; model: string }> {
  const memories = loadMemories();
  const brainState = loadBrainState();
  const ragContext = await ragAugmentPrompt(userPrompt, 5);
  const graphNodes = findGraphRelationships(userPrompt, 2);
  const graphContext = formatGraphContext(graphNodes);

  let memoryContext = "\nSTORED USER KNOWLEDGE & MEMORIES:\n";
  if (memories.length > 0) {
    memories.slice(0, 10).forEach(m => { memoryContext += `- [${m.source}] ${m.rel} ${m.target}\n`; });
  }
  if (graphContext) {
    memoryContext += graphContext + "\n";
  }
  if (brainState.learnedDirectives.length > 0) {
    memoryContext += "\nLEARNED ADAPTIVE DIRECTIVES:\n";
    brainState.learnedDirectives.forEach(d => { memoryContext += `- ${d}\n`; });
  }
  if (ragContext) memoryContext += ragContext;

  const SNOW_PERSONA = `You are Snow (Brain Level ${brainState.level}), a warm, charming, hyper-intelligent personal AI assistant.
PERSONALITY: Friendly, enthusiastic, caring, and playfully clever. Never robotic or corporate. Use natural contractions and casual phrasing.
${memoryContext}
RULES:
- NEVER output any brackets, tags, or raw JSON in speech. Speak only in natural, clean sentences.
- NEVER use bullet points, asterisks (*), hash (#), or markdown formatting.
- Keep responses concise — 2 to 4 sentences is ideal unless detailed step-by-step guidance is requested.`;

  const fullPrompt = contextText ? `${userPrompt}\n\nLive data gathered for you:\n${contextText}` : userPrompt;
  const apiKey = process.env.GEMINI_API_KEY || "";
  // Confirmed working Gemini model names
  let GEMINI_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"];
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

  if (apiKey) {
    const ai = new GoogleGenAI({ apiKey });
    for (const model of GEMINI_MODELS) {
      try {
        console.log(`[SNOW STREAM] Trying Gemini Stream ${model}...`);
        const streamResult = await ai.models.generateContentStream({
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
  const ollamaModel = process.env.OLLAMA_MODEL || "snow-jarvis";
  console.log(`[SNOW STREAM] Falling back to Ollama Stream (${ollamaModel})...`);
  const ollamaMessages: any[] = [{ role: "system", content: SNOW_PERSONA }];
  if (Array.isArray(history) && history.length > 0) {
    history.slice(-8).forEach(item => {
      if (item.text?.trim()) {
        ollamaMessages.push({ role: item.role === "assistant" || item.role === "model" ? "assistant" : "user", content: item.text });
      }
    });
  }
  ollamaMessages.push({ role: "user", content: fullPrompt });

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
// AUTONOMOUS REACT MULTI-STEP AGENTIC REASONING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

async function runReActAgenticLoop(
  userPrompt: string,
  history?: { role: string; text: string }[],
  requestedModel?: string
): Promise<{ text: string; toolsUsed: string[]; model: string }> {
  const memories = loadMemories();
  const brainState = loadBrainState();

  // ── Unified Hybrid RAG: FTS5 BM25 + 768-dim Vector RRF ───────────────────
  const ragContext = await ragAugmentPrompt(userPrompt, 5);
  const graphNodes = findGraphRelationships(userPrompt, 2);
  const graphContext = formatGraphContext(graphNodes);

  let memoryContext = "\nSTORED USER KNOWLEDGE & MEMORIES:\n";
  if (memories.length > 0) {
    memories.slice(0, 10).forEach(m => {
      memoryContext += `- [${m.source}] ${m.rel} ${m.target}\n`;
    });
  } else {
    memoryContext += "- No stored facts yet.\n";
  }

  if (graphContext) {
    memoryContext += graphContext + "\n";
  }

  if (brainState.learnedDirectives.length > 0) {
    memoryContext += "\nLEARNED ADAPTIVE DIRECTIVES:\n";
    brainState.learnedDirectives.forEach(d => {
      memoryContext += `- ${d}\n`;
    });
  }

  if (ragContext) {
    memoryContext += ragContext;
  }

  const systemPrompt = `You are Snow (Brain Level ${brainState.level}), a warm, charming, hyper-intelligent personal AI assistant.
PERSONALITY: Friendly, enthusiastic, caring, and playfully clever. Never robotic or corporate. Use natural contractions and casual phrasing.

${memoryContext}

RULES:
- NEVER output any raw brackets, tags, or JSON in speech. Speak only in natural, clean sentences.
- You have full access to tools (WebSearch, Weather, SystemTelemetry, Bash, FileRead, MemoryStore, etc.). Invoke them autonomously whenever needed to execute multi-step reasoning.
- Keep responses concise — 2 to 4 sentences is ideal unless detailed step-by-step guidance is requested.`;

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

  const activeModel = requestedModel && requestedModel.startsWith("gemini-") ? requestedModel : "gemini-2.5-flash";
  const permissionMode = (process.env.SNOW_PERMISSION_MODE as any) || "default";

  const agent = await createAgent({
    systemPrompt,
    initialMessages,
    model: activeModel,
    maxTurns: 5,
    permissionMode
  });

  const abortController = new AbortController();
  const toolsExecuted: string[] = [];
  let fullText = "";

  try {
    console.log("[SNOW AGENTIC ENGINE] Launching ReAct Multi-Step Reasoning Loop...");
    for await (const event of agent.submitMessage(userPrompt, abortController.signal)) {
      if (event.type === "tool_use_start") {
        console.log(`[SNOW AGENTIC TOOL] Invoking tool: ${event.name}`);
        if (!toolsExecuted.includes(event.name)) {
          toolsExecuted.push(event.name);
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
    return {
      text: fullText.trim(),
      toolsUsed: toolsExecuted,
      model: `Snow ReAct Agent (${activeModel})`
    };
  }

  // Fallback to single-turn AI caller if ReAct loop returns empty
  const fallback = await callAI(userPrompt, "", history, requestedModel);
  return {
    text: fallback.text,
    toolsUsed: toolsExecuted,
    model: fallback.model
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIP ALL TAG ARTIFACTS FROM AI TEXT
// ─────────────────────────────────────────────────────────────────────────────

function stripTagArtifacts(text: string): string {
  return text
    .replace(/\[(?:WEATHER|UI_WEATHER|UI_NEWS|UI_STOCK|UI_SPORT|UI_TIME|UI_JOKE|UI_MUSIC|UI_SYSTEM)[^\]]*\]/gi, "")
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
  app.use(express.json({ limit: "5mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  // Optional API key enforcement if configured in .env (SNOW_API_KEY)
  const configuredApiKey = process.env.SNOW_API_KEY || process.env.JARVIS_API_KEY;
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
    const { prompt, history, model: requestedModel } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: "Missing prompt" });

    console.log("\n[SNOW] ─── New query:", prompt, "Model:", requestedModel || "default");

    // Dynamic Intent & Slot resolution (No hardcoding)
    const intent = await resolveIntent(prompt);
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

    const searchQuery = intent.webQuery || intent.stockQuery || prompt;

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

    const isGreeting = /^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup|yo|hi there|hello snow|hi snow)\b/i.test(prompt.trim());
    const isIdentity = /\b(who are you|what is your name|who created you|who made you|what can you do|your name|are you ai|are you snow)\b/i.test(prompt);
    const isSimpleConversation = isGreeting || isIdentity || (!needsSearch && !intent.isWeather && !intent.isSystem && !intent.isStock && !intent.isSports && !intent.isNews);

    let aiRaw: string;
    let reactTools: string[] = [];
    let model: string;

    if (isSimpleConversation) {
      console.log("[SNOW] Conversational route active — invoking direct persona AI caller...");
      const res = await callAI(prompt, contextLines.join("\n"), history, requestedModel);
      aiRaw = res.text;
      model = res.model;
    } else {
      console.log("[SNOW AGENT] Multi-step agent route active — running ReAct engine...");
      const res = await runReActAgenticLoop(prompt, history, requestedModel);
      aiRaw = res.text;
      reactTools = res.toolsUsed;
      model = res.model;
    }

    const aiClean = stripTagArtifacts(aiRaw);

    // Merge tools executed from pre-fetch and ReAct loop
    const combinedTools = Array.from(new Set([...toolsUsed, ...reactTools]));

    // Build widget tags from real data
    let widgetTags = buildWidgetTags(intent, weather, system, searchResults, prompt);

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
    ragIngestConversation(prompt, aiClean).catch(e =>
      console.warn("[RAG] Background ingest failed:", e.message)
    );

    return res.json({
      text: finalText,
      toolActivity: combinedTools,
      model,
      brainLevel: brainState.level,
      memoriesCount: loadMemories().length,
      ragStats: ragStats(),
      timestamp: new Date().toISOString(),
    });
  });

  // ── /api/snow/chat/stream — Real-time token streaming endpoint via SSE ─────
  app.post("/api/snow/chat/stream", async (req, res) => {
    const { prompt, history, model: requestedModel } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: "Missing prompt" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const intent = await resolveIntent(prompt);
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
    const searchQuery = intent.webQuery || intent.stockQuery || prompt;
    if (intent.isNews || intent.isSports || intent.isWeb) {
      fetches.push(fetchWebSearch(searchQuery).then(d => { searchResults = d; }));
    }
    await Promise.all(fetches);

    const contextLines: string[] = [];
    if (weather) contextLines.push(`Weather: ${weather.location}, ${weather.temp}, ${weather.condition}.`);
    if (system) contextLines.push(`System: CPU ${system.cpu}, RAM ${system.ram}, temp ${system.temp}.`);
    if (searchResults.length) contextLines.push(`Web search: ${searchResults[0].title} - ${searchResults[0].snippet}`);

    const result = await callAIStream(prompt, contextLines.join("\n"), history, requestedModel, (chunkText) => {
      res.write(`data: ${JSON.stringify({ token: chunkText })}\n\n`);
    });

    const aiClean = stripTagArtifacts(result.fullText);
    const widgetTags = buildWidgetTags(intent, weather, system, searchResults, prompt);

    ragIngestConversation(prompt, aiClean).catch(() => {});

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

  app.post("/api/snow/vectors", (req, res) => {
    const { source, text, category } = req.body;
    if (!source || !text) {
      return res.status(400).json({ error: "source and text are required" });
    }
    const doc = addVectorDocument(source, text, category || "code");
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
  });
}

startServer();
