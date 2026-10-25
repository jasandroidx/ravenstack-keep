import { useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { TalkSheet } from "@/components/hall/talk-sheet";
import type { HallScene } from "@/lib/hall/scene";
import { RoomScene } from "@/lib/hall/room-scene";
import { RAVENLORD_SKINS, type HallNpc, type RavenlordSkin } from "@/lib/hall/world";
import { getKeepSnapshot } from "@/lib/keep/server";
import type { KeepPulse } from "@/lib/keep/pulse";
import { hallAudio } from "@/lib/hall/audio";
import { pickHeraldLineAsync } from "@/lib/hall/herald";
import { WarTablePanel } from "@/components/keep/war-table-panel";
import { getHallState, getPendingGates, listQuarantine, talkInHall } from "@/lib/keep/server";
import { pickBarkAsync, type HallState } from "@/lib/hall/barks";
import { FastMCPStatusBadge } from "@/components/keep/fastmcp-status-badge";
import { toast } from "sonner";

type Stick = { x: number; y: number };

export function KeepHall() {
  const host = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const gameRef = useRef<{
    destroy: (removeCanvas: boolean) => void;
    scale: { resize: (w: number, h: number) => void; stopListeners?: () => void };
  } | null>(null);
  const sceneRef = useRef<any>(null);
  const hallStateRef = useRef<HallState | null>(null);
  const [zone, setZone] = useState("Great Hall");
  const [lock, setLock] = useState("live");
  const [near, setNear] = useState<HallNpc | null>(null);
  const [atTable, setAtTable] = useState(false);
  const [talk, setTalk] = useState<HallNpc | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  // Chosen once per conversation. pickBark spends a line from the pool, so it
  // must not run on every render or the greeting would reroll mid-sentence.
  const [bark, setBark] = useState<string | null>(null);
  /** Gates sealed at this table, ever. Drives the wax seals left on it. */
  const sealCount = useRef(0);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [activeSkin, setActiveSkin] = useState(() => {
    try {
      const saved = localStorage.getItem("ravenlord_skin");
      if (saved && RAVENLORD_SKINS.some((sk) => sk.id === saved)) return saved;
    } catch { /* ignore */ }
    return "ravenlord";
  });
  const [pulse, setPulse] = useState<KeepPulse | null>(null);
  const [pendingGates, setPendingGates] = useState(0);
  const [audioMuted, setAudioMuted] = useState(false);
  const [askText, setAskText] = useState("");
  const [asking, setAsking] = useState(false);
  const [heraldLine, setHeraldLine] = useState<string | null>(null);
  const [teleportOpen, setTeleportOpen] = useState(false);
  const [sceneKey, setSceneKey] = useState("HallScene");
  type KeepSettings = { sound: boolean; teleportAnim: boolean; walkSpeed: "slow" | "normal" | "fast"; cameraFollow: boolean };
  const DEFAULT_SETTINGS: KeepSettings = { sound: true, teleportAnim: true, walkSpeed: "normal", cameraFollow: true };
  const [settings, setSettings] = useState<KeepSettings>(() => {
    try {
      const raw = localStorage.getItem("keep-settings");
      if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<KeepSettings>) };
    } catch { /* ignore */ }
    return DEFAULT_SETTINGS;
  });
  const settingsRef = useRef(settings);

  function applyCameraFollow(scene: any) {
    try {
      const cam = scene?.cameras?.main;
      const pl = scene?.player;
      if (!cam || !pl) return;
      if (settingsRef.current.cameraFollow) cam.startFollow(pl, true, 0.09, 0.09);
      else { cam.stopFollow(); cam.centerOn(pl.x, pl.y); }
    } catch { /* ignore */ }
  }

  function burst(scene: any, x: number, y: number) {
    try {
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 30 + Math.random() * 70;
        const c = scene.add.circle(x, y, 3 + Math.random() * 4, 0x2de2e6, 0.9).setDepth(50);
        scene.tweens.add({
          targets: c, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0,
          duration: 500 + Math.random() * 300, ease: "Quad.easeOut",
          onComplete: () => { try { c.destroy(); } catch { /* ignore */ } },
        });
      }
    } catch { /* ignore */ }
  }

  const TELEPORT_TARGETS = [
    { key: "HallScene", label: "Great Hall", spawn: { x: 760, y: 650 }, hero: { x: 820, y: 670 } },
    { key: "ReconRoomScene", label: "Recon", spawn: { x: 800, y: 1400 }, hero: { x: 800, y: 340 } },
    { key: "SearchRoomScene", label: "Search", spawn: { x: 800, y: 1400 }, hero: { x: 800, y: 800 } },
    { key: "SploitRoomScene", label: "Sploit", spawn: { x: 800, y: 1400 }, hero: { x: 800, y: 800 } },
    { key: "CitadelRoomScene", label: "Citadel", spawn: { x: 800, y: 1400 }, hero: { x: 800, y: 800 } },
    { key: "TowerRoomScene", label: "Tower", spawn: { x: 800, y: 1400 }, hero: { x: 800, y: 500 } },
  ];

  function teleportTo(t: (typeof TELEPORT_TARGETS)[number]) {
    const s = settings;
    setTeleportOpen(false);
    if (sceneKey === t.key) return; // already here — no pointless scene restart
    const game = gameRef.current as any;
    const cur = game?.scene?.getScene(sceneKey) ?? sceneRef.current;
    const doSwitch = () => { try { cur?.scene?.start(t.key, { spawn: t.spawn }); } catch { /* ignore */ } };
    if (!s.teleportAnim) { doSwitch(); return; }
    try { const pl = cur?.player; if (pl) burst(cur, pl.x, pl.y); } catch { /* ignore */ }
    if (s.sound) hallAudio.playTeleport();
    try { cur?.cameras?.main?.fadeOut(250); } catch { /* ignore */ }
    window.setTimeout(() => {
      doSwitch();
      window.setTimeout(() => {
        try {
          const next = game?.scene?.getScene(t.key) ?? sceneRef.current;
          if (!next) return;
          const pl = next.player;
          if (pl) burst(next, pl.x, pl.y);
          if (s.sound) hallAudio.playTeleport();
          if (s.cameraFollow && pl && next.cameras?.main) {
            const cam = next.cameras.main;
            cam.stopFollow();
            cam.pan(t.hero.x, t.hero.y, 700);
            next.time.delayedCall(750, () => {
              try {
                cam.pan(pl.x, pl.y, 500);
                next.time.delayedCall(550, () => { try { cam.startFollow(pl, true, 0.09, 0.09); } catch { /* ignore */ } });
              } catch { /* ignore */ }
            });
          }
        } catch { /* ignore */ }
      }, 300);
    }, 260);
  }

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

  // War table gate glow: amber only while the bridge reports a pending gate.
  // Bridge unreachable is zero — never invent a chip. Polls on a slow cadence
  // and skips hidden tabs; the seal handler below refetches straight after a
  // decision so the glow clears the moment a gate resolves.
  useEffect(() => {
    let alive = true;
    const load = () => {
      getPendingGates()
        .then((snap) => {
          if (alive) setPendingGates(snap.gates.length);
        })
        .catch(() => undefined);
    };
    load();
    const t = setInterval(() => {
      if (document.hidden) return;
      load();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Herald: ambient flavor, not status. Fires on a randomized cadence so it
  // reads as something noticing the hall rather than a metronome. Paused
  // during any modal — a thought line under a dialogue box is just noise.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (!(talk || tableOpen || wardrobeOpen || teleportOpen)) {
        const line = await pickHeraldLineAsync(new Date().getHours());
        if (line) {
          setHeraldLine(line.text);
          if (line.category === "torchlight") sceneRef.current?.pulseTorch();
        }
      }
      timer = setTimeout(tick, 45000 + Math.random() * 45000);
    };
    timer = setTimeout(tick, 8000 + Math.random() * 10000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [talk, tableOpen, wardrobeOpen, teleportOpen]);

  // Settings persist in localStorage and drive the live game: walk speed via
  // a window slot the scenes read every frame, sound via hallAudio + the HUD
  // mute button (one control, two places — this effect keeps them in sync).
  useEffect(() => {
    try { localStorage.setItem("keep-settings", JSON.stringify(settings)); } catch { /* ignore */ }
    settingsRef.current = settings;
    (window as unknown as Record<string, unknown>).__keepWalkSpeed =
      settings.walkSpeed === "slow" ? 110 : settings.walkSpeed === "fast" ? 260 : 175;
    setAudioMuted(!settings.sound);
    hallAudio.enabled = settings.sound;
  }, [settings]);

  // Ask a walking NPC a real question: the answer lands in a speech bubble
  // above that NPC via the existing talkInHall leg (FreeLLMAPI-first). If the
  // model is down, or the player is signed out (talkInHall needs auth), there
  // is no error bubble and no fake answer — the button just resets and the
  // preset timer lines keep working.
  async function askNpc() {
    if (!near || asking) return;
    const q = askText.trim();
    if (!q) return;
    setAsking(true);
    try {
      const res = await talkInHall({ data: { agent: near.id, message: q } });
      if (res.ok) {
        sceneRef.current?.showBubble(near.id, res.reply);
        setAskText("");
      }
    } catch { /* no error bubble, no fake answer */ }
    finally { setAsking(false); }
  }

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
    // Exactly one Phaser.Game per mount. `created` closes the last window a
    // second game could slip in (ResizeObserver races the initial boot), so
    // the Phaser banner and canvas exist exactly once per page visit.
    let created = false;

    async function boot(w: number, h: number) {
      if (typeof window === "undefined" || dead || starting || created || gameRef.current || !host.current) return;
      starting = true;
      try {
        const phaserMod = await import("phaser");
        const Phaser = (phaserMod as unknown as { default?: typeof phaserMod }).default || phaserMod;
        const { HallScene } = await import("@/lib/hall/scene");
        if (dead || !host.current || created || gameRef.current) return;

        const hallEvents = {
          onZone: (name: string, nextLock: string) => {
            setZone(name);
            setLock(nextLock);
          },
          onPrompt: (npc: HallNpc | null, table: boolean) => {
            setNear(npc);
            setAtTable(table);
          },
          onTalk: (npc: HallNpc) => {
            pickBarkAsync(npc.id, hallStateRef.current).then(setBark);
            setTalk(npc);
            setTableOpen(false);
          },
          onSceneReady: (liveScene: HallScene) => {
            sceneRef.current = liveScene;
            setSceneKey(liveScene.scene.key);
            applyCameraFollow(liveScene);
          },
          onEnterCell: () => {
            // Stage the newest unresolved fabrication. Nothing open, nothing
            // to stage — the cell is not theatre for its own sake.
            listQuarantine()
              .then((rows) => {
                const open = rows.filter((r) => r.status === "open")[0];
                if (!open) return;
                sceneRef.current?.openTableau(
                  open.claim,
                  open.prompt,
                  open.evidence,
                  open.created_at,
                );
              })
              .catch(() => {
                /* Cell unreadable. No tableau rather than an invented one. */
              });
          },
          onTable: () => {
            setTalk(null);
            setTableOpen(true);
          },
        };
        const scene = new HallScene(hallEvents, {
          key: "HallScene",
          spawn: { x: 760, y: 650 },
          portals: [
            { id: "stairs-to-yard-test", x: 820, y: 670, w: 160, h: 70, targetScene: "HallTestCloneScene", targetSpawn: { x: 760, y: 500 }, label: "TEST DOOR → CLONE" },
            { id: "library-to-recon", x: 300, y: 200, w: 120, h: 60, targetScene: "ReconRoomScene", targetSpawn: { x: 800, y: 1400 }, label: "RECON →" },
            { id: "workshop-to-search", x: 1500, y: 300, w: 120, h: 60, targetScene: "SearchRoomScene", targetSpawn: { x: 800, y: 1400 }, label: "SEARCH →" },
            { id: "yard-to-sploit", x: 1000, y: 800, w: 120, h: 60, targetScene: "SploitRoomScene", targetSpawn: { x: 800, y: 1400 }, label: "SPLOIT →" },
            { id: "hall-to-citadel", x: 600, y: 600, w: 120, h: 60, targetScene: "CitadelRoomScene", targetSpawn: { x: 800, y: 1400 }, label: "CITADEL →" },
            { id: "yard-to-tower", x: 700, y: 800, w: 120, h: 60, targetScene: "TowerRoomScene", targetSpawn: { x: 800, y: 1400 }, label: "TOWER →" },
          ],
        });
        const cloneScene = new HallScene(hallEvents, {
          key: "HallTestCloneScene",
          spawn: { x: 760, y: 500 },
          portals: [
            { id: "clone-return", x: 740, y: 450, w: 160, h: 70, targetScene: "HallScene", targetSpawn: { x: 760, y: 650 }, label: "RETURN → HALL" },
          ],
        });
        const reconScene = new RoomScene({
          key: "ReconRoomScene",
          mapSrc: "/hall/rooms/recon.jpg",
          mapW: 1600,
          mapH: 1600,
          spawn: { x: 800, y: 1400 },
          launcher: { label: "RAVEN RECON", url: "https://ravenserve.tail20a090.ts.net:8446", kind: "radar", x: 800, y: 340 },
          torches: [{ x: 320, y: 260 }, { x: 1280, y: 260 }],
          portals: [
            { id: "recon-return", x: 700, y: 1450, w: 200, h: 150, targetScene: "HallScene", targetSpawn: { x: 360, y: 280 }, label: "RETURN → HALL" },
          ],
          furniture: [
            { id: "radar", label: "RADAR — BRIEF SCANNER", info: "Raven Recon :8446 — live backend, /health ok 2026-10-25. Brief scanner: run_brief + surveillance logs.", x: 800, y: 800, radius: 120 },
            { id: "mirror-1", label: "SCRYING MIRROR", info: "FIXTURE — no live fetch. Scrying mirror.", x: 200, y: 450, radius: 80 },
            { id: "mirror-2", label: "SCRYING MIRROR", info: "FIXTURE — no live fetch. Scrying mirror.", x: 200, y: 800, radius: 80 },
            { id: "mirror-3", label: "SCRYING MIRROR", info: "FIXTURE — no live fetch. Scrying mirror.", x: 200, y: 1150, radius: 80 },
            { id: "shelf-1", label: "LOG SHELF", info: "FIXTURE — no live fetch. Surveillance log shelf.", x: 1450, y: 650, radius: 80 },
            { id: "shelf-2", label: "LOG SHELF", info: "FIXTURE — no live fetch. Surveillance log shelf.", x: 1450, y: 1050, radius: 80 },
            { id: "spyglass", label: "SPYGLASS PERCH", info: "FIXTURE — no live fetch. Spyglass perch.", x: 1400, y: 250, radius: 80 },
          ],
          walk: [
            { x: 280, y: 220, w: 1040, h: 1180 },
            { x: 700, y: 1400, w: 200, h: 160 },
          ],
          solidCircles: [{ x: 800, y: 800, r: 430 }],
          onSceneReady: (liveScene) => { sceneRef.current = liveScene; setSceneKey(liveScene.scene.key); applyCameraFollow(liveScene); },
        });
        const searchScene = new RoomScene({
          key: "SearchRoomScene",
          mapSrc: "/hall/tiles/floor_dim.png",
          mapW: 1600,
          mapH: 1600,
          spawn: { x: 800, y: 1400 },
          launcher: { label: "RAVENSEARCH", url: "https://ravenserve.tail20a090.ts.net:8490", kind: "desk", x: 800, y: 800 },
          torches: [{ x: 320, y: 260 }, { x: 1280, y: 260 }],
          portals: [
            { id: "search-return", x: 700, y: 1450, w: 200, h: 150, targetScene: "HallScene", targetSpawn: { x: 1500, y: 380 }, label: "RETURN → HALL" },
          ],
          furniture: [
            { id: "painting", label: "ROOM PAINTING — PLACEHOLDER", info: "PLACEHOLDER floor tile, not a painted room. Painting UNPROVEN — do not treat as final art.", x: 800, y: 200, radius: 60 },
            { id: "query-desk", label: "QUERY DESK — SEARCH BOX", info: "RavenSearch :8490 — search box. Live search is at :8490 via SearXNG:8888 (25 results, 0 unresponsive 2026-10-25); result scrolls are not fetched in-room.", x: 800, y: 800, radius: 120 },
            { id: "scrolls", label: "RESULT SCROLLS", info: "FIXTURE in-room label — real results live at :8490, not fetched in-room.", x: 300, y: 600, radius: 80 },
            { id: "gears", label: "ENGINE GEARS", info: "FIXTURE in-room label — engine is SearXNG:8888, live and answering.", x: 1300, y: 600, radius: 80 },
            { id: "bookshelf", label: "BOOKSHELF", info: "Top-Down Retro Interior bookshelf, Set A. Search references live at :8490.", x: 500, y: 400, radius: 60, sprite: { src: "/assets/furniture/bookshelf.png", w: 96, h: 96 } },
            { id: "table", label: "READING TABLE", info: "Top-Down Retro Interior table, Set A.", x: 1100, y: 400, radius: 60, sprite: { src: "/assets/furniture/table.png", w: 96, h: 64 } },
          ],
          walk: [
            { x: 280, y: 220, w: 1040, h: 1180 },
            { x: 700, y: 1400, w: 200, h: 160 },
          ],
          onSceneReady: (liveScene) => { sceneRef.current = liveScene; setSceneKey(liveScene.scene.key); applyCameraFollow(liveScene); },
        });
        const sploitScene = new RoomScene({
          key: "SploitRoomScene",
          mapSrc: "/hall/tiles/floor_dim.png",
          mapW: 1600,
          mapH: 1600,
          spawn: { x: 800, y: 1400 },
          launcher: { label: "RAVENSPLOIT", url: "https://ravenserve.tail20a090.ts.net:8487", kind: "terminal", x: 800, y: 800 },
          torches: [{ x: 320, y: 260 }, { x: 1280, y: 260 }],
          braziers: [{ x: 400, y: 1100 }, { x: 1200, y: 1100 }],
          portals: [
            { id: "sploit-return", x: 700, y: 1450, w: 200, h: 150, targetScene: "HallScene", targetSpawn: { x: 1000, y: 880 }, label: "RETURN → HALL" },
          ],
          furniture: [
            { id: "painting", label: "ROOM PAINTING — PLACEHOLDER", info: "PLACEHOLDER floor tile, not a painted room. Painting UNPROVEN — do not treat as final art.", x: 800, y: 200, radius: 60 },
            { id: "msfconsole", label: "STONE MSFCONSOLE TERMINAL", info: "RavenSploit :8487, backend :8797, msfrpcd listening 127.0.0.1:55553. Exploit mode human-gated, never auto-fired.", x: 800, y: 800, radius: 120 },
            { id: "benches", label: "TOOL BENCHES", info: "nmap, msfvenom, nuclei, zap, nikto, ffuf, gobuster, sqlmap — tool doors at :8487. FIXTURE in-room labels, tools run at :8487.", x: 300, y: 600, radius: 80 },
            { id: "recipes", label: "RECIPE BOOKS + EXPLOIT CARDS", info: "FIXTURE in-room labels — guided recipes and cards live at :8487. ZAP run + exploit-confirm flow still unfired.", x: 1300, y: 600, radius: 80 },
          ],
          walk: [
            { x: 280, y: 220, w: 1040, h: 1180 },
            { x: 700, y: 1400, w: 200, h: 160 },
          ],
          onSceneReady: (liveScene) => { sceneRef.current = liveScene; setSceneKey(liveScene.scene.key); applyCameraFollow(liveScene); },
        });
        const citadelScene = new RoomScene({
          key: "CitadelRoomScene",
          mapSrc: "/hall/tiles/floor_dim.png",
          mapW: 1600,
          mapH: 1600,
          spawn: { x: 800, y: 1400 },
          launcher: { label: "RAVEN CITADEL", url: "https://ravenserve.tail20a090.ts.net:8443", kind: "circle", x: 800, y: 800, sprite: { src: "/assets/fx/portal.png", w: 128, h: 128, sheet: { fw: 64, fh: 64, frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rate: 6 } } },
          torches: [{ x: 320, y: 260 }, { x: 1280, y: 260 }],
          portals: [
            { id: "citadel-return", x: 700, y: 1450, w: 200, h: 150, targetScene: "HallScene", targetSpawn: { x: 600, y: 680 }, label: "RETURN → HALL" },
          ],
          furniture: [
            { id: "painting", label: "ROOM PAINTING — PLACEHOLDER", info: "PLACEHOLDER floor tile, not a painted room. Painting UNPROVEN — do not treat as final art.", x: 800, y: 200, radius: 60 },
            { id: "runic-circle", label: "RUNIC CIRCLE — GRADIO CHAT", info: "Citadel :8443 — FreeLLMAPI-native chat. Live chat is at :8443, not fetched in-room.", x: 800, y: 800, radius: 120 },
            { id: "pedestals", label: "FOCUS PEDESTALS", info: "FIXTURE in-room labels — model routes. Glow only while a route answers, per the layout rule; no live glow is faked here.", x: 300, y: 600, radius: 80 },
            { id: "arch", label: "CONTAINMENT ARCH", info: "FIXTURE in-room label — session inspection, human-gated.", x: 1300, y: 600, radius: 80 },
          ],
          walk: [
            { x: 280, y: 220, w: 1040, h: 1180 },
            { x: 700, y: 1400, w: 200, h: 160 },
          ],
          onSceneReady: (liveScene) => { sceneRef.current = liveScene; setSceneKey(liveScene.scene.key); applyCameraFollow(liveScene); },
        });
        const towerScene = new RoomScene({
          key: "TowerRoomScene",
          mapSrc: "/hall/tiles/floor_dim.png",
          mapW: 1600,
          mapH: 1600,
          spawn: { x: 800, y: 1400 },
          launcher: { label: "RAVEN TOWER", url: "https://ravenserve.tail20a090.ts.net:8445", kind: "beacon", x: 800, y: 500 },
          torches: [{ x: 320, y: 260 }, { x: 1280, y: 260 }],
          braziers: [{ x: 400, y: 1100 }, { x: 1200, y: 1100 }],
          portals: [
            { id: "tower-return", x: 700, y: 1450, w: 200, h: 150, targetScene: "HallScene", targetSpawn: { x: 700, y: 880 }, label: "RETURN → HALL" },
          ],
          furniture: [
            { id: "painting", label: "ROOM PAINTING — PLACEHOLDER", info: "PLACEHOLDER floor tile, not a painted room. Painting UNPROVEN — do not treat as final art.", x: 800, y: 200, radius: 60 },
            { id: "scope", label: "LOOKOUT SCOPE", info: "Raven Tower :8445 — its own furniture only. This room does not contain the other Raven Pages.", x: 800, y: 500, radius: 100 },
            { id: "beacon", label: "SIGNAL BEACON", info: "Raven Tower :8445 — signal beacon, its own furniture only.", x: 1200, y: 800, radius: 80 },
            { id: "desk", label: "CONTROL DESK", info: "Raven Tower :8445 — control desk, its own furniture only.", x: 400, y: 800, radius: 80 },
          ],
          walk: [
            { x: 280, y: 220, w: 1040, h: 1180 },
            { x: 700, y: 1400, w: 200, h: 160 },
          ],
          onSceneReady: (liveScene) => { sceneRef.current = liveScene; setSceneKey(liveScene.scene.key); applyCameraFollow(liveScene); },
        });
        sceneRef.current = scene;

        created = true;
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
          loader: {
            imageLoadType: "HTMLImageElement",
          },
          scene: [scene, cloneScene, reconScene, searchScene, sploitScene, citadelScene, towerScene],
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
        // After the canvas settles to its real size, sit the player fully in
        // frame rather than leaving the spawn half-under the HUD.
        if (sceneRef.current?.ready) sceneRef.current.centerCameraOnPlayer();
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
      created = false;
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

  // Restore the seals pressed in earlier sessions once the scene exists, so
  // the table carries its own history rather than resetting every visit.
  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    try {
      sealCount.current = Number(localStorage.getItem("ravenstack.keep.seals") ?? 0) || 0;
    } catch {
      /* Storage blocked. The table simply starts clean. */
    }
    const attempt = () => {
      if (!alive) return;
      const scene = sceneRef.current;
      if (scene?.ready) scene.restoreSeals(sealCount.current);
      else if (tries++ < 80) timer = setTimeout(attempt, 150);
    };
    attempt();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  // One read of what the Keep can actually see, refreshed as you play. NPC
  // greetings are templated over these fields — never over anything guessed.
  useEffect(() => {
    let alive = true;
    const load = () =>
      getHallState()
        .then((s) => {
          if (!alive) return;
          // Held in a ref, not state: the greeting is read once when a
          // conversation opens, so re-rendering the hall on every refresh
          // would restart the Phaser canvas for nothing.
          hallStateRef.current = { ...s, hour: new Date().getHours() };
        })
        .catch(() => {
          /* Unreadable. hallState stays null and every NPC falls back to its
             written greeting rather than narrating a night it cannot see. */
        });
    load();
    const t = setInterval(() => {
      if (document.hidden) return;
      load();
    }, 90000);
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
          if (scene?.ready) {
            applyTo(scene, claim);
          } else if (tries++ < 80) {
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

  useEffect(() => {
    const isOpen = Boolean(talk || tableOpen || wardrobeOpen || teleportOpen);
    if (sceneRef.current) {
      sceneRef.current.paused = isOpen;
      // While a modal owns focus, Phaser's keyboard is off so typing in an
      // input never fires E/Space/ESC into the game; it is re-enabled with
      // global capture the moment the modal closes (fixes keyboard capture
      // during modal text input — see PR #85).
      sceneRef.current.setKeyboardEnabled(!isOpen);
    }
  }, [talk, tableOpen, wardrobeOpen, teleportOpen]);

  useEffect(() => {
    const held = new Set<string>();
    function sync() {
      if (talk || tableOpen || wardrobeOpen || teleportOpen) {
        sceneRef.current?.setDir(0, 0);
        return;
      }
      const x = (held.has("d") || held.has("arrowright") ? 1 : 0) - (held.has("a") || held.has("arrowleft") ? 1 : 0);
      const y = (held.has("s") || held.has("arrowdown") ? 1 : 0) - (held.has("w") || held.has("arrowup") ? 1 : 0);
      sceneRef.current?.setDir(x, y);
    }
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      // Inside an input field (TalkSheet chat), pass keys through so typing
      // works normally — but still let Escape leave the modal.
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") {
          e.preventDefault();
          (e.target as HTMLElement)?.blur();
          if (talk || tableOpen || wardrobeOpen || teleportOpen) {
            hallAudio.playInteract();
            setTalk(null);
            setTableOpen(false);
            setWardrobeOpen(false);
            setTeleportOpen(false);
          }
        }
        return;
      }
      if (talk || tableOpen || wardrobeOpen || teleportOpen) {
        if (e.key === "Escape") {
          hallAudio.playInteract();
          setTalk(null);
          setTableOpen(false);
          setWardrobeOpen(false);
          setTeleportOpen(false);
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "t" && !talk && !tableOpen && !wardrobeOpen) {
        e.preventDefault();
        hallAudio.playInteract();
        setTeleportOpen((v) => !v);
        return;
      }
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
  }, [talk, tableOpen, wardrobeOpen, teleportOpen]);

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
      : "WASD / ARROWS to walk · [C] Ravenlord Wardrobe · [T] Teleport · Click floor to travel";

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b0e14] overscroll-none select-none">
      <div
        ref={host}
        role="application"
        aria-label="Ravenstack Keep — walkable 2D hall. Use WASD or arrow keys to move, E or Space to interact."
        className="absolute inset-0 z-0"
        onPointerDown={() => host.current?.querySelector("canvas")?.focus()}
      />
      <div className="sr-only" role="status" aria-live="polite">
        {zone}
        {near ? `. Standing near ${near.name}.` : atTable ? ". Standing at the war table." : ""}
      </div>

      {talk || tableOpen || wardrobeOpen || teleportOpen ? null : (
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
            {heraldLine ? (
              <p className="mt-1.5 max-w-xs font-mono text-[10px] italic leading-snug text-[#6b7280]">
                {heraldLine}
              </p>
            ) : null}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <FastMCPStatusBadge />
            <button
              type="button"
              onClick={() => {
                hallAudio.playInteract();
                setTeleportOpen(true);
              }}
              title="Teleport + Settings [T]"
              className="rounded-sm border border-[#2de2e6]/60 bg-[#2de2e6]/10 px-2.5 py-2 font-mono text-xs uppercase tracking-wider text-[#2de2e6] backdrop-blur-md transition hover:bg-[#2de2e6]/25 hover:text-[#e8ecf1]"
            >
              📍 Teleport [T]
            </button>
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
                hallAudio.playOracleGaze();
                navigate({ to: "/oracle" });
              }}
              title="Summon The Oracle (Spectral Inquisitor)"
              className="rounded-sm border border-[#39ff14]/60 bg-[#39ff14]/10 px-2.5 py-2 font-mono text-xs uppercase tracking-wider text-[#39ff14] backdrop-blur-md transition hover:bg-[#39ff14]/25 hover:text-[#e8ecf1]"
            >
              👁️ Oracle
            </button>
            <button
              type="button"
              onClick={() => {
                setSettings((prev) => ({ ...prev, sound: !prev.sound }));
                hallAudio.playInteract();
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
      {talk || tableOpen || wardrobeOpen || teleportOpen ? null : (
        <div className="pointer-events-auto absolute bottom-4 left-4 z-10 grid grid-cols-3 gap-1 md:hidden">
          <span />
          <Pad aria-label="Move north" {...hold({ x: 0, y: -1 })}>▲</Pad>
          <span />
          <Pad aria-label="Move west" {...hold({ x: -1, y: 0 })}>◀</Pad>
          <Pad aria-label="Move south" {...hold({ x: 0, y: 1 })}>▼</Pad>
          <Pad aria-label="Move east" {...hold({ x: 1, y: 0 })}>▶</Pad>
        </div>
      )}

      {/* Center Action & Interaction HUD Banner */}
      {talk || tableOpen || wardrobeOpen || teleportOpen ? null : (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          <p className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/85 px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#e8ecf1] shadow-[0_0_15px_rgba(0,0,0,0.7)] backdrop-blur-md">
            {hint}
          </p>
          {near || atTable ? (
            <>
            <button
              type="button"
              className="pointer-events-auto rounded-sm bg-[#2de2e6] px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#0b0e14] shadow-[0_0_15px_rgba(45,226,230,0.4)] transition hover:bg-[#2de2e6]/90"
              onClick={() => {
                hallAudio.playInteract();
                if (near) {
                  pickBarkAsync(near.id, hallStateRef.current).then(setBark);
                  setTalk(near);
                }
                else setTableOpen(true);
              }}
            >
              Engage [E]
            </button>
            {near && (near as any).actor && near.id !== "oracle" ? (
              <span className="pointer-events-auto flex items-center gap-1">
                <input
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void askNpc(); }}
                  onFocus={() => sceneRef.current?.setKeyboardEnabled(false)}
                  onBlur={() => sceneRef.current?.setKeyboardEnabled(true)}
                  placeholder={`Ask ${near.name}…`}
                  className="h-9 w-48 rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/85 px-2 font-mono text-xs text-[#e8ecf1] backdrop-blur-md"
                />
                <button
                  type="button"
                  disabled={asking}
                  onClick={() => void askNpc()}
                  className="h-9 rounded-sm bg-[#e8ecf1] px-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[#0b0e14] transition hover:bg-[#2de2e6] disabled:opacity-50"
                >
                  {asking ? "…" : "Ask"}
                </button>
              </span>
            ) : null}
            </>
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



      {/* Teleport + Settings + Outfit — one screen, opened by Teleport [T]. No Armory system. */}
      {teleportOpen ? (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="max-h-full w-full max-w-4xl overflow-y-auto rounded-md border border-[#3a3f4b] bg-[#0b0e14]/95 p-6 shadow-[0_0_50px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-[#1e222b] pb-4">
              <div>
                <h2 className="font-mono text-lg font-bold tracking-wider text-[#e8ecf1]">📍 Teleport + Settings</h2>
                <p className="font-mono text-xs text-[#9aa3b2]">
                  Instant travel to any built room — the alternative to walking to a door. Settings and outfit live here too.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { hallAudio.playInteract(); setTeleportOpen(false); }}
                className="rounded-sm border border-[#3a3f4b] bg-[#1e222b] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-[#9aa3b2] hover:border-[#2de2e6] hover:text-[#e8ecf1]"
              >
                [ESC] Close
              </button>
            </div>

            <h3 className="mt-6 font-mono text-sm font-bold tracking-wider text-[#2de2e6]">Teleport</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {TELEPORT_TARGETS.map((t) => {
                const here = sceneKey === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    disabled={here}
                    onClick={() => teleportTo(t)}
                    className={`rounded-sm border px-3 py-2.5 text-left font-mono text-xs transition ${
                      here
                        ? "cursor-default border-[#2de2e6] bg-[#2de2e6]/10 text-[#2de2e6]"
                        : "border-[#3a3f4b] bg-[#1e222b]/50 text-[#e8ecf1] hover:border-[#2de2e6]"
                    }`}
                  >
                    <span className="block font-bold">{t.label}</span>
                    <span className="mt-0.5 block text-[10px] text-[#9aa3b2]">{here ? "YOU ARE HERE" : "Click to teleport"}</span>
                  </button>
                );
              })}
              {[1, 2, 3].map((n) => (
                <div key={`reserved-${n}`} className="rounded-sm border border-[#3a3f4b]/60 bg-[#1e222b]/30 px-3 py-2.5 font-mono text-xs">
                  <span className="block font-bold text-[#6b7280]">RESERVED</span>
                  <span className="mt-0.5 block text-[10px] text-[#6b7280]">Empty, no page assigned · LOCKED</span>
                </div>
              ))}
            </div>

            <h3 className="mt-8 font-mono text-sm font-bold tracking-wider text-[#2de2e6]">Settings</h3>
            <div className="mt-3 space-y-3 font-mono text-xs text-[#e8ecf1]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Sound</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setSettings((p) => ({ ...p, sound: true }))}
                    className={`rounded-sm border px-3 py-1.5 ${settings.sound ? "border-[#2de2e6] bg-[#2de2e6]/20 text-[#2de2e6]" : "border-[#3a3f4b] text-[#9aa3b2]"}`}>On</button>
                  <button type="button" onClick={() => setSettings((p) => ({ ...p, sound: false }))}
                    className={`rounded-sm border px-3 py-1.5 ${!settings.sound ? "border-[#2de2e6] bg-[#2de2e6]/20 text-[#2de2e6]" : "border-[#3a3f4b] text-[#9aa3b2]"}`}>Off</button>
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Teleport animation (fade + burst + camera pan)</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setSettings((p) => ({ ...p, teleportAnim: true }))}
                    className={`rounded-sm border px-3 py-1.5 ${settings.teleportAnim ? "border-[#2de2e6] bg-[#2de2e6]/20 text-[#2de2e6]" : "border-[#3a3f4b] text-[#9aa3b2]"}`}>On</button>
                  <button type="button" onClick={() => setSettings((p) => ({ ...p, teleportAnim: false }))}
                    className={`rounded-sm border px-3 py-1.5 ${!settings.teleportAnim ? "border-[#2de2e6] bg-[#2de2e6]/20 text-[#2de2e6]" : "border-[#3a3f4b] text-[#9aa3b2]"}`}>Off</button>
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Walk speed</span>
                <span className="flex gap-2">
                  {(["slow", "normal", "fast"] as const).map((w) => (
                    <button key={w} type="button" onClick={() => setSettings((p) => ({ ...p, walkSpeed: w }))}
                      className={`rounded-sm border px-3 py-1.5 capitalize ${settings.walkSpeed === w ? "border-[#2de2e6] bg-[#2de2e6]/20 text-[#2de2e6]" : "border-[#3a3f4b] text-[#9aa3b2]"}`}>{w}</button>
                  ))}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Camera follow</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => { setSettings((p) => ({ ...p, cameraFollow: true })); }}
                    className={`rounded-sm border px-3 py-1.5 ${settings.cameraFollow ? "border-[#2de2e6] bg-[#2de2e6]/20 text-[#2de2e6]" : "border-[#3a3f4b] text-[#9aa3b2]"}`}>On</button>
                  <button type="button" onClick={() => { setSettings((p) => ({ ...p, cameraFollow: false })); }}
                    className={`rounded-sm border px-3 py-1.5 ${!settings.cameraFollow ? "border-[#2de2e6] bg-[#2de2e6]/20 text-[#2de2e6]" : "border-[#3a3f4b] text-[#9aa3b2]"}`}>Off</button>
                </span>
              </div>
              <p className="text-[10px] text-[#6b7280]">Settings persist in localStorage and survive reloads. Sound off still plays the animation, silently.</p>
            </div>

            <h3 className="mt-8 font-mono text-sm font-bold tracking-wider text-[#2de2e6]">Outfit / Armor</h3>
            <p className="mt-1 font-mono text-[11px] text-[#9aa3b2]">
              Player sheets in the Keep&apos;s sprite registry — no invented wardrobe, no stats, no inventory. More outfits come from new sprite sheets.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              {RAVENLORD_SKINS.map((skin) => {
                const isEquipped = activeSkin === skin.id;
                return (
                  <div key={skin.id} className={`flex flex-col justify-between rounded-sm border p-4 ${isEquipped ? "border-[#2de2e6] bg-[#2de2e6]/10" : "border-[#3a3f4b] bg-[#1e222b]/50"}`}>
                    <div>
                      <div className="my-2 flex h-24 items-center justify-center rounded-sm border border-[#3a3f4b]/60 bg-[#0b0e14]">
                        <img src={skin.src} alt={skin.name} className="h-20 w-auto object-none object-top" style={{ imageRendering: "pixelated" }} />
                      </div>
                      <h4 className="font-mono text-xs font-bold text-[#e8ecf1]">{skin.name}</h4>
                      <p className="mt-1 font-mono text-[10px] text-[#9aa3b2]">{skin.title}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isEquipped}
                      onClick={() => handleEquipSkin(skin)}
                      className={`mt-4 h-8 w-full rounded-sm font-mono text-[11px] font-bold uppercase tracking-wider ${isEquipped ? "cursor-default border border-[#2de2e6]/40 bg-[#2de2e6]/20 text-[#2de2e6]" : "bg-[#e8ecf1] text-[#0b0e14] hover:bg-[#2de2e6]"}`}
                    >
                      {isEquipped ? "Equipped" : "Equip"}
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
                <span className={`h-3 w-3 rounded-full animate-pulse ${pendingGates > 0 ? "bg-[#ffc857]" : "bg-[#2de2e6]"}`} />
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

            <WarTablePanel
              onSealed={() => {
                sealCount.current += 1;
                try {
                  localStorage.setItem("ravenstack.keep.seals", String(sealCount.current));
                } catch {
                  /* Storage blocked; the seal still lands for this session. */
                }
                sceneRef.current?.pressSeal(sealCount.current);
                getPendingGates()
                  .then((s) => setPendingGates(s.gates.length))
                  .catch(() => undefined);
              }}
            />

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
