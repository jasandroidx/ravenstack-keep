import { createFileRoute } from "@tanstack/react-router";
import { KeepHall } from "@/components/hall/keep-hall";
import { KeepShell } from "@/components/keep/shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <KeepShell bleed>
      <KeepHall />
    </KeepShell>
  );
}
