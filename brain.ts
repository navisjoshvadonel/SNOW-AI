import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & DATA STRUCTURES
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryNode {
  id: string;
  source: string;
  rel: string;
  target: string;
  timestamp: string;
  category?: "User" | "Preference" | "Skill font" | "Course";
}

export interface ChromaVectorDocument {
  id: string;
  source: string;
  text: string;
  category: "code" | "history" | "guideline";
  embedding: [number, number, number];
  timestamp: string;
}

export interface FeedbackEntry {
  id: string;
  prompt: string;
  response: string;
  feedback: "thumbs_up" | "thumbs_down";
  timestamp: string;
  notes?: string;
}

export interface BrainState {
  level: number;
  xp: number;
  totalChats: number;
  positiveFeedback: number;
  negativeFeedback: number;
  lastTrained: string;
  learnedDirectives: string[];
}

export interface ResolvedIntent {
  isWeather: boolean;
  weatherLocation?: string;
  isSystem: boolean;
  isStock: boolean;
  stockQuery?: string;
  isNews: boolean;
  isSports: boolean;
  isTime: boolean;
  isJoke: boolean;
  isMusic: boolean;
  isWeb: boolean;
  webQuery?: string;
  extractedFacts?: { source: string; rel: string; target: string }[];
  isTrainRequest?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATHS & STORAGE
// ─────────────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_FILE = path.join(DATA_DIR, "memories.json");
const CHROMA_FILE = path.join(DATA_DIR, "chroma_vectors.json");
const BRAIN_STATE_FILE = path.join(DATA_DIR, "brain_state.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT SEED DATA
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MEMORIES: MemoryNode[] = [
  { id: "mem-1", source: "User", rel: "Prefers", target: "Concise & Natural Speech", timestamp: new Date().toISOString() },
  { id: "mem-2", source: "User", rel: "Builds", target: "Snow OS Assistant", timestamp: new Date().toISOString() },
  { id: "mem-3", source: "User", rel: "Uses", target: "Linux Environment", timestamp: new Date().toISOString() },
  { id: "mem-4", source: "Snow", rel: "Learns", target: "Continuous Autonomous Training", timestamp: new Date().toISOString() }
];

const DEFAULT_VECTORS: ChromaVectorDocument[] = [
  { id: "vec-1", source: "system_init.js", text: "Snow OS runtime initialized with continuous dynamic learning and dynamic LLM intent resolution.", category: "guideline", embedding: [2.5, 4.1, -1.2], timestamp: new Date().toISOString() },
  { id: "vec-2", source: "user_preferences.txt", text: "User prefers natural conversational tone without brackets or hardcoded tags in spoken output.", category: "guideline", embedding: [-3.1, 1.8, 5.0], timestamp: new Date().toISOString() }
];

const DEFAULT_BRAIN_STATE: BrainState = {
  level: 5,
  xp: 450,
  totalChats: 12,
  positiveFeedback: 8,
  negativeFeedback: 1,
  lastTrained: new Date().toISOString(),
  learnedDirectives: [
    "Prioritize friendly, highly concise conversational responses.",
    "Automatically reference system telemetry when technical queries arise.",
    "Store user preferences and facts dynamically into long-term memory."
  ]
};

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY STORE MANAGERS
// ─────────────────────────────────────────────────────────────────────────────

export function loadMemories(): MemoryNode[] {
  ensureDataDir();
  if (!fs.existsSync(MEMORY_FILE)) {
    saveMemories(DEFAULT_MEMORIES);
    return DEFAULT_MEMORIES;
  }
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
  } catch {
    return DEFAULT_MEMORIES;
  }
}

export function saveMemories(mems: MemoryNode[]) {
  ensureDataDir();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(mems, null, 2));
}

export function addMemory(source: string, rel: string, target: string): MemoryNode {
  const mems = loadMemories();
  const newMem: MemoryNode = {
    id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    source: source.trim(),
    rel: rel.trim(),
    target: target.trim(),
    timestamp: new Date().toISOString()
  };
  mems.push(newMem);
  saveMemories(mems);

  // Sync to Chroma Vectors
  addVectorDocument(`mem_${newMem.id}`, `${source} ${rel} ${target}`, "history");
  return newMem;
}

export function deleteMemory(id: string): boolean {
  const mems = loadMemories();
  const filtered = mems.filter(m => m.id !== id);
  if (filtered.length !== mems.length) {
    saveMemories(filtered);
    return true;
  }
  return false;
}

export function clearMemories() {
  saveMemories([]);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHROMA VECTOR STORE MANAGERS
// ─────────────────────────────────────────────────────────────────────────────

export function loadVectorDocuments(): ChromaVectorDocument[] {
  ensureDataDir();
  if (!fs.existsSync(CHROMA_FILE)) {
    saveVectorDocuments(DEFAULT_VECTORS);
    return DEFAULT_VECTORS;
  }
  try {
    return JSON.parse(fs.readFileSync(CHROMA_FILE, "utf-8"));
  } catch {
    return DEFAULT_VECTORS;
  }
}

export function saveVectorDocuments(docs: ChromaVectorDocument[]) {
  ensureDataDir();
  fs.writeFileSync(CHROMA_FILE, JSON.stringify(docs, null, 2));
}

export function addVectorDocument(source: string, text: string, category: "code" | "history" | "guideline"): ChromaVectorDocument {
  const docs = loadVectorDocuments();
  // Generate pseudo 3D embedding coordinates based on text char hashing
  let h1 = 0, h2 = 0, h3 = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = (h1 * 31 + code) % 20 - 10;
    h2 = (h2 * 17 + code) % 20 - 10;
    h3 = (h3 * 13 + code) % 20 - 10;
  }
  const newDoc: ChromaVectorDocument = {
    id: `vec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    source,
    text,
    category,
    embedding: [Number(h1.toFixed(1)), Number(h2.toFixed(1)), Number(h3.toFixed(1))],
    timestamp: new Date().toISOString()
  };
  docs.push(newDoc);
  saveVectorDocuments(docs);
  return newDoc;
}

export function deleteVectorDocument(id: string) {
  const docs = loadVectorDocuments();
  saveVectorDocuments(docs.filter(d => d.id !== id));
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAIN STATE & FEEDBACK MANAGERS
// ─────────────────────────────────────────────────────────────────────────────

export function loadBrainState(): BrainState {
  ensureDataDir();
  if (!fs.existsSync(BRAIN_STATE_FILE)) {
    saveBrainState(DEFAULT_BRAIN_STATE);
    return DEFAULT_BRAIN_STATE;
  }
  try {
    return JSON.parse(fs.readFileSync(BRAIN_STATE_FILE, "utf-8"));
  } catch {
    return DEFAULT_BRAIN_STATE;
  }
}

export function saveBrainState(state: BrainState) {
  ensureDataDir();
  fs.writeFileSync(BRAIN_STATE_FILE, JSON.stringify(state, null, 2));
}

export function loadFeedback(): FeedbackEntry[] {
  ensureDataDir();
  if (!fs.existsSync(FEEDBACK_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export function recordFeedback(prompt: string, response: string, feedback: "thumbs_up" | "thumbs_down", notes?: string) {
  ensureDataDir();
  const entries = loadFeedback();
  entries.push({
    id: `fb-${Date.now()}`,
    prompt,
    response,
    feedback,
    timestamp: new Date().toISOString(),
    notes
  });
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(entries, null, 2));

  // Update Brain State XP & Level
  const state = loadBrainState();
  if (feedback === "thumbs_up") {
    state.positiveFeedback += 1;
    state.xp += 50;
  } else {
    state.negativeFeedback += 1;
    state.xp += 10;
  }
  state.totalChats += 1;

  // Level up calculation (every 200 XP = +1 Level)
  const newLevel = Math.floor(state.xp / 200) + 1;
  if (newLevel > state.level) {
    state.level = newLevel;
    state.learnedDirectives.push(`Level ${newLevel} Neural Calibration unlocked: Refined adaptive response quality.`);
  }

  saveBrainState(state);
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC NEURAL INTENT RESOLVER (NO BRITTLE HARDCODED REGEXES!)
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveIntent(prompt: string): Promise<ResolvedIntent> {
  const pLower = prompt.toLowerCase();

  // Try LLM Intent Resolution first for intelligent intent parsing
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `You are a dynamic neural intent parser for Snow OS. Analyze the user input and extract intents and slots in JSON format.
Return ONLY valid JSON matching this schema:
{
  "isWeather": boolean,
  "weatherLocation": string | null,
  "isSystem": boolean,
  "isStock": boolean,
  "stockQuery": string | null,
  "isNews": boolean,
  "isSports": boolean,
  "isTime": boolean,
  "isJoke": boolean,
  "isMusic": boolean,
  "isWeb": boolean,
  "webQuery": string | null,
  "extractedFacts": Array<{"source": string, "rel": string, "target": string}>,
  "isTrainRequest": boolean
}`;

      const res = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json"
        }
      });

      const text = res.text?.trim();
      if (text) {
        const parsed = JSON.parse(text);
        
        // Auto-save extracted facts to dynamic memory graph
        if (Array.isArray(parsed.extractedFacts) && parsed.extractedFacts.length > 0) {
          parsed.extractedFacts.forEach((fact: any) => {
            if (fact.source && fact.rel && fact.target) {
              addMemory(fact.source, fact.rel, fact.target);
            }
          });
        }

        return {
          isWeather: !!parsed.isWeather,
          weatherLocation: parsed.weatherLocation || undefined,
          isSystem: !!parsed.isSystem,
          isStock: !!parsed.isStock,
          stockQuery: parsed.stockQuery || undefined,
          isNews: !!parsed.isNews,
          isSports: !!parsed.isSports,
          isTime: !!parsed.isTime,
          isJoke: !!parsed.isJoke,
          isMusic: !!parsed.isMusic,
          isWeb: !!parsed.isWeb,
          webQuery: parsed.webQuery || undefined,
          extractedFacts: parsed.extractedFacts,
          isTrainRequest: !!parsed.isTrainRequest || /train|learn|study|update brain/i.test(pLower)
        };
      }
    } catch (e: any) {
      console.warn("[SNOW BRAIN] LLM intent resolution fallback to dynamic semantic parser:", e.message);
    }
  }

  // Dynamic Semantic Fallback (Broad matching, flexible)
  const isWeather = /\b(weather|temperature|temp|forecast|rain|snow|cloud|sunny|climate|cold|hot|humidity|wind)\b/i.test(prompt);
  const wxMatch = prompt.match(/(?:weather|temperature|temp|forecast|climate)\s+(?:in|at|for|of)?\s+([a-zA-Z\s,]+)/i);

  const isSystem = /\b(cpu|ram|memory|temp|hardware|status|pc|system|specs|battery|performance|load|process)\b/i.test(prompt);
  const isStock = /\b(stock|share|crypto|bitcoin|btc|eth|market|ticker|price|nasdaq|s&p|apple|nvda|tesla|googl)\b/i.test(prompt);
  const isNews = /\b(news|headline|breaking|latest|happened|world|event|article)\b/i.test(prompt);
  const isSports = /\b(sports|score|game|match|cricket|football|soccer|nba|league|vs)\b/i.test(prompt);
  const isTime = /\b(time|date|day|clock|timezone|today)\b/i.test(prompt);
  const isJoke = /\b(joke|funny|laugh|pun|humor)\b/i.test(prompt);
  const isMusic = /\b(music|song|artist|playlist|album|track|play)\b/i.test(prompt);
  const isWeb = /\b(who|what|where|why|how|search|find|explain|define|tell me about|history|info)\b/i.test(prompt);
  const isTrainRequest = /\b(train|learn|study|smart|harder|update brain|brain level)\b/i.test(prompt);

  // Auto-memory detection in conversation
  const factMatch = prompt.match(/(?:my name is|i like|i love|i prefer|i use|remember that)\s+([a-zA-Z0-9\s]+)/i);
  if (factMatch) {
    addMemory("User", "Prefers", factMatch[1].trim());
  }

  return {
    isWeather,
    weatherLocation: wxMatch?.[1]?.trim(),
    isSystem,
    isStock,
    isNews,
    isSports,
    isTime,
    isJoke,
    isMusic,
    isWeb: isWeb || (!isWeather && !isSystem && !isStock && !isTime && !isJoke),
    isTrainRequest
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTINUOUS AUTONOMOUS BRAIN TRAINING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export async function trainBrain(customInstructions?: string): Promise<{
  brainState: BrainState;
  report: string;
  newMemoriesCount: number;
}> {
  const state = loadBrainState();
  const memories = loadMemories();
  const feedback = loadFeedback();

  state.level += 1;
  state.xp += 150;
  state.lastTrained = new Date().toISOString();

  // Synthesize positive & negative feedback to build adaptive directives
  const negativeExamples = feedback.filter(f => f.feedback === "thumbs_down").map(f => `Prompt: "${f.prompt}" -> Response got downvoted.`);
  const positiveExamples = feedback.filter(f => f.feedback === "thumbs_up").map(f => `Prompt: "${f.prompt}" -> Preferred style.`);

  let trainingSummary = `Brain Training Iteration Level ${state.level} Complete.
- Memory Nodes Indexed: ${memories.length}
- Positive Reinforcement Signals: ${positiveExamples.length}
- Negative Feedback Corrections: ${negativeExamples.length}
- Intelligence Node XP: ${state.xp} (Level ${state.level})`;

  if (customInstructions) {
    state.learnedDirectives.push(`User Direct Instruction: ${customInstructions}`);
  }

  if (negativeExamples.length > 0) {
    state.learnedDirectives.push(`Feedback Correction: Refine clarity and avoid patterns present in downvoted answers.`);
  }

  // Deduplicate directives
  state.learnedDirectives = Array.from(new Set(state.learnedDirectives));
  saveBrainState(state);

  // Record a training vector entry
  addVectorDocument("brain_training_session.log", trainingSummary, "guideline");

  return {
    brainState: state,
    report: trainingSummary,
    newMemoriesCount: memories.length
  };
}
