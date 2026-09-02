import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { runMechanicDiagnosis } from "@/lib/keep/server";
import { mechanicAudio } from "@/lib/mechanic/audio";
import { SignInGate } from "@/components/keep/sign-in-gate";

interface TerminalMessage {
  id: string;
  sender: "system" | "operator" | "valerie";
  timestamp: string;
  text: string;
  sources?: Array<{ title: string; url: string }>;
  searchQueries?: string[];
  isStreaming?: boolean;
}

interface QuickChip {
  id: string;
  label: string;
  icon: string;
  prompt: string;
  logs?: string;
}

const QUICK_CHIPS: QuickChip[] = [
  {
    id: "check-18789",
    label: "Check Control UI :18789",
    icon: "⚡",
    prompt: "Diagnose reachability and loopback binding for OpenClaw Gateway on port 18789. Check if websocket handshakes are dropping or if reverse proxy headers are misconfigured.",
  },
  {
    id: "probe-8100",
    label: "Probe FastMCP :8100",
    icon: "🔌",
    prompt: "Probe the FastMCP bridge on 127.0.0.1:8100 and its Tailscale Funnel ingress. Diagnose tool schema sync failures and socket timeouts.",
  },
  {
    id: "paste-log",
    label: "Paste Error Log",
    icon: "📋",
    prompt: "Analyze the attached container log crash dump. Pinpoint the root cause failure, memory pressure, or permission error.",
    logs: `[ERROR] 2026-08-24 08:14:22 [openclaw.gateway] Failed to bind ws://127.0.0.1:18789: Address already in use
[CRITICAL] 2026-08-24 08:14:23 [fastmcp.transport] Tool bridge connection refused on 127.0.0.1:8100
[WARN] 2026-08-24 08:14:25 [fs.perms] /root/ReClaw-2.0/config/openclaw.yaml owned by root:root, expected uid 1000`,
  },
  {
    id: "search-docs",
    label: "Search docs.openclaw.ai",
    icon: "🔍",
    prompt: "Search docs.openclaw.ai and GitHub (openclaw/openclaw) for recommended Docker Compose v2 networking configurations, Tailscale Funnel ingress rules, and Ollama integration parameters.",
  },
  {
    id: "tailscale-funnel",
    label: "Check Tailscale Funnel",
    icon: "🛡️",
    prompt: "Diagnose Tailscale Funnel proxy status for the configured OpenClaw hostname routing public FastMCP traffic to local port 8100.",
  },
  {
    id: "file-perms",
    label: "Fix File Ownership (uid 1000)",
    icon: "🔧",
    prompt: "Provide the standard single-block command to inspect and restore file ownership to uid 1000 across /root/ReClaw-2.0 after running root migrations.",
  },
  {
    id: "auto-repair",
    label: "Chevy Silverado / Physical Shop",
    icon: "🚗",
    prompt: "Physical shop diagnostic: Diagnose 2018 Chevy Silverado 5.3L intermittent P0300 random misfire under load. Check fuel trim, O2 sensors, MAF, and ignition coil ground pinouts.",
  },
];

const INITIAL_SYSTEM_MESSAGES: TerminalMessage[] = [
  {
    id: "boot-1",
    sender: "system",
    timestamp: "00:00:01",
    text: `================================================================================
OPENCLAW WORKBENCH v2026.7 // RETRO-CRT TERMINAL DIAGNOSTIC CONSOLE
HOST: Hetzner CCX33 VPS (Ubuntu 24.04 LTS) | STACK ROOT: /root/ReClaw-2.0
STATUS: Live Monitoring Active | Google Search Grounding: ENABLED
================================================================================
VALERIE IS AT THE BENCH. Ready for Docker dumps, FastMCP telemetry, or engine schematics.`,
  },
];

export function MechanicWorkbench() {
  const [messages, setMessages] = useState<TerminalMessage[]>(INITIAL_SYSTEM_MESSAGES);
  const [concern, setConcern] = useState("");
  const [contextLogs, setContextLogs] = useState("");
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mechanicAudio.enabled = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  function getTimestamp() {
    const d = new Date();
    return d.toTimeString().split(" ")[0];
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanConcern = concern.trim();
    const cleanLogs = contextLogs.trim();

    if (!cleanConcern && !cleanLogs) {
      toast.error("Provide a diagnostic concern, command, or raw log dump.");
      return;
    }

    const operatorMsg: TerminalMessage = {
      id: `op-${Date.now()}`,
      sender: "operator",
      timestamp: getTimestamp(),
      text: cleanConcern || (cleanLogs ? `[Attached Raw Logs Diagnostic — ${cleanLogs.split("\n").length} lines]` : ""),
    };

    setMessages((prev) => [...prev, operatorMsg]);
    setConcern("");
    setBusy(true);
    mechanicAudio.playRelaySnap();

    try {
      const res = await runMechanicDiagnosis({
        data: {
          concern: cleanConcern || "Diagnose raw system log dump.",
          contextLogs: cleanLogs || undefined,
        },
      });

      if (!res.ok) {
        const errorText = res.error || "Diagnostic failure.";
        toast.error(errorText);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: "system",
            timestamp: getTimestamp(),
            text: `[DIAGNOSTIC ERROR]: ${errorText}`,
          },
        ]);
        return;
      }

      // Stream / add response
      const valerieMsg: TerminalMessage = {
        id: `val-${Date.now()}`,
        sender: "valerie",
        timestamp: getTimestamp(),
        text: res.text,
        sources: res.sources,
        searchQueries: res.groundingSearchQueries,
      };

      setMessages((prev) => [...prev, valerieMsg]);
      mechanicAudio.playDiagnosticReady();
      toast.success("Valerie finished diagnosis.");
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "system",
          timestamp: getTimestamp(),
          text: `[CONNECTION FAULT]: ${errMsg}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleChipClick(chip: QuickChip) {
    setConcern(chip.prompt);
    if (chip.logs) {
      setContextLogs(chip.logs);
      setShowLogDrawer(true);
    }
    mechanicAudio.playKeyTick();
  }

  function copyToClipboard(text: string, blockId: string) {
    navigator.clipboard.writeText(text);
    setCopiedBlockId(blockId);
    mechanicAudio.playCopyChirp();
    toast.success("Command copied to clipboard!");
    setTimeout(() => setCopiedBlockId(null), 2200);
  }

  function clearTerminal() {
    setMessages(INITIAL_SYSTEM_MESSAGES);
    mechanicAudio.playRelaySnap();
    toast.info("Terminal log buffer cleared.");
  }

  function exportTranscript() {
    const lines = messages.map((m) => `[${m.timestamp}] <${m.sender.toUpperCase()}>:\n${m.text}\n`).join("\n---\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `valerie-workbench-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Transcript downloaded.");
  }

  /**
   * Helper to parse and render formatted markdown text with copyable code blocks and citations
   */
  function renderFormattedMessage(msg: TerminalMessage) {
    const text = msg.text;
    const parts = text.split(/(```[\s\S]*?```)/g);

    return (
      <div className="space-y-3 text-sm font-mono leading-relaxed">
        {parts.map((part, index) => {
          if (part.startsWith("```")) {
            const lines = part.slice(3, -3).trim().split("\n");
            let lang = "";
            let code = part.slice(3, -3);
            if (lines[0] && !lines[0].includes(" ") && lines.length > 1) {
              lang = lines[0].trim();
              code = lines.slice(1).join("\n");
            }
            const blockId = `${msg.id}-block-${index}`;
            const isCopied = copiedBlockId === blockId;

            return (
              <div
                key={index}
                className="relative my-3 overflow-hidden rounded-md border border-[#3a3f4b] bg-[#080511] p-3 text-xs"
              >
                <div className="flex items-center justify-between border-b border-[#2a2438] pb-2 text-[11px] text-[#9aa3b2]">
                  <span className="font-mono uppercase text-[#2de2e6]">
                    {lang || "bash / shell"} // EXECUTABLE
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(code.trim(), blockId)}
                    className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-bold transition-all ${
                      isCopied
                        ? "bg-[#39ff14]/20 text-[#39ff14] border border-[#39ff14]"
                        : "bg-[#1e222b] text-[#2de2e6] border border-[#2de2e6]/40 hover:bg-[#2de2e6] hover:text-[#0b0e14]"
                    }`}
                  >
                    {isCopied ? "✓ COPIED" : "📋 COPY COMMAND"}
                  </button>
                </div>
                <pre className="mt-2 overflow-x-auto font-mono text-[#39ff14] selection:bg-[#2de2e6] selection:text-[#0b0e14]">
                  <code>{code.trim()}</code>
                </pre>
              </div>
            );
          }

          // Format bullet points and headers
          return (
            <div key={index} className="whitespace-pre-wrap text-[#e8ecf1]">
              {part}
            </div>
          );
        })}

        {/* Live Search Grounding Badges */}
        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-4 rounded border border-[#2de2e6]/30 bg-[#0d0221]/90 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-[#2de2e6] uppercase">
              <span>🌐</span>
              <span>Live Search Grounding Sources ({msg.sources.length})</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {msg.sources.map((src, i) => (
                <a
                  key={i}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-[#3a3f4b] bg-[#1e222b] px-2 py-1 text-[11px] text-[#9aa3b2] hover:border-[#2de2e6] hover:text-[#2de2e6] transition-colors"
                >
                  <span>🔗</span>
                  <span className="max-w-[200px] truncate">{src.title}</span>
                </a>
              ))}
            </div>
            {msg.searchQueries && msg.searchQueries.length > 0 && (
              <div className="mt-2 text-[10px] text-[#9aa3b2] flex items-center gap-1">
                <span className="text-[#ffc857]">Grounded Queries:</span>
                <span>{msg.searchQueries.join(" · ")}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Outer Heavy Iron Diagnostic Frame */}
      <div
        className="relative overflow-hidden rounded-xl border-4 border-[#2a2438] bg-[#0d0221] p-2 md:p-4 shadow-2xl shadow-black"
        style={{
          boxShadow: "0 0 40px rgba(45, 226, 230, 0.08), inset 0 0 30px rgba(13, 2, 33, 0.9)",
        }}
      >
        {/* Corner Iron Rivets (Gold / Bronze) */}
        <div className="absolute top-2 left-2 h-3 w-3 rounded-full border border-[#d4af37] bg-[#ffc857] shadow-sm pointer-events-none" />
        <div className="absolute top-2 right-2 h-3 w-3 rounded-full border border-[#d4af37] bg-[#ffc857] shadow-sm pointer-events-none" />
        <div className="absolute bottom-2 left-2 h-3 w-3 rounded-full border border-[#d4af37] bg-[#ffc857] shadow-sm pointer-events-none" />
        <div className="absolute bottom-2 right-2 h-3 w-3 rounded-full border border-[#d4af37] bg-[#ffc857] shadow-sm pointer-events-none" />

        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-[#2a2438] pb-3 pt-1 px-2 gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-3 w-3 items-center justify-center">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#39ff14] opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#39ff14]"></span>
              </span>
            </div>
            <div>
              <h2 className="font-mono text-sm md:text-base font-bold tracking-wider text-[#e8ecf1]">
                OPENCLAW MECHANIC WORKBENCH // CRT DIAGNOSTIC CONSOLE
              </h2>
              <p className="text-[11px] font-mono text-[#9aa3b2]">
                Layer 0–5 Deep Stack Auditing · Google Search Grounded · Hetzner VPS & Physical Rig
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                soundEnabled
                  ? "border-[#2de2e6] bg-[#2de2e6]/10 text-[#2de2e6]"
                  : "border-[#3a3f4b] bg-[#1e222b] text-[#9aa3b2]"
              }`}
              title="Toggle Audio Feedback"
            >
              {soundEnabled ? "🔊 CRT AUDIO ON" : "🔇 AUDIO MUTED"}
            </button>
            <button
              type="button"
              onClick={exportTranscript}
              className="rounded border border-[#3a3f4b] bg-[#1e222b] px-2 py-1 font-mono text-xs text-[#e8ecf1] hover:border-[#2de2e6] hover:text-[#2de2e6] transition-colors"
            >
              💾 EXPORT LOG
            </button>
            <button
              type="button"
              onClick={clearTerminal}
              className="rounded border border-[#3a3f4b] bg-[#1e222b] px-2 py-1 font-mono text-xs text-[#ff3b3b] hover:bg-[#ff3b3b]/10 transition-colors"
            >
              CLEAR
            </button>
          </div>
        </div>

        {/* Main 2-Column Console Layout */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Valerie's Shop HUD (4 cols) */}
          {/* ========================================================================= */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Framed 16-bit Portrait of Valerie */}
            <div className="relative overflow-hidden rounded-lg border-2 border-[#ffc857]/60 bg-[#1e222b] p-3 shadow-lg">
              {/* Decorative Corner Rivets */}
              <div className="absolute top-1.5 left-1.5 h-2 w-2 rounded-full bg-[#ffc857]" />
              <div className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#ffc857]" />
              <div className="absolute bottom-1.5 left-1.5 h-2 w-2 rounded-full bg-[#ffc857]" />
              <div className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-[#ffc857]" />

              <div className="flex flex-col items-center">
                {/* 16-Bit Valerie Cyber-Arcane Avatar */}
                <div className="relative h-32 w-32 md:h-36 md:w-36 overflow-hidden rounded-md border-2 border-[#2de2e6] bg-[#0b0e14] shadow-inner">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 128 128"
                    width="100%"
                    height="100%"
                    shapeRendering="crispEdges"
                    className="h-full w-full"
                  >
                    <rect width="128" height="128" fill="#0b0e14" />
                    {/* Stone masonry background */}
                    <rect x="0" y="0" width="128" height="128" fill="#14141c" />
                    <rect x="8" y="8" width="112" height="112" fill="#1e222b" stroke="#ffc857" strokeWidth="2" />
                    <rect x="16" y="16" width="96" height="96" fill="#12161f" />
                    {/* Torch & Neon Ambient Glow */}
                    <rect x="24" y="24" width="80" height="80" fill="#1a1c26" />
                    {/* Valerie Cyber-Mechanic Sprite */}
                    {/* Shoulders & Jacket */}
                    <rect x="28" y="74" width="72" height="42" fill="#3a3f4b" />
                    <rect x="36" y="66" width="56" height="18" fill="#4a5568" />
                    <rect x="40" y="82" width="48" height="28" fill="#2a2e39" />
                    {/* Head / Face */}
                    <rect x="44" y="28" width="40" height="42" fill="#d4af37" />
                    <rect x="48" y="32" width="32" height="34" fill="#e8c89b" />
                    {/* Hair / Bandana */}
                    <rect x="40" y="24" width="48" height="16" fill="#ff2a6d" />
                    <rect x="36" y="32" width="12" height="24" fill="#ff2a6d" />
                    <rect x="80" y="32" width="12" height="20" fill="#ff2a6d" />
                    {/* Mechanic Goggles / Eyewear */}
                    <rect x="44" y="40" width="18" height="12" fill="#0b0e14" stroke="#2de2e6" strokeWidth="2" />
                    <rect x="66" y="40" width="18" height="12" fill="#0b0e14" stroke="#2de2e6" strokeWidth="2" />
                    <rect x="60" y="44" width="8" height="4" fill="#2de2e6" />
                    <rect x="48" y="44" width="10" height="4" fill="#2de2e6" />
                    <rect x="70" y="44" width="10" height="4" fill="#2de2e6" />
                    {/* Grin / Smudge */}
                    <rect x="56" y="58" width="16" height="3" fill="#3a3f4b" />
                    <rect x="74" y="54" width="6" height="4" fill="#4a5568" />
                    {/* Tool / Wrench Badge */}
                    <text x="64" y="104" fontFamily="monospace" fontSize="18" fill="#ffc857" textAnchor="middle">
                      ⚙️
                    </text>
                  </svg>
                  <div className="absolute bottom-1 right-1 rounded bg-[#0b0e14]/90 px-1 py-0.5 text-[9px] font-mono text-[#39ff14]">
                    CHIEF // V2.0
                  </div>
                </div>

                {/* Nameplate */}
                <div className="mt-3 w-full text-center border-t border-[#3a3f4b] pt-2">
                  <h3 className="font-mono text-xs md:text-sm font-bold tracking-wider text-[#ffc857]">
                    VALERIE // CHIEF MECHANIC
                  </h3>
                  <p className="text-[10px] font-mono text-[#9aa3b2] uppercase tracking-widest mt-0.5">
                    SYSTEMS TROUBLESHOOTER
                  </p>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="mt-3 flex items-center justify-center gap-2 rounded bg-[#0b0e14] py-1.5 px-3 border border-[#3a3f4b]">
                <span className="h-2 w-2 rounded-full bg-[#39ff14] animate-pulse"></span>
                <span className="font-mono text-[10px] md:text-[11px] font-bold text-[#39ff14] tracking-wide">
                  WORKSHOP ONLINE // SEARCH GROUNDED
                </span>
              </div>

              {/* Quick Port Stats */}
              <div className="mt-2 text-center font-mono text-[10px] text-[#2de2e6] bg-[#0d0221] py-1 rounded border border-[#2de2e6]/20">
                PORT 18789 · FASTMCP :8100 — see bridge badge for live status
              </div>
            </div>

            {/* Real-time Subsystem Readout */}
            <div className="rounded-lg border border-[#3a3f4b] bg-[#14141c] p-3 text-xs font-mono">
              <div className="text-[11px] font-bold uppercase text-[#ffc857] border-b border-[#2a2438] pb-1.5 flex items-center justify-between">
                <span>🛰️ RECLAW STACK TELEMETRY</span>
                <span className="text-[10px] text-[#9aa3b2]">REFERENCE — NOT PROBED</span>
              </div>

              <div className="mt-2.5 space-y-2 text-[11px]">
                <div className="flex justify-between items-center text-[#9aa3b2]">
                  <span>Host Machine:</span>
                  <span className="text-[#e8ecf1] font-bold">Hetzner CCX33 VPS</span>
                </div>
                <div className="flex justify-between items-center text-[#9aa3b2]">
                  <span>OS / Stack Root:</span>
                  <span className="text-[#2de2e6]">Ubuntu 24.04 · /root/ReClaw-2.0</span>
                </div>
                <div className="flex justify-between items-center text-[#9aa3b2]">
                  <span>OpenClaw Gateway:</span>
                  <span className="text-[#39ff14]">openclaw:2026.7.1 (:18789)</span>
                </div>
                <div className="flex justify-between items-center text-[#9aa3b2]">
                  <span>FastMCP Bridge:</span>
                  <span className="text-[#9aa3b2]">configured via FASTMCP_* env (:8100)</span>
                </div>
                <div className="flex justify-between items-center text-[#9aa3b2]">
                  <span>Local LLM Core:</span>
                  <span className="text-[#ffc857]">Ollama gemma4 (:11434)</span>
                </div>
                <div className="flex justify-between items-center text-[#9aa3b2]">
                  <span>Permissions Rule:</span>
                  <span className="text-[#39ff14]">Strict uid: 1000:1000</span>
                </div>
              </div>
            </div>

            {/* Diagnostic Protocol Hierarchy */}
            <div className="rounded-lg border border-[#3a3f4b] bg-[#14141c] p-3 text-xs font-mono">
              <div className="text-[11px] font-bold uppercase text-[#2de2e6] border-b border-[#2a2438] pb-1.5">
                ⚡ 5-LAYER TROUBLESHOOTING PROTOCOL
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-[#9aa3b2]">
                <li><span className="text-[#ffc857]">L0–2:</span> Ports, bindings & Tailscale Funnel</li>
                <li><span className="text-[#ffc857]">L3:</span> Config, envs, volumes & uid:1000</li>
                <li><span className="text-[#ffc857]">L4:</span> Docker logs, memory, OOM & loops</li>
                <li><span className="text-[#ffc857]">L5:</span> FastMCP sockets & SQLite locks</li>
                <li><span className="text-[#39ff14]">PHYS:</span> Auto circuits, OBD-II & sensors</li>
              </ul>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: CRT Terminal Viewport & Log Feed (8 cols) */}
          {/* ========================================================================= */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            {/* Retro CRT Terminal Screen */}
            <div
              className="relative flex flex-col h-[480px] md:h-[540px] rounded-lg border-2 border-[#3a3f4b] bg-[#05020d] p-3 md:p-4 overflow-hidden font-mono"
              style={{
                boxShadow: "inset 0 0 20px rgba(0,0,0,0.9), 0 0 15px rgba(45, 226, 230, 0.05)",
              }}
            >
              {/* Scanline CRT Overlay */}
              <div
                className="pointer-events-none absolute inset-0 opacity-15"
                style={{
                  background:
                    "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.75) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03))",
                  backgroundSize: "100% 3px, 6px 100%",
                }}
              />

              {/* Terminal Viewport / Scroll Area */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-4 text-xs">
                {messages.map((msg) => (
                  <div key={msg.id} className="border-b border-[#2a2438]/50 pb-3">
                    {/* Message Header */}
                    <div className="flex items-center gap-2 text-[11px] mb-1">
                      <span className="text-[#9aa3b2]">[{msg.timestamp}]</span>
                      {msg.sender === "system" && (
                        <span className="font-bold text-[#ffc857] bg-[#ffc857]/10 px-1.5 py-0.5 rounded border border-[#ffc857]/30">
                          SYSTEM // MONITORED
                        </span>
                      )}
                      {msg.sender === "operator" && (
                        <span className="font-bold text-[#2de2e6] bg-[#2de2e6]/10 px-1.5 py-0.5 rounded border border-[#2de2e6]/30">
                          OPERATOR // JASON BOYD
                        </span>
                      )}
                      {msg.sender === "valerie" && (
                        <span className="font-bold text-[#39ff14] bg-[#39ff14]/10 px-1.5 py-0.5 rounded border border-[#39ff14]/30">
                          VALERIE // CHIEF MECHANIC
                        </span>
                      )}
                    </div>

                    {/* Message Body */}
                    {renderFormattedMessage(msg)}
                  </div>
                ))}

                {busy && (
                  <div className="flex items-center gap-2 text-xs text-[#2de2e6] animate-pulse">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#2de2e6]" />
                    <span>Valerie is analyzing stack logs & scrying search docs...</span>
                  </div>
                )}
                <div ref={terminalEndRef} />
              </div>

              {/* Blinking Prompt Line at bottom */}
              <div className="mt-2 pt-2 border-t border-[#2a2438] flex items-center text-[11px] text-[#39ff14]">
                <span className="text-[#ffc857]">valerie@ravenstack-workshop</span>
                <span className="text-[#9aa3b2]">:</span>
                <span className="text-[#2de2e6]">~/ReClaw-2.0</span>
                <span className="text-[#e8ecf1]">$</span>
                <span className="ml-1 inline-block h-3.5 w-2 bg-[#39ff14] animate-ping" />
              </div>
            </div>

            {/* Quick-Action Diagnostic Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono text-[#9aa3b2] mr-1">QUICK CHIPS:</span>
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className="inline-flex items-center gap-1 rounded border border-[#3a3f4b] bg-[#1e222b] px-2.5 py-1 text-xs font-mono text-[#e8ecf1] transition-all hover:border-[#2de2e6] hover:bg-[#2de2e6]/10 hover:text-[#2de2e6]"
                >
                  <span>{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>

            {/* Raw Context Log Drawer Toggle */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowLogDrawer(!showLogDrawer)}
                className="text-xs font-mono text-[#ffc857] hover:underline inline-flex items-center gap-1"
              >
                <span>{showLogDrawer ? "▼ Hide" : "▶ Attach"} Raw Docker / Terminal Log Dump ({contextLogs ? `${contextLogs.split("\n").length} lines` : "Empty"})</span>
              </button>
              {contextLogs && (
                <button
                  type="button"
                  onClick={() => setContextLogs("")}
                  className="text-[10px] font-mono text-[#ff3b3b] hover:underline"
                >
                  Clear Raw Logs
                </button>
              )}
            </div>

            {showLogDrawer && (
              <div className="rounded-md border border-[#3a3f4b] bg-[#0b0e14] p-2">
                <textarea
                  value={contextLogs}
                  onChange={(e) => setContextLogs(e.target.value)}
                  placeholder="Paste multi-line docker compose logs, traceback dumps, or circuit schematics here..."
                  rows={4}
                  className="w-full resize-y rounded bg-[#14141c] p-2 font-mono text-xs text-[#39ff14] outline-none placeholder:text-[#9aa3b2]/50 focus:ring-1 focus:ring-[#2de2e6]"
                />
              </div>
            )}

            {/* Input & Execution Bar */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <SignInGate prompt="Sign in to the Keep to execute real-time grounded diagnoses with Valerie.">
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="relative flex-1">
                    <textarea
                      value={concern}
                      onChange={(e) => setConcern(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                      placeholder="Enter problem, command, or paste raw Docker/terminal logs (Press Enter to diagnose)..."
                      rows={2}
                      className="w-full resize-y rounded-md border border-[#3a3f4b] bg-[#14141c] px-3 py-2 font-mono text-xs text-[#e8ecf1] placeholder:text-[#9aa3b2]/60 outline-none focus:border-[#2de2e6] focus:ring-1 focus:ring-[#2de2e6]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#ffc857] bg-[#ffc857] px-6 py-2 font-mono text-xs md:text-sm font-bold text-[#0b0e14] shadow-md transition-all hover:bg-[#ffc857]/90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      boxShadow: "0 0 15px rgba(255, 200, 87, 0.3)",
                    }}
                  >
                    <span>⚡</span>
                    <span>{busy ? "RUNNING..." : "RUN DIAGNOSIS"}</span>
                  </button>
                </div>
              </SignInGate>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
