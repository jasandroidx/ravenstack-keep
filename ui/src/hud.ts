import type { CastleMapResponse, Gate, RoomChip } from "./types";
import {
  approveSpec,
  fetchCostSummary,
  fetchPath,
  reportAgentStatus,
  unlockRoom,
} from "./api";
import { getSeatByAgentId, getSeatByRoomId } from "./config/seats";

export interface HudCallbacks {
  onRefresh: () => void;
  /** Select a room on the map + detail panel (room_id). */
  onSelectRoom: (roomId: string | null) => void;
  /** Optional: request zone action from scene (path/cost/status). */
  onZoneAction?: (roomId: string, action: "path" | "cost" | "status") => void;
}

export class Hud {
  private sourceEl: HTMLElement;
  private gatesEl: HTMLElement;
  private detailEl: HTMLElement;
  private toastEl: HTMLElement;
  private selected: RoomChip | null = null;
  private gates: Gate[] = [];
  private rooms: RoomChip[] = [];
  private callbacks: HudCallbacks;
  private costNote = "";

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    this.sourceEl = document.getElementById("data-source")!;
    this.gatesEl = document.getElementById("gate-list")!;
    this.detailEl = document.getElementById("room-detail")!;
    this.toastEl = document.getElementById("toast")!;

    document.getElementById("btn-refresh")?.addEventListener("click", () => {
      this.callbacks.onRefresh();
    });
  }

  setSource(source: "api" | "seed", sot?: string) {
    this.sourceEl.textContent =
      source === "api"
        ? `LIVE · SOT ${sot || "CANONICAL"}`
        : `SEED FALLBACK · API offline`;
    this.sourceEl.className =
      source === "api" ? "pill pill-live" : "pill pill-warn";
  }

  /** Keep room list for gate → room selection. */
  setRooms(rooms: RoomChip[]) {
    this.rooms = rooms;
  }

  setGates(gates: Gate[]) {
    this.gates = gates;
    this.renderGates();
    this.setGateVignette(gates.length > 0);
  }

  setSelectedRoom(room: RoomChip | null) {
    this.selected = room;
    this.costNote = "";
    this.renderDetail();
    this.highlightGateForRoom(room);
  }

  /** Surface cost / path note from zone helpers. */
  setCostNote(note: string) {
    this.costNote = note;
    this.renderDetail();
  }

  toast(msg: string, kind: "ok" | "err" = "ok") {
    this.toastEl.textContent = msg;
    this.toastEl.className = `toast toast-${kind} show`;
    window.setTimeout(() => {
      this.toastEl.classList.remove("show");
    }, 4000);
  }

  private setGateVignette(on: boolean) {
    document.body.classList.toggle("gate-alert", on);
  }

  /** Resolve gate subject → room (room_id or occupant agent_id). */
  private roomForSubject(subjectId: string): RoomChip | null {
    return (
      this.rooms.find((r) => r.room_id === subjectId) ||
      this.rooms.find((r) => r.occupant_agent_id === subjectId) ||
      null
    );
  }

  private selectRoomFromGate(subjectId: string) {
    const room = this.roomForSubject(subjectId);
    if (!room) return;
    this.setSelectedRoom(room);
    this.callbacks.onSelectRoom(room.room_id);
  }

  private highlightGateForRoom(room: RoomChip | null) {
    this.gatesEl.querySelectorAll(".gate-card").forEach((card) => {
      const el = card as HTMLElement;
      const subject = el.dataset.subject || "";
      const match =
        !!room &&
        (subject === room.room_id || subject === room.occupant_agent_id);
      el.classList.toggle("gate-card-active", match);
    });
  }

  private renderGates() {
    if (!this.gates.length) {
      this.gatesEl.innerHTML = `<p class="muted">No pending gates. Fortress is quiet.</p>`;
      return;
    }
    this.gatesEl.innerHTML = this.gates
      .map(
        (g) => `
      <article class="gate-card" data-id="${g.id}" data-subject="${escapeHtml(g.subject_id)}" data-gate-type="${escapeHtml(g.gate_type)}" tabindex="0" title="Select related room" aria-label="Gate: ${escapeHtml(g.gate_type)} ${escapeHtml(g.subject_id)}">
        <header>
          <span class="gate-type">${escapeHtml(g.gate_type)}</span>
          <span class="gate-subject">${escapeHtml(g.subject_id)}</span>
        </header>
        <p>${escapeHtml(g.summary)}</p>
        <div class="gate-actions">
          ${actionsForGate(g)}
        </div>
      </article>`,
      )
      .join("");

    this.gatesEl.querySelectorAll(".gate-card").forEach((card) => {
      const el = card as HTMLElement;
      const select = () => {
        const subject = el.dataset.subject!;
        this.selectRoomFromGate(subject);
      };
      el.addEventListener("click", (ev) => {
        if ((ev.target as HTMLElement).closest("[data-action]")) return;
        select();
      });
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          select();
        }
      });
    });

    this.gatesEl.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const el = ev.currentTarget as HTMLElement;
        const action = el.dataset.action!;
        const subject = el.dataset.subject!;
        this.selectRoomFromGate(subject);
        await this.runGatedAction(action, subject);
      });
    });

    this.highlightGateForRoom(this.selected);
  }

  private renderDetail() {
    const r = this.selected;
    if (!r) {
      this.detailEl.innerHTML = `<p class="muted">Click a room on the map (or a gate card).</p>`;
      return;
    }

    const seat =
      getSeatByRoomId(r.room_id) || getSeatByAgentId(r.occupant_agent_id);
    const seatBlock = seat
      ? `<dt>seat</dt><dd><strong>${escapeHtml(seat.name)}</strong> · ${escapeHtml(seat.role)} <code>${escapeHtml(seat.id)}</code></dd>
         <dt>agent</dt><dd><code>${escapeHtml(seat.agentId)}</code>${seat.openclawAgentId ? ` · openclaw <code>${escapeHtml(seat.openclawAgentId)}</code>` : ""}</dd>`
      : `<dt>seat</dt><dd class="muted">— (no seat binding)</dd>`;

    const unlockBlocked =
      r.lock_state === "UNFORGED" &&
      !!r.occupant_agent_id &&
      r.spec_status === "draft";

    this.detailEl.innerHTML = `
      <h3>${escapeHtml(r.name)}</h3>
      <dl class="kv">
        <dt>room_id</dt><dd><code>${escapeHtml(r.room_id)}</code></dd>
        <dt>lock</dt><dd>${escapeHtml(String(r.lock_state))}</dd>
        <dt>occupant</dt><dd>${escapeHtml(r.occupant_agent_id || "—")}</dd>
        ${seatBlock}
        <dt>reality</dt><dd>${r.agent_real ? "REAL (approved+)" : r.spec_status === "draft" ? "DRAFT spec" : r.occupant_agent_id ? "CANDIDATE" : "EMPTY"}</dd>
        <dt>status</dt><dd>${escapeHtml(String(r.agent_state || "—"))}</dd>
        <dt>task</dt><dd>${escapeHtml(r.agent_task || "—")}</dd>
        <dt>summary</dt><dd>${escapeHtml(r.status_summary || "—")}</dd>
      </dl>
      ${
        this.costNote
          ? `<p class="cost-note muted">${escapeHtml(this.costNote)}</p>`
          : ""
      }
      <div class="detail-actions zone-strip" role="group" aria-label="Path Cost Status">
        <button type="button" data-zone="path" title="get_path from Great Hall (or current) to this room">Path</button>
        <button type="button" data-zone="cost" title="get_cost_summary for seat agent">Cost</button>
        <button type="button" data-zone="status" title="report_agent_status probe (read-only toast)">Status</button>
      </div>
      <div class="detail-actions">
        ${
          r.spec_status === "draft" && r.occupant_agent_id
            ? `<button type="button" data-action="approve_spec" data-subject="${escapeHtml(r.occupant_agent_id)}">Approve spec…</button>`
            : ""
        }
        ${
          r.lock_state === "UNFORGED"
            ? `<button type="button" data-action="unlock_room" data-subject="${escapeHtml(r.room_id)}" ${
                unlockBlocked
                  ? 'disabled title="Approve draft occupant first" aria-disabled="true"'
                  : ""
              }>Unlock room…</button>`
            : ""
        }
      </div>
      ${
        unlockBlocked
          ? `<p class="muted detail-hint">SOT: unlock blocked until <code>approve_spec</code> for ${escapeHtml(r.occupant_agent_id || "")}.</p>`
          : ""
      }
    `;

    this.detailEl.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        const el = ev.currentTarget as HTMLElement;
        await this.runGatedAction(el.dataset.action!, el.dataset.subject!);
      });
    });

    this.detailEl.querySelectorAll("[data-zone]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        const el = ev.currentTarget as HTMLElement;
        const zone = el.dataset.zone as "path" | "cost" | "status";
        await this.runZoneAction(zone);
      });
    });
  }

  /**
   * Thin spatial / cost / status helpers — fail soft, surface notes in HUD.
   * No unthrottled writes; status action only toasts current chip state.
   */
  private async runZoneAction(action: "path" | "cost" | "status") {
    const r = this.selected;
    if (!r) return;
    const seat =
      getSeatByRoomId(r.room_id) || getSeatByAgentId(r.occupant_agent_id);
    const agentId = seat?.agentId || r.occupant_agent_id || undefined;

    if (action === "path") {
      const origin =
        this.rooms.find((x) => x.room_id === "great-hall")?.name ||
        this.rooms.find((x) => x.room_id === "orchestrator")?.name ||
        "Great Hall";
      const target = r.name;
      this.toast(`Path ${origin} → ${target}…`);
      const path = await fetchPath(origin, target);
      if (!path) {
        this.setCostNote("path: unavailable (MCP down or non-spatial rooms)");
        this.toast("Path unavailable", "err");
        return;
      }
      const note = `path ${path.from_room}→${path.to_room} · manhattan ${path.manhattan} · steps ${path.step_count ?? "—"}`;
      this.setCostNote(note);
      this.toast(note, "ok");
      return;
    }

    if (action === "cost") {
      this.toast(`Cost for ${agentId || "all"}…`);
      const cost = await fetchCostSummary(agentId || undefined);
      if (!cost) {
        this.setCostNote("cost unknown — Phase 0 open");
        this.toast("Cost unknown", "err");
        return;
      }
      const note =
        cost.notes ||
        `cost ${cost.month}: $${cost.total_est_usd.toFixed(4)} (${cost.by_agent.length} agents)`;
      this.setCostNote(note);
      this.toast(note, "ok");
      return;
    }

    if (action === "status") {
      const note = agentId
        ? `status ${agentId}: ${r.agent_state || "—"} · task ${r.agent_task || "—"} · real=${!!r.agent_real}`
        : `status: empty room · lock ${r.lock_state}`;
      this.setCostNote(note);
      this.toast(note, "ok");
      void reportAgentStatus; // keep import for future gated write
    }
  }

  /**
   * Map + MCP parity: browser confirm, then POST with confirm=true.
   * Cancel leaves SOT untouched.
   */
  private async runGatedAction(action: string, subject: string) {
    const label =
      action === "approve_spec"
        ? `Approve Agent Spec for "${subject}"?\n\n• Writes status=approved on disk\n• Room stays sealed until unlock_room\n• Same as Keep MCP approve_spec(confirm=true)`
        : action === "unlock_room"
          ? `Unlock room "${subject}"?\n\n• Requires approved/live occupant when present\n• Real SOT change (lock_state → live)\n• Same as Keep MCP unlock_room(confirm=true)`
          : `Confirm ${action} on ${subject}?`;

    if (
      !window.confirm(
        label + "\n\nCancel = no write. This cannot be undone from the map easily.",
      )
    ) {
      this.toast("Cancelled — no SOT change", "err");
      return;
    }

    try {
      if (action === "approve_spec") {
        await approveSpec(subject);
        this.toast(`Approved spec: ${subject}`, "ok");
      } else if (action === "unlock_room") {
        await unlockRoom(subject);
        this.toast(`Unlocked room: ${subject}`, "ok");
      } else {
        this.toast(`Unknown action: ${action}`, "err");
        return;
      }
      this.callbacks.onRefresh();
    } catch (e) {
      this.toast(e instanceof Error ? e.message : String(e), "err");
    }
  }
}

function actionsForGate(g: Gate): string {
  if (g.gate_type === "approve_spec") {
    return `<button type="button" data-action="approve_spec" data-subject="${escapeHtml(g.subject_id)}">Approve spec…</button>`;
  }
  if (g.gate_type === "unlock_room") {
    return `<button type="button" data-action="unlock_room" data-subject="${escapeHtml(g.subject_id)}">Unlock room…</button>`;
  }
  return `<span class="muted">Handle via Grok chat / MCP</span>`;
}

/** Escape before interpolating into innerHTML. The entities here had been
 *  HTML-decoded in a previous edit, which broke the build and silently turned
 *  this into a no-op. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function applyMapMeta(map: CastleMapResponse, el: HTMLElement) {
  el.textContent = `${map.rooms.length} rooms · ${map.sot_status}`;
}
