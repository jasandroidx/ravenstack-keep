import { createFileRoute, Link } from "@tanstack/react-router";
import { KeepShell } from "@/components/keep/shell";
import { SpecPanel } from "@/components/keep/spec-panel";
import { ROOMS, getRoom, getSpecForRoom } from "@/lib/keep/catalog";

export const Route = createFileRoute("/rooms/$slug")({ component: RoomPage });

function RoomPage() {
  const { slug } = Route.useParams();
  const room = getRoom(slug);
  const spec = getSpecForRoom(slug);

  if (!room) {
    return (
      <KeepShell>
        <h1 className="font-display text-3xl">No such room</h1>
        <p className="mt-3 text-muted">That door does not exist on this floor plate.</p>
        <Link to="/" className="mt-6 inline-block text-sm text-accent hover:underline">
          Return to the hall
        </Link>
      </KeepShell>
    );
  }

  return (
    <KeepShell>
      {room.image ? (
        <img
          src={room.image}
          alt=""
          className="mb-8 h-48 w-full rounded-xl border border-line object-cover md:h-64"
        />
      ) : null}
      <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">
        {room.wing} · {room.occupant}
      </p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">{room.name}</h1>
      <p className="mt-3 max-w-2xl text-muted">{room.purpose}</p>
      {spec ? (
        <div className="mt-10 rounded-xl border border-line bg-surface p-6 md:p-8">
          <SpecPanel spec={spec} />
        </div>
      ) : (
        <div className="mt-10 rounded-xl border border-line bg-surface p-6">
          <h2 className="font-display text-2xl">Unforged</h2>
          <p className="mt-3 max-w-xl text-muted">
            This room is visible so the Keep remembers the capability. Take it to Clawforge before it becomes real.
          </p>
          <p className="mt-4 text-sm text-subtle">Kill note: {room.kill}</p>
          <Link
            to="/forge"
            className="mt-6 inline-flex h-11 items-center rounded-sm bg-accent px-4 text-sm font-medium text-accent-fg"
          >
            Forge a Spec
          </Link>
        </div>
      )}
      <div className="mt-10">
        <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Other rooms</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ROOMS.filter((r) => r.slug !== slug).map((r) => {
            const dest = r.href ?? `/rooms/${r.slug}`;
            return (
              <a
                key={r.slug}
                href={dest}
                className="rounded-sm border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                {r.name}
              </a>
            );
          })}
        </div>
      </div>
    </KeepShell>
  );
}
