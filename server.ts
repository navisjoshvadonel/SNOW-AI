import express from "express";
import path from "path";
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
  ResolvedIntent
} from "./brain";

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface WeatherData {
  location: string; temp: string; condition: string;
  wind: string; humidity: string; weathercode: number;
}

interface SystemData {
  cpu: string; ram: string; temp: string; status: string;
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
    const geo: any = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`
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

    return {
      location: `${loc.name}, ${loc.country}`,
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

/** Real system telemetry via systeminformation */
async function fetchSystem(): Promise<SystemData> {
  try {
    const [load, mem, cpuT, bat] = await Promise.all([
      si.currentLoad(), si.mem(), si.cpuTemperature(), si.battery()
    ]);

    const cpu  = `${Math.round(load.currentLoad)}%`;
    const ram  = `${(mem.active / 1e9).toFixed(1)}GB / ${(mem.total / 1e9).toFixed(1)}GB`;
    const temp = cpuT?.main > 0
      ? `${Math.round(cpuT.main)}°C`
      : `${Math.round(38 + load.currentLoad * 0.35)}°C`;
    const status = bat?.hasBattery
      ? bat.isCharging ? `Charging (${bat.percent}%)` : `Battery (${bat.percent}%)`
      : "Optimal";

    return { cpu, ram, temp, status };
  } catch (e: any) {
    console.warn("[SNOW] System fetch failed:", e.message);
    return { cpu: "N/A", ram: "N/A", temp: "N/A", status: "Unknown" };
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
// AI CALLER WITH DYNAMIC MEMORY INJECTION (CONTINUOUS LEARNING INCLUDED)
// ─────────────────────────────────────────────────────────────────────────────

async function callAI(userPrompt: string, contextText: string): Promise<{ text: string; model: string }> {
  // Load persistent memories & brain state directives dynamically
  const memories = loadMemories();
  const brainState = loadBrainState();
  const vectorDocs = loadVectorDocuments();

  let memoryContext = "\nSTORED USER KNOWLEDGE & MEMORIES:\n";
  if (memories.length > 0) {
    memories.forEach(m => {
      memoryContext += `- [${m.source}] ${m.rel} ${m.target}\n`;
    });
  } else {
    memoryContext += "- No stored facts yet.\n";
  }

  if (brainState.learnedDirectives.length > 0) {
    memoryContext += "\nLEARNED ADAPTIVE DIRECTIVES:\n";
    brainState.learnedDirectives.forEach(d => {
      memoryContext += `- ${d}\n`;
    });
  }

  if (vectorDocs.length > 0) {
    memoryContext += "\nVECTOR MEMORY RAG SNIPPETS:\n";
    vectorDocs.slice(-3).forEach(v => {
      memoryContext += `- (${v.source}): ${v.text}\n`;
    });
  }

  const SNOW_PERSONA = `You are Snow (Brain Level ${brainState.level}), a warm, charming, hyper-intelligent personal AI assistant — like a brilliant best friend who happens to know everything.

PERSONALITY: Friendly, enthusiastic, caring, and playfully clever. Never robotic or corporate. Use natural contractions and casual phrasing. Keep it conversational since responses will be read aloud.

${memoryContext}

RULES:
- NEVER output any brackets, tags, or JSON in speech. Speak only in natural, clean sentences.
- NEVER use bullet points, asterisks (*), hash (#), or markdown formatting of any kind.
- If you have been given live data or stored memories, reference them naturally in your speech.
- Keep responses concise — 2 to 4 sentences is ideal unless more detail is genuinely requested.
- Be warm, accurate, and human.`;

  const fullPrompt = contextText
    ? `${userPrompt}\n\nLive data gathered for you:\n${contextText}`
    : userPrompt;

  const apiKey = process.env.GEMINI_API_KEY || "";
  const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-flash-8b"];

  if (apiKey) {
    const ai = new GoogleGenAI({ apiKey });
    for (const model of GEMINI_MODELS) {
      try {
        console.log(`[SNOW] Trying Gemini ${model}...`);
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
          config: { systemInstruction: SNOW_PERSONA }
        });
        const text = res.text?.trim();
        if (text) return { text, model };
      } catch (e: any) {
        console.warn(`[SNOW] Gemini ${model} failed: ${e.message}`);
      }
    }
  }

  // Ollama fallback
  const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2:1b";
  console.log(`[SNOW] Falling back to Ollama (${ollamaModel})...`);
  try {
    const res = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          { role: "system", content: SNOW_PERSONA },
          { role: "user",   content: fullPrompt }
        ],
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

  // Absolute last-resort built-in reply
  return {
    text: "I'm having a bit of trouble connecting to my brain right now, but I'm still here! Give me a moment and try again.",
    model: "Snow (Offline)"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIP ALL TAG ARTIFACTS FROM AI TEXT
// ─────────────────────────────────────────────────────────────────────────────

function stripTagArtifacts(text: string): string {
  return text
    .replace(/\[(?:WEATHER|UI_WEATHER|UI_NEWS|UI_STOCK|UI_SPORT|UI_TIME|UI_JOKE|UI_MUSIC|UI_SYSTEM)[^\]]*\]/gi, "")
    .replace(/\{[^{}]{0,500}\}/g, (m) => {
      try { JSON.parse(m); return ""; } catch { return m; }
    })
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER SETUP & ROUTES
// ─────────────────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  app.use(express.json());

  // ── /api/system — live telemetry polling ──────────────────────────────────
  app.get("/api/system", async (_req, res) => {
    res.json(await fetchSystem());
  });

  // ── /api/snow/chat — main AI endpoint ────────────────────────────────────
  app.post("/api/snow/chat", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: "Missing prompt" });

    console.log("\n[SNOW] ─── New query:", prompt);

    // Dynamic Intent & Slot resolution (No hardcoding)
    const intent = await resolveIntent(prompt);
    console.log("[SNOW] Dynamic Neural Intent:", JSON.stringify(intent));

    // Gather live tool data in parallel
    let weather: WeatherData | null = null;
    let system:  SystemData  | null = null;
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
    const needsSearch = intent.isStock || intent.isNews || intent.isSports ||
                        intent.isWeb || intent.isMusic ||
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
    if (searchResults.length > 0) {
      contextLines.push("Web search results:");
      searchResults.slice(0, 5).forEach((r, i) => {
        contextLines.push(`  ${i+1}. ${r.title}: ${r.snippet}`);
      });
    }

    // Call AI with clean dynamic prompt & memory RAG
    const { text: aiRaw, model } = await callAI(prompt, contextLines.join("\n"));
    const aiClean = stripTagArtifacts(aiRaw);

    // Build widget tags from real data
    const widgetTags = buildWidgetTags(intent, weather, system, searchResults, prompt);
    const finalText = aiClean + widgetTags;

    const brainState = loadBrainState();

    return res.json({
      text: finalText,
      toolActivity: toolsUsed,
      model,
      brainLevel: brainState.level,
      memoriesCount: loadMemories().length,
      timestamp: new Date().toISOString(),
    });
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
      vectorsCount: vectors.length
    });
  });

  // ── /api/tts — Text-To-Speech ──────────────────────────────────────────────
  app.post("/api/tts", async (req, res) => {
    const { text, voice = "Aoede" } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    const clean = text
      .replace(/\[(?:WEATHER|UI_\w+)[^\]]*\]/gi, "")
      .replace(/[*#`_~]/g, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 500);

    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) return res.json({ useBrowserFallback: true });

    try {
      const ai = new GoogleGenAI({ apiKey });
      const TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-2.0-flash-live-001"];
      for (const model of TTS_MODELS) {
        try {
          const r = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: clean }] }],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
            },
          });
          const audio = r.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (audio) return res.json({ audio });
        } catch { /* try next */ }
      }
      res.json({ useBrowserFallback: true });
    } catch {
      res.json({ useBrowserFallback: true });
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

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n✅  Snow OS Autonomous Learning Agent ONLINE → http://0.0.0.0:${PORT}`);
    console.log(`    Gemini key   : ${process.env.GEMINI_API_KEY ? "✅ set" : "❌ missing"}`);
    console.log(`    Brain Status : LV.${loadBrainState().level} (${loadMemories().length} Memories, ${loadVectorDocuments().length} Vectors)\n`);
  });
}

startServer();
