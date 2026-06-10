import React, { useState } from "react";
import { CodeFile } from "../types";
import { Terminal, Play, CheckCircle2, AlertTriangle, FileCode, RotateCcw, HelpCircle } from "lucide-react";

interface CodeSandboxProps {
  files: CodeFile[];
  onUpdateFile: (name: string, code: string) => void;
  onSendToSnow: (fileName: string, fileContent: string) => void;
}

const BOILERPLATE_FILES: CodeFile[] = [
  {
    name: "calculate_shares.js",
    code: `// CRISIS IN PROGRESS: Divide by zero bug in portfolio weight math!
function evaluateWeights(sharesCount, stockValue) {
  const result = [];
  const totalValue = sharesCount * stockValue;
  
  // CRITICAL FAILURE HERE: If sharesCount is 0, totals become 0
  const factor = 100 / totalValue; 
  
  const weight = stockValue * factor;
  return weight;
}

const report = evaluateWeights(0, 150);
console.log("Equity Weight Calculated:", report);
`
  },
  {
    name: "user_lookup.js",
    code: `// CRITICAL ERROR: Unhandled null object reference on record query
const databaseMock = {
  "id-9081": { name: "Navis Donel", credentials: { level: "Admin" } },
  "id-1022": { name: "Snow Agent" } // Note: Missing 'credentials' sub-object!
};

function fetchUserClearance(id) {
  const user = databaseMock[id];
  console.log("Searching user:", user.name);
  
  // ReferenceError/TypeError crash will occur here for id-1022
  const status = user.credentials.level; 
  return status;
}

const clearance = fetchUserClearance("id-1022");
console.log("Clearance Status Approved:", clearance);
`
  },
  {
    name: "custom_formula.js",
    code: `// Snow Clean Sandbox Scratchpad. Write your own JS code here!
function computeMatrix() {
  const kernel = [1.2, 3.4, 5.6];
  const sum = kernel.reduce((acc, v) => acc + v, 0);
  return { 
    status: "Snow OS Normal",
    integrity: sum > 5 ? "Secured" : "Low",
    score: (sum * 4.2).toFixed(2)
  };
}

console.log("Executing computeMatrix():", JSON.stringify(computeMatrix()));
`
  }
];

export default function CodeSandbox({
  files,
  onUpdateFile,
  onSendToSnow,
}: CodeSandboxProps) {
  const [selectedFileName, setSelectedFileName] = useState<string>("calculate_shares.js");
  const [editorContent, setEditorContent] = useState<string>(BOILERPLATE_FILES[0].code);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "SNOW E2B v2.1 Container system ready.",
    "Root volume standard mount complete.",
    "Select an investigation file to begin debugging."
  ]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);

  const handleSelectFile = (name: string) => {
    setSelectedFileName(name);
    const activeF = files.find(f => f.name === name) || BOILERPLATE_FILES.find(f => f.name === name);
    if (activeF) {
      setEditorContent(activeF.code);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const freshVal = e.target.value;
    setEditorContent(freshVal);
    onUpdateFile(selectedFileName, freshVal);
  };

  const resetBoilerplates = () => {
    const matched = BOILERPLATE_FILES.find(b => b.name === selectedFileName);
    if (matched) {
      setEditorContent(matched.code);
      onUpdateFile(selectedFileName, matched.code);
      setTerminalLogs(prev => [...prev, `[RESET] Restored ${selectedFileName} to initial bug state.`]);
    }
  };

  const executeContainerScript = () => {
    setIsRunning(true);
    setIsSuccess(null);
    setTerminalLogs(prev => [
      ...prev,
      `--- EXECUTING ${selectedFileName.toUpperCase()} ---`,
      `[SANDBOX] Spinning up isolated E2B micro-container...`,
      `[SANDBOX] Mapping volume read/write...`,
      `[SANDBOX] Executing V8 Virtual Machine...`
    ]);

    setTimeout(() => {
      try {
        const rawCaptured: string[] = [];
        const sandboxConsole = {
          log: (...args: any[]) => {
            rawCaptured.push(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "));
          }
        };

        const runnable = `
          (function(console) {
            ${editorContent}
          })(sandboxConsole);
        `;

        const runner = new Function("sandboxConsole", runnable);
        runner(sandboxConsole);

        setTerminalLogs(prev => [
          ...prev,
          ...rawCaptured,
          `[E2B CONTAINER SUCCESS] Thread complete. Exit code 0.`
        ]);
        setIsSuccess(true);
      } catch (err: any) {
        setTerminalLogs(prev => [
          ...prev,
          `🚨 RUNTIME EXCEPTION CRASH DETECTED 🚨`,
          `[CRITICAL ERROR] ${err.name}: ${err.message}`,
          err.stack ? `  at ${err.stack.split("\n")[1]?.trim() || "anonymous:6:14"}` : "  at stackframe trace unavailable",
          `[E2B CONTAINER FAILURE] Aborted thread execution. Exit code 1.`
        ]);
        setIsSuccess(false);
      } finally {
        setIsRunning(false);
      }
    }, 1200);
  };

  return (
    <div className="flex flex-col h-full text-xs font-mono" id="sandbox-parent">
      {/* File Selectors Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span className="font-sans text-[11px] font-bold text-white/60 tracking-widest uppercase">
            Code Sandbox
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {BOILERPLATE_FILES.map((f) => (
            <button
              key={f.name}
              onClick={() => handleSelectFile(f.name)}
              className={`px-2.5 py-1 border text-[9px] font-bold tracking-wide rounded-lg transition uppercase duration-155 cursor-pointer ${
                selectedFileName === f.name
                  ? "border-white/20 bg-white/5 text-white font-black"
                  : "border-white/5 bg-transparent text-white/40 hover:text-white/80"
              }`}
            >
              {f.name.split("_")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-transparent flex flex-col p-4 gap-4 overflow-hidden">
        {/* Editor Area */}
        <div className="relative border border-white/5 bg-[#050505]/40 rounded-2xl overflow-hidden flex flex-col h-[200px]">
          <div className="bg-[#050505]/80 border-b border-white/5 px-4 py-2 flex items-center justify-between">
            <span className="text-[9.5px] text-white/40 flex items-center gap-1.5 uppercase font-bold tracking-wider">
              <FileCode className="w-3.5 h-3.5 text-blue-400" /> sandbox-isolated:///{selectedFileName}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={resetBoilerplates}
                title="Restore default broken code to try debugging again!"
                className="text-[9.5px] text-white/40 hover:text-white/80 flex items-center gap-1 cursor-pointer font-bold uppercase tracking-wider"
              >
                <RotateCcw className="w-3 h-3" /> Reset Source
              </button>
            </div>
          </div>
          
          <textarea
            value={editorContent}
            onChange={handleCodeChange}
            className="flex-1 bg-transparent p-4 text-white/80 focus:outline-none resize-none overflow-y-auto leading-relaxed text-[11px] font-mono selection:bg-white/10"
          />

          {/* Action strip overlay */}
          <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-[#050505]/90 p-1.5 border border-white/5 rounded-full backdrop-blur-md">
            <button
              onClick={() => onSendToSnow(selectedFileName, editorContent)}
              className="px-3 py-1 bg-transparent hover:bg-white/5 border border-white/10 text-white/80 rounded-full text-[9px] uppercase tracking-wider font-bold transition cursor-pointer flex items-center gap-1 font-sans"
            >
              <HelpCircle className="w-3" /> Ask Snow To Debug
            </button>
            
            <button
              onClick={executeContainerScript}
              disabled={isRunning}
              className="px-4 py-1 bg-white hover:bg-neutral-200 border-none text-black rounded-full text-[9px] uppercase tracking-widest font-black transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer font-sans"
            >
              <Play className={`w-3 h-3 ${isRunning ? "animate-spin" : ""}`} /> 
              {isRunning ? "Running..." : "Run Source"}
            </button>
          </div>
        </div>

        {/* Console logs */}
        <div className="flex-1 border border-white/5 bg-[#050505]/40 rounded-2xl p-4 overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2 font-semibold font-sans">
            <span className="text-[10px] text-white/60 flex items-center gap-2 uppercase tracking-widest">
              <span className="h-2 w-2 rounded-full bg-blue-400" /> Sandbox Output Terminal
            </span>
            {isSuccess !== null && (
              <div className="flex items-center gap-1 text-[10px]">
                {isSuccess ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> SUCCEEDED
                  </span>
                ) : (
                  <span className="text-rose-400 flex items-center gap-1 font-bold animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" /> CRASHED
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto text-white/60 text-[10px] space-y-1.5 font-mono pr-1">
            {terminalLogs.map((log, idx) => (
              <div
                key={idx}
                className={
                  log.includes("🚨") || log.includes("[CRITICAL ERROR]")
                    ? "text-rose-400 bg-rose-500/5 px-2.5 py-1.5 border-l-2 border-rose-500 font-bold rounded-r"
                    : log.includes("SUCCEEDED") || log.includes("Exit code 0")
                    ? "text-emerald-400 font-bold"
                    : log.includes("--- EXECUTING")
                    ? "text-blue-400 font-bold border-t border-white/5 pt-2"
                    : "text-white/40"
                }
              >
                {log}
              </div>
            ))}
          </div>

          <div className="text-[9px] text-white/20 mt-2 flex items-center justify-between font-bold uppercase tracking-wider">
            <span>CONTAINER STATUS: ACTIVE</span>
            <button
              onClick={() => setTerminalLogs(["[CLEAN] Terminal cache flushed."])}
              className="text-white/40 hover:text-white/80 cursor-pointer"
            >
              Clear Screen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
