import Phaser from "phaser";
import { KeepScene } from "./KeepScene";
import { Hud } from "./hud";
import {
  fetchCastleMap,
  fetchGates,
  fetchHealth,
  fetchPipeline,
} from "./api";
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

  scene.setRoomClickHandler((room) => {
    lastRooms = lastRooms.some((r) => r.room_id === room.room_id)
      ? lastRooms.map((r) => (r.room_id === room.room_id ? room : r))
      : [...lastRooms, room];
    selectRoom(room.room_id, false);
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

  await refresh();
  window.setInterval(() => {
    void refresh();
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
