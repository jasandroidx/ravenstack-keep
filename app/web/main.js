/**
 * Ravenstack Keep — Phase 0–2 Phaser renderer
 * Contract: fetch /data/state.json only. Never call gateway/MCP.
 */
(() => {
  "use strict";

  const STATE_URL = "/data/state.json";
  const POLL_MS_DEFAULT = 4000;
  const TILE = 32;

  /** @type {any} */
  let lastState = null;
  let pollMs = POLL_MS_DEFAULT;
  let staleFog = null;

  const SPRITE_KEYS = {
    mage_blue: "mage_blue",
    mage_green: "mage_green",
    mage_red: "mage_red",
    mage_gold: "mage_gold",
  };

  // room_id -> {x,y,w,h} in pixels (filled from map objects)
  const roomRects = {};
  // agent sprites + overlays
  const agentGfx = {};

  function nowMs() {
    return Date.now();
  }

  function parseIso(s) {
    if (!s) return 0;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  }

  function setHud(state) {
    const status = document.getElementById("status-line");
    const gates = document.getElementById("gate-line");
    const tasks = document.getElementById("tasks-line");
    const clock = document.getElementById("clock-line");
    if (!state) {
      status.textContent = "no state";
      status.className = "bad";
      return;
    }
    const g = state.global || {};
    const age = (nowMs() - parseIso(state.generated_at)) / 1000;
    const interval = state.poll_interval_sec || pollMs / 1000;
    const stale =
      g.stale === true || age > 3 * interval;
    status.textContent = stale
      ? `STALE · age ${age.toFixed(0)}s`
      : `live · age ${age.toFixed(0)}s`;
    status.className = stale ? "stale" : "ok";
    gates.textContent = `gates: ${g.gates_pending ?? "—"}`;
    if ((g.gates_pending || 0) > 0) gates.className = "warn";
    else gates.className = "";
    tasks.textContent = `tasks: ${g.tasks_running ?? "—"}`;
    clock.textContent = state.generated_at || "";
  }

  class KeepScene extends Phaser.Scene {
    constructor() {
      super("keep");
      this.roomLights = {};
      this.vignettes = {};
      this.unmatchedLogged = new Set();
    }

    preload() {
      this.load.tilemapTiledJSON("keep", "keep.json");
      this.load.image("keep_tileset", "assets/tiles/keep_tileset.png");
      Object.keys(SPRITE_KEYS).forEach((k) => {
        this.load.spritesheet(k, `assets/sprites/${k}.png`, {
          frameWidth: 32,
          frameHeight: 32,
        });
      });
      this.load.image("alert", "assets/sprites/alert.png");
    }

    create() {
      const map = this.make.tilemap({ key: "keep" });
      const tiles = map.addTilesetImage("keep_tileset", "keep_tileset");
      const ground = map.createLayer("ground", tiles, 0, 0);
      if (!ground) {
        console.error("[keep] ground layer missing — check keep.json export");
      } else {
        ground.setPipeline("TextureTintPipeline");
      }

      // animations
      Object.keys(SPRITE_KEYS).forEach((key) => {
        // row 0 down: frames 0-1; row1 left 2-3; row2 right 4-5; row3 up 6-7
        // sheet is 2 cols x 4 rows → frame index = facing*2 + frame
        for (const [facing, name] of [
          [0, "down"],
          [1, "left"],
          [2, "right"],
          [3, "up"],
        ]) {
          this.anims.create({
            key: `${key}_idle_${name}`,
            frames: [
              { key, frame: facing * 2 },
              { key, frame: facing * 2 + 1 },
            ],
            frameRate: 2,
            repeat: -1,
          });
          this.anims.create({
            key: `${key}_work_${name}`,
            frames: [
              { key, frame: facing * 2 },
              { key, frame: facing * 2 + 1 },
            ],
            frameRate: 6,
            repeat: -1,
          });
        }
      });

      // room objects
      const objLayer = map.getObjectLayer("objects");
      if (objLayer) {
        for (const o of objLayer.objects) {
          const props = {};
          (o.properties || []).forEach((p) => {
            props[p.name] = p.value;
          });
          if (o.type === "room" || props.room_id) {
            const rid = props.room_id || o.name;
            roomRects[rid] = {
              x: o.x,
              y: o.y,
              w: o.width,
              h: o.height,
              cx: o.x + o.width / 2,
              cy: o.y + o.height / 2,
            };
            // dim overlay for lighting control (multiply-ish via alpha tint rect)
            const g = this.add.graphics();
            g.setDepth(5);
            this.roomLights[rid] = g;
            // vignette per room
            const v = this.add.graphics();
            v.setDepth(20);
            v.setAlpha(0);
            this.vignettes[rid] = v;
          }
          if (o.type === "spawn" || props.agent_id) {
            const aid = props.agent_id || o.name;
            // placeholder until state arrives
            agentGfx[aid] = {
              spawnX: o.x,
              spawnY: o.y,
              room: props.room_id,
              sprite: null,
              alert: null,
            };
          }
        }
      }

      this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
      this.cameras.main.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
      this.cameras.main.setBackgroundColor("#0c0a10");

      // global fog for stale
      staleFog = this.add.rectangle(
        map.widthInPixels / 2,
        map.heightInPixels / 2,
        map.widthInPixels,
        map.heightInPixels,
        0x1a1020,
        0
      );
      staleFog.setDepth(50);

      this.time.addEvent({
        delay: 500,
        loop: true,
        callback: () => this.applyState(lastState),
      });

      // first fetch
      fetchState();
      this.time.addEvent({
        delay: pollMs,
        loop: true,
        callback: fetchState,
      });
    }

    ensureAgent(agent) {
      const id = agent.id;
      if (!agentGfx[id]) {
        if (!this.unmatchedLogged.has(id)) {
          console.warn("[keep] unmatched agent id (no spawn):", id);
          this.unmatchedLogged.add(id);
        }
        // place at room center if known
        const rr = roomRects[agent.room];
        agentGfx[id] = {
          spawnX: rr ? rr.cx : 32,
          spawnY: rr ? rr.cy : 32,
          room: agent.room,
          sprite: null,
          alert: null,
        };
      }
      const g = agentGfx[id];
      const key = SPRITE_KEYS[agent.sprite_key] || "mage_blue";
      if (!g.sprite) {
        g.sprite = this.add.sprite(g.spawnX, g.spawnY, key, 0);
        g.sprite.setDepth(10);
        g.sprite.setOrigin(0.5, 0.85);
        g.alert = this.add.image(g.spawnX, g.spawnY - 28, "alert");
        g.alert.setDepth(15);
        g.alert.setVisible(false);
      }
      return g;
    }

    applyState(state) {
      if (!state) return;
      setHud(state);
      pollMs = (state.poll_interval_sec || 4) * 1000;

      const g = state.global || {};
      const age = (nowMs() - parseIso(state.generated_at)) / 1000;
      const interval = state.poll_interval_sec || 4;
      const stale = g.stale === true || age > 3 * interval;
      if (staleFog) staleFog.setAlpha(stale ? 0.45 : 0);

      // room lock visuals
      const roomsById = {};
      (state.rooms || []).forEach((r) => {
        roomsById[r.id] = r;
      });
      for (const [rid, rect] of Object.entries(roomRects)) {
        const room = roomsById[rid];
        const gfx = this.roomLights[rid];
        const vig = this.vignettes[rid];
        if (!gfx) continue;
        gfx.clear();
        if (vig) {
          vig.clear();
          vig.setAlpha(0);
        }
        if (!room) continue;
        if (room.lock === "unforged") {
          gfx.fillStyle(0x000000, 0.55);
          gfx.fillRect(rect.x, rect.y, rect.w, rect.h);
          gfx.lineStyle(1, 0x665588, 0.6);
          gfx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
        } else if (room.lock === "locked") {
          gfx.fillStyle(0x000010, 0.35);
          gfx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
      }

      // agents waiting → amber room + vignette
      const waitingRooms = new Set();
      (state.agents || []).forEach((a) => {
        if (a.state === "waiting_on_human" && a.room) waitingRooms.add(a.room);
      });
      for (const rid of waitingRooms) {
        const rect = roomRects[rid];
        const gfx = this.roomLights[rid];
        const vig = this.vignettes[rid];
        if (!rect || !gfx) continue;
        gfx.fillStyle(0xffaa33, 0.22);
        gfx.fillRect(rect.x, rect.y, rect.w, rect.h);
        gfx.lineStyle(2, 0xffcc66, 0.85);
        gfx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
        if (vig) {
          const pulse = 0.25 + 0.15 * Math.sin(nowMs() / 250);
          vig.clear();
          vig.lineStyle(6, 0xaa2222, pulse);
          vig.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
          vig.lineStyle(2, 0xff4444, pulse + 0.1);
          vig.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
          vig.setAlpha(1);
        }
      }

      const seen = new Set();
      for (const agent of state.agents || []) {
        if (agent.state === "retired") {
          const g0 = agentGfx[agent.id];
          if (g0 && g0.sprite) {
            g0.sprite.setVisible(false);
            if (g0.alert) g0.alert.setVisible(false);
          }
          continue;
        }
        seen.add(agent.id);
        const g0 = this.ensureAgent(agent);
        const spr = g0.sprite;
        const key = SPRITE_KEYS[agent.sprite_key] || "mage_blue";
        spr.setVisible(true);
        // face door (down) when waiting/answering; work facing up toward desk
        let facing = "down";
        let anim = "idle";
        let tint = 0xffffff;
        switch (agent.state) {
          case "working":
            facing = "up";
            anim = "work";
            break;
          case "answering":
            facing = "down";
            anim = "idle";
            break;
          case "waiting_on_human":
            facing = "down";
            anim = "idle";
            break;
          case "failed":
            facing = "down";
            anim = "idle";
            tint = 0xff6666;
            break;
          case "idle":
          default:
            facing = "down";
            anim = "idle";
            break;
        }
        const animKey = `${key}_${anim}_${facing}`;
        if (spr.anims.currentAnim?.key !== animKey) {
          spr.play(animKey);
        }
        spr.setTint(tint);
        // slight bob when working
        if (agent.state === "working") {
          spr.y = g0.spawnY + Math.sin(nowMs() / 180) * 1.5;
        } else if (agent.state === "failed") {
          spr.y = g0.spawnY + 2;
        } else {
          spr.y = g0.spawnY;
        }
        spr.x = g0.spawnX;
        if (g0.alert) {
          g0.alert.setPosition(spr.x, spr.y - 28);
          g0.alert.setVisible(agent.state === "waiting_on_human");
          if (agent.state === "waiting_on_human") {
            g0.alert.setScale(1 + 0.1 * Math.sin(nowMs() / 200));
          }
        }
      }

      // hide agents not in state
      for (const [id, g0] of Object.entries(agentGfx)) {
        if (!seen.has(id) && g0.sprite) {
          // keep spawn placeholders invisible if not in state
        }
      }
    }
  }

  async function fetchState() {
    try {
      const res = await fetch(STATE_URL + "?t=" + nowMs(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      lastState = json;
      setHud(json);
    } catch (e) {
      console.error("[keep] state fetch failed", e);
      const status = document.getElementById("status-line");
      if (status) {
        status.textContent = "state fetch failed";
        status.className = "bad";
      }
    }
  }

  const config = {
    type: Phaser.AUTO,
    parent: "game-wrap",
    width: 20 * TILE,
    height: 15 * TILE,
    pixelArt: true,
    antialias: false,
    backgroundColor: "#0c0a10",
    scene: [KeepScene],
    scale: {
      mode: Phaser.Scale.NONE,
    },
  };

  window.addEventListener("load", () => {
    // eslint-disable-next-line no-new
    new Phaser.Game(config);
  });
})();
