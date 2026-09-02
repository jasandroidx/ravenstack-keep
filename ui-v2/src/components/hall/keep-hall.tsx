import { useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { TalkSheet } from "@/components/hall/talk-sheet";
import type { HallScene } from "@/lib/hall/scene";
import { RAVENLORD_SKINS, type HallNpc, type RavenlordSkin } from "@/lib/hall/world";
import { getKeepSnapshot } from "@/lib/keep/server";
import type { KeepPulse } from "@/lib/keep/pulse";
import { hallAudio } from "@/lib/hall/audio";
import { WarTablePanel } from "@/components/keep/war-table-panel";
import { getHallState, listQuarantine } from "@/lib/keep/server";
import { pickBark, type HallState } from "@/lib/hall/barks";
import { FastMCPStatusBadge } from "@/components/keep/fastmcp-status-badge";
import { toast } from "sonner";

type Stick = { x: number; y: number };

export function KeepHall() {
  const host = useRef<HTMLDivElement>(null);
  const gameRef = useRef<{
    destroy: (removeCanvas: boolean) => void;
    scale: { resize: (w: number, h: number) => void; stopListeners?: () => void };
  } | null>(null);
  const sceneRef = useRef<HallScene | null>(null);
  const hallStateRef = useRef<HallState | null>(null);
  const [zone, setZone] = useState("Great Hall");
  const [lock, setLock] = useState("live");
  const [near, setNear] = useState<HallNpc | null>(null);
  const [atTable, setAtTable] = useState(false);
  const [talk, setTalk] = useState<HallNpc | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [hallState, setHallState] = useState<HallState | null>(null);
  // Chosen once per conversation. pickBark spends a line from the pool, so it
  // must not run on every render or the greeting would reroll mid-sentence.
  const [bark, setBark] = useState<string | null>(null);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [activeSkin, setActiveSkin] = useState("ravenlord");
  const [pulse, setPulse] = useState<KeepPulse | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);

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

  function handleEquipSkin(skin: RavenlordSkin) {
    setActiveSkin(skin.id);
    sceneRef.current?.setSkin(skin.id);
    hallAudio.playArmorEquip();
    toast.success(`Equipped ${skin.name} Armor Plate`);
  }


  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    let starting = false;

    async function boot(w: number, h: number) {
      if (typeof window === "undefined" || dead || starting || gameRef.current || !host.current) return;
      starting = true;
      try {
        const phaserMod = await import("phaser");
        const Phaser = (phaserMod as unknown as { default?: typeof phaserMod }).default || phaserMod;
        const { HallScene } = await import("@/lib/hall/scene");
        if (dead || !host.current || gameRef.current) return;

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
            setBark(pickBark(npc.id, hallStateRef.current));
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
          width: Math.max(w, 400),
          height: Math.max(h, 300),
          backgroundColor: "#0b0e14",
          pixelArt: true,
          antialias: false,
          roundPixels: true,
          physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
          scale: { mode: Phaser.Scale?.NONE ?? 0 },
          scene,
        });
        gameRef.current = game;
        host.current.querySelector("canvas")?.focus();
      } catch (err) {
        if (!dead && err) {
          console.error("KeepHall boot error:", err);
        }
      } finally {
        starting = false;
      }
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
      try {
        gameRef.current.scale.resize(w, h);
      } catch {
        /* ignore resize error during teardown */
      }
    });
    ro.observe(el);

    const initialW = Math.floor(el.clientWidth || window.innerWidth || 800);
    const initialH = Math.floor(el.clientHeight || window.innerHeight || 600);
    if (initialW >= 16 && initialH >= 16) {
      void boot(initialW, initialH);
    }

    return () => {
      dead = true;
      ro.disconnect();
      sceneRef.current = null;
      try {
        gameRef.current?.scale.stopListeners?.();
      } catch {
        /* Phaser may already be tearing down */
      }
      try {
        gameRef.current?.destroy(true);
      } catch {
        /* ignore */
      }
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
  // One read of what the Keep can actually see, refreshed as you play. NPC
  // greetings are templated over these fields — never over anything guessed.
  useEffect(() => {
    let alive = true;
    const load = () =>
      getHallState()
        .then((s) => {
          if (!alive) return;
          const next = { ...s, hour: new Date().getHours() };
          hallStateRef.current = next;
          setHallState(next);
        })
        .catch(() => {
          /* Unreadable. hallState stays null and every NPC falls back to its
             written greeting rather than narrating a night it cannot see. */
        });
    load();
    const t = setInterval(load, 90000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // The Inquisitor watches the cell. Open quarantine records colour the eye
  // the moment you walk in — you learn a model lied before you ask it anything.
  //
  // The scene is built inside Phaser's async create(), so it may not exist when
  // this resolves. Wait for it rather than dropping the signal on a race.
  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;

    function applyTo(scene: HallScene, openClaim: string | null) {
      if (openClaim) scene.flareQuarantine(openClaim);
      else scene.setTruthState("sourced");
    }

    listQuarantine()
      .then((rows) => {
        if (!alive) return;
        const open = rows.filter((r) => r.status === "open");
        const claim = open.length > 0 ? open[0].claim : null;
        const attempt = () => {
          if (!alive) return;
          const scene = sceneRef.current;
          if (scene) {
            applyTo(scene, claim);
          } else if (tries++ < 40) {
            timer = setTimeout(attempt, 150);
          }
        };
        attempt();
      })
      .catch(() => {
        /* Not signed in, or the cell is unreadable. The eye keeps its current
           colour rather than claiming the cell is clear. */
      });

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

    if (sceneRef.current) sceneRef.current.paused = Boolean(talk || tableOpen || wardrobeOpen);
  }, [talk, tableOpen, wardrobeOpen]);

  useEffect(() => {
    const held = new Set<string>();
    function sync() {
      if (talk || tableOpen || wardrobeOpen) {
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
      if (talk || tableOpen || wardrobeOpen) {
        if (e.key === "Escape") {
          hallAudio.playInteract();
          setTalk(null);
          setTableOpen(false);
          setWardrobeOpen(false);
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "c") {
        e.preventDefault();
        hallAudio.playInteract();
        setWardrobeOpen(true);
        return;
      }
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
  }, [talk, tableOpen, wardrobeOpen]);

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
    ? `[E / SPACE] Talk to ${near.name}`
    : atTable
      ? "[E / SPACE] Sit the war table"
      : "WASD / ARROWS to walk · [C] Ravenlord Wardrobe · Click floor to travel";

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b0e14] overscroll-none select-none">
      <div
        ref={host}
        className="absolute inset-0 z-0"
        onPointerDown={() => host.current?.querySelector("canvas")?.focus()}
      />

      {talk || tableOpen || wardrobeOpen ? null : (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3 md:p-4">
          <div className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/85 px-3.5 py-2.5 shadow-[0_0_20px_rgba(0,0,0,0.6)] backdrop-blur-md">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9aa3b2]">Ravenstack Keep</p>
            <p className="font-mono text-base font-bold text-[#e8ecf1]">
              {zone}{" "}
              <span className={lock === "live" ? "text-[#39ff14]" : "text-[#ffc857]"}>· {lock}</span>
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#9aa3b2]">
              occupancy {pulse?.source ?? "…"}
              {pulse ? ` · ${pulse.agentsActive} active` : ""}
            </p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <FastMCPStatusBadge />
            <button
              type="button"
              onClick={() => {
                hallAudio.playInteract();
                setWardrobeOpen(true);
              }}
              title="Open Ravenlord Armor Wardrobe [C]"
              className="rounded-sm border border-[#ffc857]/60 bg-[#ffc857]/10 px-2.5 py-2 font-mono text-xs uppercase tracking-wider text-[#ffc857] backdrop-blur-md transition hover:bg-[#ffc857]/25 hover:text-[#e8ecf1]"
            >
              🛡️ Armor [C]
            </button>
            <button
              type="button"
              onClick={() => {
                sceneRef.current?.triggerOracleManifestation();
              }}
              title="Summon The Oracle (Spectral Inquisitor)"
              className="rounded-sm border border-[#39ff14]/60 bg-[#39ff14]/10 px-2.5 py-2 font-mono text-xs uppercase tracking-wider text-[#39ff14] backdrop-blur-md transition hover:bg-[#39ff14]/25 hover:text-[#e8ecf1]"
            >
              👁️ Oracle
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !audioMuted;
                setAudioMuted(next);
                hallAudio.enabled = !next;
                if (!next) hallAudio.playInteract();
              }}
              title={audioMuted ? "Unmute Audio" : "Mute Audio"}
              className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/85 px-2.5 py-2 font-mono text-xs uppercase tracking-wider text-[#9aa3b2] backdrop-blur-md transition hover:border-[#2de2e6] hover:text-[#e8ecf1]"
            >
              {audioMuted ? "🔇 Muted" : "🔊 Audio"}
            </button>
            <Link
              to="/oracle"
              onClick={() => hallAudio.playOracleGaze()}
              className="rounded-sm border border-[#39ff14]/40 bg-[#0b0e14]/85 px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[#39ff14] backdrop-blur-md transition hover:border-[#39ff14] hover:text-[#e8ecf1]"
            >
              Registry
            </Link>
            <Link
              to="/gallery"
              onClick={() => hallAudio.playZoneTransition()}
              className="rounded-sm border border-[#2de2e6]/60 bg-[#2de2e6]/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[#2de2e6] backdrop-blur-md transition hover:bg-[#2de2e6]/25"
            >
              Gallery
            </Link>
            <Link
              to="/rooms"
              className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/85 px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[#9aa3b2] backdrop-blur-md transition hover:text-[#e8ecf1]"
            >
              Ledger
            </Link>
            <Link
              to="/table"
              className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/85 px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[#9aa3b2] backdrop-blur-md transition hover:text-[#e8ecf1]"
            >
              Table
            </Link>
          </div>
        </div>
      )}

      {/* D-Pad on Touch Devices */}
      {talk || tableOpen || wardrobeOpen ? null : (
        <div className="pointer-events-auto absolute bottom-4 left-4 z-10 grid grid-cols-3 gap-1 md:hidden">
          <span />
          <Pad {...hold({ x: 0, y: -1 })}>▲</Pad>
          <span />
          <Pad {...hold({ x: -1, y: 0 })}>◀</Pad>
          <Pad {...hold({ x: 0, y: 1 })}>▼</Pad>
          <Pad {...hold({ x: 1, y: 0 })}>▶</Pad>
        </div>
      )}

      {/* Center Action & Interaction HUD Banner */}
      {talk || tableOpen || wardrobeOpen ? null : (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          <p className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/85 px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#e8ecf1] shadow-[0_0_15px_rgba(0,0,0,0.7)] backdrop-blur-md">
            {hint}
          </p>
          {near || atTable ? (
            <button
              type="button"
              className="pointer-events-auto rounded-sm bg-[#2de2e6] px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#0b0e14] shadow-[0_0_15px_rgba(45,226,230,0.4)] transition hover:bg-[#2de2e6]/90"
              onClick={() => {
                hallAudio.playInteract();
                if (near) {
                  setBark(pickBark(near.id, hallStateRef.current));
                  setTalk(near);
                }
                else setTableOpen(true);
              }}
            >
              Engage [E]
            </button>
          ) : null}
        </div>
      )}

      {talk ? (
        <TalkSheet
          npc={talk}
          greetingOverride={bark ?? undefined}
          currentSkinId={activeSkin}
          onSelectSkin={(skinId) => {
            setActiveSkin(skinId);
            sceneRef.current?.setSkin(skinId);
          }}
          onClose={() => setTalk(null)}
          onTable={() => {
            setTalk(null);
            setTableOpen(true);
          }}
        />
      ) : null}

      {/* Standalone Wardrobe / Armor Cuirass Screen */}
      {wardrobeOpen ? (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-4xl rounded-md border border-[#3a3f4b] bg-[#0b0e14]/95 p-6 shadow-[0_0_50px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-[#1e222b] pb-4">
              <div>
                <h2 className="font-mono text-lg font-bold tracking-wider text-[#e8ecf1]">
                  🛡️ Sovereign Ravenlord Wardrobe
                </h2>
                <p className="font-mono text-xs text-[#9aa3b2]">
                  Customize Jason Boyd's tactical cuirass. Textures and walk lean dynamics update instantaneously.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  hallAudio.playInteract();
                  setWardrobeOpen(false);
                }}
                className="rounded-sm border border-[#3a3f4b] bg-[#1e222b] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-[#9aa3b2] hover:border-[#2de2e6] hover:text-[#e8ecf1]"
              >
                [ESC] Close
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              {RAVENLORD_SKINS.map((skin) => {
                const isEquipped = activeSkin === skin.id;
                return (
                  <div
                    key={skin.id}
                    className={`flex flex-col justify-between rounded-sm border p-4 transition-all ${
                      isEquipped
                        ? "border-[#2de2e6] bg-[#2de2e6]/10 shadow-[0_0_20px_rgba(45,226,230,0.25)]"
                        : "border-[#3a3f4b] bg-[#1e222b]/50 hover:border-[#9aa3b2]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold tracking-wider" style={{ color: skin.accent }}>
                          {skin.badge}
                        </span>
                        {isEquipped && (
                          <span className="rounded bg-[#2de2e6] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#0b0e14]">
                            ACTIVE
                          </span>
                        )}
                      </div>

                      <div className="my-3 flex h-28 items-center justify-center rounded-sm bg-[#0b0e14] border border-[#3a3f4b]/60">
                        <img
                          src={skin.src}
                          alt={skin.name}
                          className="h-20 w-auto object-none object-top pixelated"
                          style={{ imageRendering: "pixelated" }}
                        />
                      </div>

                      <h4 className="font-mono text-xs font-bold text-[#e8ecf1]">{skin.name}</h4>
                      <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#9aa3b2]">
                        {skin.description}
                      </p>

                      <div className="mt-3 space-y-1 border-t border-[#3a3f4b]/50 pt-2 font-mono text-[9px]">
                        <div className="flex justify-between text-[#9aa3b2]">
                          <span>Armor:</span>
                          <span className="font-bold text-[#e8ecf1]">{skin.stats.armor} DEF</span>
                        </div>
                        <div className="flex justify-between text-[#9aa3b2]">
                          <span>Flux Conduit:</span>
                          <span style={{ color: skin.accent }}>{skin.stats.conduit}</span>
                        </div>
                        <div className="flex justify-between text-[#9aa3b2]">
                          <span>Affinity:</span>
                          <span className="text-[#e8ecf1]">{skin.stats.affinity}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isEquipped}
                      onClick={() => handleEquipSkin(skin)}
                      className={`mt-4 h-8 w-full rounded-sm font-mono text-[11px] font-bold uppercase tracking-wider transition ${
                        isEquipped
                          ? "bg-[#2de2e6]/20 text-[#2de2e6] cursor-default border border-[#2de2e6]/40"
                          : "bg-[#e8ecf1] text-[#0b0e14] hover:bg-[#2de2e6] hover:text-[#0b0e14]"
                      }`}
                    >
                      {isEquipped ? "Equipped" : "Equip Cuirass"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}


      {tableOpen ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 border-t border-[#3a3f4b] bg-[#0b0e14]/95 p-6 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-baseline justify-between border-b border-[#1e222b] pb-3">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-[#2de2e6] animate-pulse" />
                <h2 className="font-mono text-xl font-bold tracking-wider text-[#e8ecf1]">The War Table</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  hallAudio.playInteract();
                  setTableOpen(false);
                }}
                className="font-mono text-xs uppercase tracking-[0.16em] text-[#9aa3b2] hover:text-[#e8ecf1]"
              >
                [ESC] Stand
              </button>
            </div>
            <p className="mt-3 font-mono text-sm leading-relaxed text-[#9aa3b2]">
              The ancient oak table sits at the center of the Keep. Gates waiting on your
              seal are laid out here.
            </p>

            <WarTablePanel />

            <div className="mt-5 flex gap-3">
              <Link
                to="/table"
                onClick={() => hallAudio.playZoneTransition()}
                className="inline-flex h-10 items-center rounded-sm bg-[#2de2e6] px-5 font-mono text-xs font-bold uppercase tracking-wider text-[#0b0e14] transition hover:bg-[#2de2e6]/90"
              >
                Convene the Council
              </Link>
              <button
                type="button"
                onClick={() => {
                  hallAudio.playInteract();
                  setTableOpen(false);
                }}
                className="inline-flex h-10 items-center rounded-sm border border-[#3a3f4b] bg-[#1e222b] px-4 font-mono text-xs uppercase tracking-wider text-[#e8ecf1] hover:border-[#2de2e6]"
              >
                Step Away
              </button>
            </div>
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
      className="flex h-11 w-11 items-center justify-center rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/85 font-mono text-sm text-[#2de2e6] backdrop-blur-md active:bg-[#2de2e6]/20"
      {...rest}
    >
      {children}
    </button>
  );
}
