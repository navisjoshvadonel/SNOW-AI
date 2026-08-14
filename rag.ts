/**
 * RAG ENGINE — rag.ts
 *
 * Retrieval-Augmented Generation for Snow Jarvis using Ollama's
 * nomic-embed-text model (768-dim vectors, completely offline).
 *
 * Pipeline:
 *   1. INGEST  — Text/conversation → embed via Ollama → store in SQLite
 *   2. RETRIEVE — Query → embed → cosine similarity → top-K chunks
 *   3. AUGMENT  — Inject retrieved context into Ollama prompt before inference
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const RAG_DB_FILE = path.join(DATA_DIR, "snow_rag.db");
const OLLAMA_BASE = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const EMBED_DIM = 768; // nomic-embed-text output dimension

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
  score: number;          // cosine similarity 0-1
}

// ─── Database Setup ───────────────────────────────────────────────────────────

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (_db) return _db;

  _db = new Database(RAG_DB_FILE);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id        TEXT PRIMARY KEY,
      source    TEXT NOT NULL,
      category  TEXT NOT NULL DEFAULT 'history',
      text      TEXT NOT NULL,
      embedding BLOB NOT NULL,   -- stored as raw Float64Array bytes
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rag_source   ON rag_chunks(source);
    CREATE INDEX IF NOT EXISTS idx_rag_category ON rag_chunks(category);
    CREATE INDEX IF NOT EXISTS idx_rag_ts       ON rag_chunks(timestamp DESC);
  `);

  return _db;
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

// ─── Ollama Embedding API ─────────────────────────────────────────────────────

/**
 * Get a real 768-dim embedding from Ollama's nomic-embed-text.
 * Falls back to a term-frequency vector if Ollama is unreachable.
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);

    const data: any = await res.json();
    // nomic-embed-text returns { embeddings: [[...]] }
    const vec: number[] =
      data.embeddings?.[0] ?? data.embedding ?? [];

    if (vec.length > 0) {
      console.log(`[RAG] Embedded ${vec.length}-dim vector via ${EMBED_MODEL}`);
      return vec;
    }
    throw new Error("Empty embedding response");
  } catch (err: any) {
    console.warn("[RAG] Ollama embed failed, using offline fallback:", err.message);
    return offlineEmbed(text);
  }
}

/** Offline TF-IDF-like sparse embedding (64-dim) as last resort */
function offlineEmbed(text: string): number[] {
  const words = text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
  const vec = new Array(EMBED_DIM).fill(0);
  for (const word of words) {
    let h = 0;
    for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) % EMBED_DIM;
    vec[Math.abs(h)] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map(v => v / norm) : vec;
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────

export function cosine(a: number[], b: number[]): number {
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

// ─── INGEST ───────────────────────────────────────────────────────────────────

/**
 * Add a text chunk to the RAG store.
 * Embedding is computed automatically via Ollama.
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
    text,
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
 * Ingest a full conversation turn (auto-chunks by sentence).
 */
export async function ragIngestConversation(
  userMsg: string,
  assistantMsg: string
): Promise<void> {
  const ts = new Date().toISOString();
  const combined = `User: ${userMsg}\nSnow: ${assistantMsg}`;
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
  const text = `${subject} ${relation} ${object}`;
  await ragIngest(text, "user_facts", "fact");
}

// ─── RETRIEVE ─────────────────────────────────────────────────────────────────

/**
 * Search the RAG store for the most relevant chunks.
 * Returns top-K results sorted by cosine similarity.
 */
export async function ragSearch(
  query: string,
  topK: number = 5,
  minScore: number = 0.25,
  filterCategory?: string
): Promise<RagSearchResult[]> {
  const db = getDb();
  const queryVec = await embedText(query);

  let rows: any[];
  if (filterCategory) {
    rows = db.prepare("SELECT * FROM rag_chunks WHERE category = ? ORDER BY timestamp DESC LIMIT 500").all(filterCategory);
  } else {
    rows = db.prepare("SELECT * FROM rag_chunks ORDER BY timestamp DESC LIMIT 500").all();
  }

  if (rows.length === 0) return [];

  const scored: RagSearchResult[] = rows.map(row => {
    const vec = unpackEmbedding(row.embedding as Buffer);
    return {
      chunk: {
        id: row.id,
        source: row.source,
        category: row.category,
        text: row.text,
        embedding: vec,
        timestamp: row.timestamp,
      },
      score: cosine(queryVec, vec),
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const results = scored.filter(r => r.score >= minScore).slice(0, topK);
  console.log(`[RAG] Query "${query.slice(0, 40)}..." → ${results.length} results (top score: ${results[0]?.score.toFixed(3) ?? "N/A"})`);

  return results;
}

// ─── AUGMENT ─────────────────────────────────────────────────────────────────

/**
 * Build an augmented prompt string from RAG search results.
 * This gets injected into Ollama's system/user messages before the query.
 */
export async function ragAugmentPrompt(
  query: string,
  topK: number = 5
): Promise<string> {
  const results = await ragSearch(query, topK);
  if (results.length === 0) return "";

  const lines = results.map((r, i) =>
    `[${i + 1}] (${r.chunk.category} | ${(r.score * 100).toFixed(1)}% match | ${r.chunk.source})\n${r.chunk.text}`
  );

  return `\nRELEVANT MEMORY & CONTEXT (retrieved via semantic search):\n${lines.join("\n\n")}`;
}

// ─── MANAGEMENT ───────────────────────────────────────────────────────────────

export function ragStats(): { total: number; byCategory: Record<string, number> } {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM rag_chunks").get() as any).c;
  const cats = db.prepare("SELECT category, COUNT(*) as c FROM rag_chunks GROUP BY category").all() as any[];
  const byCategory: Record<string, number> = {};
  for (const row of cats) byCategory[row.category] = row.c;
  return { total, byCategory };
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
  console.log("[RAG] All chunks cleared");
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
