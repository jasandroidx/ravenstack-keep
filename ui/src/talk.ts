/**
 * Suikoden-style talk box.
 *
 * Portrait on the left, name plate, one line at a time with a typewriter
 * reveal. Click or Enter advances; Esc closes. Commands ("what to ask") and
 * chamber actions sit under the text.
 *
 * Pure DOM over the Phaser canvas — no Phaser text, no text baked into art.
 */

export interface TalkAction {
  label: string;
  /** Return false to keep the box open (default closes it). */
  onSelect: () => void | boolean;
  kind?: "default" | "gate";
}

export interface TalkOptions {
  name: string;
  role?: string;
  /** Portrait URL, or null for an empty wing (stone plate instead). */
  portrait?: string | null;
  /** Paragraphs, advanced one at a time. */
  lines: string[];
  /** "What to ask" — concrete commands, rendered as a list. */
  asks?: string[];
  /** Small muted line under the asks (channel / unlock condition). */
  footer?: string;
  actions?: TalkAction[];
  onClose?: () => void;
}

const TYPE_MS = 16;

export class TalkBox {
  private root: HTMLDivElement;
  private portraitEl: HTMLDivElement;
  private nameEl: HTMLSpanElement;
  private roleEl: HTMLSpanElement;
  private textEl: HTMLParagraphElement;
  private asksEl: HTMLUListElement;
  private footerEl: HTMLParagraphElement;
  private actionsEl: HTMLDivElement;
  private hintEl: HTMLSpanElement;

  private lines: string[] = [];
  private lineIdx = 0;
  private typeTimer: number | null = null;
  private typing = false;
  private opts: TalkOptions | null = null;
  private open = false;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "talkbox";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-live", "polite");
    this.root.innerHTML = `
      <div class="talk-portrait"></div>
      <div class="talk-body">
        <div class="talk-plate">
          <span class="talk-name"></span>
          <span class="talk-role"></span>
        </div>
        <p class="talk-text"></p>
        <ul class="talk-asks"></ul>
        <p class="talk-footer"></p>
        <div class="talk-actions"></div>
        <span class="talk-hint">click / Enter — Esc closes</span>
      </div>`;

    this.portraitEl = this.root.querySelector(".talk-portrait")!;
    this.nameEl = this.root.querySelector(".talk-name")!;
    this.roleEl = this.root.querySelector(".talk-role")!;
    this.textEl = this.root.querySelector(".talk-text")!;
    this.asksEl = this.root.querySelector(".talk-asks")!;
    this.footerEl = this.root.querySelector(".talk-footer")!;
    this.actionsEl = this.root.querySelector(".talk-actions")!;
    this.hintEl = this.root.querySelector(".talk-hint")!;

    document.body.appendChild(this.root);

    this.root.addEventListener("click", (e) => {
      // Buttons handle themselves.
      if ((e.target as HTMLElement).closest("button")) return;
      this.advance();
    });

    window.addEventListener("keydown", (e) => {
      if (!this.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.advance();
      }
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(opts: TalkOptions) {
    this.opts = opts;
    this.lines = opts.lines.length ? opts.lines : ["…"];
    this.lineIdx = 0;

    if (opts.portrait) {
      this.portraitEl.className = "talk-portrait";
      this.portraitEl.style.backgroundImage = `url("${opts.portrait}")`;
    } else {
      // Empty wing — a stone plate, never a fake officer.
      this.portraitEl.className = "talk-portrait talk-portrait-empty";
      this.portraitEl.style.backgroundImage = "";
    }

    this.nameEl.textContent = opts.name;
    this.roleEl.textContent = opts.role || "";

    this.asksEl.innerHTML = "";
    for (const a of opts.asks || []) {
      const li = document.createElement("li");
      li.textContent = a;
      this.asksEl.appendChild(li);
    }
    this.asksEl.style.display = (opts.asks || []).length ? "" : "none";

    this.footerEl.textContent = opts.footer || "";
    this.footerEl.style.display = opts.footer ? "" : "none";

    this.actionsEl.innerHTML = "";
    for (const act of opts.actions || []) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = act.label;
      if (act.kind === "gate") b.className = "gate";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const keep = act.onSelect();
        if (keep !== false) this.close();
      });
      this.actionsEl.appendChild(b);
    }

    this.open = true;
    this.root.classList.add("show");
    this.typeLine();
  }

  /** Complete the current line, then move on; close after the last. */
  advance() {
    if (!this.open) return;
    if (this.typing) {
      this.stopTyping();
      this.textEl.textContent = this.lines[this.lineIdx];
      this.updateHint();
      return;
    }
    if (this.lineIdx < this.lines.length - 1) {
      this.lineIdx++;
      this.typeLine();
    } else if (!(this.opts?.actions || []).length) {
      // Nothing left to choose — a click closes.
      this.close();
    }
  }

  close() {
    if (!this.open) return;
    this.stopTyping();
    this.open = false;
    this.root.classList.remove("show");
    this.opts?.onClose?.();
  }

  private typeLine() {
    const full = this.lines[this.lineIdx] ?? "";
    this.stopTyping();
    this.textEl.textContent = "";
    this.typing = true;
    let i = 0;
    this.typeTimer = window.setInterval(() => {
      i++;
      this.textEl.textContent = full.slice(0, i);
      if (i >= full.length) {
        this.stopTyping();
        this.updateHint();
      }
    }, TYPE_MS);
    this.updateHint();
  }

  private stopTyping() {
    if (this.typeTimer !== null) {
      window.clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
    this.typing = false;
  }

  private updateHint() {
    const more = this.lineIdx < this.lines.length - 1;
    this.hintEl.textContent = more
      ? "▾ more — click / Enter · Esc closes"
      : "Esc closes";
  }
}
