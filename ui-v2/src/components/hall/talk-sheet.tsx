import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { talkInHall } from "@/lib/keep/server";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  TALK_SRC,
  RAVENLORD_SKINS,
  type HallAction,
  type HallNpc,
  type RavenlordSkin,
} from "@/lib/hall/world";
import { hallAudio } from "@/lib/hall/audio";

type Message = {
  id: string;
  sender: "user" | "npc";
  senderName: string;
  text: string;
  time: string;
  emotion?: EmotionState;
};

type EmotionState = "neutral" | "speaking" | "inquisitive" | "approval" | "strike" | "alert" | "amused" | "forge";

type ReactionEmote = {
  icon: string;
  text: string;
  color: string;
  bg: string;
  border: string;
};

export function TalkSheet({
  greetingOverride,
  npc,
  onClose,
  onTable,
  currentSkinId = "ravenlord",
  onSelectSkin,
}: {
  /** Reactive line for this visit, keyed to real Keep state. Falls back to
   *  the character's written greeting when nothing matched. */
  greetingOverride?: string;
  npc: HallNpc;
  onClose: () => void;
  onTable?: () => void;
  currentSkinId?: string;
  onSelectSkin?: (skinId: string) => void;
}) {
  const { user } = useCurrentUserState();
  const [tab, setTab] = useState<"chat" | "armor">("chat");
  const [activeSkin, setActiveSkin] = useState<string>(currentSkinId);
  const greeting = greetingOverride ?? npc.greeting;
  const [fullLine, setFullLine] = useState(greeting);
  const [displayedLine, setDisplayedLine] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<EmotionState>("neutral");
  const [reaction, setReaction] = useState<ReactionEmote | null>(null);
  const [history, setHistory] = useState<Message[]>([
    {
      id: "greeting",
      sender: "npc",
      senderName: npc.name,
      text: greeting,
      time: "INIT",
      emotion: "neutral",
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll message history
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedLine, history, tab]);

  // Procedural typewriter effect with dynamic voice blips & speaking animation
  useEffect(() => {
    let index = 0;
    setDisplayedLine("");
    setIsTyping(true);
    setEmotion("speaking");

    const pitchMap: Record<string, number> = {
      raziel: 0.85,
      oracle: 0.48, // Deep spectral resonance
      valerie: 1.1,
      corvid: 0.95,
      "gallery-arch": 1.35,
    };
    const pitch = pitchMap[npc.id] ?? 1.0;

    const timer = setInterval(() => {
      index++;
      setDisplayedLine(fullLine.slice(0, index));
      if (index % 2 === 0) {
        hallAudio.playDialogueBlip(pitch);
      }
      if (index >= fullLine.length) {
        setIsTyping(false);
        setEmotion("neutral");
        clearInterval(timer);
      }
    }, 18);

    return () => clearInterval(timer);
  }, [fullLine, npc.id]);

  function triggerReaction(newEmotion: EmotionState, emote: ReactionEmote) {
    setEmotion(newEmotion);
    setReaction(emote);
    if (newEmotion === "approval") hallAudio.playReaction("approval");
    else if (newEmotion === "strike" || newEmotion === "alert") hallAudio.playReaction("strike");
    else hallAudio.playReaction("inquiry");

    setTimeout(() => {
      setReaction(null);
      if (!isTyping) setEmotion("neutral");
    }, 2800);
  }

  function runAction(action: HallAction) {
    if (action.href === "/table") {
      hallAudio.playInteract();
      onTable?.();
      return;
    }

    // Determine emotion reaction based on choice action
    const aid = action.id.toLowerCase();
    const isStrike = aid.includes("hallucination") || aid.includes("strike") || aid.includes("broke");
    const isLaw = aid.includes("truth") || aid.includes("law") || aid.includes("diag");
    const isDuty = aid.includes("duty") || aid.includes("know") || aid.includes("live");

    let nextEmotion: EmotionState = "inquisitive";
    let emote: ReactionEmote = {
      icon: "⚡",
      text: "INTERROGATION",
      color: "text-[#2de2e6]",
      bg: "bg-[#2de2e6]/15",
      border: "border-[#2de2e6]/60",
    };

    if (isStrike) {
      nextEmotion = "strike";
      emote = {
        icon: "⚠️",
        text: "RECEIPT SCRUTINY",
        color: "text-[#ff3b3b]",
        bg: "bg-[#ff3b3b]/20",
        border: "border-[#ff3b3b]/70",
      };
    } else if (isLaw) {
      nextEmotion = "inquisitive";
      emote = {
        icon: "👁️",
        text: "CANONICAL AUDIT",
        color: "text-[#39ff14]",
        bg: "bg-[#39ff14]/20",
        border: "border-[#39ff14]/70",
      };
    } else if (isDuty) {
      nextEmotion = "approval";
      emote = {
        icon: "🛡️",
        text: "STATUS VERIFIED",
        color: "text-[#ffc857]",
        bg: "bg-[#ffc857]/20",
        border: "border-[#ffc857]/70",
      };
    }

    triggerReaction(nextEmotion, emote);

    // Append to transcript
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      sender: "user",
      senderName: "Ravenlord Boyd",
      text: action.label,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const replyText = action.reply ?? "Acknowledged.";
    const npcMsg: Message = {
      id: `npc-${Date.now()}`,
      sender: "npc",
      senderName: npc.name,
      text: replyText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      emotion: nextEmotion,
    };

    setHistory((prev) => [...prev, userMsg, npcMsg]);
    setFullLine(replyText);
    setError(null);
  }

  async function send() {
    const q = input.trim();
    if (!q || !user) return;
    setBusy(true);
    setError(null);

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      sender: "user",
      senderName: "Ravenlord Boyd",
      text: q,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setHistory((prev) => [...prev, userMsg]);
    setInput("");

    triggerReaction("inquisitive", {
      icon: "⚡",
      text: "TRANSMITTING NEURAL QUERY",
      color: "text-[#2de2e6]",
      bg: "bg-[#2de2e6]/15",
      border: "border-[#2de2e6]/60",
    });

    try {
      const res = await talkInHall({ data: { agent: npc.id, message: q } });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        triggerReaction("strike", {
          icon: "⚠️",
          text: "SEAT REJECTION",
          color: "text-[#ff3b3b]",
          bg: "bg-[#ff3b3b]/20",
          border: "border-[#ff3b3b]/70",
        });
        return;
      }

      const npcMsg: Message = {
        id: `npc-${Date.now()}`,
        sender: "npc",
        senderName: npc.name,
        text: res.reply,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        emotion: "approval",
      };
      setHistory((prev) => [...prev, npcMsg]);
      setFullLine(res.reply);
      triggerReaction("approval", {
        icon: "✨",
        text: "CANONICAL REPLY",
        color: "text-[#39ff14]",
        bg: "bg-[#39ff14]/20",
        border: "border-[#39ff14]/70",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The seat did not answer.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function handleEquipSkin(skin: RavenlordSkin) {
    setActiveSkin(skin.id);
    onSelectSkin?.(skin.id);
    hallAudio.playArmorEquip();
    toast.success(`Equipped ${skin.name} Armor Plate`);
  }

  const isOracle = npc.id === "oracle";

  const roleTheme = isOracle
    ? { border: "border-[#39ff14]/70", text: "text-[#39ff14]", bg: "bg-[#39ff14]/15", glow: "shadow-[0_0_25px_rgba(57,255,20,0.35)]" }
    : npc.id === "valerie"
    ? { border: "border-[#ff2a6d]/60", text: "text-[#ff2a6d]", bg: "bg-[#ff2a6d]/10", glow: "shadow-[0_0_20px_rgba(255,42,109,0.3)]" }
    : npc.id === "corvid"
    ? { border: "border-[#2de2e6]/60", text: "text-[#2de2e6]", bg: "bg-[#2de2e6]/10", glow: "shadow-[0_0_20px_rgba(45,226,230,0.3)]" }
    : { border: "border-[#ffc857]/60", text: "text-[#ffc857]", bg: "bg-[#ffc857]/10", glow: "shadow-[0_0_20px_rgba(255,200,87,0.3)]" };

  // Dynamic portrait animation class determination
  let portraitAnimClass = "";
  if (emotion === "speaking") {
    portraitAnimClass = "scale-[1.04] brightness-110";
  } else if (emotion === "strike") {
    portraitAnimClass = "animate-pulse ring-2 ring-[#ff3b3b] shadow-[0_0_30px_rgba(255,59,59,0.6)]";
  } else if (emotion === "inquisitive") {
    portraitAnimClass = "rotate-1 shadow-[0_0_25px_rgba(45,226,230,0.5)]";
  } else if (emotion === "approval") {
    portraitAnimClass = "-translate-y-1 shadow-[0_0_25px_rgba(57,255,20,0.5)]";
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex flex-col justify-end bg-black/65 backdrop-blur-sm transition-all duration-300">
      {/* Background Painted Scene Vignette */}
      <div className="absolute inset-0 -z-10 opacity-30">
        <img src={npc.talkScene ?? TALK_SRC} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0e14] via-[#0b0e14]/75 to-transparent" />
      </div>

      {/* Top Controls Bar */}
      <div className="absolute right-4 top-4 z-40 flex items-center gap-2">
        <div className="flex rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/90 p-0.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              hallAudio.playInteract();
              setTab("chat");
            }}
            className={`rounded-xs px-3 py-1 font-mono text-xs uppercase tracking-wider transition ${
              tab === "chat"
                ? isOracle
                  ? "bg-[#39ff14]/20 text-[#39ff14] font-bold"
                  : "bg-[#2de2e6]/20 text-[#2de2e6] font-bold"
                : "text-[#9aa3b2] hover:text-[#e8ecf1]"
            }`}
          >
            🗣️ Dialogue
          </button>
          <button
            type="button"
            onClick={() => {
              hallAudio.playInteract();
              setTab("armor");
            }}
            className={`rounded-xs px-3 py-1 font-mono text-xs uppercase tracking-wider transition ${
              tab === "armor"
                ? "bg-[#ffc857]/20 text-[#ffc857] font-bold"
                : "text-[#9aa3b2] hover:text-[#e8ecf1]"
            }`}
          >
            🛡️ Ravenlord Armor
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            hallAudio.playInteract();
            onClose();
          }}
          className="flex items-center gap-1.5 rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/90 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-[#9aa3b2] backdrop-blur-md hover:border-[#2de2e6] hover:text-[#e8ecf1]"
        >
          <span>[ESC]</span> Stand
        </button>
      </div>

      {/* Main Container */}
      <div className="w-full px-3 pb-4 pt-2 md:px-8">
        <div
          className={`mx-auto max-w-4xl overflow-hidden rounded-md border ${
            isOracle ? "border-[#39ff14]/60 shadow-[0_0_60px_rgba(57,255,20,0.25)]" : "border-[#3a3f4b] shadow-[0_0_50px_rgba(0,0,0,0.9)]"
          } bg-[#0b0e14]/95 backdrop-blur-xl`}
        >
          {/* Header Bar with Status & Dynamic Reaction Pips */}
          <div
            className={`flex items-center justify-between border-b ${
              isOracle ? "border-[#39ff14]/30 bg-[#39ff14]/10" : "border-[#1e222b] bg-[#1e222b]/50"
            } px-4 py-2.5 md:px-5`}
          >
            <div className="flex items-center gap-3">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${roleTheme.bg} ${roleTheme.border} border animate-pulse`} />
              <h2 className="font-mono text-sm font-semibold tracking-wider text-[#e8ecf1]">
                {npc.name}
              </h2>
              <span className={`rounded-sm border ${roleTheme.border} ${roleTheme.bg} px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${roleTheme.text}`}>
                {npc.role}
              </span>
              {isOracle && (
                <span className="hidden font-mono text-[9px] uppercase tracking-widest text-[#39ff14]/80 md:inline">
                  [CANONICAL REGISTRY · ZERO HALLUCINATIONS]
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#9aa3b2]">
                STATUS: {npc.state.toUpperCase()}
              </span>
            </div>
          </div>

          {/* TAB 1: Dialogue & Neural Link */}
          {tab === "chat" ? (
            <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:gap-6 md:p-5">
              {/* Dynamic Animated Character Portrait Box */}
              <div className="relative shrink-0 self-center md:self-start">
                <div
                  className={`relative h-28 w-28 overflow-hidden rounded-sm border-2 ${roleTheme.border} bg-[#1e222b] transition-all duration-300 ${roleTheme.glow} ${portraitAnimClass}`}
                >
                  <img
                    src={npc.portrait ?? npc.actor ?? "/hall/sprites/ravenlord.png"}
                    alt={npc.name}
                    className="h-full w-full object-cover object-center pixelated transition-transform duration-300"
                  />

                  {/* Laser Scanline on Inquisitive / Diagnostic Reaction */}
                  {emotion === "inquisitive" && (
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#2de2e6]/25 to-transparent animate-pulse" />
                  )}

                  {/* Strike Scan Overlay */}
                  {emotion === "strike" && (
                    <div className="pointer-events-none absolute inset-0 bg-[#ff3b3b]/30 animate-ping" />
                  )}

                  {/* Speaking Indicator waveform in corner */}
                  {isTyping && (
                    <div className="absolute bottom-1 right-1 flex items-end gap-0.5 rounded bg-black/70 px-1 py-0.5">
                      <span className={`h-2.5 w-0.5 ${isOracle ? "bg-[#39ff14]" : "bg-[#2de2e6]"} animate-bounce`} />
                      <span className={`h-3.5 w-0.5 ${isOracle ? "bg-[#39ff14]" : "bg-[#2de2e6]"} animate-bounce delay-75`} />
                      <span className={`h-2 w-0.5 ${isOracle ? "bg-[#39ff14]" : "bg-[#2de2e6]"} animate-bounce delay-150`} />
                    </div>
                  )}
                </div>

                {/* Floating Reaction Badge */}
                {reaction && (
                  <div
                    className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border ${reaction.border} ${reaction.bg} px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${reaction.color} shadow-lg backdrop-blur-md animate-bounce`}
                  >
                    <span>{reaction.icon}</span> {reaction.text}
                  </div>
                )}

                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded bg-[#0b0e14] px-1.5 font-mono text-[9px] uppercase tracking-wider text-[#9aa3b2] border border-[#3a3f4b]">
                  {npc.id}
                </span>
              </div>

              {/* Chat Feed & Interactive Choices */}
              <div className="min-w-0 flex-1 flex flex-col">
                {/* Scrollable Conversation Transcript Log */}
                <div className="max-h-48 min-h-[5.5rem] overflow-y-auto rounded-sm border border-[#3a3f4b]/50 bg-[#1e222b]/40 p-3 scrollbar-thin scrollbar-thumb-[#3a3f4b]">
                  <div className="space-y-2.5">
                    {history.map((msg, i) => {
                      const isLast = i === history.length - 1;
                      const isNpc = msg.sender === "npc";
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            isNpc ? "items-start" : "items-end"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#9aa3b2] mb-0.5">
                            <span className={isNpc ? roleTheme.text : "text-[#2de2e6]"}>
                              {msg.senderName}
                            </span>
                            <span>·</span>
                            <span>{msg.time}</span>
                          </div>
                          <div
                            className={`rounded-sm px-3 py-2 text-xs font-mono leading-relaxed ${
                              isNpc
                                ? `border ${isOracle ? "border-[#39ff14]/40 bg-[#0b0e14]/90 text-[#e8ecf1]" : "border-[#3a3f4b] bg-[#0b0e14]/90 text-[#e8ecf1]"}`
                                : "border border-[#2de2e6]/50 bg-[#2de2e6]/10 text-[#2de2e6]"
                            }`}
                          >
                            {isLast && isNpc && isTyping ? (
                              <span>
                                {displayedLine}
                                <span className={`inline-block h-3.5 w-1.5 ml-1 ${isOracle ? "bg-[#39ff14]" : "bg-[#2de2e6]"} animate-pulse`} />
                              </span>
                            ) : (
                              <span>{msg.text}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  {error && <p className="mt-2 font-mono text-xs text-[#ff3b3b]">[ERROR] {error}</p>}
                </div>

                {/* Action Choices Grid */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {npc.actions.map((action) => {
                    const isTable = action.href === "/table";
                    return action.href && !isTable ? (
                      <Link
                        key={action.id}
                        to={action.href}
                        onClick={() => hallAudio.playInteract()}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-sm border ${
                          isOracle
                            ? "border-[#39ff14]/60 bg-[#39ff14]/15 text-[#39ff14] hover:bg-[#39ff14]/30"
                            : "border-[#2de2e6]/50 bg-[#2de2e6]/10 text-[#2de2e6] hover:bg-[#2de2e6]/25"
                        } px-3 font-mono text-xs uppercase tracking-wider transition shadow-sm`}
                      >
                        <span>⚡</span> {action.label}
                      </Link>
                    ) : (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => runAction(action)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-sm border ${
                          isTable
                            ? "border-[#2de2e6]/60 bg-[#2de2e6]/15 text-[#2de2e6] hover:bg-[#2de2e6]/30 font-bold"
                            : isOracle
                            ? "border-[#ffc857]/60 bg-[#ffc857]/10 text-[#ffc857] hover:bg-[#ffc857]/25"
                            : "border-[#ffc857]/50 bg-[#ffc857]/10 text-[#ffc857] hover:bg-[#ffc857]/25"
                        } px-3 font-mono text-xs uppercase tracking-wider transition`}
                      >
                        <span>{isTable ? "⚔️" : "◆"}</span> {action.label}
                      </button>
                    );
                  })}
                </div>

                {/* Freeform Prompt Form */}
                {user ? (
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={`Transmit neural query to ${npc.name}… (e.g. audit status, directives)`}
                      className={`h-9 flex-1 rounded-sm border ${
                        isOracle ? "border-[#39ff14]/50 focus:border-[#39ff14]" : "border-[#3a3f4b] focus:border-[#2de2e6]"
                      } bg-[#1e222b] px-3 font-mono text-xs text-[#e8ecf1] outline-none placeholder:text-[#6b7280]`}
                    />
                    <button
                      type="submit"
                      disabled={busy || !input.trim()}
                      className={`h-9 rounded-sm ${
                        isOracle ? "bg-[#39ff14] text-[#0b0e14] hover:bg-[#39ff14]/90" : "bg-[#2de2e6] text-[#0b0e14] hover:bg-[#2de2e6]/90"
                      } px-4 font-mono text-xs font-semibold uppercase tracking-wider transition disabled:opacity-40`}
                    >
                      {busy ? "…" : "Transmit"}
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 font-mono text-xs text-[#9aa3b2]">
                    Interactive options ready.{" "}
                    <Link to="/login" className="text-[#2de2e6] underline underline-offset-2 hover:text-[#2de2e6]/80">
                      Sign in
                    </Link>{" "}
                    to transmit custom neural prompts.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* TAB 2: Ravenlord Armor Wardrobe & Skin Swapper */
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between border-b border-[#1e222b] pb-3">
                <div>
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-[#e8ecf1]">
                    Ravenlord Tactical Wardrobe & Cuirass
                  </h3>
                  <p className="font-mono text-xs text-[#9aa3b2]">
                    Equip sovereign armor plates. Visual models and particle conduits update in real-time.
                  </p>
                </div>
                <span className="rounded bg-[#ffc857]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#ffc857] border border-[#ffc857]/40">
                  Active Skin: {activeSkin.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                {RAVENLORD_SKINS.map((skin) => {
                  const isEquipped = activeSkin === skin.id;
                  return (
                    <div
                      key={skin.id}
                      className={`relative flex flex-col justify-between rounded-sm border p-3.5 transition-all ${
                        isEquipped
                          ? "border-[#2de2e6] bg-[#2de2e6]/10 shadow-[0_0_20px_rgba(45,226,230,0.2)]"
                          : "border-[#3a3f4b] bg-[#1e222b]/50 hover:border-[#9aa3b2]"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold tracking-wider" style={{ color: skin.accent }}>
                            {skin.badge}
                          </span>
                          {isEquipped && (
                            <span className="rounded bg-[#2de2e6] px-1.5 py-0.2 font-mono text-[9px] font-bold text-[#0b0e14]">
                              EQUIPPED
                            </span>
                          )}
                        </div>

                        {/* Visual Sprite Preview */}
                        <div className="my-2.5 flex h-24 items-center justify-center rounded-sm bg-[#0b0e14] border border-[#3a3f4b]/60">
                          <img
                            src={skin.src}
                            alt={skin.name}
                            className="h-16 w-auto object-none object-top pixelated"
                            style={{ imageRendering: "pixelated" }}
                          />
                        </div>

                        <h4 className="font-mono text-xs font-bold text-[#e8ecf1]">{skin.name}</h4>
                        <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#9aa3b2]">
                          {skin.description}
                        </p>

                        <div className="mt-2.5 space-y-1 border-t border-[#3a3f4b]/50 pt-2 font-mono text-[9px]">
                          <div className="flex justify-between text-[#9aa3b2]">
                            <span>Armor Rating:</span>
                            <span className="font-bold text-[#e8ecf1]">{skin.stats.armor} DEF</span>
                          </div>
                          <div className="flex justify-between text-[#9aa3b2]">
                            <span>Conduit Flux:</span>
                            <span style={{ color: skin.accent }}>{skin.stats.conduit}</span>
                          </div>
                          <div className="flex justify-between text-[#9aa3b2]">
                            <span>Affinity:</span>
                            <span className="text-[#e8ecf1]">{skin.stats.affinity}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isEquipped}
                        onClick={() => handleEquipSkin(skin)}
                        className={`mt-3 h-8 w-full rounded-sm font-mono text-[11px] font-bold uppercase tracking-wider transition ${
                          isEquipped
                            ? "bg-[#2de2e6]/20 text-[#2de2e6] cursor-default border border-[#2de2e6]/40"
                            : "bg-[#e8ecf1] text-[#0b0e14] hover:bg-[#2de2e6] hover:text-[#0b0e14]"
                        }`}
                      >
                        {isEquipped ? "Active Cuirass" : "Equip Armor"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

