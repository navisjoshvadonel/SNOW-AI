import { ragIngestDocument } from "../rag.js";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DPO_PATH = path.join(DATA_DIR, "training_dpo.jsonl");

// Basic lists for fetching
const states = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const historyTopics = [
  "Indus Valley Civilisation", "Maurya Empire", "Gupta Empire", 
  "Mughal Empire", "Maratha Empire", "British Raj", "Indian independence movement", 
  "History of Republic of India", "Indian Space Research Organisation",
  "Economic liberalisation in India", "Constitution of India",
  "Information technology in India", "Green Revolution in India",
  "Indian Armed Forces", "Foreign relations of India", "Culture of India",
  "Geography of India", "Demographics of India"
];

async function fetchWikiIntro(title: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.extract || null;
  } catch {
    return null;
  }
}

export async function updateIndiaKnowledge() {
  console.log("[INDIA KNOWLEDGE] Starting knowledge update...");
  let newDpoEntries = "";
  
  // Update states
  for (const state of states) {
    const summary = await fetchWikiIntro(state);
    if (summary) {
      await ragIngestDocument(`Knowledge about Indian State ${state}: ${summary}`, `wiki_${state.toLowerCase().replace(/ /g, '_')}`, "fact");
      
      const dpoEntry = {
        prompt: `Tell me about the Indian state of ${state}, highlighting key historical and cultural aspects with a high level of intelligence.`,
        chosen: `Certainly, NJ. ${state} is a prominent Indian state. ${summary} It possesses a rich cultural heritage and contributes significantly to the socio-economic fabric of India.`,
        rejected: `${state} is in India. ${summary}`
      };
      newDpoEntries += JSON.stringify(dpoEntry) + "\n";
    }
    // Small delay to avoid API limits
    await new Promise(r => setTimeout(r, 1000));
  }

  // Update history
  for (const topic of historyTopics) {
    const summary = await fetchWikiIntro(topic);
    if (summary) {
      await ragIngestDocument(`Indian History - ${topic}: ${summary}`, `wiki_${topic.toLowerCase().replace(/ /g, '_')}`, "history");
      
      const dpoEntry = {
        prompt: `Provide an advanced, high-IQ analysis of the ${topic} in Indian history.`,
        chosen: `Indeed, NJ. The ${topic} represents a crucial epoch in the subcontinent's history. ${summary} Its enduring legacy continues to influence modern Indian socio-political frameworks.`,
        rejected: `The ${topic} was a time in India. ${summary}`
      };
      newDpoEntries += JSON.stringify(dpoEntry) + "\n";
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.appendFileSync(DPO_PATH, newDpoEntries);
  console.log("[INDIA KNOWLEDGE] Successfully updated RAG and DPO datasets for fine-tuning.");
}

export function startIndiaKnowledgeCron() {
  console.log("[SNOW] Starting India Knowledge Updater Cron (Every 12 Hours)...");
  
  // Run once immediately in the background
  updateIndiaKnowledge().catch(err => console.error("[INDIA KNOWLEDGE] Error:", err.message));
  
  // Then every 12 hours
  setInterval(() => {
    updateIndiaKnowledge().catch(err => console.error("[INDIA KNOWLEDGE] Error:", err.message));
  }, 12 * 60 * 60 * 1000);
}
