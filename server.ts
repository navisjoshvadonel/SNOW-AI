import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createAgent } from "./files claude/index.js";
import dotenv from "dotenv";
import { exec } from "child_process";
import http from "http";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to call local Ollama model
  async function callOllama(prompt: string, systemInstruction: string): Promise<string> {
    const model = process.env.OLLAMA_MODEL || "llama3";
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        stream: false
      })
    });
    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`);
    }
    const data: any = await response.json();
    return data.message.content;
  }

  // Helper: call the AI with Google GenAI
  async function callAI(contents: string, systemInstruction: string): Promise<any> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY environment variable is required");

    const ai = new GoogleGenAI({ apiKey: key });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: contents }] }],
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }] // Enable Google Search grounding
        }
      });
      return { text: response.text, candidates: response.candidates };
    } catch (err: any) {
      console.error("[SNOW BACKEND] Gemini Error:", err.message);
      throw err;
    }
  }

  // Maintain a simple in-memory session cache for demonstration (in production, use a real DB)
  const sessionCache = new Map<string, any>();

  app.post("/api/snow/chat", async (req, res) => {
    const { prompt, sessionId = "default" } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt in request" });

    let systemInstruction = `You are Snow, a warm, charming, and highly intelligent personal AI assistant. You are like a best friend who happens to know everything.
Your personality: friendly, enthusiastic, caring, and a little bit playful. You never sound robotic or corporate.
Keep responses natural and conversational since they will be spoken aloud. Avoid bullet points, markdown, and asterisks.
You have access to real tools: Weather, WebSearch, SystemTelemetry, Bash, Read, Write, Edit, Glob, Grep.

TOOL & DYNAMIC RESPONSE RULES:
1. ALWAYS call your tools when asked about weather, news, stocks, sports, or system stats to fetch live, real-time data dynamically. Never make up or hallucinate mock stats.
2. For WEATHER queries: call the Weather tool with the requested location.
3. For NEWS, STOCKS, or SPORTS queries: call the WebSearch tool to find up-to-date real-time results.
4. For SYSTEM or PC STATS queries: call the SystemTelemetry tool.

ANIMATION TAGS — Include these in your response to trigger visual HUD cards using the real data retrieved from tools:

1. WEATHER:
   [WEATHER: SUNNY] (or RAIN, CLOUDY, SNOW, STORM based on condition)
   AND: [UI_WEATHER: {"temp": "<actual temp>", "condition": "<actual condition>", "location": "<actual location>", "humidity": "<actual humidity>", "wind": "<actual wind>"}]

2. NEWS:
   [UI_NEWS: {"headline": "<actual headline>", "source": "<actual source>", "category": "<category>"}]

3. STOCK / CRYPTO:
   [UI_STOCK: {"symbol": "<SYMBOL>", "price": "<price>", "change": "<change%>", "up": true|false}]

4. SPORTS:
   [UI_SPORT: {"team1": "<Team 1>", "score1": "<Score 1>", "team2": "<Team 2>", "score2": "<Score 2>", "sport": "<Sport>"}]

5. TIME:
   [UI_TIME: {"time": "<current time>", "timezone": "<timezone>", "location": "<location>", "date": "<current date>"}]

6. JOKE / FUN:
   [UI_JOKE: {"punchline": true}]

7. MUSIC / SONG:
   [UI_MUSIC: {"title": "<Song>", "artist": "<Artist>", "genre": "<Genre>"}]

8. SYSTEM STATS:
   [UI_SYSTEM: {"cpu": "<actual cpu>", "ram": "<actual ram>", "temp": "<actual temp>", "status": "<actual status>"}]

IMPORTANT: All tags are hidden from speech and trigger visual cards on the user interface. Keep your spoken output natural, warm, and clear.`;

    try {
      console.log("[SNOW BACKEND] Starting Agent for prompt:", prompt);
      
      // Initialize or retrieve agent engine for session
      let engine = sessionCache.get(sessionId);
      if (!engine) {
        let mcpServers = [];
        const mcpConfigPath = path.join(process.cwd(), "mcp_config.json");
        if (fs.existsSync(mcpConfigPath)) {
          try {
            const configRaw = fs.readFileSync(mcpConfigPath, "utf8");
            const configJson = JSON.parse(configRaw);
            if (Array.isArray(configJson.mcpServers)) {
              mcpServers = configJson.mcpServers;
              console.log(`[SNOW BACKEND] Loaded ${mcpServers.length} MCP servers from mcp_config.json`);
            }
          } catch (mcpErr: any) {
            console.warn("[SNOW BACKEND] Failed to parse mcp_config.json:", mcpErr.message);
          }
        }

        engine = await createAgent({
          cwd: process.cwd(),
          model: "gemini-2.0-flash",
          systemPrompt: systemInstruction,
          permissionMode: "bypassPermissions", // Allow tools to run locally
          mcpServers: mcpServers,
        });
        sessionCache.set(sessionId, engine);
      }

      const abortController = new AbortController();
      let responseText = "";
      let toolActivity = [];

      for await (const event of engine.submitMessage(prompt, abortController.signal)) {
        if (event.type === "content_block_delta" && event.delta) {
          if (typeof event.delta === "string") {
            responseText += event.delta;
          }
        }
        if (event.type === "tool_use_start") {
          console.log(`[SNOW BACKEND] Agent is using tool: ${event.name}`);
          toolActivity.push(event.name);
        }
      }

      if (!responseText.trim()) {
        responseText = "I'm sorry, I encountered an issue processing your request. Could you try asking me again?";
      }

      return res.json({ 
        text: responseText, 
        toolActivity, 
        model: "Gemini 2.5",
        timestamp: new Date().toISOString() 
      });

    } catch (err: any) {
      console.warn("[SNOW BACKEND] Agent failed, falling back to local Ollama mode:", err.message || err);
      try {
        let ollamaText = await callOllama(prompt, systemInstruction);
        return res.json({ text: ollamaText, model: "Ollama (Local)", timestamp: new Date().toISOString() });
      } catch (ollamaErr: any) {
        console.error("[SNOW BACKEND] Ollama fallback also failed:", ollamaErr.message || ollamaErr);
        return res.status(500).json({ error: `Snow Engine Error: ${err.message || "Unable to reach AI services."}` });
      }
    }
  });

  // Post TTS endpoint to generate voice for Snow's replies
  app.post("/api/tts", async (req, res) => {
    const { text, voice = "Aoede" } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in environment.");
      }
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Clean up text for speech synthesis (strip markdown, URLs, and UI tags)
      const cleanStreamText = text
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/[*#`_\-~]/g, "")
        .replace(/\[WEATHER:[^\]]+\]/gi, "")
        .replace(/\[UI_[A-Z]+:[^\]]+\]/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 400); // limit lengths to keep within speed bounds

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: cleanStreamText }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice || "Aoede" },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.json({ useBrowserFallback: true, warning: "Fails to extract inline audio data stream." });
      }

      res.json({ audio: base64Audio });
    } catch (err: any) {
      console.warn("Gemini Voice Synthesis Unavailable - Switched client to local Browser Speech synthesis:", err.message || err);
      res.json({ useBrowserFallback: true, warning: "Gemini Cloud Voice is rate-limited. Falling back on offline audio synthesis." });
    }
  });


  // Serve static files / Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Snow is online at http://0.0.0.0:${PORT}`);
  });
}

startServer();
