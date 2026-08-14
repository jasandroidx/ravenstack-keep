import Phaser from "phaser";
import { KeepScene } from "./KeepScene";
import { Hud, escapeHtml } from "./hud";
import {
  fetchCastleMap,
  fetchClock,
  fetchGates,
  fetchHealth,
  fetchHq,
  fetchKitchen,
  fetchPath,
  fetchPipeline,
  fetchRoundTable,
  libraryCompact,
  reportStatus,
} from "./api";
import {
  HOW_TO_COMMAND,
  OFFICERS,
  getLore,
  officersInRoom,
  rankFromRooms,
} from "./hq";
import { TalkBox } from "./talk";
import type { RoomChip } from "./types";
import "./style.css";

const POLL_MS = 3000;
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

async function boot() {
  const gameParent = document.getElementById("game");
  if (!gameParent) throw new Error("#game element missing");

  // Ensure non-zero size before Phaser measures the parent
  if (gameParent.clientWidth < 32 || gameParent.clientHeight < 32) {
    gameParent.style.minHeight = "400px";
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameParent,
    width: Math.max(gameParent.clientWidth, 640),
    height: Math.max(gameParent.clientHeight, 400),
    backgroundColor: "#0b0e14",
    scene: [KeepScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: true,
      antialias: false,
    },
  });

  const scene = await waitForKeepScene(game);

  /** Single selection source of truth (map click + gate card share this). */
  let selectedId: string | null = null;
  let selected: RoomChip | null = null;
  let lastRooms: RoomChip[] = [];

  function selectRoom(id: string | null, focus = false) {
    selectedId = id;
    selected = id
      ? lastRooms.find((r) => r.room_id === id) || selected
      : null;
    scene.setSelected(id);
    if (id && focus) scene.focusRoom(id);
    hud.setSelectedRoom(selected);
  }

  const hud = new Hud({
    onRefresh: () => {
      void refresh();
    },
    onSelectRoom: (id) => {
      selectRoom(id, /* focus */ true);
    },
  });

  // -------------------------------------------------------------------------
  // Suikoden talk — walk up to a room, hear who stands there
  // -------------------------------------------------------------------------

  const talk = new TalkBox();

  /** Action status lives in its own element — the 3s refresh owns #map-meta
   *  and would otherwise wipe the Rally/Tour message the moment it lands. */
  function setStatus(msg: string) {
    const el = document.getElementById("keep-status");
    if (el) el.textContent = msg;
  }

  /** Chamber readout — real numbers from real routes, or an honest miss. */
  async function enterChamber(room: RoomChip) {
    const lore = getLore(room.room_id, room.name);
    const lines: string[] = [];

    if (room.room_id === "kitchen") {
      const k = await fetchKitchen();
      if (!k) lines.push("No hearth reading — /api/kitchen is not on this build.");
      else if (!k.reachable) lines.push(k.note);
      else {
        const local = k.models.filter((m) => m.local).map((m) => m.name);
        const cloud = k.models.filter((m) => !m.local).map((m) => m.name);
        lines.push(
          local.length
            ? `Burning locally: ${local.join(", ")}.`
            : "No local models on the hearth.",
        );
        if (cloud.length) lines.push(`Reachable but not local: ${cloud.join(", ")}.`);
        lines.push("These cost nothing to run. Nothing is routed here yet.");
      }
    } else if (room.room_id === "clock-tower") {
      const c = await fetchClock();
      if (!c) lines.push("No pulse reading — /api/clock is not on this build.");
      else if (!c.has_pulse) lines.push(c.note);
      else {
        lines.push(`Last tick: ${c.last_agent} at ${c.last_tick}.`);
        const recent = c.ticks
          .slice(0, 4)
          .map((t) => `${t.agent_id} ${t.state}`)
          .join(" · ");
        lines.push(`Heartbeats on record: ${c.count}. ${recent}`);
        lines.push("These are real status writes. No schedule is wired yet.");
      }
    } else if (room.room_id === "round-table") {
      const rt = await fetchRoundTable();
      if (!rt) lines.push("No council reading — /api/round-table is not on this build.");
      else {
        lines.push(rt.note);
        lines.push(
          rt.seats
            ? `Officers who could sit: ${rt.seated.join(", ")}.`
            : "No officer holds a stamped Spec yet.",
        );
        lines.push(`Spend: ${rt.spend}.`);
      }
    } else {
      lines.push(lore.purpose);
      if (room.status_summary) lines.push(room.status_summary);
      if (room.agent_state) {
        lines.push(
          `${room.occupant_agent_id ?? "occupant"} is ${room.agent_state}${
            room.agent_task ? ` — ${room.agent_task}` : ""
          }.`,
        );
      }
    }

    if (lore.unlock && room.lock_state !== "live") lines.push(lore.unlock);

    talk.show({
      name: lore.title,
      role: `chamber · ${room.lock_state}`,
      portrait: null,
      lines,
      footer: "Esc leaves the chamber.",
    });
  }

  /** Click a room → Talk first (Suikoden rule). */
  function openTalk(room: RoomChip, officerIdx = 0) {
    const lore = getLore(room.room_id, room.name);
    const posted = officersInRoom(room.room_id);
    const officer = posted[officerIdx];

    const actions = [
      {
        label: "Enter chamber",
        onSelect: () => {
          void enterChamber(room);
          return false; // keep the box open; enterChamber replaces its content
        },
      },
    ];

    // Library holds two desks — let Jason turn to the other officer.
    if (posted.length > 1) {
      const next = posted[(officerIdx + 1) % posted.length];
      actions.push({
        label: `Turn to ${next.name}`,
        onSelect: () => {
          openTalk(room, (officerIdx + 1) % posted.length);
          return false;
        },
      });
    }

    if (!officer) {
      // Empty / sealed wing — lore, never a fake officer.
      const lines = [lore.line, lore.purpose];
      if (lore.unlock) lines.push(lore.unlock);
      talk.show({
        name: lore.title,
        role:
          room.lock_state === "live"
            ? "no officer posted"
            : room.lock_state === "locked"
              ? "locked"
              : "UNFORGED",
        portrait: null,
        lines,
        footer: "No one stands here.",
        actions,
      });
      return;
    }

    const sealed = room.lock_state !== "live";
    const lines = [officer.greeting];
    if (room.agent_state) {
      lines.push(
        `(${officer.name} is ${room.agent_state}${
          room.agent_task ? ` — ${room.agent_task}` : ""
        })`,
      );
    }
    if (sealed) lines.push(lore.unlock || "This wing is not forged yet.");

    talk.show({
      name: officer.name,
      role: `${officer.role} · ${lore.title}`,
      portrait: officer.portrait,
      lines,
      asks: officer.asks,
      footer: officer.channel,
      actions,
    });
  }

  scene.setRoomClickHandler((room) => {
    lastRooms = lastRooms.some((r) => r.room_id === room.room_id)
      ? lastRooms.map((r) => (r.room_id === room.room_id ? room : r))
      : [...lastRooms, room];
    selectRoom(room.room_id, false);
    openTalk(room);
  });

  // Zone actions (select already fires from click); path/cost/status from HUD strip
  scene.setZoneActionHandler((_room, action) => {
    if (action === "select") return; // already handled by click → selectRoom
    // HUD owns path/cost/status buttons; no auto-fire here
  });

  async function refresh() {
    const health = await fetchHealth();
    const [{ map, source }, gates, pipeline] = await Promise.all([
      fetchCastleMap(),
      fetchGates(),
      fetchPipeline(),
    ]);

    lastRooms = map.rooms;
    hud.setSource(source, map.sot_status);
    hud.setRooms(map.rooms);
    hud.setGates(gates.gates);

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
    if (selectedId) scene.setSelected(selectedId);

    const meta = document.getElementById("map-meta");
    if (meta) {
      meta.textContent = `${map.rooms.length} rooms · ${source.toUpperCase()}${
        health ? " · API ok" : " · API down"
      }`;
    }
  }

  // -------------------------------------------------------------------------
  // Rally / Tour / Compact — each does exactly what its tooltip says
  // -------------------------------------------------------------------------

  /**
   * Walk Raziel the conduit pipes on real get_path cells.
   * Returns false when nothing was drawn — we never claim a walk we did not
   * render.
   */
  async function walkRaziel(): Promise<boolean> {
    if (!scene.hasActor("raziel")) return false;
    const legs: Array<[string, string]> = [
      ["great-hall", "library"],
      ["library", "great-hall"],
    ];
    let drew = false;
    for (let i = 0; i < legs.length; i++) {
      const [from, to] = legs[i];
      const p = await fetchPath(from, to);
      const cells = p?.path_cells;
      if (!cells || cells.length < 2) continue;
      const last = i === legs.length - 1;
      const ok = await scene.walkAgentCells(
        "raziel",
        cells as Array<[number, number]>,
        { stepMs: 700, release: last },
      );
      drew = drew || ok;
      // Pause at the far end so the walk reads as a visit, not a twitch.
      if (!last && ok) await new Promise((r) => window.setTimeout(r, 700));
    }
    return drew;
  }

  let busy = false;

  async function doRally() {
    if (busy) return;
    busy = true;
    setStatus("Rally — writing presence…");
    // Real presence writes. These are the only writes Rally makes.
    const writes: Array<[string, string, string]> = [
      ["clawforge", "working", "at the bench in the Alchemy Lab"],
      ["oracle", "idle", "at the Library desk"],
      ["scribe", "idle", "at the Library desk"],
    ];
    const failed: string[] = [];
    for (const [agent, state, task] of writes) {
      try {
        await reportStatus(agent, state, task);
      } catch {
        failed.push(agent);
      }
    }
    await refresh();

    setStatus("Rally — Raziel is walking the pipes…");
    const walked = await walkRaziel();

    const wrote = writes.length - failed.length;
    const msg = `Rally: ${wrote}/${writes.length} officers reported${
      walked ? ", Raziel walked the pipes" : ", no walk drawn"
    }.`;
    hud.toast(msg, failed.length || !walked ? "err" : "ok");
    setStatus(msg + (failed.length ? ` Failed: ${failed.join(", ")}.` : ""));
    await refresh();
    busy = false;
  }

  async function doTour() {
    if (busy) return;
    busy = true;
    setStatus("Tour — walking the castle. No writes.");
    const walked = await walkRaziel();
    const msg = walked
      ? "Tour: Raziel walked Great Hall → Library → home. Nothing was written."
      : "Tour: no walk drawn — get_path returned no cells.";
    hud.toast(msg, walked ? "ok" : "err");
    setStatus(msg);
    busy = false;
  }

  async function doCompact() {
    if (busy) return;
    busy = true;
    setStatus("Compact — asking the Arcane Library to fold…");
    const r = await libraryCompact();
    const msg = r.ok
      ? "Compact: Library compaction ran (spatial/token). Not a visual mode."
      : `Compact: ${r.reason}. Nothing was changed.`;
    hud.toast(msg, r.ok ? "ok" : "err");
    setStatus(msg);
    busy = false;
  }

  document.getElementById("btn-rally")?.addEventListener("click", () => {
    void doRally();
  });
  document.getElementById("btn-tour")?.addEventListener("click", () => {
    void doTour();
  });
  document.getElementById("btn-compact")?.addEventListener("click", () => {
    void doCompact();
  });

  // How to command — reality, not jargon.
  const howEl = document.getElementById("how-to-command");
  if (howEl) {
    howEl.innerHTML = "";
    for (const line of HOW_TO_COMMAND) {
      const li = document.createElement("li");
      li.textContent = line;
      howEl.appendChild(li);
    }
  }

  /** Roster panel: who is posted where, and what to ask them. */
  function renderRoster(rooms: RoomChip[]) {
    const el = document.getElementById("roster");
    if (!el) return;
    const byRoom = new Map(rooms.map((r) => [r.room_id, r]));
    el.innerHTML = "";
    for (const o of OFFICERS) {
      const room = byRoom.get(o.roomId);
      const sealed = !room || room.lock_state !== "live";
      const card = document.createElement("div");
      card.className = `roster-card${sealed ? " sealed" : ""}`;
      const state = room?.occupant_agent_id === o.agentId ? room?.agent_state : null;
      // escapeHtml matters here: asks contain placeholders like "<topic>",
      // which innerHTML would otherwise swallow as a tag.
      card.innerHTML = `
        <img src="${escapeHtml(o.portrait)}" alt="" class="roster-face" />
        <div class="roster-meta">
          <strong>${escapeHtml(o.name)}</strong>
          <span class="muted">${escapeHtml(o.role)}</span>
          <span class="roster-post">${sealed ? "SEALED" : "LIVE"} · ${escapeHtml(
            room?.name ?? o.roomId,
          )}${state ? ` · ${escapeHtml(state)}` : ""}</span>
          <span class="roster-ask">${escapeHtml(o.asks[0])}</span>
        </div>`;
      card.addEventListener("click", () => {
        if (room) {
          selectRoom(room.room_id, true);
          openTalk(room);
        }
      });
      el.appendChild(card);
    }
  }

  /** HQ rank pill — from /api/hq, falling back to a client-side mirror. */
  async function refreshRank(rooms: RoomChip[]) {
    const pill = document.getElementById("hq-rank");
    if (!pill) return;
    const api = await fetchHq();
    const r = api?.hq ?? rankFromRooms(rooms);
    pill.textContent = `HQ ${r.rank} · ${r.title}`;
    pill.title =
      `${r.live_rooms} live rooms · ${r.officers_real} real officers` +
      ` · ${r.sealed_rooms} sealed` +
      (r.next_rank_at ? ` — ${r.to_next} more to rank ${r.rank + 1}` : " — max rank");
  }

  await refresh();
  renderRoster(lastRooms);
  void refreshRank(lastRooms);

  window.setInterval(() => {
    void refresh().then(() => {
      renderRoster(lastRooms);
      void refreshRank(lastRooms);
    });
  }, POLL_MS);

  window.addEventListener("resize", () => {
    const w = Math.max(gameParent.clientWidth, 320);
    const h = Math.max(gameParent.clientHeight, 240);
    game.scale.resize(w, h);
  });
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById("map-meta");
  if (el) el.textContent = `Boot failed: ${e}`;
});
