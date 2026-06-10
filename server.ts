import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { exec } from "child_process";
import http from "http";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Helper to control the Python World Monitor dashboard
  function controlDashboard(action: "show" | "hide" | "close"): Promise<void> {
    return new Promise((resolve) => {
      const postData = "";
      const req = http.request(
        {
          hostname: "localhost",
          port: 8085,
          path: `/dashboard/${action}`,
          method: "POST",
          headers: {
            "Content-Length": Buffer.byteLength(postData),
          },
        },
        (res) => {
          resolve();
        }
      );

      req.on("error", (e) => {
        // If connection refused (dashboard not running), start it!
        if (action === "show") {
          console.log("[SNOW BACKEND] Starting world_monitor.py process...");
          exec("python3 world_monitor.py", { env: process.env }, (err) => {
            if (err) {
              console.error("[SNOW BACKEND] Failed to execute world_monitor.py:", err);
            }
          });
        }
        resolve();
      });

      req.write(postData);
      req.end();
    });
  }

  // Helper to send telemetry data updates to the Python World Monitor dashboard
  function sendDashboardUpdate(data: any): Promise<boolean> {
    return new Promise((resolve) => {
      const postData = JSON.stringify(data);
      const req = http.request(
        {
          hostname: "localhost",
          port: 8085,
          path: "/dashboard/update",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
        },
        (res) => {
          resolve(res.statusCode === 200);
        }
      );
      req.on("error", (e) => {
        resolve(false);
      });
      req.write(postData);
      req.end();
    });
  }

  app.use(express.json());

  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!aiClient) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY environment variable is required");
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });
    }
    return aiClient;
  }

  // Helper: call the AI with automatic retry on 503
  async function callAI(contents: string, systemInstruction: string, retries = 2): Promise<any> {
    const ai = getGeminiClient();
    try {
      return await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          tools: [{ googleSearch: {} }],
        },
      });
    } catch (err: any) {
      if (retries > 0 && (err?.status === 503 || err?.status === 429)) {
        console.warn(`Retrying AI call... (${retries} retries left)`);
        await new Promise(r => setTimeout(r, 3000));
        return callAI(contents, systemInstruction, retries - 1);
      }
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

8. WORLD MONITOR or COMMAND CENTER dashboard queries (e.g. "show world monitor", "open dashboard", "hide world monitor", "close radar") — include:
   [UI_MONITOR: {"action": "show"}] or [UI_MONITOR: {"action": "hide"}] or [UI_MONITOR: {"action": "close"}]

9. WORLD MONITOR DYNAMIC DATA — For ALL queries (especially when they contain locations, stocks, company names, cities, tech concepts, or general topics), you MUST also include a custom JSON telemetry dataset for the world monitor dashboard. Append this tag at the very end of your response:
   [UI_MONITOR_DATA: {"locations": [{"name": "Location Name", "coords": [latitude, longitude]}], "logs": ["Informational step log 1", "Informational step log 2", "Informational step log 3", "Informational step log 4", "Informational step log 5"], "radar_title": "[CUSTOM SCANNED TOPIC]", "orbital_data": {"title": "CUSTOM SWEEP TITLE", "alt": "Custom Altitude Value (e.g. 35,786 KM or 500m)", "lat": "custom latitude text", "lon": "custom longitude text"}, "density_title": "[CUSTOM SPECTRUM TITLE]", "density_data": [array of 12 numbers from 10 to 95 representing density heights]}]
   Make sure coordinates are real and relevant (e.g. if the user asks about Apple, use Cupertino HQ, manufacturing hubs, retail hubs; if weather in Seattle, use weather stations/radar coordinate points in Seattle; if coding, use server/cloud locations like Frankfurt, Virginia, Singapore). Provide 5-6 informative progress logs. Include exactly 3-5 locations.

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

    async function processTelemetryAndMonitor(text: string) {
      const monitorMatch = text.match(/\[UI_MONITOR:\s*({[^}]+})\]/);
      let isShowing = false;
      let explicitCloseOrHide = false;
      if (monitorMatch) {
        try {
          const actionData = JSON.parse(monitorMatch[1]);
          if (actionData.action) {
            await controlDashboard(actionData.action);
            if (actionData.action === "show") {
              isShowing = true;
            } else if (actionData.action === "hide" || actionData.action === "close") {
              explicitCloseOrHide = true;
            }
          }
        } catch (e) {
          console.error("[SNOW BACKEND] Failed to parse or trigger UI_MONITOR action:", e);
        }
      }

      const telemetryMatch = text.match(/\[UI_MONITOR_DATA:\s*({[\s\S]*})\s*\]/);
      if (telemetryMatch) {
        try {
          const telemetryData = JSON.parse(telemetryMatch[1]);
          
          // Auto-show/open dashboard if telemetry data is present and no explicit hide/close action was given
          if (!isShowing && !explicitCloseOrHide) {
            console.log("[SNOW BACKEND] Auto-showing world monitor for telemetry...");
            await controlDashboard("show");
            isShowing = true;
          }

          if (isShowing) {
            // Wait for PyQt5 process to spin up HTTP port 8085
            setTimeout(async () => {
              await sendDashboardUpdate(telemetryData);
            }, 1800);
          } else {
            // Dashboard already running, update immediately
            await sendDashboardUpdate(telemetryData);
          }
        } catch (e) {
          console.error("[SNOW BACKEND] Failed to parse or send UI_MONITOR_DATA:", e);
        }
      }
    }

    function getMockTelemetry(p: string) {
      if (p.includes("apple")) {
        return ` [UI_STOCK: {"symbol": "AAPL", "price": "$290.55", "change": "-3.64%", "up": false}] [UI_MONITOR_DATA: {"locations": [{"name": "Cupertino HQ", "coords": [37.3318, -122.0311]}, {"name": "Shenzhen Assembly", "coords": [22.5431, 114.0579]}, {"name": "Tokyo Store", "coords": [35.6762, 139.6503]}], "logs": ["Step 1: Pinging Cupertino HQ... SUCCESS (12ms)", "Step 2: Checking Shenzhen line volume...", "Step 3: Compiling Apple Store stock level map...", "Step 4: Live volume tracking enabled"], "radar_title": "[AAPL HEATMAP]", "orbital_data": {"title": "AAPL SUP-CHAIN", "alt": "400 KM", "lat": "37.3318 N", "lon": "122.0311 W"}, "density_title": "[AAPL MARKET DENSITY]", "density_data": [30, 45, 60, 85, 95, 80, 75, 85, 90, 70, 50, 40]}]`;
      }
      if (p.includes("tokyo")) {
        return ` [UI_WEATHER: {"temp": "22°C", "condition": "Cloudy", "location": "Tokyo", "humidity": "70%", "wind": "15 km/h"}] [UI_MONITOR_DATA: {"locations": [{"name": "Tokyo Core Node", "coords": [35.6762, 139.6503]}, {"name": "Yokohama Station", "coords": [35.4437, 139.638]}, {"name": "Chiba Data Link", "coords": [35.6074, 140.1063]}], "logs": ["Pinging Tokyo nodes... SUCCESS", "Evaluating metropolitan signal strength...", "Checking seismic telemetry... STABLE", "Weather satellite connection established"], "radar_title": "[TOKYO GRID WEATHER]", "orbital_data": {"title": "HIMAWARI-9", "alt": "35,786 KM", "lat": "35.6762 N", "lon": "139.6503 E"}, "density_title": "[TOKYO WEATHER INDEX]", "density_data": [50, 55, 60, 65, 70, 75, 80, 85, 80, 70, 60, 50]}]`;
      }
      return ` [UI_MONITOR_DATA: {"locations": [{"name": "Snow OS Core (London)", "coords": [51.5074, -0.1278]}, {"name": "Node Alpha (Tokyo)", "coords": [35.6762, 139.6503]}, {"name": "Node Beta (New York)", "coords": [40.7128, -74.0060]}], "logs": ["Step 1: Parsing user prompt...", "Step 2: Performing contextual analysis...", "Step 3: Updating live dashboard map nodes...", "Step 4: System grid fully synchronized"], "radar_title": "[SNOW OS HUD MONITOR]", "orbital_data": {"title": "GEO-SYNC SAT-3", "alt": "35,786 KM", "lat": "0.0000 N", "lon": "0.0000 E"}, "density_title": "[CORE DENSITY]", "density_data": [25, 45, 60, 80, 95, 75, 85, 90, 70, 50, 40, 30]}]`;
    }

    // Offline mock mode
    if (!key || key === "") {
      const p = prompt.toLowerCase();
      let mockText = "I'm Snow, and I'm offline right now. ";
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
      } else if (p.includes("monitor") || p.includes("dashboard") || p.includes("radar")) {
        if (p.includes("hide") || p.includes("close") || p.includes("stop")) {
          mockText = "Closing the world monitor dashboard. [UI_MONITOR: {\"action\": \"close\"}]";
        } else {
          mockText = "Launching the high-tech world monitor dashboard now. [UI_MONITOR: {\"action\": \"show\"}]";
        }
      } else {
        mockText += "Ask me about the weather, news, jokes, or the time to see my animations in action!";
      }

      // Add telemetry mock data
      mockText += getMockTelemetry(p);

      // Process telemetry in the background/sync
      await processTelemetryAndMonitor(mockText);

      return res.json({ text: mockText, grounding: null, timestamp: new Date().toISOString() });
    }

    try {
      const response = await callAI(prompt, systemInstruction);
      const responseText = response.text || "I didn't quite get that. Could you try again?";
      const grounding = (response as any).candidates?.[0]?.groundingMetadata || null;

      await processTelemetryAndMonitor(responseText);

      return res.json({ text: responseText, grounding, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.warn("Gemini API call failed, falling back to local mock mode:", err.message || err);
      
      const p = prompt.toLowerCase();
      let mockText = "I'm Snow, and I'm currently running in local offline mode. ";
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
      } else if (p.includes("monitor") || p.includes("dashboard") || p.includes("radar")) {
        if (p.includes("hide") || p.includes("close") || p.includes("stop")) {
          mockText = "Closing the world monitor dashboard. [UI_MONITOR: {\"action\": \"close\"}]";
        } else {
          mockText = "Launching the high-tech world monitor dashboard now. [UI_MONITOR: {\"action\": \"show\"}]";
        }
      } else {
        mockText += "Ask me about the weather, news, jokes, or the time to see my animations in action!";
      }

      // Add telemetry mock data
      mockText += getMockTelemetry(p);

      // Process telemetry in the background/sync
      await processTelemetryAndMonitor(mockText);

      return res.json({ text: mockText, grounding: null, timestamp: new Date().toISOString() });
    }
  });

  app.post("/api/snow/dashboard/toggle", async (req, res) => {
    try {
      const { action } = req.body;
      await controlDashboard(action || "show");
      res.json({ status: "success" });
    } catch (err: any) {
      console.error("[SNOW BACKEND] Dashboard toggle error:", err);
      res.status(500).json({ error: err.message || "Failed to toggle dashboard" });
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
