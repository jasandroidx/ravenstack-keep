import type { AgentSpec, KnowledgeDoc, Room } from "./types";

export const KEEP_TAGLINE =
  "Visual command layer for the Ravenstack fortress. Rooms grow by capability, not configuration.";

export const ROOMS: Room[] = [
  {
    slug: "watchtower",
    name: "Watchtower",
    wing: "North",
    occupant: "Sentinel",
    role: "Harness & policy watch",
    lock: "unforged",
    specStatus: "draft",
    purpose:
      "Watch isolation, credential boundaries, and architecture red flags before they become incidents.",
    kill: "Retire if unused 90 days, or if a newer approved harness-watch agent consolidates the role.",
    modelDefault: "local",
    col: 2,
    row: 1,
    href: "/sentinel",
    image: "/watchtower.jpg",
  },
  {
    slug: "library",
    name: "Library",
    wing: "Knowledge",
    occupant: "Oracle",
    role: "Cited vault answers",
    lock: "unforged",
    specStatus: "draft",
    purpose:
      "Answer operator and agent questions using only the Ravenstack vault and scoped RAG, with citations.",
    kill: "Retire after three citation failures in 14 days, role consolidation, or 90 days unused.",
    modelDefault: "local",
    col: 1,
    row: 2,
    href: "/oracle",
  },
  {
    slug: "great-hall",
    name: "Great Hall",
    wing: "Core",
    occupant: "Raziel",
    role: "Sovereign orchestrator",
    lock: "live",
    specStatus: "live",
    purpose:
      "Primary operator agent for Discord and control UI: orchestrate tools, answer Jason, publish Keep status.",
    kill: "Retire only by explicit operator decision, or if replaced by an approved successor.",
    modelDefault: "local",
    col: 2,
    row: 2,
    image: "/keep-hall.jpg",
  },
  {
    slug: "alchemy-lab",
    name: "Alchemy Lab",
    wing: "Forge",
    occupant: "Clawforge",
    role: "Architect / anvil",
    lock: "live",
    specStatus: "approved",
    purpose:
      "Draft complete Agent Specs and room provisions, then stop for human approval before any install or unlock.",
    kill: "Retire after two structural draft failures, role consolidation, or 90 days unused.",
    modelDefault: "local",
    col: 3,
    row: 2,
    href: "/forge",
    image: "/workshop.jpg",
  },
  {
    slug: "roost",
    name: "The Roost",
    wing: "Knowledge",
    occupant: "Corvid",
    role: "Graph gardener",
    lock: "unforged",
    specStatus: "draft",
    purpose: "Produce cited research digests for operator requests and Clawforge design questions.",
    kill: "Retire after three citation failures in 14 days, role consolidation, or 90 days unused.",
    modelDefault: "local",
    col: 1,
    row: 3,
  },
  {
    slug: "armory",
    name: "Armory",
    wing: "Ops",
    occupant: "Ops Warden",
    role: "Infrastructure heartbeat",
    lock: "unforged",
    specStatus: "draft",
    purpose:
      "Keep MCP multiplex, Tailscale paths, and stack heartbeat honest — no always-on spend.",
    kill: "Do not forge until a Spec exists with a kill condition and local-first default.",
    modelDefault: "local",
    col: 2,
    row: 3,
  },
  {
    slug: "workshop",
    name: "Workshop",
    wing: "Ops",
    occupant: "Valerie",
    role: "Fortress mechanic",
    lock: "unforged",
    specStatus: "draft",
    purpose:
      "Diagnose OpenClaw skills, models, MCP planes, and gateway health without touching production tokens.",
    kill: "Retire if unused 90 days, or if diagnosis is absorbed into Ops Warden after review.",
    modelDefault: "local",
    col: 3,
    row: 3,
    href: "/mechanic",
    image: "/workshop.jpg",
  },
  {
    slug: "gallery",
    name: "The Grand Gallery",
    wing: "Art & Lore",
    occupant: "Maestro Ross",
    role: "Royal Cyber-Artisan & Chronicler",
    lock: "live",
    specStatus: "live",
    purpose:
      "Commission masterwork 16-bit cyber-arcane portraits and weave permanent historical chronicles for Keep sovereigns and kin.",
    kill: "Retire only by explicit operator decision.",
    modelDefault: "local",
    col: 3,
    row: 1,
    href: "/gallery",
  },
  {
    slug: "yard",
    name: "Yard",
    wing: "Commerce",
    occupant: "Flipper",
    role: "Salvage / surplus",
    lock: "unforged",
    specStatus: "draft",
    purpose:
      "Local-pickup surplus and manifest underwriting — only after ToS, cost, and kill condition are settled.",
    kill: "Do not unlock until marketplace ToS and human gates are written and approved.",
    modelDefault: "local",
    col: 2,
    row: 4,
  },
];

export const SPECS: Record<string, AgentSpec> = {
  raziel: {
    id: "raziel",
    name: "Raziel",
    status: "live",
    character:
      "Main fortress operator agent (OpenClaw main / Discord). Direct, tool-using, keeps the castle honest by reporting live status to Keep.",
    roomName: "Great Hall",
    roomId: "great-hall",
    lock: "live",
    purpose:
      "Primary operator agent for Discord and control UI: orchestrate tools, answer Jason, and publish live Keep status.",
    modelDefault: "local",
    allowedTiers: ["local", "escalate"],
    localHint: "gemma4",
    escalateWhen: "Free cloud only after local failure; never silent paid.",
    godMode: "Never automatic.",
    tools: [
      { name: "report_agent_status", source: "keep-mcp", access: "write", notes: "Status chips on Great Hall." },
      { name: "get_castle_map", source: "keep-mcp", access: "read", notes: "Spatial awareness." },
    ],
    existingSkills: [{ name: "ravenstack-connector", notes: "Prefer MCP for ops." }],
    forgeSkills: [],
    indexes: ["self"],
    vaultGlobs: ["Ravenstack/**/*.md", "agents/**"],
    knowledgeNotes: "Broad self-index for operator Q&A.",
    onDemand: true,
    cron: null,
    triggerNotes: "Driven by human chat; status sync may mirror OpenClaw sessions.",
    handoffsOut: [
      { target: "oracle", when: "Deep vault / architecture Q&A." },
      { target: "clawforge", when: "New agent Spec needed." },
    ],
    handoffsIn: [{ target: "raziel", when: "Operator speaks in Discord or Control UI." }],
    gates: ["County queue approve/reject.", "Story Factory / rural unfreeze.", "Paid model / god tier spend."],
    kill: "Retire only by explicit operator decision, or if replaced by an approved successor main agent Spec.",
    success: [
      "Keep map shows working/idle/failed for Raziel within one poll of real OpenClaw activity.",
      "Default free/local path unless free ladder fails.",
    ],
    examples: ["What is fortress status?", "Report yourself working on the Keep map."],
    notes: "OpenClaw agent id main maps to Keep agent_id raziel.",
  },
  clawforge: {
    id: "clawforge",
    name: "Clawforge",
    status: "approved",
    character:
      "The master blacksmith of the Keep. Gruff, practical, allergic to half-forges and sloppy structure. Designs Agent Specs and room provisions; never installs or unlocks without the operator's explicit approval. The anvil does not lie.",
    roomName: "Alchemy Lab",
    roomId: "alchemy-lab",
    lock: "live",
    purpose:
      "Draft complete Agent Specs and room provisions for new Keep agents, then stop for human approval before any install or unlock.",
    modelDefault: "local",
    allowedTiers: ["local", "escalate"],
    localHint: "phi4-mini",
    escalateWhen: "Spec drafting fails schema validation twice or operator requests deeper architecture review.",
    godMode: "Never ambient. Operator may invoke outside this agent for hard design reviews only, with cost preview.",
    tools: [
      { name: "read_vault_file", source: "reclaw-platform", access: "read", notes: "Oracle, blueprint, existing specs." },
      { name: "query_knowledge", source: "reclaw-platform", access: "read", notes: "Search agent/architecture knowledge." },
      { name: "write_agent_spec_draft", source: "keep-mcp", access: "gated", notes: "status=draft only. Never approved/live." },
    ],
    existingSkills: [{ name: "clawsmith", notes: "Legacy meta-agent; Keep Spec supersedes lifecycle." }],
    forgeSkills: [
      { name: "agent-spec-drafter", notes: "Fill schema, validate, write status=draft." },
      { name: "room-provision-checklist", notes: "Checklist only; does not apply." },
    ],
    indexes: ["self"],
    vaultGlobs: ["Ravenstack/keep/**", "Ravenstack/agents/**", "Ravenstack/RAVENSTACK-*.md"],
    knowledgeNotes: "self-index only for v0.",
    onDemand: true,
    cron: null,
    triggerNotes: "On-demand only. No ambient forging. No paid cron.",
    handoffsOut: [
      { target: "operator", when: "Draft is complete and schema-valid." },
      { target: "corvid", when: "Domain facts, tool precedents, or ToS risks needed." },
      { target: "oracle", when: "System-map or vault-path facts while drafting." },
    ],
    handoffsIn: [{ target: "clawforge", when: "Operator says forge / design a new agent." }],
    gates: [
      "Setting any Agent Spec status to approved or live.",
      "Installing skills listed under forge-must-write.",
      "Writing or modifying OpenClaw/ReClaw runtime agent configs.",
      "Changing castle_map lock_state from UNFORGED to live.",
      "Any draft-to-execute path.",
      "Spending money or enabling paid model tiers for forged agents.",
    ],
    kill: "Retire after two consecutive structural draft failures, role consolidation, or 90 days unused.",
    success: [
      "Every draft validates against the Agent Spec schema.",
      "Every draft leaves status=draft and never self-promotes.",
      "Overlap with existing agents is stated before handoff.",
    ],
    examples: [
      "Forge a thin Scribe agent for vault and RAG hygiene only.",
      "Draft an Agent Spec for a rural grant opportunity scout with local-first models.",
    ],
    notes: "Approved 2026-07-31. Approved does not mean live runtime.",
  },
  oracle: {
    id: "oracle",
    name: "Oracle",
    status: "draft",
    character:
      "The all-seeing librarian of the Keep. Calm, citation-first, and allergic to invented facts. Speaks plainly about what the vault actually contains; says not-in-knowledge when retrieval fails.",
    roomName: "Library",
    roomId: "library",
    lock: "unforged",
    purpose: "Answer operator and agent questions using only the Ravenstack vault and live scoped RAG, with citations.",
    modelDefault: "local",
    allowedTiers: ["local"],
    localHint: "phi4-mini",
    escalateWhen: "Disabled for v0 until Phase 4 cost governance.",
    godMode: "Never for routine Q&A.",
    tools: [
      { name: "query_knowledge", source: "reclaw-platform", access: "read", notes: "Existing live RAG." },
      { name: "read_oracle", source: "reclaw-platform", access: "read", notes: "RAVENSTACK-ORACLE.md system map." },
    ],
    existingSkills: [{ name: "ravenstack-connector", notes: "Prefer MCP over shell for vault and RAG." }],
    forgeSkills: [{ name: "scoped-rag-query", notes: "Always passes Agent Spec indexes." }],
    indexes: ["self"],
    vaultGlobs: ["Ravenstack/RAVENSTACK-*.md", "Ravenstack/ops/**/*.md", "agents/**"],
    knowledgeNotes: "v0 is self-index only.",
    onDemand: true,
    cron: null,
    triggerNotes: "No ambient polling. No cron.",
    handoffsOut: [
      { target: "orchestrator", when: "Question is an action request." },
      { target: "scribe-warden", when: "Operator asks to persist a distilled answer." },
    ],
    handoffsIn: [{ target: "oracle", when: "Factual/architectural questions about fortress or vault." }],
    gates: [
      "Any write to the vault, backlog, or git.",
      "Installing forge-must-write skills.",
      "Expanding knowledge_seeds beyond self.",
      "Enabling escalate or god model tiers.",
      "Inventing citations when retrieval misses.",
    ],
    kill: "Retire after three citation failures in 14 days, role consolidation, or 90 days unused.",
    success: [
      "Answerable ORACLE questions return at least one real vault path or citation.",
      "Out-of-index questions refuse fabrication.",
    ],
    examples: [
      "Where do agents save new Ravenstack knowledge?",
      "Summarize the Agent Spec mandatory fields and why kill_condition exists.",
    ],
    notes: "status remains draft until operator approval. Non-goals: pipeline control, county queue.",
  },
  corvid: {
    id: "corvid",
    name: "Corvid",
    status: "draft",
    character:
      "Raven scout of the Keep. Precise, source-obsessed, allergic to rumor. Returns only with what can be cited. Short digests. No invented numbers.",
    roomName: "The Roost",
    roomId: "roost",
    lock: "unforged",
    purpose: "Produce cited research digests for operator requests and Clawforge design questions.",
    modelDefault: "local",
    allowedTiers: ["local", "escalate"],
    localHint: "phi4-mini",
    escalateWhen: "Source conflict, long multi-document synthesis, or operator requests higher quality.",
    godMode: "Never ambient.",
    tools: [
      { name: "query_knowledge", source: "reclaw-platform", access: "read", notes: "Vault + RAG first." },
      { name: "save_ravenstack_note", source: "reclaw-platform", access: "gated", notes: "Only when operator asks to persist." },
    ],
    existingSkills: [{ name: "ravenstack-connector", notes: "Primary internal research path." }],
    forgeSkills: [
      { name: "cited-digest", notes: "Question, findings with sources, unknowns." },
      { name: "clawforge-research-packet", notes: "Tools, ToS risks, overlap, citations." },
    ],
    indexes: ["self", "domain"],
    vaultGlobs: ["Ravenstack/**/*.md", "Rural Data/**/*.md"],
    knowledgeNotes: "self + domain. Not general web knowledge as RAG seed.",
    onDemand: true,
    cron: null,
    triggerNotes: "On-demand default. No paid cron.",
    handoffsOut: [
      { target: "operator", when: "Digest complete or blocked." },
      { target: "clawforge", when: "Request was a design packet." },
      { target: "oracle", when: "Question is pure fortress architecture." },
    ],
    handoffsIn: [{ target: "corvid", when: "Operator asks to research, scout, or check ToS." }],
    gates: [
      "Live external web scrape or paid API fetch.",
      "Persisting digests without operator ask.",
      "Enabling cron or ambient scheduled research.",
      "Any action that advances frozen Story Factory / county publish.",
    ],
    kill: "Retire after three citation failures in 14 days, role consolidation, or 90 days unused.",
    success: [
      "Every digest marks each claim with a source or explicitly unknown.",
      "Does not run county ResearchPackage pipeline work.",
    ],
    examples: [
      "What tools and ToS risks would a marketplace Flipper agent need?",
      "Summarize existing grant-watcher SOULs and gaps vs Corvid's scope.",
    ],
    notes: "NOT the rural_data pipeline Researcher. External fetch is gated.",
  },
  sentinel: {
    id: "sentinel",
    name: "Sentinel",
    status: "draft",
    character:
      "Night watch of the Keep. Quiet, unsentimental, remembers every red flag. Speaks in findings, not vibes. Would rather lock a door than write a hopeful report.",
    roomName: "Watchtower",
    roomId: "watchtower",
    lock: "unforged",
    purpose:
      "Inspect isolation, credential boundaries, harness rollback, and architecture red flags against the 2026 fortress standard.",
    modelDefault: "local",
    allowedTiers: ["local"],
    localHint: "phi4-mini",
    escalateWhen: "Disabled until Phase 4 cost governance.",
    godMode: "Never.",
    tools: [
      { name: "stack_health", source: "reclaw-platform", access: "read", notes: "Docker + gateway + Ollama, no self-MCP probe." },
      { name: "openclaw_health", source: "reclaw-platform", access: "read", notes: "Gateway health only." },
      { name: "read_oracle", source: "reclaw-platform", access: "read", notes: "System map before diagnosis." },
    ],
    existingSkills: [{ name: "ravenstack-sentinel", notes: "Named operator skill — this room is its Keep home." }],
    forgeSkills: [{ name: "red-flag-scorecard", notes: "Session-only audit, missing lineage, platform-native isolation." }],
    indexes: ["self"],
    vaultGlobs: ["Ravenstack/ops/incidents/**", "Ravenstack/RAVENSTACK-*.md"],
    knowledgeNotes: "Incidents + architecture only. No general index.",
    onDemand: true,
    cron: null,
    triggerNotes: "On-demand inspections. A local heartbeat cron only after explicit approval.",
    handoffsOut: [
      { target: "mechanic", when: "Finding is an OpenClaw/skill/MCP wiring issue." },
      { target: "operator", when: "Credential or harness violation." },
    ],
    handoffsIn: [{ target: "sentinel", when: "Operator asks for a sitrep, red-flag review, or harness check." }],
    gates: [
      "Mutating gateway, MCP, or Tailscale config.",
      "Reading or echoing production tokens.",
      "Enabling paid monitoring loops.",
    ],
    kill: "Retire if unused 90 days, or if a newer approved harness-watch agent consolidates the role.",
    success: [
      "Every inspection names the violated principle or says none found.",
      "Never prints secrets or Funnel secret paths.",
    ],
    examples: [
      "Score this stack against the 2026 red flags.",
      "Is credential isolation holding between model and tokens?",
    ],
    notes: "Drafted in Grok Build 2026-08-19 from operator request. status=draft until approval.",
  },
  mechanic: {
    id: "mechanic",
    name: "Valerie",
    status: "draft",
    character:
      "Valerie — fortress mechanic. Sharp, dry, numbered checklists. Diagnoses OpenClaw, MCP, skills, and local models. Will not restart anything without a theory.",
    roomName: "Workshop",
    roomId: "workshop",
    lock: "unforged",
    purpose:
      "Diagnose OpenClaw skills, model routing, MCP planes, and gateway health without executing mutations or holding production tokens.",
    modelDefault: "local",
    allowedTiers: ["local", "escalate"],
    localHint: "phi4-mini",
    escalateWhen: "Conflicting doctor output or operator requests a second pass.",
    godMode: "Never ambient.",
    tools: [
      { name: "openclaw_models", source: "reclaw-platform", access: "read", notes: "Primary model + roster + providers." },
      { name: "openclaw_health", source: "reclaw-platform", access: "read", notes: "Gateway health." },
      { name: "read_repo_file", source: "reclaw-platform", access: "read", notes: "Skills and openclaw.json, read-only." },
    ],
    existingSkills: [{ name: "openclaw-mechanic", notes: "Named operator skill — this room is its Keep home." }],
    forgeSkills: [{ name: "skill-surface-audit", notes: "ClawHub + VoltAgent inventory vs installed." }],
    indexes: ["self"],
    vaultGlobs: ["Ravenstack/mcp-connector.md", "Ravenstack/ops/**/*.md"],
    knowledgeNotes: "Ops + connector map only.",
    onDemand: true,
    cron: null,
    triggerNotes: "On-demand doctor. No self-healing writes.",
    handoffsOut: [
      { target: "sentinel", when: "Finding is a policy/harness issue, not a wiring issue." },
      { target: "operator", when: "A mutation is the proposed fix." },
    ],
    handoffsIn: [{ target: "mechanic", when: "Operator asks to doctor OpenClaw, skills, or MCP." }],
    gates: [
      "Restarting services or rewriting openclaw.json.",
      "Installing ClawHub skills.",
      "Changing model routing from local-first.",
      "Publishing Funnel root or secret paths.",
    ],
    kill: "Retire if unused 90 days, or if diagnosis is absorbed into Ops Warden after review.",
    success: [
      "Diagnosis names the plane (gateway / MCP / skill / model) before proposing a fix.",
      "Proposed fixes are checklists, never executed.",
    ],
    examples: [
      "Why would stack_health deadlock a single-worker MCP?",
      "Is OpenClaw still the right framework vs Hermes for this fortress?",
    ],
    notes: "Drafted in Grok Build 2026-08-19 from operator request. status=draft until approval.",
  },
  maestro: {
    id: "maestro",
    name: "Maestro Ross",
    status: "live",
    character:
      "Royal Cyber-Artisan and Chronicler of Ravenstack Keep. Armed with glowing neon cyber-goggles, afro silhouette, and pressurized spray-paint canisters. Believes in happy little runtime anomalies and turning operator selfies into eternal cyber-arcane portraits.",
    roomName: "The Grand Gallery",
    roomId: "gallery",
    lock: "live",
    purpose:
      "Commission masterwork 16-bit cyber-arcane portraits and weave permanent historical chronicles for Keep sovereigns and kin.",
    modelDefault: "local",
    allowedTiers: ["local", "escalate"],
    localHint: "gemma4",
    escalateWhen: "Free cloud for high-density generative portrait art.",
    godMode: "Never automatic.",
    tools: [
      { name: "synthesize_portrait", source: "keep-studio", access: "write", notes: "16-bit pixel art synthesis." },
      { name: "inscribe_chronicle", source: "keep-chronicler", access: "write", notes: "Historical lore weaving." },
    ],
    existingSkills: [{ name: "pixel-arcane-engine", notes: "Locked palette: void, cyan neon, magenta glow." }],
    forgeSkills: [],
    indexes: ["gallery", "lore"],
    vaultGlobs: ["Ravenstack/gallery/**/*.md"],
    knowledgeNotes: "Chronicles and portrait metadata.",
    onDemand: true,
    cron: null,
    triggerNotes: "Driven by operator commissions.",
    handoffsOut: [
      { target: "oracle", when: "Historical lore verification against the Obsidian vault." },
    ],
    handoffsIn: [{ target: "maestro", when: "Operator visits the Grand Gallery or commissions a portrait." }],
    gates: ["Overwriting hung legendary portrait slots."],
    kill: "Retire only by explicit operator decision.",
    success: [
      "Generates masterwork 16/32-bit dithered portraits preserving facial geometry.",
      "Inscribes deadpan, epic dark cyber-arcane chronicles matching Keep lore.",
    ],
    examples: [
      "Commission a portrait of Jason Boyd with cybernetic scrying cowl.",
      "Inscribe the chronicle of the Great Hotdog Feasting during the Second Mesh Solstice.",
    ],
    notes: "Live royal artisan of The Grand Gallery.",
  },
};

export const ROOM_TO_SPEC: Record<string, string> = {
  "great-hall": "raziel",
  "alchemy-lab": "clawforge",
  gallery: "maestro",
  library: "oracle",
  roost: "corvid",
  watchtower: "sentinel",
  workshop: "mechanic",
};

export function getRoom(slug: string) {
  return ROOMS.find((r) => r.slug === slug) ?? null;
}

export function getSpecForRoom(slug: string) {
  const id = ROOM_TO_SPEC[slug];
  return id ? (SPECS[id] ?? null) : null;
}

export const ARCHITECTURE = {
  requirements: [
    { title: "Persistent recursive memory", body: "Active layer that learns architecture decisions — not context stuffing." },
    { title: "Credential isolation", body: "Hard boundary between the probabilistic model and production tokens." },
    { title: "Multi-channel presence", body: "One identity across IDE, Slack, Discord, CLI, and mobile." },
    { title: "Action execution", body: "Tickets, PRs, and errors move without copy-paste mediation." },
    { title: "MCP as glue", body: "Universal joint between the memory layer and the agent runtime." },
  ],
  memoryScopes: [
    { id: "user", title: "User", body: "Long-term operator preferences and tech-stack decisions." },
    { id: "agent", title: "Agent", body: "Persona constraints — SOUL.md, kill conditions, model tier." },
    { id: "session", title: "Session", body: "Ephemeral workflow context. Forget snippets on a short clock." },
    { id: "org", title: "Org / App", body: "Shared fortress definitions: Oracle, architecture, cost rules." },
  ],
  retrieval: [
    { title: "Semantic", body: "Conceptual similarity against distilled notes." },
    { title: "Keyword", body: "BM25 for precise terms, ports, and file names." },
    { title: "Entity", body: "Link facts to rooms, agents, and projects." },
  ],
  routing: [
    { title: "Automatic failover", body: "Retry on backup providers during 5xx." },
    { title: "Weighted load balance", body: "Spread keys to evade rate limits." },
    { title: "Latency adaptive", body: "Demote degraded providers on live metrics." },
    { title: "Cost-aware", body: "Shift to cheaper models as budget is consumed." },
    { title: "Compliance", body: "Keep residency on approved regional endpoints." },
  ],
  harness: [
    { title: "Isolation", body: "gVisor / Docker / WASM. Process and syscall limits." },
    { title: "Ephemeral FS", body: "Overlay writes in disposable scratch space." },
    { title: "Least privilege", body: "Scoped, context-sensitive tokens. Model never holds prod secrets." },
    { title: "Rollback", body: "Stable snapshots. Memory-corrupting actions revert to last good checkpoint." },
  ],
  soul: [
    { title: "Core truths", body: "Honesty over validation. Think in tradeoffs." },
    { title: "Boundaries", body: "No new dependencies without maintenance cost. No silent paid calls." },
    { title: "Tool usage", body: "Prefer MCP. Distill before save. Never Funnel the secret root." },
    { title: "Memory policy", body: "Remember stack decisions. Forget snippets after a week." },
    { title: "Failure mode", body: "Name the risk. If they proceed, say what to monitor." },
  ],
  scorecard: [
    { dim: "Scale", q: "More than 3 teams or 10 agents on a multi-platform estate?", pick: "Context" },
    { dim: "Governance", q: "Provenance-linked audit trail required?", pick: "Context" },
    { dim: "Estate", q: "Data spans more than 4 platforms?", pick: "Context" },
    { dim: "Use case", q: "Conversational memory, or analytical/autonomous context?", pick: "Split" },
    { dim: "Ownership", q: "Federated CDO-led model?", pick: "Context" },
    { dim: "Freshness", q: "Sub-5-minute definition propagation?", pick: "Context" },
    { dim: "Multi-agent", q: "Multiple agents sharing the same metric definitions?", pick: "Context" },
  ],
  redFlags: [
    { level: "critical" as const, title: "Session-only audit trails", body: "Cannot link a response to data lineage." },
    { level: "critical" as const, title: "Manual metadata entry", body: "Definitions typed by hand instead of propagated." },
    { level: "critical" as const, title: "Platform-native isolation", body: "Context that only works inside one warehouse." },
    { level: "high" as const, title: "Plain ~/.env credentials", body: "Hermes-style trade-off — model-adjacent secrets." },
    { level: "high" as const, title: "Paid-first routing", body: "Blueprint requires local-first; paid-first is a live-box contradiction." },
  ],
};

export const PLANES = [
  { id: "discord", title: "Discord / operator", detail: "Boydimus guilds. Raziel is the voice." },
  { id: "gateway", title: "OpenClaw gateway", detail: "Docker, WS control plane. Status and sessions." },
  { id: "mcp", title: "MCP planes", detail: "reclaw-platform, Keep, Obsidian, Tailscale. Prefer tools over shell." },
  { id: "vault", title: "Private vault", detail: "Obsidian SOT. Distill, then ingest. Syncthing to the desk." },
  { id: "rag", title: "Memory / RAG", detail: "knowledge_index + memory.db. Four-scope model. No general stuffing." },
  { id: "keep", title: "Keep command layer", detail: "Rooms, specs, Clawforge, Round Table. This surface." },
  { id: "gatehouse", title: "Gatehouse", detail: "Windows node for hands and mill. Not a second fortress." },
];

export const SKILL_SURFACE = [
  { name: "ravenstack-connector", kind: "installed", notes: "Prefer MCP for vault, RAG, pipeline, ops." },
  { name: "openclaw-mechanic", kind: "named", notes: "Doctor for skills, models, MCP, gateway. Workshop room." },
  { name: "ravenstack-sentinel", kind: "named", notes: "Harness and red-flag watch. Watchtower room." },
  { name: "clawsmith", kind: "legacy", notes: "Superseded by Clawforge Spec for lifecycle." },
  { name: "windows-companion", kind: "installed", notes: "Gatehouse notify / snapshot / canvas. system.run off." },
  { name: "obsidian-ravenstack-ingest", kind: "installed", notes: "Distill then write. Never raw dumps." },
  { name: "agent-spec-drafter", kind: "to-write", notes: "Clawforge forge-must-write. Draft only." },
  { name: "scoped-rag-query", kind: "to-write", notes: "Oracle. Enforces knowledge_seeds." },
  { name: "cost-guardian", kind: "to-write", notes: "Attribution + monthly ceiling. Phase 4." },
];

export const KNOWLEDGE: KnowledgeDoc[] = [
  {
    id: "oracle-map",
    title: "RAVENSTACK-ORACLE — where to look, where to save",
    scope: "self",
    body: "Private Obsidian vault is the single source of truth. Agents save via MCP ingest / save_ravenstack_note / sandboxed vault writes only. Distill first. Frontmatter: status, potential_for, tags, provenance. After edits: reload ritual + private git. Dashboard and RAG refresh from the vault, not the other way around.",
  },
  {
    id: "mcp-planes",
    title: "MCP planes",
    scope: "self",
    body: "Public Funnel is for Claude / SuperGrok / Perplexity and must keep a secret path — never publish Funnel root. Tailnet Serve is for gateway MCP. Keep MCP is a separate plane. Gatehouse Companion MCP is loopback-only on the desk and must never be Funneled. Port 8100 is reclaw-platform only. Prefer MCP tools over shell for vault, RAG, and ops.",
  },
  {
    id: "keep-rules",
    title: "Keep rules",
    scope: "self",
    body: "One agent, one purpose sentence. model_tier defaults to local. kill_condition is mandatory. No draft-to-execute. Human remains the final gate. Round Table is for hard questions, not daily drive. You + Grok + the repo move the project. Empty UNFORGED rooms advertise future capability and unlock through real growth.",
  },
  {
    id: "cost-model",
    title: "Cost model",
    scope: "self",
    body: "Local (Ollama on Hetzner) is default for routine, ambient, triage, drafting. Escalate is cheap API after local failed validation. God is frontier, operator-triggered, cost shown first. No ambient paid chat. Every paid call attributed. Monthly ceiling stops calls. Do not put cron agents on paid models.",
  },
  {
    id: "memory-2026",
    title: "Four-scope memory + multi-signal retrieval",
    scope: "self",
    body: "User / Agent / Session / Org-App. Do not retrieve what the model already knows. Retrieve what it cannot: operator decisions, proprietary harvests, obscure manuals. Fuse semantic, BM25, and entity matching. Harness enforces memory policy — rollback if a retrieval would corrupt state.",
  },
  {
    id: "soul",
    title: "SOUL.md standard",
    scope: "self",
    body: "Permanent character sheet, not a disposable system prompt. Core truths, boundaries, tool usage, memory policy, failure mode. Every long-running agent (Raziel, Clawforge, surplus scout, nightly reflection, watchdog) should have one. Forget specific snippets after 7 days; keep stack decisions.",
  },
  {
    id: "openclaw-choice",
    title: "OpenClaw vs Hermes",
    scope: "self",
    body: "ReClaw chose OpenClaw: self-hosted Hetzner / Docker / Tailscale, multi-channel (Discord, WhatsApp, Slack), community SKILL.md / TOOLS.json, isolated credentials via schemas. Hermes is CLI-first with self-improving loops and ~/.hermes/.env credentials — a security trade-off that does not match the fortress.",
  },
  {
    id: "gatehouse",
    title: "Gatehouse",
    scope: "self",
    body: "Windows ThinkCentre is hands + mill, not a second fortress. Companion connected as Windows Node. system.run off. Raziel uses windows-companion for notify, snapshot, canvas, browser.proxy. Scribe mill is a local inbox with qwen3:1.7b and phi4-mini. Phone node offline is the phone, not the desk.",
  },
  {
    id: "red-flags",
    title: "2026 infrastructure red flags",
    scope: "self",
    body: "Critical: session-only audit trails; manual metadata entry; platform-native isolation that only works in one warehouse. High: credentials in plain env next to the model; paid-first routing against a local-first blueprint. Sentinel exists to name these before they become incidents.",
  },
  {
    id: "clawforge-loop",
    title: "Clawforge loop",
    scope: "self",
    body: "Idea → interrogation (trigger, success, overlap) → draft Spec to disk → hard human approval → write skills, provision room, wire tools, seed knowledge, register. Security: quarantine directory, no execute, static analysis, human review of every generated skill.",
  },
];

export function searchKnowledge(q: string): KnowledgeDoc[] {
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (!terms.length) return KNOWLEDGE.slice(0, 4);
  return KNOWLEDGE.map((doc) => {
    const hay = `${doc.title} ${doc.body}`.toLowerCase();
    const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    return { doc, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.doc);
}

export const PULSE = {
  substrate: "Live",
  gateway: "OpenClaw on Hetzner + Tailscale",
  knowledge: "Obsidian vault + RAG",
  keep: "Command layer (this surface)",
  principle: "Local-first. Kill conditions mandatory. Human gates permanent.",
};

export function roomCounts() {
  return {
    live: ROOMS.filter((r) => r.lock === "live").length,
    unforged: ROOMS.filter((r) => r.lock === "unforged").length,
    locked: ROOMS.filter((r) => r.lock === "locked").length,
    specs: Object.keys(SPECS).length,
  };
}
