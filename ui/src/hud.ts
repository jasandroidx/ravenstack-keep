import type { CastleMapResponse, Gate, RoomChip } from "./types";
import { approveSpec, unlockRoom } from "./api";
import { keepAudio } from "./audio";

export interface HudCallbacks {
  onRefresh: () => void;
  /** Select a room on the map + detail panel (room_id). */
  onSelectRoom: (roomId: string | null) => void;
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
    this.renderForgeFlow();
  }

  setSelectedRoom(room: RoomChip | null) {
    this.selected = room;
    this.renderDetail();
    this.highlightGateForRoom(room);
    this.renderForgeFlow();
  }

  /** Clawforge visual loop — always human-gated (item 4). */
  renderForgeFlow() {
    let el = document.getElementById("forge-flow");
    if (!el) {
      const host = document.getElementById("hud");
      if (!host) return;
      el = document.createElement("section");
      el.id = "forge-flow-section";
      el.innerHTML = `<h2>Clawforge loop</h2><div id="forge-flow" class="forge-flow"></div>`;
      const gates = host.querySelector("section");
      if (gates?.nextSibling) host.insertBefore(el, gates.nextSibling);
      else host.appendChild(el);
    }
    const box = document.getElementById("forge-flow");
    if (!box) return;

    const forgeGate = this.gates.find(
      (g) =>
        g.gate_type === "approve_spec" &&
        (g.subject_id === "clawforge" || g.subject_id.includes("claw")),
    );
    const room =
      this.rooms.find((r) => r.room_id === "alchemy-lab") ||
      this.rooms.find((r) => r.occupant_agent_id === "clawforge");
    const spec = room?.spec_status;
    const unlocked = room?.lock_state === "live";

    const stages: Array<{ id: string; label: string; cls: string }> = [
      { id: "idea", label: "Idea / need", cls: "done" },
      {
        id: "draft",
        label: "Agent Spec draft",
        cls:
          spec === "draft" || spec === "approved" || spec === "live"
            ? "done"
            : "active",
      },
      {
        id: "gate",
        label: "Human Gate · APPROVE_SPEC",
        cls: forgeGate
          ? "active"
          : spec === "approved" || spec === "live"
            ? "done"
            : "locked",
      },
      {
        id: "provision",
        label: "Provision (spec approved)",
        cls: spec === "approved" || spec === "live" ? "done" : "locked",
      },
      {
        id: "unlock",
        label: "Room unlock (Alchemy Lab)",
        cls: unlocked ? "done" : spec === "approved" ? "active" : "locked",
      },
    ];

    box.innerHTML = `
      <p class="muted" style="margin:0 0 0.35rem;font-size:0.68rem">
        Never auto-executes. Hard gate stays human.
      </p>
      <ol>
        ${stages
          .map((s) => `<li class="${s.cls}">${escapeHtml(s.label)}</li>`)
          .join("")}
      </ol>
    `;
  }

  toast(msg: string, kind: "ok" | "err" = "ok") {
    this.toastEl.textContent = msg;
    this.toastEl.className = `toast toast-${kind} show`;
    if (kind === "ok") keepAudio.sfxSuccess();
    else keepAudio.sfxError();
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
        // Buttons handle their own clicks; card body selects room.
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
        // Focus related room before confirm so user sees context.
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
        <dt>reality</dt><dd>${r.agent_real ? "REAL (approved+)" : r.spec_status === "draft" ? "DRAFT spec" : r.occupant_agent_id ? "CANDIDATE" : "EMPTY"}</dd>
        <dt>status</dt><dd>${escapeHtml(String(r.agent_state || "—"))}</dd>
        <dt>task</dt><dd>${escapeHtml(r.agent_task || "—")}</dd>
        <dt>summary</dt><dd>${escapeHtml(r.status_summary || "—")}</dd>
      </dl>
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function applyMapMeta(map: CastleMapResponse, el: HTMLElement) {
  el.textContent = `${map.rooms.length} rooms · ${map.sot_status}`;
}
