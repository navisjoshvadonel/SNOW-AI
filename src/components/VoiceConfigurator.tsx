import React from "react";
import { Headphones, AudioLines, Settings2, Info } from "lucide-react";

export interface VoiceChoice {
  id: string;
  name: string;
  gender: string;
  description: string;
  isBackend: boolean;
}

interface VoiceConfiguratorProps {
  selectedVoice: string;
  onVoiceChange: (voiceId: string) => void;
  voiceSpeed: number;
  onVoiceSpeedChange: (speed: number) => void;
  isBackendVoice: boolean;
  onBackendToggle: (isBackend: boolean) => void;
}

const BACKEND_VOICES: VoiceChoice[] = [
  { id: "Aoede", name: "Aoede (Recommended)", gender: "Female", description: "Smooth, elegant, and highly expressive female companion voice.", isBackend: true },
  { id: "Kore", name: "Kore (Warm Wood)", gender: "Female", description: "Soft, warm, friendly and natural vocal companion.", isBackend: true },
  { id: "Zephyr", name: "Zephyr (Bright)", gender: "Female", description: "Bright, cheerful, and energetic female companion voice.", isBackend: true },
];

export const VoiceConfigurator: React.FC<VoiceConfiguratorProps> = ({
  selectedVoice,
  onVoiceChange,
  voiceSpeed,
  onVoiceSpeedChange,
  isBackendVoice,
  onBackendToggle,
}) => {
  return (
    <div id="voice-configurator-card" className="bg-slate-900/55 border border-slate-800/80 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-cyan-400">
          <Headphones className="w-5 h-5 animate-pulse" />
          <h3 className="font-display font-medium text-slate-200 text-sm tracking-wide uppercase">
            Acoustic Controls
          </h3>
        </div>
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            id="audio-mode-gemini"
            onClick={() => onBackendToggle(true)}
            className={`px-3 py-1 text-[10px] font-mono rounded-md font-semibold tracking-wider uppercase transition-all duration-200 cursor-pointer ${
              isBackendVoice
                ? "bg-cyan-500/20 text-cyan-400 shadow-sm border border-cyan-500/30"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Gemini TTS
          </button>
          <button
            id="audio-mode-browser"
            onClick={() => onBackendToggle(false)}
            className={`px-3 py-1 text-[10px] font-mono rounded-md font-semibold tracking-wider uppercase transition-all duration-200 cursor-pointer ${
              !isBackendVoice
                ? "bg-cyan-500/20 text-cyan-400 shadow-sm border border-cyan-500/30"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Browser Speech
          </button>
        </div>
      </div>

      {isBackendVoice ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono text-slate-400">SELECT PRETRAINED VOICE MODEL</label>
            <div className="relative">
              <select
                id="backend-voice-selector"
                value={selectedVoice}
                onChange={(e) => onVoiceChange(e.target.value)}
                className="w-full bg-slate-950 text-slate-200 text-xs rounded-xl border border-slate-800 p-2.5 outline-none cursor-pointer hover:border-cyan-500/30 transition-colors focus:border-cyan-500/50 appearance-none font-sans"
              >
                {BACKEND_VOICES.map((v) => (
                  <option key={v.id} value={v.id} className="bg-slate-950 text-slate-200">
                    {v.name} ({v.gender})
                  </option>
                ))}
              </select>
              <div className="absolute top-1/2 right-3 -translate-y-1/2 pointer-events-none text-slate-400 border-l border-slate-800/80 pl-2.5">
                <Settings2 className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Description of current selected voice */}
          <div className="bg-slate-950/50 border border-slate-800/40 p-2.5 rounded-lg flex gap-2 items-start">
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <p className="text-slate-400 text-xs leading-relaxed font-sans">
              {BACKEND_VOICES.find((v) => v.id === selectedVoice)?.description || "Provides voice capabilities from Gemini API."}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 bg-slate-950/40 border border-slate-800/50 p-3 rounded-xl">
          <div className="flex gap-2 items-start">
            <AudioLines className="w-4 h-4 text-cyan-400 mt-0.5" />
            <p className="text-slate-300 font-sans text-xs leading-relaxed">
              <strong>Local Speech Engine ACTIVE</strong>. Utilizing browser client speech API. Extremely low latency, infinite lengths, and zero credentials overhead. Automatically attempts to bind to elegant local female sound profiles!
            </p>
          </div>
          
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-slate-400">VOICE CADENCE / SPEED</span>
              <span className="text-cyan-400 font-bold">{voiceSpeed}x</span>
            </div>
            <input
              id="voice-speed-slider"
              type="range"
              min="0.75"
              max="1.50"
              step="0.05"
              value={voiceSpeed}
              onChange={(e) => onVoiceSpeedChange(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 bg-slate-800/80 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Acoustic wave indicator details decoration */}
      <div className="flex justify-between items-center border-t border-slate-800/60 pt-3">
        <span className="text-[10px] text-slate-500 font-mono tracking-wider">AUDIO ENGINE STATUS</span>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 font-bold">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
          READY
        </span>
      </div>
    </div>
  );
};
