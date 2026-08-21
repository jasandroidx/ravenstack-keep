import { useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { TalkSheet } from "@/components/hall/talk-sheet";
import type { HallScene } from "@/lib/hall/scene";
import type { HallNpc } from "@/lib/hall/world";
import { getKeepSnapshot } from "@/lib/keep/server";
import type { KeepPulse } from "@/lib/keep/pulse";

type Stick = { x: number; y: number };

export function KeepHall() {
  const host = useRef<HTMLDivElement>(null);
  const gameRef = useRef<{
    destroy: (removeCanvas: boolean) => void;
    scale: { resize: (w: number, h: number) => void; stopListeners?: () => void };
  } | null>(null);
  const sceneRef = useRef<HallScene | null>(null);
  const [zone, setZone] = useState("Great Hall");
  const [lock, setLock] = useState("live");
  const [near, setNear] = useState<HallNpc | null>(null);
  const [atTable, setAtTable] = useState(false);
  const [talk, setTalk] = useState<HallNpc | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [pulse, setPulse] = useState<KeepPulse | null>(null);

  useEffect(() => {
    let alive = true;
    getKeepSnapshot()
      .then((snap) => {
        if (alive) setPulse(snap.pulse);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    let starting = false;

    async function boot(w: number, h: number) {
      if (dead || starting || gameRef.current || !host.current) return;
      starting = true;
      const Phaser = (await import("phaser")).default;
      const { HallScene } = await import("@/lib/hall/scene");
      if (dead || !host.current) return;

      const scene = new HallScene({
        onZone: (name, nextLock) => {
          setZone(name);
          setLock(nextLock);
        },
        onPrompt: (npc, table) => {
          setNear(npc);
          setAtTable(table);
        },
        onTalk: (npc) => {
          setTalk(npc);
          setTableOpen(false);
        },
        onTable: () => {
          setTalk(null);
          setTableOpen(true);
        },
      });
      sceneRef.current = scene;

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current,
        width: w,
        height: h,
        backgroundColor: "#0b0e14",
        pixelArt: true,
        antialias: false,
        roundPixels: true,
        physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
        scale: { mode: Phaser.Scale.NONE },
        scene,
      });
      gameRef.current = game;
      host.current.querySelector("canvas")?.focus();
    }

    const ro = new ResizeObserver(() => {
      if (dead || !el) return;
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      if (w < 16 || h < 16) return;
      if (!gameRef.current) {
        void boot(w, h);
        return;
      }
      gameRef.current.scale.resize(w, h);
    });
    ro.observe(el);

    return () => {
      dead = true;
      ro.disconnect();
      sceneRef.current = null;
      try {
        gameRef.current?.scale.stopListeners?.();
      } catch {
        /* Phaser may already be tearing down */
      }
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.paused = Boolean(talk || tableOpen);
  }, [talk, tableOpen]);

  useEffect(() => {
    const held = new Set<string>();
    function sync() {
      if (talk || tableOpen) {
        sceneRef.current?.setDir(0, 0);
        return;
      }
      const x = (held.has("d") || held.has("arrowright") ? 1 : 0) - (held.has("a") || held.has("arrowleft") ? 1 : 0);
      const y = (held.has("s") || held.has("arrowdown") ? 1 : 0) - (held.has("w") || held.has("arrowup") ? 1 : 0);
      sceneRef.current?.setDir(x, y);
    }
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (talk || tableOpen) {
        if (e.key === "Escape") {
          setTalk(null);
          setTableOpen(false);
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "e" || e.key === " ") {
        e.preventDefault();
        sceneRef.current?.interact();
        return;
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
        if (e.type === "keydown") held.add(k);
        else held.delete(k);
        sync();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", () => {
      held.clear();
      sceneRef.current?.setDir(0, 0);
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      sceneRef.current?.setDir(0, 0);
    };
  }, [talk, tableOpen]);

  function hold(dir: Stick) {
    return {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        sceneRef.current?.setDir(dir.x, dir.y);
      },
      onPointerUp: () => sceneRef.current?.setDir(0, 0),
      onPointerLeave: () => sceneRef.current?.setDir(0, 0),
    };
  }

  const hint = near
    ? `Talk to ${near.name}`
    : atTable
      ? "Sit the war table"
      : "WASD or tap the floor · arrows if the keyboard is captured";

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b0e14] overscroll-none">
      <div
        ref={host}
        className="absolute inset-0 z-0"
        onPointerDown={() => host.current?.querySelector("canvas")?.focus()}
      />

      {talk || tableOpen ? null : (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3 md:p-4">
          <div className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/80 px-3 py-2 backdrop-blur-md">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#9aa3b2]">Ravenstack Keep</p>
            <p className="font-display text-xl leading-none text-[#e8ecf1]">
              {zone}{" "}
              <span className={lock === "live" ? "text-[#39ff14]" : "text-[#ffc857]"}>· {lock}</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#9aa3b2]">
              occupancy {pulse?.source ?? "…"}
              {pulse ? ` · ${pulse.agentsActive} active` : ""}
            </p>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <Link
              to="/rooms"
              className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/80 px-3 py-2 text-xs uppercase tracking-[0.14em] text-[#9aa3b2] backdrop-blur-md hover:text-[#e8ecf1]"
            >
              Ledger
            </Link>
            <Link
              to="/table"
              className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/80 px-3 py-2 text-xs uppercase tracking-[0.14em] text-[#9aa3b2] backdrop-blur-md hover:text-[#e8ecf1]"
            >
              Table
            </Link>
          </div>
        </div>
      )}

      {talk || tableOpen ? null : (
        <div className="pointer-events-auto absolute bottom-4 left-4 z-10 grid grid-cols-3 gap-1">
          <span />
          <Pad {...hold({ x: 0, y: -1 })}>▲</Pad>
          <span />
          <Pad {...hold({ x: -1, y: 0 })}>◀</Pad>
          <Pad {...hold({ x: 0, y: 1 })}>▼</Pad>
          <Pad {...hold({ x: 1, y: 0 })}>▶</Pad>
        </div>
      )}

      {talk || tableOpen ? null : (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          <p className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/80 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-[#9aa3b2] backdrop-blur-md">
            {hint}
          </p>
          {near || atTable ? (
            <button
              type="button"
              className="pointer-events-auto rounded-sm bg-[#2de2e6] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0b0e14]"
              onClick={() => {
                if (near) setTalk(near);
                else setTableOpen(true);
              }}
            >
              Talk
            </button>
          ) : null}
        </div>
      )}

      {talk ? (
        <TalkSheet
          npc={talk}
          onClose={() => setTalk(null)}
          onTable={() => {
            setTalk(null);
            setTableOpen(true);
          }}
        />
      ) : null}

      {tableOpen ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 border-t border-[#3a3f4b] bg-[#0b0e14]/95 p-5 backdrop-blur-md">
          <div className="mx-auto max-w-xl">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl">War table</h2>
              <button
                type="button"
                onClick={() => setTableOpen(false)}
                className="text-xs uppercase tracking-[0.16em] text-[#9aa3b2]"
              >
                Stand
              </button>
            </div>
            <p className="mt-2 text-sm text-[#9aa3b2]">
              The oak is live. Convene the seats for a hard question — they argue, then stop for you.
            </p>
            <Link
              to="/table"
              className="mt-4 inline-flex h-10 items-center rounded-sm bg-[#2de2e6] px-4 text-sm text-[#0b0e14]"
            >
              Sit the table
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Pad({
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-11 w-11 items-center justify-center rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/80 text-sm text-[#2de2e6] backdrop-blur-md active:bg-[#2de2e6]/20"
      {...rest}
    >
      {children}
    </button>
  );
}
