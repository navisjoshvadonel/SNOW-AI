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

  app.post("/api/snow/chat", async (req, res) => {
    const { prompt, memories, topVectors } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt in request" });

    // System instructions for Snow
    let systemInstruction = `You are Snow, a warm, charming, and highly intelligent personal AI assistant. You are like a best friend who happens to know everything.
Your personality: friendly, enthusiastic, caring, and a little bit playful. You never sound robotic or corporate.
Keep responses natural and conversational since they will be spoken aloud. Avoid bullet points, markdown, and asterisks.
You have access to real-time Google Search. Always search for current data when asked about news, weather, prices, sports, or anything time-sensitive.

ANIMATION TAGS — you MUST include these in your responses to trigger beautiful visual cards on the screen:

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

    if (memories?.length > 0) {
      systemInstruction += `\n\nThings I know about you:\n`;
      memories.forEach((m: any) => systemInstruction += `- ${m.source} ${m.rel} ${m.target}\n`);
    }
    if (topVectors?.length > 0) {
      systemInstruction += `\n\nRecent context:\n`;
      topVectors.forEach((d: any) => systemInstruction += `\n- ${d.text}\n`);
    }

    const key = process.env.GEMINI_API_KEY;

    try {
      let responseText = "";
      let grounding = null;

      if (key && key !== "") {
        const response = await callAI(prompt, systemInstruction);
        responseText = response.text || "I didn't quite get that. Could you try again?";
        grounding = (response as any).candidates?.[0]?.groundingMetadata || null;
      } else {
        try {
          console.log("[SNOW BACKEND] Attempting local Ollama query...");
          responseText = await callOllama(prompt, systemInstruction);
          console.log("[SNOW BACKEND] Ollama query successful!");
        } catch (ollamaErr: any) {
          console.warn("[SNOW BACKEND] Ollama failed or not running, falling back to mock mode:", ollamaErr.message || ollamaErr);
          throw new Error("OLLAMA_OFFLINE");
        }
      }

      return res.json({ text: responseText, grounding, timestamp: new Date().toISOString() });

    } catch (err: any) {
      const p = prompt.toLowerCase();
      let mockText = "I'm Snow, and I'm currently running in local offline mode. ";
      
      if (err.message !== "OLLAMA_OFFLINE") {
        console.warn("[SNOW BACKEND] AI call failed, falling back to mock mode:", err.message || err);
      }

      if (p.includes("weather") || p.includes("sunny")) {
        mockText = "It's a gorgeous sunny day! The temperature is around 28 degrees. [WEATHER: SUNNY] [UI_WEATHER: {\"temp\": \"28°C\", \"condition\": \"Sunny\", \"location\": \"Your City\", \"humidity\": \"55%\", \"wind\": \"8 km/h\"}]";
      } else if (p.includes("rain")) {
        mockText = "Oh, it's quite rainy today. Don't forget your umbrella! [WEATHER: RAIN] [UI_WEATHER: {\"temp\": \"18°C\", \"condition\": \"Rainy\", \"location\": \"Your City\", \"humidity\": \"80%\", \"wind\": \"20 km/h\"}]";
      } else if (p.includes("snow")) {
        mockText = "It's snowing beautifully outside! [WEATHER: SNOW] [UI_WEATHER: {\"temp\": \"-2°C\", \"condition\": \"Snowing\", \"location\": \"Your City\", \"humidity\": \"90%\", \"wind\": \"5 km/h\"}]";
      } else if (p.includes("news")) {
        mockText = "Here's a top story for you today! [UI_NEWS: {\"headline\": \"AI assistants become smarter and more personal than ever\", \"source\": \"Tech Insider\", \"category\": \"Technology\"}]";
      } else if (p.includes("joke")) {
        mockText = "Why don't scientists trust atoms? Because they make up everything! [UI_JOKE: {\"punchline\": true}]";
      } else if (p.includes("time")) {
        mockText = "Let me check the time for you. [UI_TIME: {\"time\": \"09:45 AM\", \"timezone\": \"IST\", \"location\": \"Mumbai, India\", \"date\": \"Tuesday, June 10\"}]";
      } else {
        mockText += " Ask me about the weather, news, jokes, or the time to see my animations in action!";
      }

      return res.json({ text: mockText, grounding: null, timestamp: new Date().toISOString() });
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
