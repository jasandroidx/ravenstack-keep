/**
 * RPG-style room interaction menu (inspired by agent-town walk-up menus).
 * Gothic fortress identity — not a modern office form.
 */
import type { RoomChip } from "./types";
import { keepAudio } from "./audio";

export type InteractionAction =
  | "talk"
  | "chamber"
  | "view"
  | "focus"
  | "approve_spec"
  | "unlock_room"
  | "inspect_spec"
  | "close";

export interface InteractionCallbacks {
  onAction: (action: InteractionAction, room: RoomChip) => void;
}

export class InteractionMenu {
  private root: HTMLElement;
  private callbacks: InteractionCallbacks;
  private room: RoomChip | null = null;

  constructor(callbacks: InteractionCallbacks) {
    this.callbacks = callbacks;
    let el = document.getElementById("interaction-menu");
    if (!el) {
      el = document.createElement("div");
      el.id = "interaction-menu";
      el.className = "interaction-menu hidden";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", "Room interaction");
      document.getElementById("game")?.appendChild(el);
    }
    this.root = el;
  }

  open(room: RoomChip, screenX?: number, screenY?: number) {
    this.room = room;
    keepAudio.sfxSelect();
    const lock = room.lock_state;
    const canApprove =
      room.spec_status === "draft" && !!room.occupant_agent_id;
    const canUnlock =
      lock === "UNFORGED" &&
      !(room.spec_status === "draft" && room.occupant_agent_id);

    this.root.innerHTML = `
      <header class="ix-header">
        <span class="ix-rune">⚔</span>
        <h3>${escapeHtml(room.name)}</h3>
        <button type="button" class="ix-close" data-ix="close" aria-label="Close">×</button>
      </header>
      <p class="ix-sub">${escapeHtml(room.room_id)} · ${escapeHtml(String(lock))} · ${
        room.agent_real ? "REAL" : room.occupant_agent_id ? "CANDIDATE" : "EMPTY"
      }</p>
      <p class="ix-task">${escapeHtml(
        room.agent_task || room.status_summary || "No active task reported.",
      )}</p>
      <nav class="ix-actions">
        <button type="button" class="ix-primary" data-ix="talk">✉ Talk</button>
        <button type="button" data-ix="chamber">⚔ Enter chamber</button>
        <button type="button" data-ix="view">Inspect in HUD</button>
        <button type="button" data-ix="focus">Focus camera only</button>
        ${
          room.occupant_agent_id
            ? `<button type="button" data-ix="inspect_spec">Open Agent Spec…</button>`
            : ""
        }
        ${
          canApprove
            ? `<button type="button" class="ix-gate" data-ix="approve_spec">Human Gate: Approve Spec…</button>`
            : ""
        }
        ${
          canUnlock
            ? `<button type="button" class="ix-gate" data-ix="unlock_room">Human Gate: Unlock Room…</button>`
            : ""
        }
      </nav>
      <p class="ix-hint">Chamber = zoom in + command panel. Gates never auto-run.</p>
    `;
    this.root.classList.remove("hidden");
    if (screenX != null && screenY != null) {
      const rect = this.root.parentElement?.getBoundingClientRect();
      const px = Math.min(
        (screenX - (rect?.left || 0)) + 12,
        (rect?.width || 400) - 280,
      );
      const py = Math.min(
        (screenY - (rect?.top || 0)) + 12,
        (rect?.height || 300) - 200,
      );
      this.root.style.left = `${Math.max(8, px)}px`;
      this.root.style.top = `${Math.max(8, py)}px`;
    } else {
      this.root.style.left = "50%";
      this.root.style.top = "40%";
      this.root.style.transform = "translate(-50%, -50%)";
    }
    this.root.querySelectorAll("[data-ix]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = (btn as HTMLElement).dataset.ix as InteractionAction;
        if (this.room) this.callbacks.onAction(action, this.room);
        if (action === "close" || action === "view" || action === "focus") {
          if (action === "close") this.close();
        }
      });
    });
  }

  close() {
    this.root.classList.add("hidden");
    this.root.style.transform = "";
    this.room = null;
  }

  isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
