import { createFileRoute } from "@tanstack/react-router";
import { KeepShell } from "@/components/keep/shell";
import { LockBadge } from "@/components/ui/badge";
import { KEEP_TAGLINE, PULSE, ROOMS, roomCounts } from "@/lib/keep/catalog";

export const Route = createFileRoute("/rooms/")({ component: RoomsLedger });

function RoomsLedger() {
  const counts = roomCounts();

  return (
    <KeepShell>
      <section>
        <p className="text-[11px] uppercase tracking-[0.22em] text-accent">Ledger</p>
        <h1 className="mt-2 font-display text-4xl">Floor plate</h1>
        <p className="mt-3 max-w-xl text-sm text-muted">{KEEP_TAGLINE}</p>
      </section>

      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Live</p>
          <p className="mt-1 font-display text-3xl">{counts.live}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Unforged</p>
          <p className="mt-1 font-display text-3xl">{counts.unforged}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Specs</p>
          <p className="mt-1 font-display text-3xl">{counts.specs}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Substrate</p>
          <p className="mt-1 font-display text-2xl">{PULSE.substrate}</p>
        </div>
      </section>

      <section className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ROOMS.map((room) => {
          const dest = room.href ?? `/rooms/${room.slug}`;
          return (
            <a
              key={room.slug}
              href={dest}
              className="group rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">{room.wing}</p>
                  <h3 className="mt-1 font-display text-2xl leading-tight">{room.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {room.occupant} · {room.role}
                  </p>
                </div>
                <LockBadge lock={room.lock} />
              </div>
              <p className="mt-4 text-sm text-muted">{room.purpose}</p>
            </a>
          );
        })}
      </section>
    </KeepShell>
  );
}
