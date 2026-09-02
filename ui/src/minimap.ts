/**
 * Keep mini-map — overview + click-to-focus (item 6).
 */
import type { RoomChip } from "./types";

export type MinimapClickFn = (roomId: string) => void;

const COL: Record<string, string> = {
  live: "#2de2e6",
  UNFORGED: "#6b5b95",
  locked: "#ff3b3b",
  empty: "#3a3f4b",
  work: "#ff2a6d",
  wait: "#ffc857",
  real: "#39ff14",
};

export class Minimap {
  private canvas: HTMLCanvasElement;
  private rooms: RoomChip[] = [];
  private selectedId: string | null = null;
  private onClick: MinimapClickFn;

  constructor(onClick: MinimapClickFn) {
    this.onClick = onClick;
    let c = document.getElementById("minimap") as HTMLCanvasElement | null;
    if (!c) {
      c = document.createElement("canvas");
      c.id = "minimap";
      c.width = 160;
      c.height = 120;
      c.className = "minimap";
      c.title = "Mini-map — click a room to focus";
      document.getElementById("game")?.appendChild(c);
    }
    this.canvas = c;
    this.canvas.addEventListener("click", (ev) => this.handleClick(ev));
  }

  setRooms(rooms: RoomChip[], selectedId: string | null) {
    this.rooms = rooms;
    this.selectedId = selectedId;
    this.draw();
  }

  private handleClick(ev: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = ((ev.clientX - rect.left) / rect.width) * this.canvas.width;
    const sy = ((ev.clientY - rect.top) / rect.height) * this.canvas.height;
    const bounds = this.bounds();
    if (!bounds) return;
    const { minX, minY, scale } = bounds;
    const wx = minX + sx / scale;
    const wy = minY + sy / scale;
    let best: RoomChip | null = null;
    let bestD = Infinity;
    for (const r of this.rooms) {
      const d = Math.hypot(r.x - wx, r.y - wy);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    if (best && bestD < 90) this.onClick(best.room_id);
  }

  private bounds() {
    if (!this.rooms.length) return null;
    const xs = this.rooms.map((r) => r.x);
    const ys = this.rooms.map((r) => r.y);
    const pad = 80;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const scale = Math.min(
      this.canvas.width / (maxX - minX || 1),
      this.canvas.height / (maxY - minY || 1),
    );
    return { minX, minY, maxX, maxY, scale };
  }

  private draw() {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2de2e6";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    const b = this.bounds();
    if (!b) return;
    const { minX, minY, scale } = b;

    // edges
    ctx.strokeStyle = "rgba(255,42,109,0.35)";
    ctx.beginPath();
    // simple nearest-neighbor lines by spatial id adjacency isn't known — skip

    for (const r of this.rooms) {
      const px = (r.x - minX) * scale;
      const py = (r.y - minY) * scale;
      const sz = 10;
      let fill = COL.empty;
      if (r.lock_state === "locked") fill = COL.locked;
      else if (r.lock_state === "UNFORGED") fill = COL.UNFORGED;
      else if (r.agent_state === "working" || r.agent_state === "answering")
        fill = COL.work;
      else if (r.agent_state === "waiting_human") fill = COL.wait;
      else if (r.agent_real) fill = COL.real;
      else if (r.lock_state === "live") fill = COL.live;

      ctx.fillStyle = fill;
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      if (this.selectedId === r.room_id) {
        ctx.strokeStyle = "#ff2a6d";
        ctx.strokeRect(px - sz / 2 - 1, py - sz / 2 - 1, sz + 2, sz + 2);
      }
    }
  }
}
