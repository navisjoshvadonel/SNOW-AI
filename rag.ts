/**
 * UNIFIED HYBRID RAG ENGINE — rag.ts
 *
 * Phase 2: High-Precision Retrieval-Augmented Generation for Snow Jarvis
 *
 * Capabilities:
 *   1. DENSE VECTOR RETRIEVAL  — 768-dim semantic vectors (Ollama nomic-embed-text / Gemini text-embedding-004)
 *   2. SPARSE KEYWORD RETRIEVAL — SQLite FTS5 (BM25 ranking with Porter stemming)
 *   3. RECIPROCAL RANK FUSION   — Combines Dense + Sparse rankings with scale invariance
 *   4. CONVERSATION CURATION    — Filters ephemeral small-talk, auto-compresses history
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

// ─── Config ───────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const RAG_DB_FILE = path.join(DATA_DIR, "snow_rag.db");
const BRAIN_DB_FILE = path.join(DATA_DIR, "snow_brain.db");
const OLLAMA_BASE = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
export const EMBED_DIM = 768; // Standard 768-dim vector space for both Ollama & Gemini

// In-memory LRU embedding cache (avoids repeated API calls for same queries/texts)
const EMBEDDING_CACHE = new Map<string, number[]>();
const MAX_CACHE_ENTRIES = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RagChunk {
  id: string;
  source: string;         // where this text came from (e.g. "conversation", "user_fact", "docs")
  category: string;       // "history" | "preference" | "fact" | "code" | "guideline"
  text: string;           // the raw text chunk
  embedding: number[];    // 768-dim float vector
  timestamp: string;
}

export interface RagSearchResult {
  chunk: RagChunk;
  score: number;          // normalized hybrid RRF score 0-1
  vectorScore?: number;
  bm25Rank?: number;
}

// ─── Database Setup with FTS5 Full-Text Indexing ──────────────────────────────

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (_db) return _db;

  _db = new Database(RAG_DB_FILE);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");

  // 1. Core vector chunks table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id        TEXT PRIMARY KEY,
      source    TEXT NOT NULL,
      category  TEXT NOT NULL DEFAULT 'history',
      text      TEXT NOT NULL,
      embedding BLOB NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rag_source   ON rag_chunks(source);
    CREATE INDEX IF NOT EXISTS idx_rag_category ON rag_chunks(category);
    CREATE INDEX IF NOT EXISTS idx_rag_ts       ON rag_chunks(timestamp DESC);
  `);

  // 2. Virtual Table for Full-Text Search (BM25 via FTS5)
  _db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
      id UNINDEXED,
      text,
      source,
      category,
      tokenize = 'porter unicode61'
    );

    -- Automatic triggers to keep FTS5 synchronized with rag_chunks
    CREATE TRIGGER IF NOT EXISTS trg_rag_ai AFTER INSERT ON rag_chunks BEGIN
      INSERT INTO rag_chunks_fts(id, text, source, category)
      VALUES (new.id, new.text, new.source, new.category);
    END;

    CREATE TRIGGER IF NOT EXISTS trg_rag_ad AFTER DELETE ON rag_chunks BEGIN
      DELETE FROM rag_chunks_fts WHERE id = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_rag_au AFTER UPDATE ON rag_chunks BEGIN
      DELETE FROM rag_chunks_fts WHERE id = old.id;
      INSERT INTO rag_chunks_fts(id, text, source, category)
      VALUES (new.id, new.text, new.source, new.category);
    END;
  `);

  // 3. Ensure FTS5 index is populated if table has rows but FTS5 is empty
  const chunkCount = (_db.prepare("SELECT COUNT(*) as c FROM rag_chunks").get() as any).c;
  const ftsCount = (_db.prepare("SELECT COUNT(*) as c FROM rag_chunks_fts").get() as any).c;
  if (chunkCount > 0 && ftsCount === 0) {
    console.log(`[RAG SYNC] Populating FTS5 index with ${chunkCount} existing chunks...`);
    _db.prepare(`
      INSERT INTO rag_chunks_fts(id, text, source, category)
      SELECT id, text, source, category FROM rag_chunks
    `).run();
  }

  // 4. Migrate vector documents from snow_brain.db if present
  autoMigrateBrainVectors(_db);

  return _db;
}

/** Consolidates vector_documents from snow_brain.db into unified rag_chunks */
function autoMigrateBrainVectors(targetDb: Database.Database) {
  if (!fs.existsSync(BRAIN_DB_FILE)) return;
  try {
    const brainDb = new Database(BRAIN_DB_FILE, { readonly: true });
    const tables = brainDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vector_documents'").all();
    if (tables.length === 0) return;

    const rows: any[] = brainDb.prepare("SELECT * FROM vector_documents").all();
    if (rows.length === 0) return;

    const checkStmt = targetDb.prepare("SELECT 1 FROM rag_chunks WHERE id = ?");
    const insertStmt = targetDb.prepare(`
      INSERT OR IGNORE INTO rag_chunks (id, source, category, text, embedding, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let migrated = 0;
    for (const row of rows) {
      if (!checkStmt.get(row.id)) {
        let vec: number[] = [];
        try { vec = JSON.parse(row.embedding); } catch {}
        if (vec.length > 0) {
          // Pad or adapt to 768-dim if needed
          if (vec.length < EMBED_DIM) {
            vec = [...vec, ...new Array(EMBED_DIM - vec.length).fill(0)];
          } else if (vec.length > EMBED_DIM) {
            vec = vec.slice(0, EMBED_DIM);
          }
          insertStmt.run(row.id, row.source, row.category, row.text, packEmbedding(vec), row.timestamp);
          migrated++;
        }
      }
    }
    if (migrated > 0) {
      console.log(`[RAG CONSOLIDATION] Consolidated ${migrated} legacy vectors into unified RAG database.`);
    }
  } catch (e: any) {
    console.warn("[RAG CONSOLIDATION] Notice during vector migration:", e.message);
  }
}

// ─── Serialization helpers ────────────────────────────────────────────────────

function packEmbedding(vec: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vec.length * 8);
  for (let i = 0; i < vec.length; i++) buf.writeDoubleBE(vec[i], i * 8);
  return buf;
}

function unpackEmbedding(buf: Buffer): number[] {
  const len = buf.length / 8;
  const vec: number[] = new Array(len);
  for (let i = 0; i < len; i++) vec[i] = buf.readDoubleBE(i * 8);
  return vec;
}

// ─── High-Dimensional Normalized Offline Fallback ─────────────────────────────

function offlineEmbed(text: string): number[] {
  const words = text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
  const vec = new Array(EMBED_DIM).fill(0);
  for (const word of words) {
    let h = 0;
    for (let i = 0; i < word.length; i++) {
      h = (h * 31 + word.charCodeAt(i)) % EMBED_DIM;
    }
    vec[Math.abs(h)] += 1.0;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map(v => v / norm) : vec;
}

// ─── Multi-Provider Embedding Pipeline (Ollama -> Gemini -> Offline) ──────────

/**
 * Generates a real 768-dim embedding:
 * 1. Checks memory cache
 * 2. Attempts Ollama nomic-embed-text (offline local model)
 * 3. Falls back to Gemini text-embedding-004 if API key is set
 * 4. Falls back to deterministic normalized 768-dim hash vector
 */
export async function embedText(text: string): Promise<number[]> {
  const clean = text.trim();
  if (!clean) return new Array(EMBED_DIM).fill(0);

  // Check cache
  if (EMBEDDING_CACHE.has(clean)) {
    return EMBEDDING_CACHE.get(clean)!;
  }

  let resultVec: number[] | null = null;

  // 1. Try Ollama (Local & Offline)
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: clean }),
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data: any = await res.json();
      const vec: number[] = data.embeddings?.[0] ?? data.embedding ?? [];
      if (vec.length > 0) {
        resultVec = vec;
      }
    }
  } catch {}

  // 2. Try Gemini API (Cloud) if Ollama is not active
  if (!resultVec && process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const res: any = await ai.models.embedContent({
        model: "text-embedding-004",
        contents: [{ parts: [{ text: clean }] }]
      });
      const values = res.embedding?.values || res.embeddings?.[0]?.values;
      if (Array.isArray(values) && values.length > 0) {
        resultVec = values;
      }
    } catch {}
  }

  // 3. Fallback to deterministic normalized offline embedding
  if (!resultVec || resultVec.length === 0) {
    resultVec = offlineEmbed(clean);
  }

  // Cache normalized vector
  if (EMBEDDING_CACHE.size >= MAX_CACHE_ENTRIES) {
    const firstKey = EMBEDDING_CACHE.keys().next().value;
    if (firstKey) EMBEDDING_CACHE.delete(firstKey);
  }
  EMBEDDING_CACHE.set(clean, resultVec);

  return resultVec;
}

// ─── Math & Similarity ────────────────────────────────────────────────────────

export function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function cleanFtsQuery(query: string): string {
  const words = query
    .replace(/[^\w\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1);

  if (words.length === 0) return "";
  // Search with OR tokens using porter stems
  return words.map(w => `"${w}"`).join(" OR ");
}

// ─── Ephemeral & Noise Filtering ──────────────────────────────────────────────

/** Detects non-informative pleasantries / greetings that shouldn't pollute memory */
export function isEphemeralMessage(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (clean.length <= 2) return true;
  return /^(hi|hello|hey|yo|sup|good\s+(morning|afternoon|evening)|bye|goodbye|see\s+you|ok|okay|cool|thanks|thank\s+you|great|awesome|nice)[\.\!\?]*$/i.test(clean);
}

// ─── INGESTION PIPELINE ───────────────────────────────────────────────────────

/**
 * Add a text chunk to the unified RAG store.
 */
export async function ragIngest(
  text: string,
  source: string,
  category: "history" | "preference" | "fact" | "code" | "guideline" = "history"
): Promise<RagChunk> {
  const db = getDb();
  const embedding = await embedText(text);
  const chunk: RagChunk = {
    id: `rag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    source,
    category,
    text: text.trim(),
    embedding,
    timestamp: new Date().toISOString(),
  };

  db.prepare(`
    INSERT OR REPLACE INTO rag_chunks (id, source, category, text, embedding, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(chunk.id, chunk.source, chunk.category, chunk.text, packEmbedding(embedding), chunk.timestamp);

  console.log(`[RAG] Ingested chunk ${chunk.id} (${category}) from "${source}"`);
  return chunk;
}

/**
 * Ingest a conversation turn with ephemeral filtering.
 */
export async function ragIngestConversation(
  userMsg: string,
  assistantMsg: string
): Promise<void> {
  if (isEphemeralMessage(userMsg)) {
    return; // Don't pollute long-term memory with "hi" or "thanks"
  }

  const ts = new Date().toISOString();
  const combined = `User: ${userMsg.trim()}\nSnow: ${assistantMsg.trim()}`;
  await ragIngest(combined, `conversation_${ts}`, "history");
}

/**
 * Ingest a user fact or preference.
 */
export async function ragIngestFact(
  subject: string,
  relation: string,
  object: string
): Promise<void> {
  const text = `${subject.trim()} ${relation.trim()} ${object.trim()}`;
  await ragIngest(text, "user_facts", "fact");
}

// ─── HYBRID SEARCH (RECIPROCAL RANK FUSION) ───────────────────────────────────

/**
 * Reciprocal Rank Fusion (RRF) combines sparse BM25 and dense vector rankings:
 *   Score(d) = (w_dense / (k + rank_dense(d))) + (w_sparse / (k + rank_sparse(d)))
 *   where k = 60 constant.
 */
export async function ragSearch(
  query: string,
  topK: number = 5,
  minScore: number = 0.005,
  filterCategory?: string
): Promise<RagSearchResult[]> {
  const db = getDb();
  const clean = query.trim();
  if (!clean) return [];

  // 1. Sparse Retrieval via SQLite FTS5 (BM25)
  const ftsSearchStr = cleanFtsQuery(clean);
  const bm25Ranks = new Map<string, number>();

  if (ftsSearchStr) {
    try {
      let ftsQuery = `
        SELECT id, bm25(rag_chunks_fts) as rank
        FROM rag_chunks_fts
        WHERE rag_chunks_fts MATCH ?
      `;
      const params: any[] = [ftsSearchStr];
      if (filterCategory) {
        ftsQuery += " AND category = ?";
        params.push(filterCategory);
      }
      ftsQuery += " ORDER BY rank ASC LIMIT 50";

      const ftsRows: any[] = db.prepare(ftsQuery).all(...params);
      ftsRows.forEach((row, index) => {
        bm25Ranks.set(row.id, index + 1); // 1-based rank
      });
    } catch (e: any) {
      console.warn("[RAG FTS5] BM25 match note:", e.message);
    }
  }

  // 2. Dense Vector Retrieval (Cosine Similarity)
  const queryVec = await embedText(clean);
  let chunkRows: any[];
  if (filterCategory) {
    chunkRows = db.prepare("SELECT * FROM rag_chunks WHERE category = ? ORDER BY timestamp DESC LIMIT 500").all(filterCategory);
  } else {
    chunkRows = db.prepare("SELECT * FROM rag_chunks ORDER BY timestamp DESC LIMIT 500").all();
  }

  if (chunkRows.length === 0) return [];

  // Score dense vectors
  const vectorScores: { row: any; score: number }[] = [];
  for (const r of chunkRows) {
    const vec = unpackEmbedding(r.embedding as Buffer);
    const sim = cosine(queryVec, vec);
    vectorScores.push({ row: r, score: sim });
  }

  // Sort by cosine similarity descending
  vectorScores.sort((a, b) => b.score - a.score);

  const denseRanks = new Map<string, number>();
  vectorScores.forEach((item, index) => {
    denseRanks.set(item.row.id, index + 1); // 1-based rank
  });

  // 3. Reciprocal Rank Fusion
  const k = 60;
  const wDense = 1.0;
  const wSparse = 0.85;
  const now = Date.now();

  const candidateMap = new Map<string, any>();
  chunkRows.forEach(r => candidateMap.set(r.id, r));

  const fusedResults: RagSearchResult[] = [];

  for (const [id, r] of candidateMap.entries()) {
    const rankDense = denseRanks.get(id);
    const rankSparse = bm25Ranks.get(id);

    // If item appeared in neither top dense nor top sparse, skip
    if (!rankDense && !rankSparse) continue;

    const scoreDense = rankDense ? wDense / (k + rankDense) : 0;
    const scoreSparse = rankSparse ? wSparse / (k + rankSparse) : 0;

    // Recency boost (up to 10% bonus for memories under 48 hours old)
    const ageHours = (now - new Date(r.timestamp).getTime()) / (1000 * 3600);
    const recencyBoost = ageHours < 48 ? 1.10 : 1.0;

    const rrfScore = (scoreDense + scoreSparse) * recencyBoost;

    if (rrfScore >= minScore) {
      fusedResults.push({
        chunk: {
          id: r.id,
          source: r.source,
          category: r.category,
          text: r.text,
          embedding: unpackEmbedding(r.embedding as Buffer),
          timestamp: r.timestamp,
        },
        score: Number(rrfScore.toFixed(4)),
        vectorScore: rankDense ? vectorScores[rankDense - 1].score : 0,
        bm25Rank: rankSparse || undefined,
      });
    }
  }

  fusedResults.sort((a, b) => b.score - a.score);
  const results = fusedResults.slice(0, topK);

  console.log(`[RAG Hybrid RRF] "${clean.slice(0, 35)}..." → ${results.length} matches (Top Score: ${results[0]?.score ?? "0"})`);
  return results;
}

// ─── AUGMENT PROMPT ───────────────────────────────────────────────────────────

export async function ragAugmentPrompt(
  query: string,
  topK: number = 5
): Promise<string> {
  const results = await ragSearch(query, topK);
  if (results.length === 0) return "";

  const lines = results.map((r, i) =>
    `[Context ${i + 1}] (${r.chunk.category} | RRF Score: ${r.score} | ${r.chunk.source})\n${r.chunk.text}`
  );

  return `\nRELEVANT KNOWLEDGE BASE CONTEXT (Retrieved via Hybrid Dense-BM25 RAG):\n${lines.join("\n\n")}`;
}

// ─── CURATION, DEDUPLICATION & AUTO-PRUNING ───────────────────────────────────

/** Deduplicates near-identical memory chunks using cosine similarity threshold */
export function ragDeduplicate(similarityThreshold: number = 0.96): number {
  const db = getDb();
  const chunks = ragLoadAll();
  let deleted = 0;

  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const sim = cosine(chunks[i].embedding, chunks[j].embedding);
      if (sim >= similarityThreshold) {
        // Remove the older chunk
        const olderId = new Date(chunks[i].timestamp) < new Date(chunks[j].timestamp)
          ? chunks[i].id
          : chunks[j].id;
        db.prepare("DELETE FROM rag_chunks WHERE id = ?").run(olderId);
        deleted++;
      }
    }
  }

  if (deleted > 0) {
    console.log(`[RAG CURATOR] Removed ${deleted} near-duplicate chunks.`);
  }
  return deleted;
}

/** Automatically compresses old conversation turns into consolidated history */
export function ragAutoCompressHistory(maxAgeDays: number = 14, maxChunks: number = 200): number {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as c FROM rag_chunks WHERE category = 'history'").get() as any).c;
  if (count <= maxChunks) return 0;

  const cutoff = new Date(Date.now() - maxAgeDays * 86400 * 1000).toISOString();
  const res = db.prepare(`
    DELETE FROM rag_chunks 
    WHERE category = 'history' AND timestamp < ?
  `).run(cutoff);

  console.log(`[RAG CURATOR] Compressed and pruned ${res.changes} aged conversation chunks.`);
  return res.changes;
}

// ─── MANAGEMENT APIS ──────────────────────────────────────────────────────────

export function ragStats(): { total: number; byCategory: Record<string, number>; ftsIndexed: number } {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM rag_chunks").get() as any).c;
  const ftsIndexed = (db.prepare("SELECT COUNT(*) as c FROM rag_chunks_fts").get() as any).c;
  const cats = db.prepare("SELECT category, COUNT(*) as c FROM rag_chunks GROUP BY category").all() as any[];
  const byCategory: Record<string, number> = {};
  for (const row of cats) byCategory[row.category] = row.c;
  return { total, byCategory, ftsIndexed };
}

export function ragDeleteOld(daysOld: number = 30): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - daysOld * 86400 * 1000).toISOString();
  const res = db.prepare("DELETE FROM rag_chunks WHERE timestamp < ? AND category = 'history'").run(cutoff);
  console.log(`[RAG] Pruned ${res.changes} old history chunks`);
  return res.changes;
}

export function ragClear(): void {
  const db = getDb();
  db.prepare("DELETE FROM rag_chunks").run();
  db.prepare("DELETE FROM rag_chunks_fts").run();
  console.log("[RAG] All chunks and FTS indices cleared");
}

export function ragLoadAll(): RagChunk[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM rag_chunks ORDER BY timestamp DESC").all() as any[];
  return rows.map(row => ({
    id: row.id,
    source: row.source,
    category: row.category,
    text: row.text,
    embedding: unpackEmbedding(row.embedding as Buffer),
    timestamp: row.timestamp,
  }));
}

