/**
 * Types & Interfaces for the Snow AI Agent HUD Dashboard
 */

export interface MemoryNode {
  id: string;
  source: string;
  rel: string; // e.g. "Learns", "Prefers", "Configures"
  target: string;
}

export interface ChatHistoryItem {
  id: string;
  sender: "user" | "snow";
  text: string;
  timestamp: string;
  mode: "general" | "education" | "debugging" | "context_awareness";
  simulatedModel?: string;
  compiledPrompt?: string;
}

export interface CodeFile {
  name: string;
  code: string;
}

export interface SystemMetrics {
  cpu: number;
  ram: number;
  latency: number;
  networkLoad: number;
}
