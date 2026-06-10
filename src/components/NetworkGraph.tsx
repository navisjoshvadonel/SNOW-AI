import React, { useState, useMemo } from "react";
import { MemoryNode } from "../types";
import { GitCommit, Plus, BrainCircuit, Terminal, Sparkles } from "lucide-react";

interface NetworkGraphProps {
  memories: MemoryNode[];
  onAddMemory: (source: string, rel: string, target: string) => void;
  onDeleteMemory: (id: string) => void;
  onClearMemories: () => void;
}

// Map names to specific node categories for Neo4j simulation styling
function getNodeCategory(name: string): "User" | "Preference" | "Skill" | "Course" {
  const lower = name.toLowerCase();
  if (lower === "user" || lower === "navis" || lower === "admin") return "User";
  if (lower.includes("strict") || lower.includes("compact") || lower.includes("style") || lower.includes("tone") || lower.includes("jargon") || lower.includes("witty")) {
    return "Preference";
  }
  if (lower.includes("python") || lower.includes("rust") || lower.includes("javascript") || lower.includes("sql") || lower.includes("typescript") || lower.includes("react") || lower.includes("docker")) {
    return "Skill";
  }
  return "Course";
}

// Color matching dictionary for Cypher/Neo4j labels
const CATEGORY_COLORS = {
  User: { bg: "rgba(16, 185, 129, 0.12)", stroke: "#10b981", bullet: "#10b981", text: "#a7f3d0" },
  Preference: { bg: "rgba(245, 158, 11, 0.12)", stroke: "#f59e0b", bullet: "#f59e0b", text: "#fde68a" },
  Skill: { bg: "rgba(59, 130, 246, 0.12)", stroke: "#3b82f6", bullet: "#3b82f6", text: "#bfdbfe" },
  Course: { bg: "rgba(236, 72, 153, 0.12)", stroke: "#ec4899", bullet: "#ec4899", text: "#fbcfe8" },
};

export default function NetworkGraph({
  memories,
  onAddMemory,
  onDeleteMemory,
  onClearMemories,
}: NetworkGraphProps) {
  const [source, setSource] = useState("User");
  const [rel, setRel] = useState("Prefers");
  const [target, setTarget] = useState("");
  const [activeNode, setActiveNode] = useState<string | null>(null);

  // Cypher Console Playground state
  const [cypherQuery, setCypherQuery] = useState("MATCH (u:User)-[r]->(m) RETURN u, r, m");
  const [cypherLogs, setCypherLogs] = useState<string[]>([
    "BOLT V4.4 Connected to Neo4j Instance [neo4js://localhost:7687]",
    "Database 'neo4j' online. Storing 3 default nodes.",
  ]);

  // Derive unique nodes for plotting
  const graphData = useMemo(() => {
    const nodeSet = new Set<string>();
    memories.forEach((m) => {
      nodeSet.add(m.source);
      nodeSet.add(m.target);
    });

    const uniqueNodes = Array.from(nodeSet);
    const nodePositions: Record<string, { x: number; y: number }> = {};
    const width = 450;
    const height = 230;
    const centerX = width / 2;
    const centerY = height / 2;

    uniqueNodes.forEach((nodeName, index) => {
      const category = getNodeCategory(nodeName);
      if (category === "User") {
        nodePositions[nodeName] = { x: centerX, y: centerY };
      } else {
        const totalOuter = uniqueNodes.filter(n => getNodeCategory(n) !== "User").length;
        const outerIndex = uniqueNodes.filter((n, i) => getNodeCategory(n) !== "User" && i < index).length;
        
        const angle = (outerIndex / (totalOuter || 1)) * 2 * Math.PI - (Math.PI / 2);
        const radius = totalOuter > 5 ? 100 : 75;
        nodePositions[nodeName] = {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        };
      }
    });

    return { uniqueNodes, nodePositions };
  }, [memories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.trim() || !rel.trim() || !target.trim()) return;

    // Simulate committing Neo4j transaction
    const cleanT = target.trim();
    onAddMemory(source.trim(), rel.trim(), cleanT);
    
    // Add transaction log
    setCypherLogs(prev => [
      ...prev,
      `cypher> CREATE (n:${getNodeCategory(source)})-[r:${rel.toUpperCase()}]->(t:${getNodeCategory(cleanT)} {name: "${cleanT}"})`,
      `Neo4j Transaction Succeeded: Added 1 relationship, created 1 node.`
    ]);

    setTarget("");
  };

  // Run a custom Cypher command
  const handleRunCypher = () => {
    const trimmed = cypherQuery.trim();
    if (!trimmed) return;

    if (trimmed.toLowerCase().includes("create")) {
      // Parse a quick Cypher statement e.g. CREATE (User)-[:LEARNS]->(Docker)
      const match = trimmed.match(/create\s+\(\w+\)-?\[:(\w+)\]->?\((\w+)\)/i);
      if (match) {
        const relation = match[1];
        const dest = match[2];
        onAddMemory("User", relation, dest);
        setCypherLogs(prev => [
          ...prev,
          `cypher> ${trimmed}`,
          `Graph committed 1 new link. Node '${dest}' mapped in Neo4j index.`
        ]);
      } else {
        setCypherLogs(prev => [
          ...prev,
          `cypher> ${trimmed}`,
          `[Cypher Error] Invalid syntax. Try template 'CREATE (User)-[:LEARNS]->(Docker)'`
        ]);
      }
    } else if (trimmed.toLowerCase().includes("delete") || trimmed.toLowerCase().includes("purge")) {
      onClearMemories();
      setCypherLogs(prev => [
        ...prev,
        `cypher> ${trimmed}`,
        `Graph truncated. Cleared all Neo4j indices and relationships.`
      ]);
    } else {
      // Default query output
      setCypherLogs(prev => [
        ...prev,
        `cypher> ${trimmed}`,
        `MATCH returned ${memories.length} relationships across ${graphData.uniqueNodes.length} active labels.`
      ]);
    }
  };

  return (
    <div className="flex flex-col h-full text-xs font-mono select-none" id="neo4j-graph-parent">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-blue-400" />
          <span className="font-sans text-[11px] font-bold text-white/60 tracking-widest uppercase">
            Neo4j Knowledge Graph
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
            Long-term Profile
          </span>
        </div>
      </div>

      {/* Main Canvas area */}
      <div className="flex-1 bg-transparent p-4 flex flex-col gap-4 overflow-y-auto max-h-[500px]">
        
        {/* Dynamic Nodes Guide Legend */}
        <div className="grid grid-cols-4 gap-1 p-2 bg-white/[0.01] border border-white/5 rounded-xl text-[7.5px] uppercase font-bold tracking-wider text-center text-white/50">
          <div className="flex items-center justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" /> User
          </div>
          <div className="flex items-center justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" /> Prefs
          </div>
          <div className="flex items-center justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6]" /> Skill
          </div>
          <div className="flex items-center justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ec4899]" /> Course
          </div>
        </div>

        {/* Visual Graph Panel */}
        <div className="relative border border-white/5 bg-[#050505]/40 rounded-2xl overflow-hidden h-[210px] flex-shrink-0">
          <svg className="w-full h-full" viewBox="0 0 450 210">
            {/* Background graph guidelines */}
            <circle cx="225" cy="105" r="95" fill="none" stroke="rgba(255, 255, 255, 0.02)" strokeWidth="1" strokeDasharray="6 6" />
            <circle cx="225" cy="105" r="50" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1.5" />
            
            {/* Edges of Graph (links) */}
            {memories.map((link, idx) => {
              const start = graphData.nodePositions[link.source];
              const end = graphData.nodePositions[link.target];
              if (!start || !end) return null;

              return (
                <g key={`edge-${link.id}-${idx}`}>
                  {/* Neon line bridges */}
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="1.2"
                  />
                  {/* Vector flow animation */}
                  <circle r="2.5" fill="#60a5fa">
                    <animateMotion
                      dur="5s"
                      repeatCount="indefinite"
                      path={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                    />
                  </circle>
                  
                  {/* Label tag bridge */}
                  <rect
                    x={(start.x + end.x) / 2 - 25}
                    y={(start.y + end.y) / 2 - 5}
                    width="50"
                    height="10"
                    rx="2"
                    fill="#050505"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                  />
                  <text
                    x={(start.x + end.x) / 2}
                    y={(start.y + end.y) / 2 + 2.5}
                    fill="#94a3b8"
                    fontSize="6"
                    textAnchor="middle"
                    className="font-bold uppercase tracking-wider"
                  >
                    {link.rel}
                  </text>
                </g>
              );
            })}

            {/* Nodes representation */}
            {graphData.uniqueNodes.map((nodeName) => {
              const pos = graphData.nodePositions[nodeName];
              if (!pos) return null;
              
              const cat = getNodeCategory(nodeName);
              const styling = CATEGORY_COLORS[cat];
              const isCenter = cat === "User";
              const isHighlighted = activeNode === nodeName;

              return (
                <g
                  key={`node-${nodeName}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="cursor-pointer"
                  onClick={() => setActiveNode(isHighlighted ? null : nodeName)}
                >
                  <circle
                    r={isCenter ? 14 : 9}
                    fill={styling.bg}
                    stroke={styling.stroke}
                    strokeWidth={isHighlighted ? 2.5 : 1}
                  />
                  <circle r={isCenter ? 4 : 2} fill={styling.bullet} />
                  
                  {/* Floating labels */}
                  <rect
                    x="-35"
                    y={isCenter ? "16" : "11"}
                    width="70"
                    height="11"
                    rx="2"
                    fill="rgba(5, 5, 5, 0.95)"
                    stroke={styling.stroke}
                    strokeWidth="0.8"
                  />
                  <text
                    y={isCenter ? "23" : "18"}
                    fill="#ffffff"
                    fontSize="6.5"
                    textAnchor="middle"
                    className="font-semibold uppercase tracking-wider font-sans text-white"
                  >
                    {nodeName.length > 8 ? `${nodeName.slice(0, 7)}..` : nodeName}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Quick Node Inspector status overlay */}
          <div className="absolute bottom-2 left-2 right-2 bg-[#050505]/95 p-2 border border-white/5 rounded-xl text-[8px] flex items-center justify-between">
            <div className="text-white/40">
              {activeNode ? (
                <span>
                  SELECTED: (:{getNodeCategory(activeNode)} {`{name: "${activeNode}"}`})
                </span>
              ) : (
                <span>Click nodes to map learning histories & clearances</span>
              )}
            </div>
            {activeNode && !["user", "navis"].includes(activeNode.toLowerCase()) && (
              <button
                onClick={() => {
                  const toDelete = memories.find(m => m.source === activeNode || m.target === activeNode);
                  if (toDelete) onDeleteMemory(toDelete.id);
                  setActiveNode(null);
                  setCypherLogs(prev => [...prev, `cypher> DETACH DELETE nodes matched: '${activeNode}'`]);
                }}
                className="text-red-400 hover:text-red-300 underline font-bold uppercase cursor-pointer"
              >
                Prune
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Cypher Query Sandbox Console */}
        <div className="border border-white/5 bg-white/[0.01] p-3 rounded-2xl space-y-2.5">
          <div className="text-[10px] text-white/50 font-bold flex items-center justify-between uppercase tracking-widest">
            <span className="flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5 text-blue-400" /> Cypher Query Console
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={cypherQuery}
              onChange={(e) => setCypherQuery(e.target.value)}
              placeholder="e.g. CREATE (User)-[:LEARNS]->(Rust)"
              className="flex-1 bg-[#050505] border border-white/10 rounded-xl px-2.5 py-1.5 text-[10px] focus:outline-none focus:border-blue-400/40"
            />
            <button
              onClick={handleRunCypher}
              className="px-3 bg-white text-black font-black uppercase text-[8px] rounded-xl hover:bg-neutral-200 transition duration-150 flex items-center justify-center gap-1 cursor-pointer font-sans"
            >
              RUN
            </button>
          </div>

          {/* Cypher Logs feed */}
          <div className="p-2 border border-white/5 bg-[#030303]/80 rounded-xl max-h-[85px] overflow-y-auto space-y-1 text-[8.5px] pr-1 scrollbar-thin">
            {cypherLogs.map((log, idx) => (
              <div
                key={idx}
                className={log.startsWith("cypher>") ? "text-blue-400" : log.includes("Succeeded") ? "text-emerald-400 font-bold" : "text-white/40"}
              >
                {log}
              </div>
            ))}
          </div>
        </div>

        {/* Association Form */}
        <form onSubmit={handleSubmit} className="p-3 bg-white/[0.01] border border-white/5 rounded-2xl flex flex-col gap-2.5">
          <div className="text-[10px] text-white/50 font-bold flex items-center gap-1 uppercase tracking-widest">
            <Plus className="w-3.5 h-3.5 text-blue-400" /> Map User Relationship (Neo4j)
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[8px] text-white/30 block mb-1 uppercase tracking-wider">Source</span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full bg-[#050505] border border-white/10 text-white/80 rounded px-2 py-1 text-[10px] focus:outline-none"
              >
                <option value="User">User</option>
                <option value="Admin">Admin</option>
                <option value="System">System</option>
              </select>
            </div>
            <div>
              <span className="text-[8px] text-white/30 block mb-1 uppercase tracking-wider">Type</span>
              <select
                value={rel}
                onChange={(e) => setRel(e.target.value)}
                className="w-full bg-[#050505] border border-white/10 text-white/80 rounded px-2 py-1 text-[10px] focus:outline-none"
              >
                <option value="Prefers">Prefers</option>
                <option value="Learns">Learns</option>
                <option value="Completed">Completed</option>
                <option value="Tested">Tested</option>
                <option value="Avoids">Avoids</option>
              </select>
            </div>
            <div>
              <span className="text-[8px] text-white/30 block mb-1 uppercase tracking-wider">Target Node</span>
              <input
                type="text"
                placeholder="e.g. strict tone"
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full bg-[#050505] border border-white/10 text-white/90 rounded px-2 py-1 text-[10px] focus:outline-none placeholder-white/20"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-1.5 text-center bg-white text-black font-semibold tracking-widest uppercase text-[9px] rounded-xl hover:bg-neutral-200 transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
          >
            <GitCommit className="w-3.5 h-3.5" /> Execute 'CREATE' Transaction
          </button>
        </form>
      </div>
    </div>
  );
}
