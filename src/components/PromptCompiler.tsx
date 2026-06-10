import React from "react";
import { MemoryNode } from "../types";
import { Cpu, ShieldAlert, BookOpen, Layers, Sparkles } from "lucide-react";

interface PromptCompilerProps {
  mode: "general" | "education" | "debugging" | "context_awareness";
  onChangeMode: (mode: "general" | "education" | "debugging" | "context_awareness") => void;
  memories: MemoryNode[];
  modelSelected: string;
}

export default function PromptCompiler({
  mode,
  onChangeMode,
  memories,
  modelSelected,
}: PromptCompilerProps) {
  // Compute what the compiled prompt looks like in real time!
  const compiledText = React.useMemo(() => {
    let systemInstruction = `You are JARVIS / SNOW, a highly adaptive, hyper-intelligent digital companion for the Snow AI agent project. Your tone is efficient, slightly witty, and deeply collaborative.

OPERATIONAL PROTOCOLS currently loaded:
`;

    if (mode === "education") {
      systemInstruction += `\n1. [PROTOCOL: EDUCATION MODE] When teaching, use the Feynman Technique. Break complex topics into simple analogies. Never just give the answer; guide the user to it step-by-step. Use leading questions to encourage their discovery.`;
    } else if (mode === "debugging") {
      systemInstruction += `\n1. [PROTOCOL: DEBUGGING MODE] Treat code as a crime scene. Always structure your response into these 3 distinct modules:
- 🔍 ROOT CAUSE: Analyze what fails and why.
- 🚨 IMMEDIATE FIX: Provide the exact fixed code block clearly.
- 🛡️ PREVENTION STRATEGY: Explain how to avoid this bug in the future.
Be extremely detailed, precise, and analytical. Code blocks must be flawless.`;
    } else if (mode === "context_awareness") {
      systemInstruction += `\n1. [PROTOCOL: CONTEXT AWARENESS] Explicitly check historical skill levels and currently loaded files in user project space. Match your technical depth perfectly to their expertise level.`;
    } else {
      systemInstruction += `\n1. [PROTOCOL: STANDARD MODE] Be sharp, highly resourceful, slightly witty, and quick. Maintain high-level technical intelligence.`;
    }

    if (modelSelected === "deepseek") {
      systemInstruction += `\n\n[simulated_core: DeepSeek-Blaze Node] Emulate a specialized high-reasoning coding assistant. Prioritize flawless syntax, computational efficiency, and architectural layouts.`;
    } else if (modelSelected === "llama-3-8b") {
      systemInstruction += `\n\n[simulated_core: Llama-3-8B Local Node] Emulate a lightweight local machine chat engine. Speak highly directly, avoid long introductions, focus on speed and brief answers.`;
    } else if (modelSelected === "ollama") {
      systemInstruction += `\n\n[simulated_core: Ollama Fallback Engine] Emulate a secure, strictly offline backup engine, emphasizing data localization and user-centric privacy.`;
    } else if (modelSelected === "gemini-3.1-pro-preview") {
      systemInstruction += `\n\n[core: Gemini 3.1 Pro Preview] Run advanced reasoning algorithms to tackle highly complex systemic requests.`;
    } else {
      systemInstruction += `\n\n[core: Gemini 3.5 Flash] Run lightning-fast, highly contextual conversational processing.`;
    }

    if (memories.length > 0) {
      systemInstruction += `\n\nADAPTIVE MEMORY LAYER ACTIVE CONTEXT:\n`;
      memories.forEach((mem) => {
        systemInstruction += `- User Relationship: [${mem.source}] ${mem.rel} [${mem.target}]\n`;
      });
      systemInstruction += `\nAdhere perfectly to these stored associations. If the user preferences or profile is mentioned above, adapt your responses to follow those guidelines.`;
    } else {
      systemInstruction += `\n\nADAPTIVE MEMORY LAYER ACTIVE CONTEXT:\n[Memory core empty. Waiting for associations]`;
    }

    return systemInstruction;
  }, [mode, memories, modelSelected]);

  return (
    <div className="flex flex-col h-full text-xs font-mono select-none" id="prompt-compiler-parent">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-400" />
          <span className="font-sans text-[11px] font-bold text-white/60 tracking-widest uppercase">
            Prompt Agent Compiler
          </span>
        </div>
      </div>

      <div className="flex-1 bg-transparent p-4 flex flex-col gap-4 overflow-hidden">
        {/* Toggle Protocol Cards */}
        <div>
          <span className="text-[9px] text-white/40 uppercase tracking-widest block mb-2 font-bold">
            Select Active Protocol Mode
          </span>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onChangeMode("general")}
              className={`p-2.5 border rounded-2xl text-left flex flex-col justify-between h-[60px] transition group relative overflow-hidden cursor-pointer ${
                mode === "general"
                  ? "border-white/20 bg-white/5 text-white"
                  : "border-white/5 bg-transparent text-white/40 hover:border-white/10 hover:text-white/60"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[9.5px] uppercase font-bold tracking-wider">01. Standard</span>
                <Sparkles className={`w-3.5 h-3.5 ${mode === "general" ? "text-blue-400" : "text-white/20"}`} />
              </div>
              <span className="text-[8px] leading-tight text-white/40 group-hover:text-white/60">
                Witty, intelligent cyber companion.
              </span>
            </button>

            <button
              onClick={() => onChangeMode("education")}
              className={`p-2.5 border rounded-2xl text-left flex flex-col justify-between h-[60px] transition group relative overflow-hidden cursor-pointer ${
                mode === "education"
                  ? "border-white/20 bg-white/5 text-white"
                  : "border-white/5 bg-transparent text-white/40 hover:border-white/10 hover:text-white/60"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[9.5px] uppercase font-bold tracking-wider">02. Feynman</span>
                <BookOpen className={`w-3.5 h-3.5 ${mode === "education" ? "text-blue-400" : "text-white/20"}`} />
              </div>
              <span className="text-[8px] leading-tight text-white/40 group-hover:text-white/60">
                Break complex topics down.
              </span>
            </button>

            <button
              onClick={() => onChangeMode("debugging")}
              className={`p-2.5 border rounded-2xl text-left flex flex-col justify-between h-[60px] transition group relative overflow-hidden cursor-pointer ${
                mode === "debugging"
                  ? "border-white/20 bg-white/5 text-white"
                  : "border-white/5 bg-transparent text-white/40 hover:border-white/10 hover:text-white/60"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[9.5px] uppercase font-bold tracking-wider">03. Crime Scene</span>
                <ShieldAlert className={`w-3.5 h-3.5 ${mode === "debugging" ? "text-blue-400" : "text-white/20"}`} />
              </div>
              <span className="text-[8px] leading-tight text-white/40 group-hover:text-white/60">
                Step-by-step rigorous root forensics.
              </span>
            </button>

            <button
              onClick={() => onChangeMode("context_awareness")}
              className={`p-2.5 border rounded-2xl text-left flex flex-col justify-between h-[60px] transition group relative overflow-hidden cursor-pointer ${
                mode === "context_awareness"
                  ? "border-white/20 bg-white/5 text-white"
                  : "border-white/5 bg-transparent text-white/40 hover:border-white/10 hover:text-white/60"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[9.5px] uppercase font-bold tracking-wider">04. Workspace</span>
                <Layers className={`w-3.5 h-3.5 ${mode === "context_awareness" ? "text-blue-400" : "text-white/20"}`} />
              </div>
              <span className="text-[8px] leading-tight text-white/40 group-hover:text-white/60">
                Align depth with user profiles.
              </span>
            </button>
          </div>
        </div>

        {/* Live Raw Compiler Preview */}
        <div className="flex-1 flex flex-col border border-white/10 rounded-2xl overflow-hidden relative bg-[#050505]/40 backdrop-blur-md">
          <div className="absolute top-2 right-3 bg-white/5 text-white/60 px-1.5 py-0.5 rounded text-[7px] uppercase tracking-widest font-bold border border-white/5">
            Compiled Live
          </div>
          <div className="border-b border-white/5 p-2 px-3 text-[9px] uppercase hover:bg-white/[0.02] flex items-center gap-1.5 text-white/50">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Compiled instruction matrix
          </div>
          <textarea
            readOnly
            value={compiledText}
            className="flex-1 p-3.5 bg-transparent text-white/80 overflow-y-auto leading-relaxed focus:outline-none select-text text-[10px] font-mono selection:bg-white/10"
          />
          <div className="p-2 border-t border-white/5 bg-[#050505] text-[8px] text-white/30 flex justify-between uppercase tracking-wider font-semibold">
            <span>MEMORIES: {memories.length} injected</span>
            <span>EST: ~{Math.ceil(compiledText.length / 4)} tokens</span>
          </div>
        </div>
      </div>
    </div>
  );
}
