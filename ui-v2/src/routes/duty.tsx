import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { KeepShell } from "@/components/keep/shell";
import { getDutyBoard } from "@/lib/keep/server";
import { LIGHT_META, DUTY_META, type DutyBoard } from "@/lib/keep/duty";

export const Route = createFileRoute("/duty")({ component: ShiftBoard });

function Board({ board }: { board: DutyBoard }) {
  return (
    <>
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl">Workplaces</h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
            {board.generated_at
              ? `updated ${formatDistanceToNow(new Date(board.generated_at), { addSuffix: true })}`
              : "updated unknown"}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {board.rooms.map((room) => {
            const meta = LIGHT_META[room.light];
            return (
              <article key={room.room_id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">{room.kind}</p>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span style={{ color: meta.color }}>{meta.label}</span>
                  </span>
                </div>
                <h3 className="mt-2 font-display text-xl leading-tight">{room.name}</h3>
                <p className="mt-3 text-sm text-muted">{room.detail}</p>
                {room.last_event ? (
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-subtle">
                    {room.last_event}
                  </p>
                ) : null}
                {room.occupants.length > 0 ? (
                  <p className="mt-2 font-mono text-[11px] text-subtle">
                    waiting: {room.occupants.join(", ")}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl">Duty roster</h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
            quiet ≥ {board.quiet_leave_after} → <span style={{ color: DUTY_META.leave.color }}>leave</span>
          </p>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-elevated text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Post</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last active</th>
                <th className="px-4 py-3 font-medium">Last real work</th>
              </tr>
            </thead>
            <tbody>
              {board.duty.map((agent) => {
                const meta = DUTY_META[agent.status];
                return (
                  <tr key={agent.agent_id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <span className="font-medium text-fg">{agent.name}</span>
                      <span className="ml-2 font-mono text-xs text-subtle">@{agent.agent_id}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {agent.room_name ? `${agent.room_name}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em]">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                        <span style={{ color: meta.color }}>{meta.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {agent.last_active
                        ? formatDistanceToNow(new Date(agent.last_active), { addSuffix: true })
                        : "—"}
                    </td>
                    <td className="max-w-[22rem] px-4 py-3 text-muted">
                      {agent.last_real_work ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ShiftBoard() {
  const { data, isFetching, isPending } = useQuery({
    queryKey: ["duty-board"],
    queryFn: () => getDutyBoard(),
    refetchInterval: 30000,
  });

  return (
    <KeepShell>
      <section>
        <p className="text-[11px] uppercase tracking-[0.22em] text-accent">Shift board</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">The chalkboard</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Duty and workplace lights drawn only from real signals — Keep status, gates, the
          county queue, the outbox and the library inbox. No model runs to paint this board.
        </p>
        {isFetching ? (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
            refreshing…
          </p>
        ) : null}
      </section>

      {isPending ? (
        <div className="mt-10 space-y-3" aria-busy="true">
          <div className="h-28 w-full animate-pulse rounded-lg bg-elevated" />
          <div className="h-28 w-full animate-pulse rounded-lg bg-elevated" />
        </div>
      ) : data?.ok ? (
        <Board board={data.board} />
      ) : (
        <div className="mt-10 rounded-lg border border-line bg-surface p-6">
          <p className="font-mono text-sm text-fg">Board unread.</p>
          <p className="mt-2 text-sm text-muted">
            {data?.ok === false ? data.error : "Keep HTTP is unreachable."} Nothing is drawn
            from memory.
          </p>
        </div>
      )}
    </KeepShell>
  );
}