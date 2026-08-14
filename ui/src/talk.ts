/**
 * Suikoden-style talk box — portrait + name + one line + commands.
 */
import type { RoomChip } from "./types";
import { officerFor, talkLine, ROOM_LORE } from "./hq";
import { keepAudio } from "./audio";

export type TalkAction = "chamber" | "tour" | "close";

export interface TalkCallbacks {
  onAction: (action: TalkAction, room: RoomChip, agentId: string | null) => void;
}

export class TalkBox {
  private root: HTMLElement;
  private callbacks: TalkCallbacks;

  constructor(callbacks: TalkCallbacks) {
    this.callbacks = callbacks;
    let el = document.getElementById("talk-box");
    if (!el) {
      el = document.createElement("div");
      el.id = "talk-box";
      el.className = "talk-box hidden";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", "Officer talk");
      document.body.appendChild(el);
    }
    this.root = el;
  }

  open(room: RoomChip, agentId?: string | null) {
    const aid = agentId || room.occupant_agent_id;
    const off = officerFor(aid);
    const lore = ROOM_LORE[room.room_id];
    const line = off
      ? talkLine(aid, room.agent_state)
      : lore?.line || "An empty room. The castle can still grow here.";
    const name = off?.name || lore?.title || room.name;
    const role = off?.role || room.lock_state;
    const portrait = off?.portrait || "";
    keepAudio.sfxSelect();
    this.root.innerHTML = `
      <div class="talk-inner">
        <div class="talk-portrait ${portrait ? "" : "is-empty"}">
          ${
            portrait
              ? `<img src="${portrait}" alt="${escapeHtml(name)}" />`
              : `<span class="talk-rune">✦</span>`
          }
        </div>
        <div class="talk-body">
          <header>
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(String(role))}</span>
          </header>
          <p class="talk-line">${escapeHtml(line)}</p>
          <p class="talk-lore">${escapeHtml(lore?.suikoden || "")}</p>
          <nav>
            <button type="button" data-talk="chamber">Enter chamber</button>
            <button type="button" data-talk="tour">Walk here</button>
            <button type="button" data-talk="close">Leave</button>
          </nav>
        </div>
      </div>
    `;
    this.root.classList.remove("hidden");
    this.root.querySelectorAll("[data-talk]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = (btn as HTMLElement).dataset.talk as TalkAction;
        this.callbacks.onAction(action, room, aid);
        if (action === "close") this.close();
      });
    });
  }

  close() {
    this.root.classList.add("hidden");
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
