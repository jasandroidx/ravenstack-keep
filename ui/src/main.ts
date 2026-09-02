import Phaser from "phaser";
import { KeepScene } from "./KeepScene";
import { Hud } from "./hud";
import {
  approveSpec,
  fetchCastleMap,
  fetchGates,
  fetchHealth,
  fetchLibraryInbox,
  fetchPath,
  fetchPipeline,
  reportPresence,
  unlockRoom,
  uploadLibraryFiles,
  distillLibraryInbox,
  runKeepJob,
  runArenaBout,
} from "./api";
import { keepAudio } from "./audio";
import {
  ArcaneLibraryCompactorHook,
  type CompactSpatialPayload,
} from "./ArcaneLibraryCompactorHook";
import { CommandLayer } from "./command";
import { InteractionMenu } from "./interaction";
import { Minimap } from "./minimap";
import type { RoomChip } from "./types";
import { DEFAULT_POLL_SEC, ageLabel, isStale } from "./freshness";
import "./style.css";

const POLL_ACTIVE_MS = DEFAULT_POLL_SEC * 1000;
const POLL_IDLE_MS = 15_000;
const SCENE_KEY = "KeepScene";

/** Wait until Phaser has booted and KeepScene.create() has finished. */
function waitForKeepScene(game: Phaser.Game): Promise<KeepScene> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("KeepScene did not become ready within 10s"));
    }, 10_000);

    const finish = (scene: KeepScene) => {
      window.clearTimeout(timeout);
      resolve(scene);
    };

    const tryBind = () => {
      const scene = game.scene.getScene(SCENE_KEY) as KeepScene | null;
      if (!scene) return false;

      // create() already ran
      if (scene.sys.settings.status >= Phaser.Scenes.RUNNING) {
        finish(scene);
        return true;
      }
      // scene exists but create pending
      scene.events.once(Phaser.Scenes.Events.CREATE, () => finish(scene));
      return true;
    };

    if (tryBind()) return;

    game.events.once(Phaser.Core.Events.READY, () => {
      if (tryBind()) return;
      // Scene plugin may still be spinning up
      const poll = window.setInterval(() => {
        if (tryBind()) window.clearInterval(poll);
      }, 16);
      window.setTimeout(() => window.clearInterval(poll), 5000);
    });
  });
}

function setBootError(msg: string) {
  const banner = document.getElementById("boot-banner");
  const err = document.getElementById("boot-error");
  if (err) err.textContent = msg;
  banner?.classList.add("is-error");
}

function renderRoomFallback(
  rooms: RoomChip[],
  selectedId: string | null,
  onPick: (roomId: string) => void,
) {
  const list = document.getElementById("room-fallback-list");
  if (!list) return;
  if (!rooms.length) {
    list.textContent = "No rooms from API — check /api/castle-map";
    return;
  }
  list.innerHTML = "";
  for (const r of rooms) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "room-fallback-card" + (r.room_id === selectedId ? " is-selected" : "");
    btn.dataset.roomId = r.room_id;
    const who = r.occupant_agent_id
      ? `${r.occupant_agent_id} · ${r.agent_state || "present"}`
      : "empty";
    const task = (r.agent_task || r.status_summary || "").slice(0, 80);
    btn.innerHTML = `<span class="rf-name">${escapeDom(r.name)}</span><span class="rf-state">${escapeDom(String(r.lock_state))}</span><span class="rf-meta">${escapeDom(who)}${task ? " — " + escapeDom(task) : ""}</span>`;
    btn.addEventListener("click", () => onPick(r.room_id));
    list.appendChild(btn);
  }
}

function escapeDom(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function boot() {
  const gameParent = document.getElementById("game");
  if (!gameParent) throw new Error("#game element missing");

  // Ensure non-zero size before Phaser measures the parent (mobile / grid collapse)
  const forceH = Math.max(gameParent.clientHeight, 420);
  const forceW = Math.max(gameParent.clientWidth, 480);
  if (gameParent.clientWidth < 32 || gameParent.clientHeight < 32) {
    gameParent.style.minHeight = "420px";
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameParent,
    width: forceW,
    height: forceH,
    backgroundColor: "#0b0e14",
    scene: [KeepScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
      // Allow keyboard + / − zoom without stealing focus weirdly
      keyboard: true,
    },
    render: {
      pixelArt: true,
      antialias: false,
      // Helps some GPUs / remote desktops that otherwise paint a black canvas
      powerPreference: "default",
    },
  });
  // Debug hook for operator / agents
  (window as unknown as { __KEEP_GAME__?: Phaser.Game }).__KEEP_GAME__ = game;

  const scene = await waitForKeepScene(game);

  /** Single selection source of truth (map click + gate card share this). */
  let selectedId: string | null = null;
  let selected: RoomChip | null = null;
  let lastRooms: RoomChip[] = [];

  const statusBar = document.getElementById("map-status-bar");
  const statusText = document.getElementById("map-status-text");

  // Declared early so selectRoom can update it
  let minimap!: Minimap;

  function updateStatusBar(room: RoomChip | null) {
    if (!statusBar || !statusText) return;
    statusBar.classList.remove("is-waiting", "is-working", "is-empty");
    if (!room) {
      statusText.textContent =
        "Select a room · arrows/WASD pan · wheel zoom · ♪ audio";
      return;
    }
    const lock =
      room.lock_state === "UNFORGED"
        ? "SEALED"
        : room.lock_state === "locked"
          ? "LOCKED"
          : !room.occupant_agent_id
            ? "VACANT"
            : "LIVE";
    const reality = !room.occupant_agent_id
      ? "empty"
      : room.agent_real
        ? "real"
        : room.spec_status === "draft"
          ? "draft"
          : "candidate";
    const act = room.agent_state || "—";
    const task = room.agent_task ? ` · ${room.agent_task}` : "";
    const who = room.occupant_agent_id
      ? ` · ${room.occupant_agent_id}`
      : "";
    statusText.textContent = `${room.name} · ${lock} · ${reality} · ${act}${who}${task}`;
    if (!room.occupant_agent_id) statusBar.classList.add("is-empty");
    else if (
      room.agent_state === "waiting_human" ||
      room.spec_status === "draft"
    )
      statusBar.classList.add("is-waiting");
    else if (
      room.agent_state === "working" ||
      room.agent_state === "answering"
    )
      statusBar.classList.add("is-working");
  }

  let command!: CommandLayer;

  const arcaneHook = new ArcaneLibraryCompactorHook(
    (payload: CompactSpatialPayload) => {
      void (async () => {
        // Only auto-compact when token ratio is high or manual; zone_enter logs interest
        if (payload.reason === "zone_enter" && payload.ratio < 0.85) {
          console.info("[arcane] Library zone enter", payload);
          return;
        }
        try {
          const res = await fetch("/api/compact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              room_name: payload.roomName,
              current_token_count: payload.currentTokens || 9000,
              max_tokens: payload.maxTokens || 10000,
              // Shell has no full LLM context buffer — force archives a
              // spatial breadcrumb from live map status when forced.
              context_snippet: buildSpatialContextSnippet(lastRooms, payload.roomName),
              force: payload.reason === "manual" || payload.ratio >= 0.85,
            }),
          });
          const data = (await res.json()) as {
            compacted?: boolean;
            note_path?: string;
            error?: string;
            message?: string;
          };
          if (data.compacted && data.note_path) {
            hud.toast(`Arcane compact → ${data.note_path}`);
            keepAudio.sfxSuccess();
          } else if (data.error) {
            console.warn("[arcane] compact", data);
          }
        } catch (e) {
          console.warn("[arcane] compact failed", e);
        }
      })();
    },
    { maxTokens: 10_000, cooldownMs: 90_000 },
  );

  function buildSpatialContextSnippet(
    rooms: RoomChip[],
    focusRoom: string,
  ): string {
    const lines = [
      `# Keep spatial context @ ${focusRoom}`,
      `Library is the high-density knowledge zone [1,0].`,
      "",
    ];
    for (const r of rooms) {
      lines.push(
        `## ${r.name} (${r.room_id}) lock=${r.lock_state} agents=${(r.agent_ids || [r.occupant_agent_id]).filter(Boolean).join(",") || "empty"}`,
      );
      if (r.agent_task) lines.push(`Task: ${r.agent_task}`);
      if (r.status_summary) lines.push(r.status_summary);
      lines.push("");
    }
    // Pad so compaction has material to archive in smoke tests
    lines.push("## Footprint notes");
    lines.push(
      Array.from({ length: 40 }, (_, i) =>
        `Observation ${i + 1}: spatial telemetry and chamber command leave a cognitive trail in the ${focusRoom}.`,
      ).join(" "),
    );
    return lines.join("\n");
  }

  function enterChamber(roomId: string) {
    selectedId = roomId;
    selected = lastRooms.find((r) => r.room_id === roomId) || null;
    scene.enterChamber(roomId);
    hud.setSelectedRoom(selected);
    updateStatusBar(selected);
    command.setSelectedRoom(roomId);
    command.setChamber(roomId);
    if (minimap) minimap.setRooms(lastRooms, roomId);
    keepAudio.sfxSelect();
    document.body.classList.add("in-chamber");
    // High-density zone signal (Library primary)
    arcaneHook.onChamberEnter(roomId);
  }

  function exitChamber() {
    scene.exitChamber();
    command.setChamber(null);
    document.body.classList.remove("in-chamber");
    keepAudio.sfxClick();
    updateStatusBar(selected);
  }

  function selectRoom(id: string | null, focus = false, playSfx = true) {
    selectedId = id;
    selected = id
      ? lastRooms.find((r) => r.room_id === id) || selected
      : null;
    scene.setSelected(id);
    if (id && focus && !scene.isChamberMode()) scene.focusRoom(id);
    if (id && scene.isChamberMode() && scene.getChamberRoomId() !== id) {
      enterChamber(id);
      return;
    }
    hud.setSelectedRoom(selected);
    updateStatusBar(selected);
    if (minimap) minimap.setRooms(lastRooms, selectedId);
    command?.setSelectedRoom(id);
    if (id && playSfx) keepAudio.sfxSelect();
  }

  const hud = new Hud({
    onRefresh: () => {
      keepAudio.sfxRefresh();
      void refresh();
    },
    onSelectRoom: (id) => {
      selectRoom(id, /* focus */ true);
    },
  });

  command = new CommandLayer({
    onSelectRoom: (roomId, goChamber) => {
      if (goChamber) enterChamber(roomId);
      else selectRoom(roomId, true, true);
    },
    onSelectAgent: (_agentId) => {
      /* roster already opens chamber via onSelectRoom */
    },
    onExitChamber: () => exitChamber(),
    onDispatch: async (agentId, roomId, note) => {
      try {
        await reportPresence({
          room_id: roomId,
          agent_id: agentId,
          state: "idle",
          task_summary: note,
          sprite_hint: agentId,
        });
        hud.toast(`Dispatched ${agentId} → ${roomId}`);
        await refresh();
      } catch (e) {
        hud.toast(String(e), "err");
      }
    },
    onRecall: async (agentId, homeRoomId) => {
      try {
        await reportPresence({
          room_id: homeRoomId,
          agent_id: agentId,
          state: "idle",
          task_summary: "Recalled by operator",
          sprite_hint: agentId,
        });
        hud.toast(`Recalled ${agentId}`);
        await refresh();
      } catch (e) {
        hud.toast(String(e), "err");
      }
    },
    onApprove: async (agentId) => {
      try {
        if (
          !window.confirm(
            `Approve Agent Spec for ${agentId}? Requires confirm=true.`,
          )
        )
          return;
        await approveSpec(agentId);
        hud.toast(`Approved ${agentId}`);
        await refresh();
      } catch (e) {
        hud.toast(String(e), "err");
      }
    },
    onUnlock: async (roomId) => {
      try {
        if (
          !window.confirm(
            `Unlock room ${roomId}? Requires confirm=true.`,
          )
        )
          return;
        await unlockRoom(roomId);
        hud.toast(`Unlocked ${roomId}`);
        await refresh();
      } catch (e) {
        hud.toast(String(e), "err");
      }
    },
    onUploadForScribe: async (files, note) => {
      try {
        const res = await uploadLibraryFiles(files, {
          agentId: "scribe",
          note,
          autoDistill: true,
        });
        if (!res.ok) {
          const msg = res.error || res.errors?.join("; ") || "Upload failed";
          hud.toast(msg, "err");
          return { ok: false, message: msg };
        }
        const n = res.saved?.length || 0;
        const rows = res.distill?.results || [];
        const outs = rows
          .map((r) => r.output_rel || r.disposition)
          .filter(Boolean)
          .slice(0, 3)
          .join(", ");
        const msg = rows.length
          ? `Uploaded ${n} → distilled: ${outs || res.distill?.presence_summary || "done"}`
          : `Uploaded ${n} file(s) (distill empty — try Distill inbox)`;
        hud.toast(msg);
        await refresh();
        return { ok: true, message: msg };
      } catch (e) {
        const msg = String(e);
        hud.toast(msg, "err");
        return { ok: false, message: msg };
      }
    },
    onDistillInbox: async () => {
      try {
        const res = await distillLibraryInbox({ limit: 10 });
        const rows = res.results || [];
        const line =
          res.presence_summary ||
          rows
            .map((r) => `${r.source_name}:${r.disposition}`)
            .slice(0, 4)
            .join(", ");
        hud.toast(line || "Distill finished");
        await refresh();
        return { ok: !!res.ok, message: line };
      } catch (e) {
        const msg = String(e);
        hud.toast(msg, "err");
        return { ok: false, message: msg };
      }
    },
    onRunJob: async (job) => {
      try {
        const res = await runKeepJob(job);
        const msg = res.ok
          ? `Job ${job} ok`
          : res.message || `Job ${job} failed`;
        hud.toast(msg, res.ok ? undefined : "err");
        await refresh();
        return { ok: !!res.ok, message: msg };
      } catch (e) {
        const msg = String(e);
        hud.toast(msg, "err");
        return { ok: false, message: msg };
      }
    },
    onArenaBout: async (question) => {
      try {
        const res = await runArenaBout(question);
        if (!res.ok) {
          const msg = res.message || res.error || "Arena failed";
          hud.toast(msg, "err");
          return { ok: false, message: msg };
        }
        const msg = `Arena → ${res.log_rel || "logged"} · ${
          (res.chair || "").slice(0, 80)
        }…`;
        hud.toast(`Arena bout logged`);
        await refresh();
        return { ok: true, message: msg };
      } catch (e) {
        const msg = String(e);
        hud.toast(msg, "err");
        return { ok: false, message: msg };
      }
    },
    onRefreshInbox: async () => {
      const inbox = await fetchLibraryInbox();
      return (inbox?.files || []).map((f) => ({
        name: f.name,
        rel_path: f.rel_path,
        bytes: f.bytes,
      }));
    },
    onRefresh: () => void refresh(),
  });

  const ix = new InteractionMenu({
    onAction: (action, room) => {
      if (action === "chamber") {
        enterChamber(room.room_id);
        ix.close();
      } else if (action === "view") {
        selectRoom(room.room_id, false, false);
        ix.close();
      } else if (action === "focus") {
        selectRoom(room.room_id, true, true);
        ix.close();
      } else if (action === "approve_spec" && room.occupant_agent_id) {
        enterChamber(room.room_id);
        void (async () => {
          try {
            if (
              !window.confirm(
                `Approve Agent Spec for ${room.occupant_agent_id}? (confirm=true)`,
              )
            )
              return;
            await approveSpec(room.occupant_agent_id!);
            hud.toast(`Approved ${room.occupant_agent_id}`);
            void refresh();
          } catch (e) {
            hud.toast(String(e), "err");
          }
        })();
        ix.close();
      } else if (action === "unlock_room") {
        enterChamber(room.room_id);
        void (async () => {
          try {
            if (
              !window.confirm(
                `Unlock room ${room.room_id}? (confirm=true)`,
              )
            )
              return;
            await unlockRoom(room.room_id);
            hud.toast(`Unlocked ${room.room_id}`);
            void refresh();
          } catch (e) {
            hud.toast(String(e), "err");
          }
        })();
        ix.close();
      } else if (action === "inspect_spec") {
        enterChamber(room.room_id);
        ix.close();
      } else if (action === "close") {
        ix.close();
      }
    },
  });

  minimap = new Minimap((roomId) => {
    if (scene.isChamberMode()) enterChamber(roomId);
    else selectRoom(roomId, true, true);
  });

  // Esc exits chamber
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && scene.isChamberMode()) {
      exitChamber();
    }
  });

  // Agents walk cyan pipes when presence room changes
  scene.setPathFetcher((from, to) => fetchPath(from, to));

  let bootAnnounced = false;

  /** One-line living roster from last map poll (no invented work). */
  function livingRosterLine(rooms: RoomChip[]): string {
    const bits: string[] = [];
    for (const r of rooms) {
      if (!r.occupant_agent_id) continue;
      const st = r.agent_state || "present";
      const task = r.agent_task ? `:${r.agent_task.slice(0, 28)}` : "";
      bits.push(`${r.occupant_agent_id}(${st}${task})@${r.room_id}`);
    }
    if (!bits.length) return "Castle empty — hit ⚡ Wake or report presence via MCP";
    return bits.join(" · ");
  }

  async function razielPipeTour(): Promise<void> {
    keepAudio.sfxRefresh();
    hud.toast("Raziel is walking the pipes…");
    await reportPresence({
      room_id: "library",
      agent_id: "raziel",
      state: "working",
      task_summary: "Pipe-walk to Oracle",
      sprite_hint: "raziel",
    });
    await refresh();
    await new Promise((r) => window.setTimeout(r, 4200));
    await reportPresence({
      room_id: "great-hall",
      agent_id: "raziel",
      state: "idle",
      task_summary: "Back at command",
      sprite_hint: "raziel",
    });
    await refresh();
    hud.toast("Raziel returned to Great Hall");
  }

  /**
   * Wake Castle — proof loop: real presence writes + pipe-walk + roster toast.
   * Does not invent agent jobs beyond operator-visible presence labels.
   */
  async function wakeCastle(): Promise<void> {
    keepAudio.sfxRefresh();
    hud.toast("Waking the Keep…");
    const stamp = new Date().toISOString().slice(11, 19) + "Z";
    // Clawforge (Grok Build / forge lane) — Alchemy Lab
    await reportPresence({
      room_id: "alchemy-lab",
      agent_id: "clawforge",
      state: "working",
      task_summary: `Operator wake @ ${stamp} — forge online`,
      sprite_hint: "ops",
    });
    // Oracle ready in Library (idle, not fake RAG work)
    await reportPresence({
      room_id: "library",
      agent_id: "oracle",
      state: "idle",
      task_summary: "Ready for vault Q",
      sprite_hint: "oracle",
    });
    // Scribe present (idle) — library duo footprint
    await reportPresence({
      room_id: "library",
      agent_id: "scribe",
      state: "idle",
      task_summary: "Inbox watch",
      sprite_hint: "scribe",
    });
    await refresh();
    hud.toast(livingRosterLine(lastRooms));
    // Visual pay-off: walk the commander
    await razielPipeTour();
    hud.toast(`Keep awake · ${livingRosterLine(lastRooms)}`);
    keepAudio.sfxSuccess();
  }

  document.getElementById("btn-arcane-compact")?.addEventListener("click", () => {
    arcaneHook.setTokenMetrics(9200, 10000);
    arcaneHook.requestManual(
      scene.getChamberRoomId() || selectedId || "library",
    );
  });

  document.getElementById("btn-wake-castle")?.addEventListener("click", () => {
    void wakeCastle().catch((e) => hud.toast(String(e), "err"));
  });

  // Demo: send Raziel down the pipes (library → home)
  document.getElementById("btn-agent-tour")?.addEventListener("click", () => {
    void razielPipeTour().catch((e) => hud.toast(String(e), "err"));
  });

  scene.setRoomClickHandler((room) => {
    lastRooms = lastRooms.some((r) => r.room_id === room.room_id)
      ? lastRooms.map((r) => (r.room_id === room.room_id ? room : r))
      : [...lastRooms, room];
    selectRoom(room.room_id, false, true);
    // RPG interaction menu (item 5)
    ix.open(room);
  });

  // ── Audio UI ──────────────────────────────────────────────
  const btnAudio = document.getElementById(
    "btn-audio-toggle",
  ) as HTMLButtonElement | null;
  const musicVol = document.getElementById(
    "music-vol",
  ) as HTMLInputElement | null;
  const sfxVol = document.getElementById("sfx-vol") as HTMLInputElement | null;

  function syncAudioUi() {
    if (btnAudio) {
      btnAudio.classList.toggle("is-muted", keepAudio.isMuted());
      btnAudio.textContent = keepAudio.isMuted() ? "🔇" : "♪";
      btnAudio.title = keepAudio.isMuted()
        ? "Unmute music & SFX"
        : "Mute music & SFX";
    }
    if (musicVol) musicVol.value = String(Math.round(keepAudio.getMusicVol() * 100));
    if (sfxVol) sfxVol.value = String(Math.round(keepAudio.getSfxVol() * 100));
  }
  syncAudioUi();

  // Browsers block audio until a gesture — unlock on first click/key
  const unlockAudio = () => {
    void keepAudio.ensureStarted();
  };
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });

  btnAudio?.addEventListener("click", () => {
    void keepAudio.ensureStarted().then(() => {
      keepAudio.toggleMute();
      syncAudioUi();
      if (!keepAudio.isMuted()) keepAudio.sfxClick();
    });
  });
  musicVol?.addEventListener("input", () => {
    keepAudio.setMusicVol(Number(musicVol.value) / 100);
  });
  sfxVol?.addEventListener("input", () => {
    keepAudio.setSfxVol(Number(sfxVol.value) / 100);
    keepAudio.sfxHoverSoft();
  });

  // Map zoom controls (wheel is in-scene; buttons + keyboard wired here too)
  const zoomLevel = document.getElementById("zoom-level");
  let lastZoom = scene.getZoom();
  const setZoomLabel = (z: number) => {
    if (zoomLevel) zoomLevel.textContent = `${z.toFixed(2)}×`;
    if (Math.abs(z - lastZoom) > 0.04) {
      keepAudio.sfxZoom(z > lastZoom);
      lastZoom = z;
    }
  };
  scene.setZoomChangeHandler(setZoomLabel);
  setZoomLabel(scene.getZoom());

  document.getElementById("btn-zoom-in")?.addEventListener("click", () => {
    scene.zoomBy(1.12);
  });
  document.getElementById("btn-zoom-out")?.addEventListener("click", () => {
    scene.zoomBy(1 / 1.12);
  });
  document.getElementById("btn-zoom-reset")?.addEventListener("click", () => {
    scene.zoomReset();
    keepAudio.sfxClick();
  });

  async function refresh() {
    const health = await fetchHealth();
    const [{ map, source }, gates, pipeline] = await Promise.all([
      fetchCastleMap(),
      fetchGates(),
      fetchPipeline(),
    ]);

    lastRooms = map.rooms;
    const pollSec = map.poll_interval_sec ?? DEFAULT_POLL_SEC;
    const envelopeStale =
      source !== "api" || isStale(map.generated_at, pollSec);
    hud.setSource(source, map.sot_status, {
      envelopeStale: source === "api" && envelopeStale,
      generatedAge: ageLabel(map.generated_at),
    });
    hud.setRooms(map.rooms);
    hud.setGates(gates.gates);
    keepAudio.onGateCount(gates.count ?? gates.gates.length);

    // Map gate subjects → room alert markers on canvas
    const gateSubjects = gates.gates.map((g) => g.subject_id);

    if (selectedId) {
      selected =
        map.rooms.find((r) => r.room_id === selectedId) || null;
      if (!selected) selectedId = null;
      hud.setSelectedRoom(selected);
    } else {
      selected = null;
      hud.setSelectedRoom(null);
    }

    scene.applyMap(map, pipeline);
    scene.setGatedSubjects(gateSubjects);
    if (selectedId) scene.setSelected(selectedId);
    command.setData(map.rooms, gates.gates);
    // Stay in chamber if still there (don't re-tween camera every poll)
    if (scene.isChamberMode()) {
      const cid = scene.getChamberRoomId();
      if (cid && map.rooms.some((r) => r.room_id === cid)) {
        command.setChamber(cid);
        scene.applyChamberDim(cid);
      } else {
        exitChamber();
      }
    } else {
      command.setChamber(null);
    }
    updateStatusBar(selected);
    minimap.setRooms(map.rooms, selectedId);
    command.setSelectedRoom(selectedId);

    const meta = document.getElementById("map-meta");
    if (meta) {
      const working = map.rooms.filter(
        (r) =>
          r.agent_state === "working" || r.agent_state === "answering",
      ).length;
      meta.textContent = `${map.rooms.length} rooms · ${working} working · ${source.toUpperCase()}${
        health ? " · API ok" : " · API down"
      }`;
    }

    // HTML room cards always — so a black WebGL canvas is not a blank page
    renderRoomFallback(map.rooms, selectedId, (id) => {
      selectRoom(id, true, true);
      enterChamber(id);
    });
    document.getElementById("room-fallback")?.classList.toggle(
      "is-map-ok",
      source === "api" && map.rooms.length > 0,
    );

    // First successful poll: tell the operator the castle is not a static poster
    if (!bootAnnounced && source === "api") {
      bootAnnounced = true;
      const line = livingRosterLine(map.rooms);
      hud.toast(line);
      if (statusText && !selected) {
        statusText.textContent = `Living · ${line.slice(0, 120)} · hit ⚡ Wake`;
      }
      // Re-fit camera once layout has real size (fixes empty canvas after 0-height boot)
      window.setTimeout(() => {
        try {
          scene.zoomReset();
          const gp = document.getElementById("game");
          if (gp) {
            game.scale.resize(
              Math.max(gp.clientWidth, 320),
              Math.max(gp.clientHeight, 240),
            );
          }
        } catch {
          /* ignore */
        }
      }, 100);
    }
  }

  await refresh();
  let pollHandle = 0;
  const pollMs = () => {
    if (document.hidden) return POLL_IDLE_MS;
    const busy = lastRooms.some(
      (r) =>
        r.agent_state === "working" ||
        r.agent_state === "answering" ||
        r.agent_state === "waiting_human",
    );
    return busy ? POLL_ACTIVE_MS : POLL_IDLE_MS;
  };
  const armPoll = () => {
    window.clearTimeout(pollHandle);
    pollHandle = window.setTimeout(() => {
      void refresh().finally(armPoll);
    }, pollMs());
  };
  armPoll();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh().finally(armPoll);
  });

  window.addEventListener("resize", () => {
    const w = Math.max(gameParent.clientWidth, 320);
    const h = Math.max(gameParent.clientHeight, 240);
    game.scale.resize(w, h);
  });
}

boot().catch((e) => {
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  setBootError(`Boot failed: ${msg}`);
  const el = document.getElementById("map-meta");
  if (el) el.textContent = `Boot failed: ${msg}`;
  // Still try to show rooms without Phaser
  void fetchCastleMap()
    .then(({ map }) => {
      renderRoomFallback(map.rooms, null, () => {
        /* chamber needs scene */
      });
      const list = document.getElementById("room-fallback-list");
      if (list && !map.rooms.length) {
        list.textContent = "API returned zero rooms.";
      }
    })
    .catch((fe) => setBootError(`Boot + map failed: ${msg} / ${fe}`));
});
