import { useEffect, useState } from "react";
import { callFastMCP } from "@/lib/keep/server";
import type { FastMCPToolResult } from "@/lib/keep/fastmcp";

export function FastMCPStatusBadge() {
  const [status, setStatus] = useState<FastMCPToolResult | null>(null);
  const [loading, setLoading] = useState(true);

  async function checkBridge() {
    try {
      const res = await callFastMCP({
        data: {
          tool: "get_castle_map",
        },
      });
      setStatus(res);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void checkBridge();
    const interval = setInterval(() => {
      void checkBridge();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !status) {
    return (
      <div className="flex items-center gap-1.5 rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/80 px-2.5 py-1 font-mono text-[10px] text-[#9aa3b2]">
        <span className="h-2 w-2 rounded-full bg-[#ffc857] animate-ping" />
        <span>CONNECTING FASTMCP…</span>
      </div>
    );
  }

  const isLive = status?.source === "live_funnel" || status?.source === "live_internal";
  const sourceLabel = status?.source === "live_funnel"
    ? "FASTMCP: CONNECTED (FUNNEL)"
    : status?.source === "live_internal"
    ? "FASTMCP: CONNECTED (TAILNET)"
    : "FASTMCP: UNREACHABLE";

  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider backdrop-blur-md transition ${
        isLive
          ? "border-[#39ff14]/60 bg-[#39ff14]/10 text-[#39ff14] shadow-[0_0_12px_rgba(57,255,20,0.25)] hover:bg-[#39ff14]/20"
          : "border-[#ffc857]/60 bg-[#ffc857]/10 text-[#ffc857] hover:bg-[#ffc857]/20"
      }`}
      onClick={() => void checkBridge()}
      title="Click to probe FastMCP bridge"
    >
      <span
        className={`h-2 w-2 rounded-full ${
          isLive ? "bg-[#39ff14] shadow-[0_0_8px_#39ff14]" : "bg-[#ffc857] shadow-[0_0_8px_#ffc857]"
        } animate-pulse`}
      />
      <span className="font-semibold">{sourceLabel}</span>
      {status?.latencyMs ? (
        <span className="hidden font-mono text-[9px] text-[#9aa3b2] sm:inline">
          {status.latencyMs}ms
        </span>
      ) : null}

      {/* Hover Card Details */}
      <div className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-72 flex-col gap-1 rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/95 p-3 text-[10px] text-[#e8ecf1] shadow-2xl backdrop-blur-xl group-hover:flex">
        <p className="font-bold text-[#ffc857]">SOVEREIGN FAST-MCP BRIDGE</p>
        <div className="space-y-1 text-[#9aa3b2]">
          <p>
            <span className="text-[#e8ecf1]">Endpoint:</span>{" "}
            {status?.endpoint || "not configured"}
          </p>
          <p>
            <span className="text-[#e8ecf1]">Mode:</span>{" "}
            <span className={isLive ? "text-[#39ff14] font-bold" : "text-[#ffc857]"}>
              {status?.source?.toUpperCase()}
            </span>
          </p>
          {!isLive && (
            <p className="text-[#ffc857]">
              No data is being shown. Panels stay empty until the bridge answers.
            </p>
          )}
        </div>
        {status?.error && (
          <p className="mt-1 border-t border-[#3a3f4b] pt-1 text-[9px] text-[#ffc857]">
            {status.error}
          </p>
        )}
      </div>
    </div>
  );
}
