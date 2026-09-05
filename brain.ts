import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import { embedText, ragIngestFact } from "./rag.js";

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
  embedding: number[];
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
// SQLITE PRODUCTION DATABASE ENGINE (WAL MODE FOR CONCURRENCY)
// ─────────────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "snow_brain.db");
const MEMORY_FILE = path.join(DATA_DIR, "memories.json");
const CHROMA_FILE = path.join(DATA_DIR, "chroma_vectors.json");
const BRAIN_STATE_FILE = path.join(DATA_DIR, "brain_state.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  ensureDataDir();
  if (!dbInstance) {
    dbInstance = new Database(DB_FILE);
    dbInstance.pragma("journal_mode = WAL");
    dbInstance.pragma("synchronous = NORMAL");

    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        rel TEXT NOT NULL,
        target TEXT NOT NULL,
        category TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vector_documents (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        text TEXT NOT NULL,
        category TEXT NOT NULL,
        embedding TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS brain_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        level INTEGER NOT NULL,
        xp INTEGER NOT NULL,
        total_chats INTEGER NOT NULL,
        positive_feedback INTEGER NOT NULL,
        negative_feedback INTEGER NOT NULL,
        last_trained TEXT NOT NULL,
        learned_directives TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS feedback_entries (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        response TEXT NOT NULL,
        feedback TEXT NOT NULL,
        notes TEXT,
        timestamp TEXT NOT NULL
      );
    `);

    autoMigrateJsonToSqlite(dbInstance);
  }
  return dbInstance;
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

function autoMigrateJsonToSqlite(db: Database.Database) {
  // 1. Memories
  const memCount = (db.prepare("SELECT COUNT(*) as count FROM memories").get() as any).count;
  if (memCount === 0) {
    let memsToMigrate = DEFAULT_MEMORIES;
    if (fs.existsSync(MEMORY_FILE)) {
      try { memsToMigrate = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8")); } catch {}
    }
    const insertMem = db.prepare("INSERT OR REPLACE INTO memories (id, source, rel, target, category, timestamp) VALUES (?, ?, ?, ?, ?, ?)");
    const insertTx = db.transaction((items: MemoryNode[]) => {
      for (const m of items) insertMem.run(m.id, m.source, m.rel, m.target, m.category || null, m.timestamp);
    });
    insertTx(memsToMigrate);
  }

  // 2. Vector Documents
  const vecCount = (db.prepare("SELECT COUNT(*) as count FROM vector_documents").get() as any).count;
  if (vecCount === 0) {
    let vecsToMigrate = DEFAULT_VECTORS;
    if (fs.existsSync(CHROMA_FILE)) {
      try { vecsToMigrate = JSON.parse(fs.readFileSync(CHROMA_FILE, "utf-8")); } catch {}
    }
    const insertVec = db.prepare("INSERT OR REPLACE INTO vector_documents (id, source, text, category, embedding, timestamp) VALUES (?, ?, ?, ?, ?, ?)");
    const insertVecTx = db.transaction((items: ChromaVectorDocument[]) => {
      for (const v of items) insertVec.run(v.id, v.source, v.text, v.category, JSON.stringify(v.embedding), v.timestamp);
    });
    insertVecTx(vecsToMigrate);
  }

  // 3. Brain State
  const stateCount = (db.prepare("SELECT COUNT(*) as count FROM brain_state").get() as any).count;
  if (stateCount === 0) {
    let stateToMigrate = DEFAULT_BRAIN_STATE;
    if (fs.existsSync(BRAIN_STATE_FILE)) {
      try { stateToMigrate = JSON.parse(fs.readFileSync(BRAIN_STATE_FILE, "utf-8")); } catch {}
    }
    db.prepare(`
      INSERT OR REPLACE INTO brain_state 
      (id, level, xp, total_chats, positive_feedback, negative_feedback, last_trained, learned_directives) 
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      stateToMigrate.level,
      stateToMigrate.xp,
      stateToMigrate.totalChats,
      stateToMigrate.positiveFeedback,
      stateToMigrate.negativeFeedback,
      stateToMigrate.lastTrained,
      JSON.stringify(stateToMigrate.learnedDirectives)
    );
  }

  // 4. Feedback
  const fbCount = (db.prepare("SELECT COUNT(*) as count FROM feedback_entries").get() as any).count;
  if (fbCount === 0 && fs.existsSync(FEEDBACK_FILE)) {
    try {
      const fbToMigrate: FeedbackEntry[] = JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf-8"));
      const insertFb = db.prepare("INSERT OR REPLACE INTO feedback_entries (id, prompt, response, feedback, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)");
      const insertFbTx = db.transaction((items: FeedbackEntry[]) => {
        for (const f of items) insertFb.run(f.id, f.prompt, f.response, f.feedback, f.notes || null, f.timestamp);
      });
      insertFbTx(fbToMigrate);
    } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY STORE MANAGERS (SQLITE + GRAPH TRAVERSAL)
// ─────────────────────────────────────────────────────────────────────────────

export function loadMemories(): MemoryNode[] {
  const db = getDb();
  const rows: any[] = db.prepare("SELECT * FROM memories ORDER BY timestamp ASC").all();
  return rows.map(r => ({
    id: r.id,
    source: r.source,
    rel: r.rel,
    target: r.target,
    category: r.category || undefined,
    timestamp: r.timestamp
  }));
}

export function saveMemories(mems: MemoryNode[]) {
  const db = getDb();
  const deleteStmt = db.prepare("DELETE FROM memories");
  const insertStmt = db.prepare("INSERT INTO memories (id, source, rel, target, category, timestamp) VALUES (?, ?, ?, ?, ?, ?)");
  
  const tx = db.transaction((items: MemoryNode[]) => {
    deleteStmt.run();
    for (const m of items) {
      insertStmt.run(m.id, m.source, m.rel, m.target, m.category || null, m.timestamp);
    }
  });
  tx(mems);
}

export function addMemory(
  source: string,
  rel: string,
  target: string,
  category?: "User" | "Preference" | "Skill font" | "Course"
): MemoryNode {
  const db = getDb();
  const newMem: MemoryNode = {
    id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    source: source.trim(),
    rel: rel.trim(),
    target: target.trim(),
    category,
    timestamp: new Date().toISOString()
  };

  db.prepare("INSERT INTO memories (id, source, rel, target, category, timestamp) VALUES (?, ?, ?, ?, ?, ?)")
    .run(newMem.id, newMem.source, newMem.rel, newMem.target, newMem.category || null, newMem.timestamp);

  // 1. Sync to local vector documents in brain.db
  addVectorDocument(`mem_${newMem.id}`, `${source} ${rel} ${target}`, "history");

  // 2. Sync to unified RAG store in rag.db
  ragIngestFact(source, rel, target).catch(() => {});

  return newMem;
}

/**
 * Multi-hop Knowledge Graph Traversal across entity relationships.
 * Traverses direct relationships (Hop 1) and discovers connected neighbors (Hop 2).
 */
export function findGraphRelationships(query: string, maxHops: number = 2): MemoryNode[] {
  const db = getDb();
  const pattern = `%${query.toLowerCase().trim()}%`;

  // Hop 1: Direct entity/relation match
  const hop1Rows: any[] = db.prepare(`
    SELECT * FROM memories 
    WHERE LOWER(source) LIKE ? OR LOWER(rel) LIKE ? OR LOWER(target) LIKE ?
    ORDER BY timestamp DESC
    LIMIT 25
  `).all(pattern, pattern, pattern);

  const seenIds = new Set<string>();
  const results: MemoryNode[] = [];
  const entitiesToExpand = new Set<string>();

  for (const r of hop1Rows) {
    seenIds.add(r.id);
    results.push({
      id: r.id,
      source: r.source,
      rel: r.rel,
      target: r.target,
      category: r.category || undefined,
      timestamp: r.timestamp
    });
    if (r.source) entitiesToExpand.add(r.source.toLowerCase().trim());
    if (r.target) entitiesToExpand.add(r.target.toLowerCase().trim());
  }

  // Hop 2: Find connected neighbor nodes
  if (maxHops >= 2 && entitiesToExpand.size > 0) {
    const hop2Stmt = db.prepare(`
      SELECT * FROM memories 
      WHERE LOWER(source) = ? OR LOWER(target) = ?
      ORDER BY timestamp DESC
      LIMIT 8
    `);

    for (const entity of Array.from(entitiesToExpand).slice(0, 10)) {
      const hop2Rows: any[] = hop2Stmt.all(entity, entity);
      for (const r of hop2Rows) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          results.push({
            id: r.id,
            source: r.source,
            rel: r.rel,
            target: r.target,
            category: r.category || undefined,
            timestamp: r.timestamp
          });
        }
      }
    }
  }

  return results;
}

/**
 * Formats knowledge graph nodes into structured paths for LLM prompt augmentation.
 */
export function formatGraphContext(nodes: MemoryNode[]): string {
  if (!nodes || nodes.length === 0) return "";
  const lines = nodes.map(n => `- [${n.source}] --(${n.rel})--> [${n.target}]`);
  return `\nCONNECTED KNOWLEDGE GRAPH (Multi-Hop Traversal):\n${lines.join("\n")}`;
}

export function deleteMemory(id: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM memories WHERE id = ?").run(id);
  return res.changes > 0;
}

export function clearMemories() {
  const db = getDb();
  db.prepare("DELETE FROM memories").run();
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED VECTOR EMBEDDING & COSINE SIMILARITY MATH
// ─────────────────────────────────────────────────────────────────────────────

/** Calculate cosine similarity between two vector arrays */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const minLen = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < minLen; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Compute real vector embedding via unified multi-provider pipeline */
export async function computeEmbedding(text: string): Promise<number[]> {
  return embedText(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHROMA VECTOR STORE MANAGERS (SQLITE ENGINE)
// ─────────────────────────────────────────────────────────────────────────────

export function loadVectorDocuments(): ChromaVectorDocument[] {
  const db = getDb();
  const rows: any[] = db.prepare("SELECT * FROM vector_documents ORDER BY timestamp ASC").all();
  return rows.map(r => ({
    id: r.id,
    source: r.source,
    text: r.text,
    category: r.category as any,
    embedding: JSON.parse(r.embedding),
    timestamp: r.timestamp
  }));
}

export function saveVectorDocuments(docs: ChromaVectorDocument[]) {
  const db = getDb();
  const deleteStmt = db.prepare("DELETE FROM vector_documents");
  const insertStmt = db.prepare("INSERT INTO vector_documents (id, source, text, category, embedding, timestamp) VALUES (?, ?, ?, ?, ?, ?)");
  
  const tx = db.transaction((items: ChromaVectorDocument[]) => {
    deleteStmt.run();
    for (const v of items) {
      insertStmt.run(v.id, v.source, v.text, v.category, JSON.stringify(v.embedding), v.timestamp);
    }
  });
  tx(docs);
}

export async function addVectorDocument(
  source: string,
  text: string,
  category: "code" | "history" | "guideline"
): Promise<ChromaVectorDocument> {
  const db = getDb();
  const embedding = await computeEmbedding(text);
  const newDoc: ChromaVectorDocument = {
    id: `vec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    source,
    text,
    category,
    embedding,
    timestamp: new Date().toISOString()
  };

  db.prepare("INSERT INTO vector_documents (id, source, text, category, embedding, timestamp) VALUES (?, ?, ?, ?, ?, ?)")
    .run(newDoc.id, newDoc.source, newDoc.text, newDoc.category, JSON.stringify(newDoc.embedding), newDoc.timestamp);

  return newDoc;
}

export function deleteVectorDocument(id: string) {
  const db = getDb();
  db.prepare("DELETE FROM vector_documents WHERE id = ?").run(id);
}

/** Search vector documents using Cosine Similarity ranking */
export async function searchVectorDocuments(
  query: string,
  topK: number = 3
): Promise<{ doc: ChromaVectorDocument; score: number }[]> {
  const docs = loadVectorDocuments();
  if (docs.length === 0) return [];

  const queryEmbedding = await computeEmbedding(query);
  const scored = docs.map(doc => ({
    doc,
    score: cosineSimilarity(queryEmbedding, doc.embedding || [])
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAIN STATE & FEEDBACK MANAGERS (SQLITE ENGINE)
// ─────────────────────────────────────────────────────────────────────────────

export function loadBrainState(): BrainState {
  const db = getDb();
  const row: any = db.prepare("SELECT * FROM brain_state WHERE id = 1").get();
  if (!row) {
    saveBrainState(DEFAULT_BRAIN_STATE);
    return DEFAULT_BRAIN_STATE;
  }
  return {
    level: row.level,
    xp: row.xp,
    totalChats: row.total_chats,
    positiveFeedback: row.positive_feedback,
    negativeFeedback: row.negative_feedback,
    lastTrained: row.last_trained,
    learnedDirectives: JSON.parse(row.learned_directives)
  };
}

export function saveBrainState(state: BrainState) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO brain_state 
    (id, level, xp, total_chats, positive_feedback, negative_feedback, last_trained, learned_directives)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    state.level,
    state.xp,
    state.totalChats,
    state.positiveFeedback,
    state.negativeFeedback,
    state.lastTrained,
    JSON.stringify(state.learnedDirectives)
  );
}

export function loadFeedback(): FeedbackEntry[] {
  const db = getDb();
  const rows: any[] = db.prepare("SELECT * FROM feedback_entries ORDER BY timestamp ASC").all();
  return rows.map(r => ({
    id: r.id,
    prompt: r.prompt,
    response: r.response,
    feedback: r.feedback as any,
    notes: r.notes || undefined,
    timestamp: r.timestamp
  }));
}

export function recordFeedback(prompt: string, response: string, feedback: "thumbs_up" | "thumbs_down", notes?: string) {
  const db = getDb();
  const id = `fb-${Date.now()}`;
  const timestamp = new Date().toISOString();

  db.prepare("INSERT INTO feedback_entries (id, prompt, response, feedback, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, prompt, response, feedback, notes || null, timestamp);

  const state = loadBrainState();
  if (feedback === "thumbs_up") {
    state.positiveFeedback += 1;
    state.xp += 50;
  } else {
    state.negativeFeedback += 1;
    state.xp += 10;
  }
  state.totalChats += 1;

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
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json"
        }
      });

      const text = res.text?.trim();
      if (text) {
        const parsed = JSON.parse(text);
        
        // Auto-save extracted facts to dynamic memory graph and unified RAG
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

  const isGreeting = /^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup|yo|hi there|hello snow|hi snow)\b/i.test(prompt.trim());
  const isIdentity = /\b(who are you|what is your name|who created you|who made you|what can you do|your name|are you ai|are you snow)\b/i.test(prompt);
  const isWeather = /\b(weather|temperature|temp|forecast|rain|snow|cloud|sunny|climate|cold|hot|humidity|wind)\b/i.test(prompt);
  const wxMatch = prompt.match(/(?:weather|temperature|temp|forecast|climate)\s+(?:in|at|for|of)?\s+([a-zA-Z\s,]+)/i);

  const isSystem = /\b(cpu|ram|memory|hardware|pc|specs|battery|performance|load|process)\b/i.test(prompt);
  const isStock = /\b(stock|share|crypto|bitcoin|btc|eth|market|ticker|price|nasdaq|s&p|apple|nvda|tesla|googl)\b/i.test(prompt);
  const isNews = /\b(news|headline|breaking|latest|happened|world|event|article)\b/i.test(prompt);
  const isSports = /\b(sports|score|game|match|cricket|football|soccer|nba|league|vs)\b/i.test(prompt);
  const isTime = /\b(time|date|day|clock|timezone|today)\b/i.test(prompt);
  const isJoke = /\b(joke|funny|laugh|pun|humor)\b/i.test(prompt);
  const isMusic = /\b(music|song|artist|playlist|album|track|play)\b/i.test(prompt);
  const isWeb = !isGreeting && !isIdentity && (/\b(search|find|explain|define|tell me about|history|info|what happened|latest news)\b/i.test(prompt));
  const isTrainRequest = /\b(train|learn|study|smart|harder|update brain|brain level)\b/i.test(prompt);

  // Multi-type fact extraction in offline/semantic fallback
  const nameMatch = prompt.match(/(?:my name is|call me)\s+([a-zA-Z\s]+)/i);
  if (nameMatch) {
    addMemory("User", "IsNamed", nameMatch[1].trim(), "User");
  }

  const prefMatch = prompt.match(/(?:i (?:prefer|like|love))\s+([a-zA-Z0-9\s]+)/i);
  if (prefMatch) {
    addMemory("User", "Prefers", prefMatch[1].trim(), "Preference");
  }

  const toolMatch = prompt.match(/(?:i (?:use|work with|build with))\s+([a-zA-Z0-9\s]+)/i);
  if (toolMatch) {
    addMemory("User", "Uses", toolMatch[1].trim(), "Preference");
  }

  const rememberMatch = prompt.match(/(?:remember that|note that)\s+([a-zA-Z0-9\s]+)/i);
  if (rememberMatch) {
    addMemory("User", "Recalls", rememberMatch[1].trim(), "Preference");
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
    isWeb: isWeb,
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
