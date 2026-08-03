import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createAgent } from "./files claude/index.js";
import dotenv from "dotenv";
import { exec } from "child_process";
import http from "http";
import { GoogleGenAI } from "@google/genai";

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
You have access to local tools and files. Use them when requested.

ANIMATION TAGS — you MUST include these in your responses to trigger beautiful visual cards on the screen when answering related questions:

1. WEATHER questions — include both of these:
   [WEATHER: SUNNY] or [WEATHER: RAIN] or [WEATHER: CLOUDY] or [WEATHER: SNOW] or [WEATHER: STORM]
   AND: [UI_WEATHER: {"temp": "72°F", "condition": "Sunny", "location": "Mumbai", "humidity": "65%", "wind": "12 km/h"}]

2. NEWS questions — include:
   [UI_NEWS: {"headline": "Headline text here", "source": "BBC News", "category": "Technology"}]

3. STOCK or CRYPTO price questions — include:
   [UI_STOCK: {"symbol": "AAPL", "price": "$192.30", "change": "+2.4%", "up": true}]

4. SPORTS score questions — include:
   [UI_SPORT: {"team1": "India", "score1": "287", "team2": "Australia", "score2": "210", "sport": "Cricket"}]

5. TIME or TIMEZONE questions — include:
   [UI_TIME: {"time": "09:45 AM", "timezone": "IST", "location": "Mumbai, India", "date": "Tuesday, June 10"}]

6. JOKE or FUN question — include:
   [UI_JOKE: {"punchline": true}]

7. MUSIC or SONG questions — include:
   [UI_MUSIC: {"title": "Song Name", "artist": "Artist Name", "genre": "Pop"}]

IMPORTANT: Strip all tags before the spoken text. The tags are INVISIBLE to the user — they only trigger visuals.`;

    try {
      console.log("[SNOW BACKEND] Starting Agent for prompt:", prompt);
      
      // Initialize or retrieve agent engine for session
      let engine = sessionCache.get(sessionId);
      if (!engine) {
        engine = await createAgent({
          cwd: process.cwd(),
          model: "gemini-2.5-flash",
          systemPrompt: systemInstruction,
          permissionMode: "bypassPermissions", // Allow tools to run locally
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
        responseText = "I'm sorry, I encountered an issue while thinking. Could you try asking me again?";
      }

      return res.json({ 
        text: responseText, 
        toolActivity, 
        timestamp: new Date().toISOString() 
      });

    } catch (err: any) {
      console.warn("[SNOW BACKEND] Agent failed, falling back to mock mode:", err.message || err);
      const p = prompt.toLowerCase();
      let mockText = "I'm Snow, and I'm currently running in offline mode. ";

      if (p.includes("weather") || p.includes("sunny")) {
        mockText = "It's a gorgeous sunny day! The temperature is around 28 degrees. [WEATHER: SUNNY] [UI_WEATHER: {\"temp\": \"28°C\", \"condition\": \"Sunny\", \"location\": \"Your City\", \"humidity\": \"55%\", \"wind\": \"8 km/h\"}]";
      } else if (p.includes("rain")) {
        mockText = "Oh, it's quite rainy today. Don't forget your umbrella! [WEATHER: RAIN] [UI_WEATHER: {\"temp\": \"18°C\", \"condition\": \"Rainy\", \"location\": \"Your City\", \"humidity\": \"80%\", \"wind\": \"20 km/h\"}]";
      } else if (p.includes("snow")) {
        mockText = "It's snowing beautifully outside! [WEATHER: SNOW] [UI_WEATHER: {\"temp\": \"-2°C\", \"condition\": \"Snowing\", \"location\": \"Your City\", \"humidity\": \"90%\", \"wind\": \"5 km/h\"}]";
      } else {
        mockText += " Ask me about the weather, news, jokes, or the time to see my animations in action!";
      }

      return res.json({ text: mockText, timestamp: new Date().toISOString() });
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

      // Clean up text for speech synthesis (strip markdown symbols like *, #, etc. and tags)
      const cleanStreamText = text
        .replace(/[*#`_\-]/g, "")
        .replace(/\[WEATHER:[^\]]+\]/g, "")
        .replace(/\[UI_[A-Z]+:[^\]]+\]/g, "")
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
