import React, { useState, useMemo } from "react";
import { Database, Search, Sparkles, Plus, Code, MessageSquare, Compass, BarChart } from "lucide-react";

export interface ChromaDocument {
  id: string;
  source: string; // e.g., "calculate_shares.js", "chat_turn_1", etc.
  text: string;
  category: "code" | "history" | "guideline";
  embedding: [number, number, number]; // Simulated 3D vector projected to 2D
  timestamp: string;
}

interface ChromaDBStoreProps {
  documents: ChromaDocument[];
  onAddDocument: (doc: Omit<ChromaDocument, "id" | "timestamp" | "embedding">) => void;
  onRemoveDocument: (id: string) => void;
  onClearDocuments: () => void;
}

// Simple stop-words list to sanitize tokens for basic Cosine Similarity score mapping
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "to", "of", "in", "on", "at", "by", "for", "with", "this", "that", "these", "those"
]);

// Helper to compute simplified cosine similarity based on word frequencies
function computeCosineSimilarity(textA: string, textB: string): number {
  const getWordFreqs = (text: string) => {
    const words = text.toLowerCase().match(/\w+/g) || [];
    const freqs: Record<string, number> = {};
    words.forEach(w => {
      if (!STOP_WORDS.has(w)) {
        freqs[w] = (freqs[w] || 0) + 1;
      }
    });
    return freqs;
  };

  const freqsA = getWordFreqs(textA);
  const freqsB = getWordFreqs(textB);

  // Set of all unique words across both documents
  const allWords = new Set([...Object.keys(freqsA), ...Object.keys(freqsB)]);
  if (allWords.size === 0) return 0;

  let dotProduct = 0;
  let magASq = 0;
  let magBSq = 0;

  allWords.forEach(word => {
    const valA = freqsA[word] || 0;
    const valB = freqsB[word] || 0;
    dotProduct += valA * valB;
    magASq += valA * valA;
    magBSq += valB * valB;
  });

  const magA = Math.sqrt(magASq);
  const magB = Math.sqrt(magBSq);

  if (magA === 0 || magB === 0) return 0;
  return Number((dotProduct / (magA * magB)).toFixed(4));
}

export default function ChromaDBStore({
  documents,
  onAddDocument,
  onRemoveDocument,
  onClearDocuments,
}: ChromaDBStoreProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [newSource, setNewSource] = useState("scratchpad.js");
  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState<"code" | "history">("code");
  const [activeVectorId, setActiveVectorId] = useState<string | null>(null);

  // Run real semantic term-matching cosine similarity query
  const queryResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return documents.map(doc => ({ ...doc, score: 0 }));
    }
    return documents
      .map(doc => {
        const score = computeCosineSimilarity(doc.text, searchQuery);
        return { ...doc, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [documents, searchQuery]);

  const topMatchId = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const best = queryResults[0];
    return best && best.score > 0 ? best.id : null;
  }, [queryResults, searchQuery]);

  const handleCreateDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !newSource.trim()) return;
    onAddDocument({
      source: newSource.trim(),
      text: newText.trim(),
      category: newCategory,
    });
    setNewText("");
  };

  return (
    <div className="flex flex-col h-full text-xs font-mono select-none" id="chromadb-parent">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400" />
          <span className="font-sans text-[11px] font-bold text-white/60 tracking-widest uppercase">
            ChromaDB Vector Store
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
            Short-term Mem
          </span>
          <button
            onClick={onClearDocuments}
            className="px-2 py-0.5 border border-white/5 bg-white/5 rounded text-[8px] hover:text-red-400 uppercase font-bold transition cursor-pointer"
          >
            Flush
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Vector Embedding Scatter Plot Map */}
        <div className="border border-white/5 bg-black/40 rounded-2xl p-3 relative h-[160px] overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/5 pb-1.5 mb-1 text-[8px] text-white/30 uppercase tracking-widest font-bold">
            <span className="flex items-center gap-1">
              <Compass className="w-3 h-3 text-emerald-400" /> Vectors 2D Projection Space
            </span>
            <span>Index: {documents.length} dimensions</span>
          </div>

          <div className="relative flex-1 bg-[#030303] border-dashed border border-white/5 rounded-lg overflow-hidden my-1">
            {/* Grid references */}
            <div className="absolute inset-x-0 top-1/2 border-t border-white/[0.03]" />
            <div className="absolute inset-y-0 left-1/2 border-l border-white/[0.03]" />

            {/* Render projected vector points */}
            {documents.map((doc) => {
              // Map simulated 3D vector coords (ranging -100 to 100) to percentage grid
              const [valX, valY, valZ] = doc.embedding;
              // Map -10 to 10 onto 0 to 100 percent
              const xPct = 50 + (valX * 4);
              const yPct = 50 + (valY * 4);
              
              const isSearching = searchQuery.trim().length > 0;
              const isMatch = isSearching && topMatchId === doc.id;
              const isActive = activeVectorId === doc.id || isMatch;

              return (
                <button
                  key={doc.id}
                  onClick={() => setActiveVectorId(activeVectorId === doc.id ? null : doc.id)}
                  style={{ left: `${xPct}%`, top: `${yPct}%` }}
                  title={`${doc.source} Vector: [${valX}, ${valY}, ${valZ}]`}
                  className={`absolute w-3.5 h-3.5 -ml-1.5 -mt-1.5 rounded-full flex items-center justify-center transition duration-240 cursor-pointer ${
                    isMatch
                      ? "bg-emerald-400 ring-4 ring-emerald-500/30 animate-pulse scale-125 z-30" 
                      : isActive
                      ? "bg-blue-400 ring-4 ring-blue-500/20 scale-110 z-20"
                      : doc.category === "code"
                      ? "bg-amber-500/80 hover:bg-amber-400 hover:scale-110"
                      : "bg-[#818cf8]/80 hover:bg-[#6366f1] hover:scale-110"
                  }`}
                >
                  {doc.category === "code" ? (
                    <Code className="w-1.5 h-1.5 text-black" />
                  ) : (
                    <MessageSquare className="w-1.5 h-1.5 text-black" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Hover / click status message */}
          <div className="text-[7.5px] uppercase text-white/20 font-bold flex justify-between tracking-wider">
            <span>Orange = Active Snippets</span>
            <span className="text-emerald-400/40">Purple = Chat Logs</span>
          </div>
        </div>

        {/* Real Similarity Search interface */}
        <div className="border border-white/5 bg-white/[0.01] p-3 rounded-2xl space-y-3">
          <div className="text-[10px] text-white/50 font-bold flex items-center justify-between uppercase tracking-widest">
            <span className="flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-emerald-400" /> Vector Similarity Retrieve
            </span>
            {searchQuery.trim() && (
              <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 rounded-full font-bold">
                Dynamic RAG Engine
              </span>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Query vector database (e.g. shares, credentials, portfolio)..."
              className="w-full bg-[#050505] text-white/80 border border-white/10 rounded-xl px-3 py-2 text-[10.5px] focus:outline-none focus:border-emerald-500/45 focus:bg-[#070707] placeholder-white/20 transition duration-150 pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-white/30 hover:text-white/60 font-black cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          {/* Similarity outputs */}
          <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
            {queryResults.slice(0, 3).map((doc) => {
              const isTop = topMatchId === doc.id;
              return (
                <div
                  key={doc.id}
                  className={`p-2 rounded-xl border transition ${
                    isTop
                      ? "border-emerald-500/30 bg-emerald-500/5 text-white"
                      : "border-white/5 bg-black/20 text-white/60"
                  }`}
                >
                  <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-wider mb-1">
                    <span className="flex items-center gap-1 font-bold">
                      {doc.category === "code" ? (
                        <Code className="w-2.5 h-2.5 text-amber-400" />
                      ) : (
                        <MessageSquare className="w-2.5 h-2.5 text-indigo-400" />
                      )}
                      {doc.source}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[7.5px] ${isTop ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-white/40"}`}>
                      Cosine distance: {doc.score > 0 ? doc.score.toFixed(3) : "0.000"}
                    </span>
                  </div>
                  <p className="text-[9.5px] line-clamp-2 leading-relaxed text-white/70 font-mono">
                    {doc.text}
                  </p>
                </div>
              );
            })}
            {documents.length === 0 && (
              <div className="text-center py-5 text-white/30 text-[9px] uppercase tracking-wider">
                No active document embeddings indexed.
              </div>
            )}
          </div>
        </div>

        {/* Index New Code or Context Form */}
        <form onSubmit={handleCreateDocument} className="border border-white/5 bg-white/[0.01] p-3 rounded-2xl flex flex-col gap-2.5">
          <div className="text-[10px] text-white/50 font-bold flex items-center justify-between uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-emerald-400" /> Index Context Chunk
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[8px] text-white/30 block mb-1 uppercase tracking-wider">Filename/Tag</span>
              <input
                type="text"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                className="w-full bg-[#050505] border border-white/10 text-white/80 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-emerald-500/20"
              />
            </div>
            <div>
              <span className="text-[8px] text-white/30 block mb-1 uppercase tracking-wider">Vector Type</span>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="w-full bg-[#050505] border border-white/10 text-white/80 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-emerald-500/20"
              >
                <option value="code">Active Snippets</option>
                <option value="history">Conversation Turn</option>
              </select>
            </div>
          </div>

          <div>
            <span className="text-[8px] text-white/30 block mb-1 uppercase tracking-wider">Source Content / Payload</span>
            <textarea
              required
              rows={2}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Paste code segments or metadata to vector index..."
              className="w-full bg-[#050505] text-white/80 border border-white/10 rounded px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-emerald-400/25 focus:bg-[#070707] placeholder-white/20 font-mono resize-none leading-relaxed"
            />
          </div>

          <button
            type="submit"
            className="w-full py-1.5 bg-emerald-500 text-black font-black uppercase text-[9px] rounded-lg hover:bg-emerald-400 transition tracking-widest cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Vectorize Code Segment
          </button>
        </form>
      </div>

      {/* Selected Node Inspector Details if active */}
      {activeVectorId && (
        <div className="p-3 border-t border-white/5 bg-[#050505] text-[9.5px]">
          {(() => {
            const doc = documents.find(d => d.id === activeVectorId);
            if (!doc) return null;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-white uppercase">Inspection Panel</span>
                  <button onClick={() => setActiveVectorId(null)} className="text-white/40 hover:text-white uppercase">Close</button>
                </div>
                <div className="grid grid-cols-2 text-[8px] text-white/40 uppercase font-semibold">
                  <span>Source: {doc.source}</span>
                  <span>Vector: [{doc.embedding.map(n => n.toFixed(1)).join(", ")}]</span>
                </div>
                <pre className="p-2 bg-white/5 rounded border border-white/5 text-[8.5px] max-h-[80px] overflow-y-auto leading-relaxed text-white/80 font-mono break-all whitespace-pre-wrap">
                  {doc.text}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    onRemoveDocument(doc.id);
                    setActiveVectorId(null);
                  }}
                  className="text-red-400 hover:text-red-300 font-bold uppercase underline"
                >
                  De-index Vector
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
