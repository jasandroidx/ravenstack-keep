import { useQuery } from "@tanstack/react-query";
import { getKeepSnapshot } from "@/lib/keep/server";

export function PulseBadge() {
  // Shared query-client cache: a snapshot fetched on one route is still warm
  // when the next route's PulseBadge mounts, so this never re-flashes to a
  // loading state just because you navigated.
  const { data, isLoading } = useQuery({
    queryKey: ["keep-snapshot"],
    queryFn: () => getKeepSnapshot(),
  });
  const pulse = data?.pulse ?? null;

  if (isLoading && !pulse) {
    return <span className="hidden text-subtle sm:inline animate-pulse">checking…</span>;
  }
  if (!pulse) {
    return <span className="hidden text-subtle sm:inline">unavailable</span>;
  }

  const live = pulse.source === "live";
  return (
    <span
      className="hidden items-center gap-2 text-xs uppercase tracking-[0.14em] sm:inline-flex"
      title={pulse.note ?? pulse.networkDetail}
    >
      <span className={live ? "text-[#39ff14]" : "text-[#ffc857]"}>{pulse.source}</span>
      <span className="text-subtle">
        {pulse.agentsActive} active · queue {pulse.queue.status}
      </span>
    </span>
  );
}
