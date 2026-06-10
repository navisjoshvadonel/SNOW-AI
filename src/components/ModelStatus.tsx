import React, { useState, useEffect } from "react";
import { GitBranch, HardDrive, ShieldCheck, Zap, Activity } from "lucide-react";
import { SystemMetrics } from "../types";

interface ModelStatusProps {
  modelSelected: string;
  onChangeModel: (model: string) => void;
}

interface HybridModel {
  id: string;
  name: string;
  type: string;
  status: "ONLINE" | "STANDBY" | "OFFLINE";
  latency: number;
  parameters: string;
  useCase: string;
}

const MODELS_REGISTRY: HybridModel[] = [
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    type: "Cloud Core (Standard)",
    status: "ONLINE",
    latency: 90,
    parameters: "Multimodal Core",
    useCase: "Light conversation, low latency",
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    type: "Cloud Reasoning (Paid)",
    status: "ONLINE",
    latency: 185,
    parameters: "Deep Logic Tier",
    useCase: "Complex math & deep reasoning",
  },
  {
    id: "deepseek",
    name: "DeepSeek-Blaze",
    type: "Coding Specialist",
    status: "STANDBY",
    latency: 280,
    parameters: "671B MoE Core",
    useCase: "Deep syntax correctness & execution",
  },
  {
    id: "llama-3-8b",
    name: "Llama-3-8B Local",
    type: "Local Fast Conversation",
    status: "ONLINE",
    latency: 22,
    parameters: "8B Int4 Local",
    useCase: "Speedy everyday chats",
  },
  {
    id: "ollama",
    name: "Ollama Fallback",
    type: "Local Offline Engine",
    status: "ONLINE",
    latency: 8,
    parameters: "Offline Backup Node",
    useCase: "Private offline fallback",
  }
];

export default function ModelStatus({
  modelSelected,
  onChangeModel,
}: ModelStatusProps) {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu: 24,
    ram: 68,
    latency: 120,
    networkLoad: 12.4
  });

  // Oscillating metrics to look beautiful and realistic
  useEffect(() => {
    const timer = setInterval(() => {
      setMetrics((prev) => {
        const offsetCpu = (Math.random() - 0.5) * 8;
        const offsetRam = (Math.random() - 0.5) * 2;
        const activeM = MODELS_REGISTRY.find(m => m.id === modelSelected);
        const baselineLatency = activeM ? activeM.latency : 100;
        const offsetLatency = (Math.random() - 0.5) * 15;

        return {
          cpu: Math.max(10, Math.min(95, Math.round(prev.cpu + offsetCpu))),
          ram: Math.max(40, Math.min(99, Math.round(prev.ram + offsetRam))),
          latency: Math.max(5, Math.round(baselineLatency + offsetLatency)),
          networkLoad: Math.max(2, parseFloat((prev.networkLoad + (Math.random() - 0.5) * 1.5).toFixed(1)))
        };
      });
    }, 1500);

    return () => clearInterval(timer);
  }, [modelSelected]);

  const activeModelObj = MODELS_REGISTRY.find(m => m.id === modelSelected) || MODELS_REGISTRY[0];

  return (
    <div className="flex flex-col h-full text-xs font-mono select-none" id="model-status-parent">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-400" />
          <span className="font-sans text-[11px] font-bold text-white/60 tracking-widest uppercase">
            Active Intelligence Node
          </span>
        </div>
        <div className="text-[9px] text-white/50 px-2 py-1 border border-white/10 rounded bg-white/5 uppercase font-bold">
          {activeModelObj.name}
        </div>
      </div>

      <div className="flex-1 bg-transparent p-4 flex flex-col justify-between gap-4 overflow-y-auto">
        {/* Core gauges section */}
        <div className="grid grid-cols-2 gap-3">
          {/* CPU Gauge */}
          <div className="border border-white/5 rounded-2xl p-3 bg-white/[0.02] flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-white/5 pb-1.5 mb-1.5">
              <span className="text-[8px] uppercase tracking-wider text-white/40">Inference load</span>
              <Activity className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="flex items-center gap-3 py-1">
              {/* Spinning circular line outline */}
              <div className="relative w-12 h-12 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="2.5" />
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2.5"
                    strokeDasharray={`${metrics.cpu * 1.25} 125`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/80">
                  {metrics.cpu}%
                </div>
              </div>
              <div className="leading-tight">
                <span className="text-[12px] text-white/80 font-bold tracking-tight">CPU Core</span>
                <span className="text-[7.5px] text-white/30 block uppercase tracking-wider">Dynamic fit</span>
              </div>
            </div>
          </div>

          {/* RAM Gauge */}
          <div className="border border-white/5 rounded-2xl p-3 bg-white/[0.02] flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-white/5 pb-1.5 mb-1.5">
              <span className="text-[8px] uppercase tracking-wider text-white/40">VRAM usage</span>
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="flex items-center gap-3 py-1">
              <div className="relative w-12 h-12 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="2.5" />
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.5"
                    strokeDasharray={`${metrics.ram * 1.25} 125`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/80">
                  {metrics.ram}%
                </div>
              </div>
              <div className="leading-tight">
                <span className="text-[12px] text-white/80 font-bold tracking-tight">VRAM</span>
                <span className="text-[7.5px] text-white/30 block uppercase tracking-wider">Indexed sync</span>
              </div>
            </div>
          </div>
        </div>

        {/* Diagnostic parameters */}
        <div className="border border-white/5 bg-white/[0.01] p-3 rounded-2xl flex items-center justify-between text-[10px]">
          <div className="text-white/40 leading-normal space-y-1">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-blue-400" /> 
              <span>Latency:</span> 
              <span className="text-white/80 font-bold">{metrics.latency}ms</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 
              <span>Status:</span> 
              <span className="text-emerald-400 font-bold">100.0% Secure</span>
            </div>
          </div>
          <div className="text-right text-[8px] leading-relaxed text-white/20 uppercase tracking-widest">
            <div>Tunnel // Active</div>
            <div>Env // Sandbox</div>
          </div>
        </div>

        {/* Model Route selector */}
        <div className="space-y-2">
          <span className="text-[9px] text-white/40 uppercase tracking-widest block font-bold">
            Intelligence Routing Selection
          </span>
          <div className="space-y-1.5">
            {MODELS_REGISTRY.map((m) => (
              <button
                key={m.id}
                onClick={() => onChangeModel(m.id)}
                className={`w-full p-2.5 border rounded-2xl text-left transition relative cursor-pointer ${
                  modelSelected === m.id
                    ? "border-white/20 bg-white/5 text-white"
                    : "border-white/5 bg-transparent text-white/50 hover:border-white/10 hover:text-white/80"
                }`}
              >
                {modelSelected === m.id && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-400 rounded-full" />
                )}
                
                <div className="flex justify-between items-center mb-0.5">
                  <span className="font-bold font-sans text-[11px] tracking-wide">{m.name}</span>
                  <span className="text-[7.5px] text-white/30 font-normal uppercase tracking-wider">{m.type}</span>
                </div>
                <div className="flex justify-between items-center text-[8px] text-white/40">
                  <span>{m.useCase}</span>
                  <span className="font-mono text-[8px] text-blue-400 font-bold">~{m.latency}ms</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
