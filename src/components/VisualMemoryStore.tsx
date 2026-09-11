import React, { useState, useEffect } from "react";
import { Eye, EyeOff, Search, Trash2, Camera, Monitor, Clock, Sparkles, RefreshCw, ZoomIn, X, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export interface VisualEpisodeItem {
  id: string;
  source: string;
  scene: string;
  objects: string;
  activity?: string;
  thumbnail?: string;
  timestamp: string;
}

interface VisualMemoryStoreProps {
  autoObserve: boolean;
  onToggleAutoObserve: () => void;
  onCaptureSnapshot: () => void;
  isCameraActive: boolean;
  isScreenActive: boolean;
}

export const VisualMemoryStore: React.FC<VisualMemoryStoreProps> = ({
  autoObserve,
  onToggleAutoObserve,
  onCaptureSnapshot,
  isCameraActive,
  isScreenActive
}) => {
  const [episodes, setEpisodes] = useState<VisualEpisodeItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<VisualEpisodeItem | null>(null);

  const fetchEpisodes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/snow/vision/episodes");
      if (res.ok) {
        const data = await res.json();
        setEpisodes(data.episodes || []);
      }
    } catch (err) {
      console.warn("Failed to fetch visual episodes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEpisodes();
    const interval = setInterval(fetchEpisodes, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/snow/vision/episodes/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEpisodes(prev => prev.filter(ep => ep.id !== id));
      }
    } catch (err) {
      console.warn("Failed to delete episode:", err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Clear all episodic visual memories?")) return;
    try {
      const res = await fetch("/api/snow/vision/episodes", { method: "DELETE" });
      if (res.ok) {
        setEpisodes([]);
      }
    } catch (err) {
      console.warn("Failed to clear episodes:", err);
    }
  };

  const filteredEpisodes = episodes.filter(ep => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      ep.scene.toLowerCase().includes(q) ||
      ep.objects.toLowerCase().includes(q) ||
      (ep.activity && ep.activity.toLowerCase().includes(q)) ||
      ep.source.toLowerCase().includes(q)
    );
  });

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return date.toLocaleDateString();
    } catch {
      return isoString;
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-4 space-y-4 font-sans text-slate-100 overflow-hidden">
      {/* ── Header Control Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/30 backdrop-blur-md shadow-[0_0_30px_rgba(6,182,212,0.08)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <Eye className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold font-mono tracking-wider text-white">ASTRA EPISODIC MEMORY</h2>
              <span className="px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 font-mono text-[10px] text-cyan-300 font-extrabold">
                {episodes.length} RECORDED
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Where did I leave my items? Spatial observations indexed via Gemini Multimodal.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onToggleAutoObserve}
            className={`px-3 py-1.5 rounded-xl border font-mono text-xs font-bold flex items-center gap-1.5 transition-all duration-300 cursor-pointer ${
              autoObserve
                ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                : "bg-slate-950/80 border-slate-700 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-300"
            }`}
            title="Automatically captures keyframes every 14s when camera or screen share is active"
          >
            {autoObserve ? <Eye className="w-3.5 h-3.5 animate-pulse" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>AUTO-OBSERVE {autoObserve ? "ON (14s)" : "OFF"}</span>
          </button>

          <button
            onClick={onCaptureSnapshot}
            disabled={!isCameraActive && !isScreenActive}
            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 font-mono text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Capture an instant scene memory right now"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>SNAPSHOT NOW</span>
          </button>

          <button
            onClick={fetchEpisodes}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition cursor-pointer"
            title="Refresh memory store"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          {episodes.length > 0 && (
            <button
              onClick={handleClearAll}
              className="p-2 rounded-xl bg-rose-950/50 border border-rose-600/40 text-rose-300 hover:bg-rose-900/60 transition cursor-pointer"
              title="Clear all episodic memories"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Search Filter ── */}
      <div className="relative w-full">
        <Search className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search scene memories by object (e.g., 'keys', 'coffee', 'glasses', 'terminal', 'book')..."
          className="w-full bg-slate-950/80 border border-cyan-500/25 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Episode Cards Grid ── */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredEpisodes.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center p-8 rounded-2xl bg-slate-950/50 border border-dashed border-slate-800 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-300">
                {searchQuery ? `No visual memories found matching "${searchQuery}"` : "No visual episodic memories indexed yet"}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Enable your Webcam or Screen Share and click "SNAPSHOT NOW" or turn on "AUTO-OBSERVE" so Snow can remember what was seen in your space.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredEpisodes.map((ep) => (
              <motion.div
                key={ep.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                onClick={() => setSelectedSnapshot(ep)}
                className="group relative flex flex-col rounded-2xl bg-slate-950/90 border border-cyan-500/20 hover:border-cyan-400/60 shadow-lg hover:shadow-[0_0_25px_rgba(6,182,212,0.15)] transition-all duration-300 overflow-hidden cursor-pointer"
              >
                {/* Thumbnail Image Viewport */}
                {ep.thumbnail ? (
                  <div className="relative w-full h-36 bg-black overflow-hidden border-b border-cyan-500/15">
                    <img
                      src={ep.thumbnail}
                      alt={ep.scene}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-cyan-400/40 text-[9px] font-mono text-cyan-300 font-bold flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-cyan-400" />
                        {formatRelativeTime(ep.timestamp)}
                      </span>
                      <button
                        onClick={(e) => handleDelete(ep.id, e)}
                        className="p-1 rounded-lg bg-black/70 hover:bg-rose-950 border border-slate-700 hover:border-rose-500 text-slate-400 hover:text-rose-300 transition"
                        title="Delete memory"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-2 flex items-center gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase flex items-center gap-1 ${
                        ep.source === "screen"
                          ? "bg-emerald-950/80 border border-emerald-500/50 text-emerald-300"
                          : "bg-cyan-950/80 border border-cyan-500/50 text-cyan-300"
                      }`}>
                        {ep.source === "screen" ? <Monitor className="w-2.5 h-2.5" /> : <Camera className="w-2.5 h-2.5" />}
                        {ep.source}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 border-b border-cyan-500/15 flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="flex items-center gap-1 text-cyan-300 uppercase font-bold">
                      {ep.source === "screen" ? <Monitor className="w-3 h-3" /> : <Camera className="w-3 h-3" />}
                      {ep.source}
                    </span>
                    <div className="flex items-center gap-2">
                      <span>{formatRelativeTime(ep.timestamp)}</span>
                      <button
                        onClick={(e) => handleDelete(ep.id, e)}
                        className="text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Content Block */}
                <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-100 leading-snug line-clamp-2">
                      {ep.scene}
                    </h3>

                    {ep.activity && (
                      <p className="text-[11px] text-cyan-300/80 font-mono mt-1">
                        Activity: {ep.activity}
                      </p>
                    )}
                  </div>

                  {/* Objects Chips */}
                  {ep.objects && (
                    <div className="pt-2 border-t border-cyan-500/10 flex flex-wrap gap-1">
                      {ep.objects.split(",").map((obj, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded-md bg-slate-900 border border-cyan-500/25 text-[9.5px] font-mono text-cyan-200"
                        >
                          {obj.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ── Full Snapshot Modal ── */}
      <AnimatePresence>
        {selectedSnapshot && (
          <div
            onClick={() => setSelectedSnapshot(null)}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-2xl w-full rounded-2xl bg-slate-950 border border-cyan-500/40 p-5 space-y-4 shadow-[0_0_50px_rgba(6,182,212,0.25)] relative"
            >
              <button
                onClick={() => setSelectedSnapshot(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-700 transition"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 font-mono text-xs text-cyan-300 font-bold uppercase">
                  {selectedSnapshot.source}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {new Date(selectedSnapshot.timestamp).toLocaleString()} ({formatRelativeTime(selectedSnapshot.timestamp)})
                </span>
              </div>

              {selectedSnapshot.thumbnail && (
                <div className="w-full rounded-xl overflow-hidden border border-cyan-500/30 bg-black max-h-96 flex items-center justify-center">
                  <img
                    src={selectedSnapshot.thumbnail}
                    alt={selectedSnapshot.scene}
                    className="max-h-96 w-full object-contain"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <h4 className="text-sm font-bold text-white font-mono">Observed Scene:</h4>
                <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  {selectedSnapshot.scene}
                </p>
              </div>

              {selectedSnapshot.objects && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-400 font-mono">Detected Objects:</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSnapshot.objects.split(",").map((obj, i) => (
                      <span key={i} className="px-2 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-xs font-mono text-cyan-300">
                        {obj.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VisualMemoryStore;
