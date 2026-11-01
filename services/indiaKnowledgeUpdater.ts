import { ragIngestDocument } from "../rag.js";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DPO_PATH = path.join(DATA_DIR, "training_dpo.jsonl");

// 28 Indian States
export const states = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

// 8 Union Territories
export const unionTerritories = [
  "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh",
  "Andaman and Nicobar Islands", "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep"
];

// National History & Civilization Topics
export const historyTopics = [
  "Indus Valley Civilisation", "Maurya Empire", "Gupta Empire", 
  "Mughal Empire", "Maratha Empire", "British Raj", "Indian independence movement", 
  "History of Republic of India", "Indian Space Research Organisation",
  "Economic liberalisation in India", "Constitution of India",
  "Information technology in India", "Green Revolution in India",
  "Indian Armed Forces", "Foreign relations of India", "Culture of India",
  "Geography of India", "Demographics of India"
];

// Operator Regional & Cultural Heritage Topics (Madurai, Tamil Nadu, India)
export const regionalHeritageTopics = [
  "Madurai", "Meenakshi Temple", "Thirumalai Nayakkar Mahal", "Vaigai River",
  "Keezhadi excavation site", "Sangam literature", "Thirukkural", "Silappatikaram",
  "Chola dynasty", "Pandya dynasty", "Pallava dynasty"
];

// Set of already ingested sources in this runtime session to prevent duplicate RAG embeds
const ingestedSourcesSession = new Set<string>();

/**
 * Resilient Wikipedia summary fetcher with Wikimedia-compliant User-Agent and timeout.
 */
export async function fetchWikiIntro(title: string, timeoutMs: number = 5000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SnowAI/1.0 (NJ Workstation; Madurai, Tamil Nadu, India; github.com/navisjoshvadonel/SNOW-AI)",
        "Accept": "application/json"
      }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.extract || null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Reads existing DPO prompts to avoid duplicating records.
 */
function getExistingDpoPrompts(): Set<string> {
  const prompts = new Set<string>();
  try {
    if (fs.existsSync(DPO_PATH)) {
      const content = fs.readFileSync(DPO_PATH, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && parsed.prompt) {
            prompts.add(parsed.prompt);
          }
        } catch {}
      }
    }
  } catch {}
  return prompts;
}

/**
 * Returns diagnostic stats about India & Regional knowledge status.
 */
export function getIndiaKnowledgeStats() {
  const existingPrompts = getExistingDpoPrompts();
  return {
    totalTopics: states.length + unionTerritories.length + historyTopics.length + regionalHeritageTopics.length,
    statesCount: states.length,
    utCount: unionTerritories.length,
    historyCount: historyTopics.length,
    regionalHeritageCount: regionalHeritageTopics.length,
    dpoEntriesCount: existingPrompts.size,
    sessionIngestedCount: ingestedSourcesSession.size,
  };
}

/**
 * Ingests a topic into RAG and formats a high-IQ DPO alignment pair with deduplication.
 */
async function processTopic(
  title: string,
  category: "fact" | "history" | "guideline",
  prompt: string,
  chosenFormatter: (summary: string) => string,
  rejectedFormatter: (summary: string) => string,
  existingPrompts: Set<string>
): Promise<string | null> {
  const summary = await fetchWikiIntro(title);
  if (!summary) return null;

  const sourceKey = `wiki_${title.toLowerCase().replace(/[\s\W]+/g, '_')}`;

  // Ingest into RAG if not already ingested in this runtime session
  if (!ingestedSourcesSession.has(sourceKey)) {
    try {
      await ragIngestDocument(`Knowledge about ${title}: ${summary}`, sourceKey, category);
      ingestedSourcesSession.add(sourceKey);
    } catch (err: any) {
      console.warn(`[INDIA KNOWLEDGE] RAG ingest skipped for ${title}:`, err.message);
    }
  }

  // De-duplicate DPO entry
  if (!existingPrompts.has(prompt)) {
    const dpoEntry = {
      prompt,
      chosen: chosenFormatter(summary),
      rejected: rejectedFormatter(summary)
    };
    existingPrompts.add(prompt);
    return JSON.stringify(dpoEntry) + "\n";
  }

  return null;
}

export async function updateIndiaKnowledge() {
  console.log("[INDIA KNOWLEDGE] Starting knowledge update and deduplication pass...");
  const existingPrompts = getExistingDpoPrompts();
  let newDpoEntries = "";

  // 1. Process Indian States
  for (const state of states) {
    const prompt = `Tell me about the Indian state of ${state}, highlighting key historical and cultural aspects with a high level of intelligence.`;
    const entry = await processTopic(
      state,
      "fact",
      prompt,
      (summary) => `Certainly, NJ. ${state} is a prominent Indian state. ${summary} It possesses a rich cultural heritage and contributes significantly to the socio-economic fabric of India.`,
      (summary) => `${state} is in India. ${summary}`,
      existingPrompts
    );
    if (entry) newDpoEntries += entry;
    await new Promise(r => setTimeout(r, 600));
  }

  // 2. Process Union Territories
  for (const ut of unionTerritories) {
    const prompt = `Provide an overview of the Indian Union Territory of ${ut}, highlighting its administrative and geographical importance.`;
    const entry = await processTopic(
      ut,
      "fact",
      prompt,
      (summary) => `NJ, ${ut} is an integral Union Territory of the Republic of India. ${summary} It operates under direct union administration with distinct cultural and regional significance.`,
      (summary) => `${ut} is a union territory. ${summary}`,
      existingPrompts
    );
    if (entry) newDpoEntries += entry;
    await new Promise(r => setTimeout(r, 600));
  }

  // 3. Process Indian History & Civilization Topics
  for (const topic of historyTopics) {
    const prompt = `Provide an advanced, high-IQ analysis of the ${topic} in Indian history.`;
    const entry = await processTopic(
      topic,
      "history",
      prompt,
      (summary) => `Indeed, NJ. The ${topic} represents a crucial epoch in the subcontinent's history. ${summary} Its enduring legacy continues to influence modern Indian socio-political frameworks.`,
      (summary) => `The ${topic} was a time in India. ${summary}`,
      existingPrompts
    );
    if (entry) newDpoEntries += entry;
    await new Promise(r => setTimeout(r, 600));
  }

  // 4. Process Madurai & Tamil Nadu Regional Heritage Topics
  for (const heritage of regionalHeritageTopics) {
    const prompt = `Explain the cultural, architectural, and historical significance of ${heritage} in Tamil Nadu.`;
    const entry = await processTopic(
      heritage,
      "fact",
      prompt,
      (summary) => `NJ, ${heritage} is a cornerstone of Tamil heritage and classical Dravidian civilizational history. ${summary} It reflects extraordinary architectural and cultural depth centered in Tamil Nadu.`,
      (summary) => `${heritage} is in Tamil Nadu. ${summary}`,
      existingPrompts
    );
    if (entry) newDpoEntries += entry;
    await new Promise(r => setTimeout(r, 600));
  }

  if (newDpoEntries) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.appendFileSync(DPO_PATH, newDpoEntries);
    console.log(`[INDIA KNOWLEDGE] Successfully appended new unique DPO alignment pairs to ${DPO_PATH}.`);
  } else {
    console.log("[INDIA KNOWLEDGE] DPO dataset is already fully up-to-date (no duplicates added).");
  }

  console.log("[INDIA KNOWLEDGE] Knowledge update pass complete.");
}

export function startIndiaKnowledgeCron() {
  console.log("[SNOW] Starting India Knowledge Updater Cron (Every 12 Hours)...");

  // Run once immediately in the background
  updateIndiaKnowledge().catch(err => console.error("[INDIA KNOWLEDGE] Error:", err.message));

  // Then recurring every 12 hours
  setInterval(() => {
    updateIndiaKnowledge().catch(err => console.error("[INDIA KNOWLEDGE] Error:", err.message));
  }, 12 * 60 * 60 * 1000);
}
