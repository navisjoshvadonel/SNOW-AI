import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import { embedText, ragIngestFact, ragAugmentPrompt } from "./rag.js";

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

export interface VisualEpisode {
  id: string;
  source: string;
  scene: string;
  objects: string;
  activity?: string;
  thumbnail?: string;
  timestamp: string;
}

export interface DecisionRecord {
  id: string;
  decision: string;
  rationale: string;
  constraints?: string;
  gitCommit?: string;
  contextQuery?: string;
  timestamp: string;
}

export interface ProceduralRule {
  id: string;
  triggerContext: string;
  rule: string;
  rationale?: string;
  sourceFailure?: string;
  confidence: number;
  appliedCount: number;
  timestamp: string;
}

export interface SynthesizedSkill {
  id: string;
  name: string;
  description: string;
  language: "python" | "node" | "bash";
  code: string;
  inputSchema: string; // JSON string
  testCases: string;   // JSON string
  isVerified: boolean;
  successCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export type GoalStatus = "pending" | "planning" | "active" | "paused" | "completed" | "failed";
export type SubtaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface AutonomousGoal {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: number;
  progressPct: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  subtasks?: GoalSubtask[];
}

export interface GoalSubtask {
  id: string;
  goalId: string;
  stepOrder: number;
  title: string;
  assignedTool: string;
  inputPayload: string; // JSON
  status: SubtaskStatus;
  resultSummary?: string;
  retryCount: number;
  executedAt?: string;
}

export interface GoalLog {
  id: string;
  goalId: string;
  subtaskId?: string;
  message: string;
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

      CREATE TABLE IF NOT EXISTS visual_episodes (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        scene TEXT NOT NULL,
        objects TEXT NOT NULL,
        activity TEXT,
        thumbnail TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS decision_records (
        id TEXT PRIMARY KEY,
        decision TEXT NOT NULL,
        rationale TEXT NOT NULL,
        constraints TEXT,
        git_commit TEXT,
        context_query TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS procedural_rules (
        id TEXT PRIMARY KEY,
        trigger_context TEXT NOT NULL,
        rule TEXT NOT NULL,
        rationale TEXT,
        source_failure TEXT,
        confidence REAL DEFAULT 1.0,
        applied_count INTEGER DEFAULT 0,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS synthesized_skills (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        language TEXT NOT NULL,
        code TEXT NOT NULL,
        input_schema TEXT NOT NULL,
        test_cases TEXT NOT NULL,
        is_verified INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS autonomous_goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER DEFAULT 3,
        progress_pct INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS goal_subtasks (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        title TEXT NOT NULL,
        assigned_tool TEXT NOT NULL,
        input_payload TEXT NOT NULL,
        status TEXT NOT NULL,
        result_summary TEXT,
        retry_count INTEGER DEFAULT 0,
        executed_at TEXT,
        FOREIGN KEY (goal_id) REFERENCES autonomous_goals(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS goal_logs (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        subtask_id TEXT,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
    `);

    try {
      dbInstance.exec(`ALTER TABLE visual_episodes ADD COLUMN thumbnail TEXT;`);
    } catch { /* column already exists */ }

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

export function loadMemories(limit?: number): MemoryNode[] {
  const db = getDb();
  // Fix 8: push LIMIT into SQL — avoids loading the entire table when only a slice is needed
  const rows: any[] = limit
    ? db.prepare("SELECT * FROM memories ORDER BY timestamp ASC LIMIT ?").all(limit)
    : db.prepare("SELECT * FROM memories ORDER BY timestamp ASC").all();
  return rows.map(r => ({
    id: r.id,
    source: r.source,
    rel: r.rel,
    target: r.target,
    category: r.category || undefined,
    timestamp: r.timestamp
  }));
}

/**
 * Replaces the entire memories table with the provided array.
 * BULK OPERATION ONLY — do NOT call this from addMemory().
 * For single additions use addMemory() which does a direct INSERT.
 */
export function bulkReplaceMemories(mems: MemoryNode[]) {
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

/** @deprecated Use bulkReplaceMemories for bulk ops. For single entries use addMemory(). */
export const saveMemories = bulkReplaceMemories;

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

let _brainGenAI: GoogleGenAI | null = null;
function getBrainGenAI(apiKey: string): GoogleGenAI {
  if (!_brainGenAI) {
    _brainGenAI = new GoogleGenAI({ apiKey });
  }
  return _brainGenAI;
}

export async function resolveIntent(prompt: string): Promise<ResolvedIntent> {
  const pLower = prompt.toLowerCase().trim();

  // Fast-track common high-confidence intents to skip 500-1000ms LLM classification roundtrip
  const isHighConfidenceTime = /^(?:what(?:\s+is|\x27s)?\s+(?:the\s+)?(?:time|date)|current\s+(?:time|date)|what\s+time\s+is\s+it|what\s+day\s+is\s+(?:it|today)|today\x27s\s+date|tell\s+me\s+the\s+time)[.!?\s]*$/i.test(pLower);
  if (isHighConfidenceTime) {
    return {
      isTime: true, isWeather: false, isSystem: false, isStock: false,
      isNews: false, isSports: false, isJoke: false, isMusic: false,
      isWeb: false, isTrainRequest: false
    };
  }

  const isHighConfidenceSystem = /^(?:(?:system|hardware|pc|cpu|ram|memory|battery|disk|specs|performance)\s*(?:status|stats|info|health|load|usage)?|how(?:\s+is|\x27s)\s+the\s+system)[.!?\s]*$/i.test(pLower);
  if (isHighConfidenceSystem) {
    return {
      isSystem: true, isWeather: false, isStock: false, isNews: false,
      isSports: false, isTime: false, isJoke: false, isMusic: false,
      isWeb: false, isTrainRequest: false
    };
  }

  const isHighConfidenceWeather = /^(?:what(?:\s+is|\x27s)?\s+(?:the\s+)?weather(?:\s+(?:like|today|forecast))?|weather\s+report|how(?:\s+is|\x27s)\s+the\s+weather)[.!?\s]*$/i.test(pLower);
  if (isHighConfidenceWeather) {
    return {
      isWeather: true, weatherLocation: "Madurai, Tamil Nadu, India",
      isSystem: false, isStock: false, isNews: false, isSports: false,
      isTime: false, isJoke: false, isMusic: false, isWeb: false,
      isTrainRequest: false
    };
  }

  // Fast-track simple greetings, casual talk, and wake calls without burning Gemini API quota
  const isSimpleGreetingOrChat = /^(?:hello|hi|hey|yo|sup|greetings|howdy|good\s+(?:morning|afternoon|evening|night)|who are you|what is your name|are you there|snow|jarvis)[.!?\s]*$/i.test(pLower);

  // Try LLM Intent Resolution first for intelligent intent parsing only on non-trivial queries
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (apiKey && !isSimpleGreetingOrChat) {
    try {
      const ai = getBrainGenAI(apiKey);
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
  const memories = loadMemories(); // full count needed for training report
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

// ─────────────────────────────────────────────────────────────────────────────
// EPISODIC VISUAL MEMORY (ASTRA-STYLE SPATIAL & VISUAL RECALL)
// ─────────────────────────────────────────────────────────────────────────────

export function addVisualEpisode(
  source: string,
  scene: string,
  objects: string[] | string,
  activity?: string,
  thumbnail?: string
): VisualEpisode {
  const db = getDb();
  const id = `vis-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = new Date().toISOString();
  const objectsStr = Array.isArray(objects) ? objects.join(", ") : String(objects || "");
  const stmt = db.prepare(`
    INSERT INTO visual_episodes (id, source, scene, objects, activity, thumbnail, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, source, scene, objectsStr, activity || "", thumbnail || "", timestamp);
  ragIngestFact(source, "observed_scene", `${scene} with items [${objectsStr}] during activity: ${activity || "observed"}`).catch(() => {});
  return { id, source, scene, objects: objectsStr, activity, thumbnail, timestamp };
}

export function searchVisualEpisodes(query: string, limit: number = 5): VisualEpisode[] {
  const db = getDb();
  const q = `%${query.toLowerCase()}%`;
  const stmt = db.prepare(`
    SELECT * FROM visual_episodes
    WHERE LOWER(scene) LIKE ? OR LOWER(objects) LIKE ? OR LOWER(activity) LIKE ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(q, q, q, limit) as VisualEpisode[];
}

export function loadRecentVisualEpisodes(limit: number = 10): VisualEpisode[] {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM visual_episodes ORDER BY timestamp DESC LIMIT ?`);
  return stmt.all(limit) as VisualEpisode[];
}

export function deleteVisualEpisode(id: string): boolean {
  const db = getDb();
  const stmt = db.prepare(`DELETE FROM visual_episodes WHERE id = ?`);
  const res = stmt.run(id);
  return res.changes > 0;
}

export function clearVisualEpisodes(): void {
  const db = getDb();
  db.exec(`DELETE FROM visual_episodes`);
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED HYBRID MEMORY SYNTHESIS (GRAPH + RAG + VISUAL EPISODES)
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedContextResult {
  contextBlock: string;
  memoryCount: number;
  graphCount: number;
  ragCount: number;
  visualCount: number;
  directiveCount: number;
}

/**
 * All-in-one cognitive context retriever that synthesizes:
 *  1. Persistent entity memories & knowledge graph connections
 *  2. Adaptive learned directives (curated from past interactions)
 *  3. Spatial & visual episodic memory (Astra-style screen perception history)
 *  4. Hybrid semantic vector & FTS5 BM25 RAG documents
 */
export async function getUnifiedContext(
  query: string,
  options?: {
    maxMemories?: number;
    maxRag?: number;
    maxVisual?: number;
    maxDirectives?: number;
  }
): Promise<UnifiedContextResult> {
  const maxMem = options?.maxMemories ?? 10;
  const maxRag = options?.maxRag ?? 5;
  const maxVis = options?.maxVisual ?? 4;
  const maxDir = options?.maxDirectives ?? 10;

  // 1. Graph Memories & Relationships
  // Fix 8: pass limit directly so SQL only fetches what we need
  const memories = loadMemories(maxMem);
  const graphNodes = findGraphRelationships(query, 2);
  const graphContext = formatGraphContext(graphNodes);

  // 2. Hybrid Vector RAG
  let ragContext = "";
  try {
    ragContext = await ragAugmentPrompt(query, maxRag);
  } catch {}

  // 3. Visual Episodes (Desktop / Screen perception history)
  let visualEpisodes: VisualEpisode[] = [];
  try {
    visualEpisodes = searchVisualEpisodes(query, maxVis);
    if (visualEpisodes.length === 0) {
      visualEpisodes = loadRecentVisualEpisodes(maxVis);
    }
  } catch {}

  // 4. Learned Directives & Brain State
  const brainState = loadBrainState();

  // 5. Synthesis & Assembly
  const sections: string[] = [];

  // Memory & Knowledge Graph
  if (memories.length > 0) {
    let memText = "STORED USER KNOWLEDGE & MEMORIES:\n";
    memories.slice(0, maxMem).forEach(m => {
      memText += `- [${m.source}] ${m.rel} ${m.target}\n`;
    });
    sections.push(memText.trim());
  }

  if (graphContext) {
    sections.push(graphContext.trim());
  }

  // Learned Directives
  if (brainState.learnedDirectives.length > 0) {
    let dirText = "LEARNED ADAPTIVE DIRECTIVES:\n";
    brainState.learnedDirectives.slice(-maxDir).forEach(d => {
      dirText += `- ${d}\n`;
    });
    sections.push(dirText.trim());
  }

  // Visual Episodic Memory
  if (visualEpisodes.length > 0) {
    let visText = "RECENT DESKTOP & VISUAL EPISODES (SPATIAL MEMORY):\n";
    visualEpisodes.forEach(v => {
      visText += `- [${new Date(v.timestamp).toLocaleTimeString()}] Scene: "${v.scene}" | Activity: "${v.activity || "active"}" | Objects: [${v.objects}]\n`;
    });
    sections.push(visText.trim());
  }

  // Semantic RAG Context
  if (ragContext) {
    sections.push(ragContext.trim());
  }

  // 5. Temporal Causal Decisions
  try {
    const decisions = searchDecisions(query, 3);
    if (decisions.length > 0) {
      let decText = "RECENT ARCHITECTURAL & SYSTEM DECISIONS (CAUSAL MEMORY):\n";
      decisions.forEach(d => {
        decText += `- Decision: "${d.decision}" | Rationale: "${d.rationale}"${d.constraints ? ` | Constraint: "${d.constraints}"` : ""}\n`;
      });
      sections.push(decText.trim());
    }
  } catch {}

  return {
    contextBlock: sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "",
    memoryCount: memories.length,
    graphCount: graphNodes.length,
    ragCount: ragContext ? maxRag : 0,
    visualCount: visualEpisodes.length,
    directiveCount: brainState.learnedDirectives.length
  };
}

export function recordDecision(
  decision: string,
  rationale: string,
  constraints?: string,
  contextQuery?: string,
  gitCommit?: string
): DecisionRecord {
  const db = getDb();
  const id = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO decision_records (id, decision, rationale, constraints, git_commit, context_query, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, decision, rationale, constraints || "", gitCommit || "", contextQuery || "", timestamp);
  ragIngestFact("decision_engine", "architectural_decision", `${decision} (Reason: ${rationale})`).catch(() => {});
  return { id, decision, rationale, constraints, gitCommit, contextQuery, timestamp };
}

export function searchDecisions(query: string, limit: number = 5): DecisionRecord[] {
  const db = getDb();
  const q = `%${query.toLowerCase()}%`;
  const stmt = db.prepare(`
    SELECT * FROM decision_records
    WHERE LOWER(decision) LIKE ? OR LOWER(rationale) LIKE ? OR LOWER(constraints) LIKE ? OR LOWER(context_query) LIKE ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(q, q, q, q, limit) as DecisionRecord[];
}

export function loadRecentDecisions(limit: number = 10): DecisionRecord[] {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM decision_records ORDER BY timestamp DESC LIMIT ?");
  return stmt.all(limit) as DecisionRecord[];
}

/**
 * Prunes duplicate and stale learned directives to prevent memory bloat
 */
export function compactMemoryDirectives(): { removedCount: number; remainingCount: number } {
  const state = loadBrainState();
  const originalCount = state.learnedDirectives.length;
  const seen = new Set<string>();
  const uniqueDirectives: string[] = [];

  for (const d of state.learnedDirectives) {
    const norm = d.trim().toLowerCase();
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      uniqueDirectives.push(d.trim());
    }
  }

  // Retain most recent 25 directives
  state.learnedDirectives = uniqueDirectives.slice(-25);
  saveBrainState(state);

  return {
    removedCount: originalCount - state.learnedDirectives.length,
    remainingCount: state.learnedDirectives.length
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCEDURAL REFLEXION & DYNAMIC RULES REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function recordProceduralRule(
  triggerContext: string,
  rule: string,
  rationale?: string,
  sourceFailure?: string,
  confidence: number = 1.0
): ProceduralRule {
  const db = getDb();
  const id = `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const timestamp = new Date().toISOString();

  const existing = db.prepare("SELECT * FROM procedural_rules WHERE rule = ?").get(rule) as any;
  if (existing) {
    db.prepare("UPDATE procedural_rules SET confidence = MIN(confidence + 0.1, 2.0), applied_count = applied_count + 1 WHERE id = ?").run(existing.id);
    return {
      id: existing.id,
      triggerContext: existing.trigger_context,
      rule: existing.rule,
      rationale: existing.rationale,
      sourceFailure: existing.source_failure,
      confidence: existing.confidence + 0.1,
      appliedCount: existing.applied_count + 1,
      timestamp: existing.timestamp
    };
  }

  db.prepare(`
    INSERT INTO procedural_rules (id, trigger_context, rule, rationale, source_failure, confidence, applied_count, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, triggerContext, rule, rationale || "", sourceFailure || "", confidence, timestamp);

  return { id, triggerContext, rule, rationale, sourceFailure, confidence, appliedCount: 0, timestamp };
}

export function getRelevantProceduralRules(query: string, limit: number = 4): ProceduralRule[] {
  const db = getDb();
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const all = db.prepare("SELECT * FROM procedural_rules ORDER BY confidence DESC, applied_count DESC LIMIT 50").all() as any[];

  if (!all.length) return [];
  if (!terms.length) return all.slice(0, limit).map(mapDbRule);

  const scored = all.map(r => {
    const text = `${r.trigger_context} ${r.rule} ${r.rationale || ""}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) score += 1;
    }
    return { rule: mapDbRule(r), score };
  });

  scored.sort((a, b) => b.score - a.score || b.rule.confidence - a.rule.confidence);
  return scored.filter(s => s.score > 0).slice(0, limit).map(s => s.rule);
}

export function getAllProceduralRules(): ProceduralRule[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM procedural_rules ORDER BY timestamp DESC").all() as any[];
  return rows.map(mapDbRule);
}

function mapDbRule(r: any): ProceduralRule {
  return {
    id: r.id,
    triggerContext: r.trigger_context,
    rule: r.rule,
    rationale: r.rationale,
    sourceFailure: r.source_failure,
    confidence: r.confidence,
    appliedCount: r.applied_count,
    timestamp: r.timestamp
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHESIZED SKILLS REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function saveSynthesizedSkill(skill: Omit<SynthesizedSkill, "id" | "createdAt" | "updatedAt" | "successCount" | "failureCount"> & { id?: string }): SynthesizedSkill {
  const db = getDb();
  const id = skill.id || `skill-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO synthesized_skills (id, name, description, language, code, input_schema, test_cases, is_verified, success_count, failure_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      language = excluded.language,
      code = excluded.code,
      input_schema = excluded.input_schema,
      test_cases = excluded.test_cases,
      is_verified = excluded.is_verified,
      updated_at = excluded.updated_at
  `).run(
    id,
    skill.name,
    skill.description,
    skill.language,
    skill.code,
    skill.inputSchema,
    skill.testCases,
    skill.isVerified ? 1 : 0,
    now,
    now
  );

  return {
    id,
    name: skill.name,
    description: skill.description,
    language: skill.language,
    code: skill.code,
    inputSchema: skill.inputSchema,
    testCases: skill.testCases,
    isVerified: skill.isVerified,
    successCount: 0,
    failureCount: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function loadSynthesizedSkills(onlyVerified: boolean = false): SynthesizedSkill[] {
  const db = getDb();
  const query = onlyVerified
    ? "SELECT * FROM synthesized_skills WHERE is_verified = 1 ORDER BY success_count DESC, updated_at DESC"
    : "SELECT * FROM synthesized_skills ORDER BY updated_at DESC";
  const rows = db.prepare(query).all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    language: r.language,
    code: r.code,
    inputSchema: r.input_schema,
    testCases: r.test_cases,
    isVerified: !!r.is_verified,
    successCount: r.success_count,
    failureCount: r.failure_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export function getSynthesizedSkillByName(name: string): SynthesizedSkill | null {
  const db = getDb();
  const r = db.prepare("SELECT * FROM synthesized_skills WHERE name = ?").get(name) as any;
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    language: r.language,
    code: r.code,
    inputSchema: r.input_schema,
    testCases: r.test_cases,
    isVerified: !!r.is_verified,
    successCount: r.success_count,
    failureCount: r.failure_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export function updateSkillStats(name: string, success: boolean): void {
  const db = getDb();
  if (success) {
    db.prepare("UPDATE synthesized_skills SET success_count = success_count + 1 WHERE name = ?").run(name);
  } else {
    db.prepare("UPDATE synthesized_skills SET failure_count = failure_count + 1 WHERE name = ?").run(name);
  }
}

export function deleteSynthesizedSkill(name: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM synthesized_skills WHERE name = ?").run(name);
  return res.changes > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTONOMOUS HIERARCHICAL GOALS REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function createAutonomousGoal(
  title: string,
  description: string,
  priority: number = 3
): AutonomousGoal {
  const db = getDb();
  const id = `goal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO autonomous_goals (id, title, description, status, priority, progress_pct, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, 0, ?, ?)
  `).run(id, title, description, priority, now, now);

  logGoalEvent(id, `Autonomous goal initialized: "${title}"`);

  return {
    id,
    title,
    description,
    status: "pending",
    priority,
    progressPct: 0,
    createdAt: now,
    updatedAt: now,
    subtasks: []
  };
}

export function getAutonomousGoals(statusFilter?: GoalStatus): AutonomousGoal[] {
  const db = getDb();
  let rows: any[];
  if (statusFilter) {
    rows = db.prepare("SELECT * FROM autonomous_goals WHERE status = ? ORDER BY priority ASC, created_at DESC").all(statusFilter);
  } else {
    rows = db.prepare("SELECT * FROM autonomous_goals ORDER BY priority ASC, created_at DESC").all();
  }

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status as GoalStatus,
    priority: r.priority,
    progressPct: r.progress_pct,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at || undefined
  }));
}

export function getGoalWithSubtasks(goalId: string): AutonomousGoal | null {
  const db = getDb();
  const goal = db.prepare("SELECT * FROM autonomous_goals WHERE id = ?").get(goalId) as any;
  if (!goal) return null;

  const subtasks = db.prepare("SELECT * FROM goal_subtasks WHERE goal_id = ? ORDER BY step_order ASC").all(goalId) as any[];

  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    status: goal.status as GoalStatus,
    priority: goal.priority,
    progressPct: goal.progress_pct,
    createdAt: goal.created_at,
    updatedAt: goal.updated_at,
    completedAt: goal.completed_at || undefined,
    subtasks: subtasks.map(s => ({
      id: s.id,
      goalId: s.goal_id,
      stepOrder: s.step_order,
      title: s.title,
      assignedTool: s.assigned_tool,
      inputPayload: s.input_payload,
      status: s.status as SubtaskStatus,
      resultSummary: s.result_summary || undefined,
      retryCount: s.retry_count,
      executedAt: s.executed_at || undefined
    }))
  };
}

export function updateGoalStatus(
  goalId: string,
  status: GoalStatus,
  progressPct?: number,
  completedAt?: string
): void {
  const db = getDb();
  const now = new Date().toISOString();

  if (progressPct !== undefined && completedAt !== undefined) {
    db.prepare("UPDATE autonomous_goals SET status = ?, progress_pct = ?, completed_at = ?, updated_at = ? WHERE id = ?")
      .run(status, progressPct, completedAt, now, goalId);
  } else if (progressPct !== undefined) {
    db.prepare("UPDATE autonomous_goals SET status = ?, progress_pct = ?, updated_at = ? WHERE id = ?")
      .run(status, progressPct, now, goalId);
  } else {
    db.prepare("UPDATE autonomous_goals SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, goalId);
  }
}

export function addGoalSubtasks(
  goalId: string,
  subtasks: Array<{ stepOrder: number; title: string; assignedTool: string; inputPayload?: any }>
): GoalSubtask[] {
  const db = getDb();
  const created: GoalSubtask[] = [];

  const stmt = db.prepare(`
    INSERT INTO goal_subtasks (id, goal_id, step_order, title, assigned_tool, input_payload, status, retry_count)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 0)
  `);

  const tx = db.transaction(() => {
    subtasks.forEach(st => {
      const id = `subtask-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const payloadStr = typeof st.inputPayload === "string" ? st.inputPayload : JSON.stringify(st.inputPayload || {});
      stmt.run(id, goalId, st.stepOrder, st.title, st.assignedTool, payloadStr);
      created.push({
        id,
        goalId,
        stepOrder: st.stepOrder,
        title: st.title,
        assignedTool: st.assignedTool,
        inputPayload: payloadStr,
        status: "pending",
        retryCount: 0
      });
    });
    db.prepare("UPDATE autonomous_goals SET status = 'active', updated_at = ? WHERE id = ?").run(new Date().toISOString(), goalId);
  });

  tx();
  logGoalEvent(goalId, `Decomposed into ${created.length} executable subtasks.`);
  return created;
}

export function updateSubtaskStatus(
  subtaskId: string,
  status: SubtaskStatus,
  resultSummary?: string
): void {
  const db = getDb();
  const now = new Date().toISOString();

  if (status === "failed") {
    db.prepare("UPDATE goal_subtasks SET status = ?, result_summary = ?, retry_count = retry_count + 1, executed_at = ? WHERE id = ?")
      .run(status, resultSummary || "", now, subtaskId);
  } else {
    db.prepare("UPDATE goal_subtasks SET status = ?, result_summary = ?, executed_at = ? WHERE id = ?")
      .run(status, resultSummary || "", now, subtaskId);
  }
}

export function logGoalEvent(goalId: string, message: string, subtaskId?: string): void {
  try {
    const db = getDb();
    const id = `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    db.prepare("INSERT INTO goal_logs (id, goal_id, subtask_id, message, timestamp) VALUES (?, ?, ?, ?, ?)")
      .run(id, goalId, subtaskId || null, message, new Date().toISOString());
  } catch {}
}

export function deleteAutonomousGoal(goalId: string): boolean {
  const db = getDb();
  db.prepare("DELETE FROM goal_logs WHERE goal_id = ?").run(goalId);
  db.prepare("DELETE FROM goal_subtasks WHERE goal_id = ?").run(goalId);
  const res = db.prepare("DELETE FROM autonomous_goals WHERE id = ?").run(goalId);
  return res.changes > 0;
}

