import { useState, useEffect } from "react";
import { toast } from "sonner";
import { callFastMCP } from "@/lib/keep/server";
import type { GatewayLogLine, FastMCPToolResult } from "@/lib/keep/fastmcp";

export function FastMCPGatewayStreamer() {
  const [logs, setLogs] = useState<GatewayLogLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<FastMCPToolResult | null>(null);
  const [selectedService, setSelectedService] = useState<string>("all");

  async function fetchGatewayLogs() {
    try {
      const res = await callFastMCP({
        data: {
          tool: "tail_gateway_logs",
          params: { limit: 40 },
        },
      });
      setLastSyncResult(res);
      if ((res as any).ok && Array.isArray((res as any).data)) {
        setLogs((res as any).data as GatewayLogLine[]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch gateway logs");
    }
  }

  useEffect(() => {
    void fetchGatewayLogs();
  }, []);

  useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => {
      void fetchGatewayLogs();
    }, 4000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  const filteredLogs = selectedService === "all"
    ? logs
    : logs.filter((l) => l.service === selectedService);

  return (
    <div className="overflow-hidden rounded-xl border border-[#3a3f4b] bg-[#05020d] shadow-2xl">
      {/* Top Stream Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2438] bg-[#0d0221] px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isStreaming ? "bg-[#39ff14] shadow-[0_0_10px_#39ff14] animate-ping" : "bg-[#ffc857]"
            }`}
          />
          <div>
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#e8ecf1]">
              📡 Live OpenClaw Gateway Logs (ws://100.108.130.82:18789)
            </h3>
            <p className="font-mono text-[10px] text-[#9aa3b2]">
              FastMCP: <code className="text-[#2de2e6]">tail_gateway_logs</code> · Mode:{" "}
              <span className={lastSyncResult?.source === "fallback_mock" ? "text-[#ffc857]" : "text-[#39ff14]"}>
                {lastSyncResult?.source?.toUpperCase() ?? "DISCONNECTED"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Service Filter */}
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="rounded border border-[#3a3f4b] bg-[#14141c] px-2 py-1 font-mono text-[11px] text-[#e8ecf1] outline-none"
          >
            <option value="all">ALL SERVICES</option>
            <option value="gateway">GATEWAY (:18789)</option>
            <option value="fastmcp">FASTMCP (:8100)</option>
            <option value="reclaw_api">RECLAW API (:8000)</option>
            <option value="ollama">OLLAMA (:11434)</option>
          </select>

          <button
            type="button"
            onClick={() => {
              const next = !isStreaming;
              setIsStreaming(next);
              if (next) {
                toast.success("Live gateway log polling started.");
              } else {
                toast.info("Log polling paused.");
              }
            }}
            className={`rounded px-3 py-1 font-mono text-xs font-bold uppercase transition ${
              isStreaming
                ? "border border-[#ff3b3b] bg-[#ff3b3b]/20 text-[#ff3b3b]"
                : "border border-[#39ff14] bg-[#39ff14]/20 text-[#39ff14]"
            }`}
          >
            {isStreaming ? "⏹ Pause Stream" : "▶ Start Live Stream"}
          </button>

          <button
            type="button"
            onClick={() => void fetchGatewayLogs()}
            className="rounded border border-[#3a3f4b] bg-[#1e222b] px-2 py-1 font-mono text-xs text-[#9aa3b2] hover:text-[#e8ecf1]"
            title="Poll once"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="h-64 overflow-y-auto p-3 font-mono text-xs leading-relaxed space-y-1.5 bg-[#05020d]">
        {filteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[#9aa3b2]">
            Waiting for gateway log emission…
          </div>
        ) : (
          filteredLogs.map((l) => (
            <div key={l.id} className="flex items-start gap-2 hover:bg-[#14141c]/60 px-1 py-0.5 rounded">
              <span className="text-[10px] text-[#9aa3b2] shrink-0">{l.timestamp.split("T")[1]?.slice(0, 8) ?? l.timestamp}</span>
              <span
                className={`text-[10px] font-bold px-1 rounded uppercase shrink-0 ${
                  l.level === "ERROR" || l.level === "CRITICAL"
                    ? "bg-[#ff3b3b]/20 text-[#ff3b3b]"
                    : l.level === "WARN"
                    ? "bg-[#ffc857]/20 text-[#ffc857]"
                    : "bg-[#2de2e6]/20 text-[#2de2e6]"
                }`}
              >
                {l.service}
              </span>
              <span className="text-[#e8ecf1] break-all">{l.raw || l.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
