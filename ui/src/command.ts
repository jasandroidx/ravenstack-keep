/**
 * Keep Command Layer — agent roster + chamber (interior) command panel.
 *
 * Operator commands only. Never invents agent work:
 * - Dispatch / recall = report_presence (spatial truth)
 * - Gates = approve_spec / unlock_room with confirm=true
 * - Orders = local operator intent (not agent_state=working)
 */

import type { Gate, RoomChip } from "./types";
import { keepAudio } from "./audio";

const ORDERS_KEY = "keep.operator.orders";

export interface OperatorOrder {
  id: string;
  room_id: string;
  agent_id: string | null;
  text: string;
  created_at: string;
}

export type CommandHandler = {
  onSelectRoom: (roomId: string, enterChamber: boolean) => void;
  onSelectAgent: (agentId: string) => void;
  onExitChamber: () => void;
  onDispatch: (
    agentId: string,
    roomId: string,
    note: string,
  ) => Promise<void>;
  onRecall: (agentId: string, homeRoomId: string) => Promise<void>;
  onApprove: (agentId: string) => Promise<void>;
  onUnlock: (roomId: string) => Promise<void>;
  onUploadForScribe: (
    files: FileList,
    note: string,
  ) => Promise<{ ok: boolean; message: string }>;
  onDistillInbox?: () => Promise<{ ok: boolean; message?: string }>;
  onRunJob?: (job: string) => Promise<{ ok: boolean; message?: string }>;
  onArenaBout?: (
    question: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  onRefreshInbox?: () => Promise<
    Array<{ name: string; rel_path: string; bytes: number }>
  >;
  onRefresh: () => void;
};

function loadOrders(): OperatorOrder[] {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveOrders(orders: OperatorOrder[]) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, 40)));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class CommandLayer {
  private rosterEl: HTMLElement;
  private chamberEl: HTMLElement;
  private handlers: CommandHandler;
  private rooms: RoomChip[] = [];
  private gates: Gate[] = [];
  private selectedRoomId: string | null = null;
  private chamberRoomId: string | null = null;
  private selectedAgentId: string | null = null;

  constructor(handlers: CommandHandler) {
    this.handlers = handlers;

    let roster = document.getElementById("agent-roster");
    if (!roster) {
      roster = document.createElement("div");
      roster.id = "agent-roster";
      roster.className = "agent-roster";
      roster.setAttribute("role", "toolbar");
      roster.setAttribute("aria-label", "Agent roster");
      document.getElementById("game")?.appendChild(roster);
    }
    this.rosterEl = roster;

    let chamber = document.getElementById("chamber-panel");
    if (!chamber) {
      chamber = document.createElement("div");
      chamber.id = "chamber-panel";
      chamber.className = "chamber-panel hidden";
      chamber.setAttribute("role", "region");
      chamber.setAttribute("aria-label", "Chamber command");
      document.getElementById("game")?.appendChild(chamber);
    }
    this.chamberEl = chamber;
  }

  setData(rooms: RoomChip[], gates: Gate[]) {
    this.rooms = rooms;
    this.gates = gates;
    this.renderRoster();
    if (this.chamberRoomId) this.renderChamber();
  }

  setSelectedRoom(roomId: string | null) {
    this.selectedRoomId = roomId;
    this.renderRoster();
  }

  setChamber(roomId: string | null) {
    this.chamberRoomId = roomId;
    if (!roomId) {
      this.chamberEl.classList.add("hidden");
      document.getElementById("game")?.classList.remove("chamber-active");
      return;
    }
    document.getElementById("game")?.classList.add("chamber-active");
    this.chamberEl.classList.remove("hidden");
    this.renderChamber();
  }

  private agentsFromRooms(): Array<{
    agentId: string;
    homeRoom: RoomChip;
    visualRoomId: string;
    state: string;
    real: boolean;
  }> {
    const out: Array<{
      agentId: string;
      homeRoom: RoomChip;
      visualRoomId: string;
      state: string;
      real: boolean;
    }> = [];
    const seen = new Set<string>();
    for (const r of this.rooms) {
      const ids =
        r.agent_ids?.length
          ? r.agent_ids
          : r.occupant_agent_id
            ? [r.occupant_agent_id, ...(r.co_occupants || [])]
            : [...(r.co_occupants || [])];
      const occById = new Map((r.occupants || []).map((o) => [o.agent_id, o]));
      for (const agentId of ids) {
        if (!agentId || seen.has(agentId)) continue;
        seen.add(agentId);
        const occ = occById.get(agentId);
        out.push({
          agentId,
          homeRoom: r,
          visualRoomId:
            occ?.presence_room_id ||
            (agentId === r.occupant_agent_id
              ? r.presence_room_id || r.room_id
              : r.room_id),
          state: String(
            occ?.agent_state ||
              (agentId === r.occupant_agent_id ? r.agent_state : null) ||
              "—",
          ),
          real: !!(
            occ?.agent_real ||
            (agentId === r.occupant_agent_id && r.agent_real)
          ),
        });
      }
    }
    return out;
  }

  private renderRoster() {
    const agents = this.agentsFromRooms();
    if (!agents.length) {
      this.rosterEl.innerHTML = `<span class="roster-empty">No agents on map</span>`;
      return;
    }
    this.rosterEl.innerHTML = agents
      .map(({ agentId, homeRoom, visualRoomId, state, real }) => {
        const active =
          this.selectedAgentId === agentId ||
          this.selectedRoomId === homeRoom.room_id ||
          this.chamberRoomId === homeRoom.room_id ||
          this.chamberRoomId === visualRoomId;
        const gate = this.gates.some(
          (g) =>
            g.subject_id === agentId ||
            g.subject_id === homeRoom.room_id,
        );
        return `
          <button type="button" class="roster-chip ${active ? "is-active" : ""} ${gate ? "has-gate" : ""} ${real ? "is-real" : "is-draft"}"
            data-agent="${escapeHtml(agentId)}" data-room="${escapeHtml(homeRoom.room_id)}"
            title="${escapeHtml(agentId)} · ${escapeHtml(state)} · @${escapeHtml(visualRoomId)} · ${real ? "REAL" : "draft"}">
            <img src="/art/agents/agent_${escapeHtml(spriteKey(agentId))}.png" alt="" width="28" height="28" />
            <span class="roster-name">${escapeHtml(agentId)}</span>
            <span class="roster-state">${escapeHtml(state)}</span>
            ${gate ? `<span class="roster-gate">!</span>` : ""}
          </button>`;
      })
      .join("");

    this.rosterEl.querySelectorAll(".roster-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const el = btn as HTMLElement;
        const agentId = el.dataset.agent!;
        const roomId = el.dataset.room!;
        this.selectedAgentId = agentId;
        keepAudio.sfxClick();
        this.handlers.onSelectAgent(agentId);
        this.handlers.onSelectRoom(roomId, true);
        this.renderRoster();
      });
    });
  }

  private renderChamber() {
    const roomId = this.chamberRoomId;
    if (!roomId) return;
    const room = this.rooms.find((r) => r.room_id === roomId);
    if (!room) {
      this.chamberEl.innerHTML = `<p class="muted">Room not found.</p>`;
      return;
    }

    const residents =
      room.agent_ids?.length
        ? room.agent_ids
        : room.occupant_agent_id
          ? [room.occupant_agent_id, ...(room.co_occupants || [])]
          : [...(room.co_occupants || [])];
    const agentId =
      this.selectedAgentId && residents.includes(this.selectedAgentId)
        ? this.selectedAgentId
        : room.occupant_agent_id || residents[0] || null;
    const occ = (room.occupants || []).find((o) => o.agent_id === agentId);
    const roomsOpts = this.rooms
      .map(
        (r) =>
          `<option value="${escapeHtml(r.room_id)}" ${
            r.room_id === (occ?.presence_room_id || room.presence_room_id || room.room_id)
              ? "selected"
              : ""
          }>${escapeHtml(r.name)}</option>`,
      )
      .join("");

    const agentOpts = residents
      .map(
        (id) =>
          `<option value="${escapeHtml(id)}" ${id === agentId ? "selected" : ""}>${escapeHtml(id)}</option>`,
      )
      .join("");

    const canApprove =
      (occ?.spec_status === "draft" || room.spec_status === "draft") &&
      !!agentId;
    const canUnlock =
      room.lock_state === "UNFORGED" &&
      !(occ?.spec_status === "draft" && agentId);

    const roomGates = this.gates.filter(
      (g) =>
        g.subject_id === room.room_id ||
        residents.includes(g.subject_id) ||
        g.subject_id === room.occupant_agent_id,
    );

    const orders = loadOrders().filter(
      (o) =>
        o.room_id === room.room_id ||
        (o.agent_id && residents.includes(o.agent_id)),
    );

    const isLibrary = room.room_id === "library";
    const commandingScribe =
      !!agentId &&
      (agentId === "scribe" || agentId.includes("scribe"));
    const rolesHint = isLibrary
      ? `<p class="chamber-roles"><strong>Oracle</strong> = ask / RAG · <strong>Scribe</strong> = upload → triage useful? → gated vault note</p>`
      : "";

    const uploadBlock =
      isLibrary || commandingScribe
        ? `
      <div class="chamber-upload">
        <p class="chamber-kicker">GIVE SCRIBE SOMETHING TO READ</p>
        <p class="muted" style="margin:0 0 0.4rem;font-size:0.68rem">
          <strong>Choose a file → upload + library-distill</strong> (skill SOT local-batch).
          Notes land in <code>library/inbox</code> or <code>library/pointers</code>.
        </p>
        <label class="chamber-field">
          <span>Optional focus note (applied on next pick)</span>
          <input type="text" id="cmd-upload-note" maxlength="120" placeholder="e.g. Keep only fortress-relevant chapters" />
        </label>
        <div class="chamber-row upload-row">
          <input type="file" id="cmd-upload-files" multiple
            accept=".md,.txt,.pdf,.epub,.html,.htm,.json,.csv,.docx,text/plain,application/pdf" />
        </div>
        <p id="cmd-upload-status" class="muted" style="margin:0.25rem 0;font-size:0.72rem" aria-live="polite"></p>
        <div class="chamber-row" style="gap:0.35rem;flex-wrap:wrap">
          <button type="button" id="cmd-distill-inbox" class="ix-primary">✧ Distill inbox</button>
          <button type="button" id="cmd-refresh-inbox" class="cmd-secondary">Refresh list</button>
        </div>
        <div id="cmd-inbox-list" class="inbox-list muted">Loading inbox…</div>
      </div>`
        : "";

    const jobsBlock = `
      <div class="chamber-jobs">
        <p class="chamber-kicker">WALK-UP JOBS (real)</p>
        <div class="chamber-row" style="gap:0.35rem;flex-wrap:wrap">
          <button type="button" data-job="distill_inbox" class="cmd-secondary">Distill inbox</button>
          <button type="button" data-job="wake" class="cmd-secondary">Wake presence</button>
          <button type="button" data-job="sync_openclaw" class="cmd-secondary">Sync OpenClaw</button>
          <button type="button" data-job="rag_sync_vault" class="cmd-secondary" title="Full vault reindex — slow; production notes auto-ingest after distill">Full RAG sync</button>
        </div>
      </div>`;

    const arenaBlock =
      room.room_id === "observatory" || room.room_id === "great-hall"
        ? `
      <div class="chamber-arena">
        <p class="chamber-kicker">ARENA BOUT (v0)</p>
        <label class="chamber-field">
          <span>Question for the table</span>
          <input type="text" id="cmd-arena-q" maxlength="400" placeholder="What should we ship next for the Keep?" />
        </label>
        <button type="button" id="cmd-arena-go" class="ix-primary">⚔ Run bout</button>
        <p id="cmd-arena-status" class="muted" style="font-size:0.72rem" aria-live="polite"></p>
      </div>`
        : "";

    this.chamberEl.innerHTML = `
      <header class="chamber-header">
        <div>
          <p class="chamber-kicker">CHAMBER COMMAND</p>
          <h3>${escapeHtml(room.name)}</h3>
        </div>
        <button type="button" id="chamber-exit" class="chamber-exit" title="Exit chamber (Esc)">✕ Exit</button>
      </header>
      ${rolesHint}
      ${uploadBlock}
      ${jobsBlock}
      ${arenaBlock}

      <dl class="chamber-kv">
        <dt>room</dt><dd><code>${escapeHtml(room.room_id)}</code></dd>
        <dt>lock</dt><dd>${escapeHtml(String(room.lock_state))}</dd>
        <dt>residents</dt><dd>${escapeHtml(residents.join(", ") || "— empty —")}</dd>
        <dt>commanding</dt><dd>
          ${
            residents.length > 1
              ? `<select id="cmd-agent">${agentOpts}</select>`
              : escapeHtml(agentId || "—")
          }
        </dd>
        <dt>reality</dt><dd>${
          occ?.agent_real || room.agent_real
            ? "REAL"
            : occ?.spec_status === "draft" || room.spec_status === "draft"
              ? "DRAFT"
              : agentId
                ? "CANDIDATE"
                : "EMPTY"
        }</dd>
        <dt>live state</dt><dd>${escapeHtml(String(occ?.agent_state || room.agent_state || "—"))}</dd>
        <dt>task</dt><dd>${escapeHtml(occ?.agent_task || room.agent_task || "— none reported —")}</dd>
        <dt>presence</dt><dd>${escapeHtml(occ?.presence_room_id || room.presence_room_id || room.room_id)}</dd>
      </dl>

      ${
        roomGates.length
          ? `<div class="chamber-gates">
              <p class="chamber-kicker">HUMAN GATES HERE</p>
              ${roomGates
                .map(
                  (g) =>
                    `<p class="chamber-gate-line"><strong>${escapeHtml(g.gate_type)}</strong> · ${escapeHtml(g.subject_id)}<br/><span class="muted">${escapeHtml(g.summary)}</span></p>`,
                )
                .join("")}
            </div>`
          : ""
      }

      <div class="chamber-commands">
        <p class="chamber-kicker">COMMANDS</p>
        ${
          agentId
            ? `
          <label class="chamber-field">
            <span>Dispatch agent to room</span>
            <div class="chamber-row">
              <select id="cmd-dispatch-room">${roomsOpts}</select>
              <button type="button" id="cmd-dispatch">Dispatch</button>
            </div>
          </label>
          <label class="chamber-field">
            <span>Dispatch note (shown as presence task — you wrote it)</span>
            <input type="text" id="cmd-dispatch-note" maxlength="80" placeholder="e.g. Operator: check library seal" />
          </label>
          <button type="button" id="cmd-recall" class="cmd-secondary">Recall to home (${escapeHtml(room.room_id)})</button>
          `
            : `<p class="muted">Empty chamber — no agent to dispatch. Unlock/forge first.</p>`
        }

        <label class="chamber-field">
          <span>Operator order (local only — does NOT set agent working)</span>
          <div class="chamber-row">
            <input type="text" id="cmd-order-text" maxlength="120" placeholder="Intent for later: ask Oracle about MCP…" />
            <button type="button" id="cmd-order-add">Pin order</button>
          </div>
        </label>

        <div class="chamber-gate-actions">
          ${
            canApprove
              ? `<button type="button" class="cmd-gate" id="cmd-approve">Gate: Approve Spec (${escapeHtml(agentId!)})</button>`
              : ""
          }
          ${
            canUnlock
              ? `<button type="button" class="cmd-gate" id="cmd-unlock">Gate: Unlock Room</button>`
              : ""
          }
        </div>
      </div>

      <div class="chamber-orders">
        <p class="chamber-kicker">PINNED ORDERS (local)</p>
        ${
          orders.length
            ? `<ul>${orders
                .map(
                  (o) =>
                    `<li><span>${escapeHtml(o.text)}</span>
                    <button type="button" data-clear-order="${escapeHtml(o.id)}" class="cmd-tiny">clear</button></li>`,
                )
                .join("")}</ul>`
            : `<p class="muted">No pinned orders for this chamber.</p>`
        }
      </div>

      <p class="chamber-disclaimer">Map never invents work. Dispatch only moves presence. Live tasks come from agents/MCP.</p>
    `;

    this.chamberEl.querySelector("#chamber-exit")?.addEventListener("click", () => {
      this.handlers.onExitChamber();
    });

    const activeAgent = () => {
      const sel = this.chamberEl.querySelector(
        "#cmd-agent",
      ) as HTMLSelectElement | null;
      return sel?.value || agentId;
    };

    this.chamberEl.querySelector("#cmd-agent")?.addEventListener("change", () => {
      const a = activeAgent();
      if (a) this.selectedAgentId = a;
    });

    this.chamberEl.querySelector("#cmd-dispatch")?.addEventListener("click", () => {
      const aid = activeAgent();
      if (!aid) return;
      const sel = this.chamberEl.querySelector(
        "#cmd-dispatch-room",
      ) as HTMLSelectElement;
      const note = (
        this.chamberEl.querySelector("#cmd-dispatch-note") as HTMLInputElement
      )?.value?.trim();
      const dest = sel?.value;
      if (!dest) return;
      keepAudio.sfxClick();
      void this.handlers.onDispatch(
        aid,
        dest,
        note ? `Operator: ${note}` : "Operator dispatch",
      );
    });

    this.chamberEl.querySelector("#cmd-recall")?.addEventListener("click", () => {
      const aid = activeAgent();
      if (!aid) return;
      keepAudio.sfxClick();
      void this.handlers.onRecall(aid, room.room_id);
    });

    this.chamberEl.querySelector("#cmd-approve")?.addEventListener("click", () => {
      const aid = activeAgent();
      if (!aid) return;
      void this.handlers.onApprove(aid);
    });

    this.chamberEl.querySelector("#cmd-unlock")?.addEventListener("click", () => {
      void this.handlers.onUnlock(room.room_id);
    });

    this.chamberEl.querySelector("#cmd-order-add")?.addEventListener("click", () => {
      const input = this.chamberEl.querySelector(
        "#cmd-order-text",
      ) as HTMLInputElement;
      const text = input?.value?.trim();
      if (!text) return;
      const orders = loadOrders();
      orders.unshift({
        id: `ord-${Date.now()}`,
        room_id: room.room_id,
        agent_id: agentId,
        text,
        created_at: new Date().toISOString(),
      });
      saveOrders(orders);
      keepAudio.sfxSuccess();
      input.value = "";
      this.renderChamber();
    });

    this.chamberEl.querySelectorAll("[data-clear-order]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.clearOrder!;
        saveOrders(loadOrders().filter((o) => o.id !== id));
        this.renderChamber();
      });
    });

    const loadInbox = async () => {
      const box = this.chamberEl.querySelector("#cmd-inbox-list");
      if (!box || !this.handlers.onRefreshInbox) return;
      box.textContent = "Loading…";
      const files = await this.handlers.onRefreshInbox();
      if (!files.length) {
        box.innerHTML = `<p class="muted">Inbox empty. Browse files to give Scribe a drop.</p>`;
        return;
      }
      box.innerHTML = `<ul class="inbox-ul">${files
        .slice(0, 12)
        .map(
          (f) =>
            `<li><code>${escapeHtml(f.rel_path)}</code> <span class="muted">(${Math.round(f.bytes / 1024)} KB)</span></li>`,
        )
        .join("")}</ul>`;
    };

    this.chamberEl
      .querySelector("#cmd-refresh-inbox")
      ?.addEventListener("click", () => void loadInbox());
    void loadInbox();

    const statusEl = () =>
      this.chamberEl.querySelector("#cmd-upload-status") as HTMLElement | null;

    const runUpload = (files: FileList) => {
      if (!files?.length) {
        keepAudio.sfxError();
        return;
      }
      const note = (
        this.chamberEl.querySelector("#cmd-upload-note") as HTMLInputElement
      )?.value?.trim();
      const st = statusEl();
      if (st) st.textContent = `Uploading ${files.length} file(s)…`;
      keepAudio.sfxClick();
      void this.handlers.onUploadForScribe(files, note || "").then((r) => {
        if (r.ok) {
          keepAudio.sfxSuccess();
          if (st) st.textContent = r.message || "Uploaded — inbox refreshed.";
        } else {
          keepAudio.sfxError();
          if (st) st.textContent = r.message || "Upload failed.";
        }
        if (r.ok && r.message) {
          const orders = loadOrders();
          orders.unshift({
            id: `ord-${Date.now()}`,
            room_id: room.room_id,
            agent_id: "scribe",
            text: r.message,
            created_at: new Date().toISOString(),
          });
          saveOrders(orders);
        }
        // Refresh inbox in place (avoid full chamber re-render clearing status)
        void loadInbox();
        const input = this.chamberEl.querySelector(
          "#cmd-upload-files",
        ) as HTMLInputElement | null;
        if (input) input.value = "";
      });
    };

    // Select file(s) → upload + distill immediately (no second button)
    this.chamberEl
      .querySelector("#cmd-upload-files")
      ?.addEventListener("change", (ev) => {
        const input = ev.target as HTMLInputElement;
        if (input.files?.length) runUpload(input.files);
      });

    this.chamberEl
      .querySelector("#cmd-distill-inbox")
      ?.addEventListener("click", () => {
        if (!this.handlers.onDistillInbox) return;
        const st = statusEl();
        if (st) st.textContent = "Distilling inbox…";
        keepAudio.sfxClick();
        void this.handlers.onDistillInbox().then((r) => {
          if (r.ok) keepAudio.sfxSuccess();
          else keepAudio.sfxError();
          if (st) st.textContent = r.message || (r.ok ? "Done" : "Failed");
          void loadInbox();
        });
      });

    this.chamberEl.querySelectorAll("[data-job]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const job = (btn as HTMLElement).dataset.job;
        if (!job || !this.handlers.onRunJob) return;
        keepAudio.sfxClick();
        void this.handlers.onRunJob(job).then((r) => {
          if (r.ok) keepAudio.sfxSuccess();
          else keepAudio.sfxError();
        });
      });
    });

    this.chamberEl.querySelector("#cmd-arena-go")?.addEventListener("click", () => {
      if (!this.handlers.onArenaBout) return;
      const q = (
        this.chamberEl.querySelector("#cmd-arena-q") as HTMLInputElement
      )?.value?.trim();
      const st = this.chamberEl.querySelector(
        "#cmd-arena-status",
      ) as HTMLElement | null;
      if (!q) {
        keepAudio.sfxError();
        if (st) st.textContent = "Enter a question first.";
        return;
      }
      if (st) st.textContent = "Running bout…";
      keepAudio.sfxClick();
      void this.handlers.onArenaBout(q).then((r) => {
        if (r.ok) keepAudio.sfxSuccess();
        else keepAudio.sfxError();
        if (st) st.textContent = r.message || (r.ok ? "Logged" : "Failed");
      });
    });
  }
}

function spriteKey(agentId: string): string {
  const id = agentId.toLowerCase();
  if (id.includes("raziel")) return "raziel";
  if (id.includes("oracle")) return "oracle";
  if (id.includes("clawforge") || id.includes("clawsmith")) return "clawforge";
  if (id.includes("corvid")) return "corvid";
  if (id.includes("scribe")) return "scribe";
  return "generic";
}
