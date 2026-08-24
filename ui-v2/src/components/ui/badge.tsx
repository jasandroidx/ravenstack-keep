import { cn } from "@/lib/cn";
import type { LockState, SpecStatus } from "@/lib/keep/types";

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border border-line px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LockBadge({ lock }: { lock: LockState }) {
  if (lock === "live") {
    return <Badge className="border-live/40 text-live">Live</Badge>;
  }
  if (lock === "locked") {
    return <Badge className="border-danger/40 text-danger">Locked</Badge>;
  }
  return <Badge>Unforged</Badge>;
}

export function SpecBadge({ status }: { status: SpecStatus }) {
  const cls =
    status === "live"
      ? "border-live/40 text-live"
      : status === "approved"
        ? "border-accent/40 text-accent"
        : status === "retired"
          ? "border-danger/30 text-danger"
          : "";
  return <Badge className={cls}>Spec {status}</Badge>;
}
