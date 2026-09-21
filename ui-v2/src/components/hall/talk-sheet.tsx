import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { talkInHall } from "@/lib/keep/server";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { TALK_SRC, type HallAction, type HallNpc } from "@/lib/hall/world";

export function TalkSheet({
  npc,
  onClose,
  onTable,
}: {
  npc: HallNpc;
  onClose: () => void;
  onTable?: () => void;
}) {
  const { user } = useCurrentUserState();
  // A conversation, not a single replaced line — you can read back what the
  // seat already told you instead of losing it on the next question.
  type Turn = { who: "agent" | "you" | "error"; text: string; meta?: string; hint?: string };
  const [turns, setTurns] = useState<Turn[]>([{ who: "agent", text: npc.greeting }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the exchange grows.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const say = (t: Turn) => setTurns((prev) => [...prev, t]);

  function runAction(action: HallAction) {
    if (action.href === "/table") {
      onTable?.();
      return;
    }
    // A scripted line is marked as scripted, so it is never read as live.
    if (action.reply) say({ who: "agent", text: action.reply, meta: "scripted" });
  }

  async function send() {
    const q = input.trim();
    if (!q) return;
    if (!user) {
      // Silent return here is what made dialogue feel broken rather than gated.
      const msg = "Sign in to talk, or set VITE_AUTH_ENABLED=false for local dev.";
      say({ who: "error", text: msg });
      toast.error(msg);
      return;
    }
    say({ who: "you", text: q });
    setInput("");
    setBusy(true);
    try {
      const res = await talkInHall({ data: { agent: npc.id, message: q } });
      if (!res.ok) {
        // Headline only — the plumbing stays in the console, not in the hall.
        if (res.detail) console.warn("[hall]", res.detail);
        say({ who: "error", text: res.error, hint: res.hint });
        toast.error(res.error);
        return;
      }
      say({
        who: "agent",
        text: res.reply,
        meta: `${res.model} · ${res.sawBox ? "live box" : "no live reading"}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The seat did not answer.";
      say({ who: "error", text: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 bg-[#0b0e14]">
      <img src={npc.talkScene ?? TALK_SRC} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-black/25" />

      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-sm border border-[#2de2e6]/40 bg-[#0b0e14]/80 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[#e8ecf1] hover:border-[#2de2e6]"
      >
        Close
      </button>

      <div className="absolute inset-x-0 bottom-0 px-[4%] pb-[3%] pt-2">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 font-display text-2xl text-[#e8ecf1] drop-shadow-[0_2px_8px_#0b0e14]">
            {npc.name} <span className="text-base text-[#2de2e6]">· {npc.role}</span>
          </p>

          <div className="relative flex gap-4 overflow-hidden rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/92 px-5 py-4 shadow-[0_0_40px_#0b0e14] md:px-7 md:py-5">
            {npc.portrait ? (
              <img
                src={npc.portrait}
                alt=""
                className="hidden h-28 w-28 shrink-0 rounded-sm border border-[#ff2a6d]/50 object-cover object-top sm:block"
              />
            ) : null}
            <div className="min-w-0 flex-1">
            <div
              ref={logRef}
              className="min-h-[4.5rem] max-h-40 space-y-2.5 overflow-y-auto pr-8 text-[15px] leading-relaxed md:min-h-[5rem] md:text-base"
            >
              {turns.map((t, i) => (
                <div key={i}>
                  {t.who === "you" ? (
                    <p className="text-[#2de2e6]">
                      <span className="mr-2 text-[11px] uppercase tracking-[0.18em] text-[#2de2e6]/60">You</span>
                      {t.text}
                    </p>
                  ) : t.who === "error" ? (
                    <>
                      <p className="text-sm text-[#ff3b3b]">{t.text}</p>
                      {t.hint ? <p className="mt-1 text-xs text-[#9aa3b2]">{t.hint}</p> : null}
                    </>
                  ) : (
                    <>
                      <p className="text-[#e8ecf1]">{t.text}</p>
                      {t.meta ? (
                        <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-[#2de2e6]/60">{t.meta}</p>
                      ) : null}
                    </>
                  )}
                </div>
              ))}
              {busy ? <p className="text-sm italic text-[#9aa3b2]">{npc.name} is thinking…</p> : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {npc.actions.map((action) =>
                action.href && action.href !== "/table" ? (
                  <Link
                    key={action.id}
                    to={action.href}
                    className="inline-flex h-9 items-center rounded-sm border border-[#2de2e6]/50 bg-[#1e222b] px-3 text-xs uppercase tracking-[0.14em] text-[#2de2e6] hover:bg-[#2de2e6]/10"
                  >
                    {action.label}
                  </Link>
                ) : (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => runAction(action)}
                    className="inline-flex h-9 items-center rounded-sm border border-[#ffc857]/50 bg-[#1e222b] px-3 text-xs uppercase tracking-[0.14em] text-[#ffc857] hover:bg-[#ffc857]/10"
                  >
                    {action.label}
                  </button>
                ),
              )}
            </div>

            {user ? (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Speak to ${npc.name}…`}
                  className="h-10 flex-1 rounded-sm border border-[#3a3f4b] bg-[#1e222b] px-3 text-sm text-[#e8ecf1] outline-none placeholder:text-[#6b7280] focus:border-[#2de2e6]"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="h-10 rounded-sm bg-[#2de2e6] px-4 text-sm font-medium text-[#0b0e14] disabled:opacity-50"
                >
                  {busy ? "…" : "Say"}
                </button>
              </form>
            ) : (
              <p className="mt-3 text-sm text-[#9aa3b2]">
                Action buttons work now.{" "}
                <Link to="/login" className="text-[#2de2e6] underline-offset-2 hover:underline">
                  Sign in
                </Link>{" "}
                only if you want a freeform reply.
              </p>
            )}

            </div>
            <span className="pointer-events-none absolute bottom-4 right-4 text-[#2de2e6]">◆</span>
          </div>
        </div>
      </div>
    </div>
  );
}
