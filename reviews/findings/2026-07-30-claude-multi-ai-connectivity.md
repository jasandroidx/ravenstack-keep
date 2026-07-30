---
date: 2026-07-30
author: Claude (Anthropic) — live MCP session
type: research
topic: Connecting multiple AIs to one shared context — MCP ingress, auth, and shared-thread options
status: needs operator decision
blueprint_refs: ["§4.2", "§6", "§6.2", "§12.Q2", "§12.Q4", "§13.B", "§13.D"]
files_reviewed:
  - "RAVENSTACK-KEEP-BLUEPRINT-v0.2.md"
  - "mcp/README.md"
  - "mcp/tools.md"
  - "reviews/findings/2026-07-29-grok-roundtable-vehicle-recommendation.md"
  - "reviews/findings/2026-07-29-claude-live-substrate-review.md"
  - "docs/roundtable-v0.md"
  - "Live: connector_status, project_sitrep (MCP transport, tunnel, Tailscale posture)"
external_sources:
  - "xAI docs — Grok connectors / remote MCP (Bring Your Own MCP)"
  - "Claude Help Center — custom connectors via remote MCP"
  - "MCP authorization spec (OAuth 2.1 + PKCE, RFC 9728 PRM), Nov 2025 revision"
  - "Cloudflare One — secure MCP servers with Access"
  - "homeassistant-ai/ha-mcp Discussion #1674 — Claude.ai behind Cloudflare Zero Trust"
  - "aj-geddes/quorum-mcp; jdez427/claude-ipc-mcp; MrLesk/agents-council; srbhptl39/MCP-SuperAssistant"
---

# Finding: connecting multiple AIs to one shared context

## Summary

The operator asked whether there is a realistic way to get several AIs connected to
the same context and responding to the same thing. **Yes — and most of it is already
built.** The blocker is not capability, it is **one endpoint and one missing
credential.**

The ask is actually two problems that get conflated, and they have different answers:

1. **"Connect the AIs to the same thing."** Solved by the ecosystem. As of mid-2026
   all four major assistants — Claude, ChatGPT, Gemini, **and Grok** — ship a custom
   remote-MCP client surface. The existing reclaw-platform MCP is already the shared
   context. It needs a **stable public hostname and real auth**; it currently has a
   rotating quick-tunnel hostname and **no authentication at all**.
2. **"All respond to the same thing."** Not a tunnel problem. This is a shared-thread
   problem, and it needs roughly **four new tools** on the MCP that already exists —
   not a new server, not a new dependency.

**Blocking security issue, ahead of everything else in this finding:** the MCP
currently exposes write and approval tools with no authentication, protected only by
the obscurity of a rotating tunnel URL. Making that endpoint reliably reachable so
four AIs can use it — without adding auth first — would publish vault-write and
queue-approval capability to the open internet. **Auth is not step three. It is step
one.**

## What I read

- Blueprint §4.2 (Keep MCP), §6 (Round Table), §12.Q2 and §12.Q4
- Grok's Round Table vehicle recommendation and `docs/roundtable-v0.md`
- Live connector posture via `connector_status` and `project_sitrep`
- xAI and Anthropic documentation on custom remote-MCP connectors
- The MCP authorization specification (Nov 2025 revision)
- Cloudflare One guidance on securing MCP servers with Access
- A real-world write-up of connecting a hosted assistant to a self-hosted MCP behind
  Cloudflare Zero Trust, including the failure modes and the config that fixed them
- Four candidate projects for the shared-thread half (see below)

## Findings (facts)

### 1. All four major assistants now support custom remote MCP

This is the fact that makes the whole idea viable, and it is newer than the blueprint.

| Client | Custom remote MCP | Notes |
|---|---|---|
| **Claude** (web / desktop / Cowork) | Yes | Documented as available on Free, Pro, Max, Team, Enterprise. Free tier limited to one connector |
| **Grok** (grok.com, iOS, Android) | Yes — **"Bring Your Own MCP"** | Shipped 2026-05-06 alongside built-in connectors. `grok.com/connectors` → New Connector → Custom → enter server URL. **Paid tiers** — the operator's SuperGrok subscription qualifies |
| **ChatGPT** | Yes | Via connectors / developer mode |
| **Gemini** | Yes | Client surface for custom servers; Gemini CLI has the most complete support |
| **Local Ollama models** | Yes | Already inside the network; no ingress needed |
| Perplexity and others | Not natively | Browser-extension bridges exist — see risk 4 |

**Implication for §6:** the Round Table does not need a new deliberation product to
share context. Every seat can already be pointed at the *same* MCP server. §6.2's
"Keep MCP is the primary shared surface" was the right instinct, and the ecosystem
caught up to it.

### 2. The current ingress cannot carry this

From `connector_status`, three facts matter:

- Transport is streamable-http — **correct and compatible**; no change needed.
- The public tunnel is a **quick tunnel**: its hostname **rotates on restart**. Every
  rotation silently breaks every connector configured in every AI client.
- Auth posture is reported by the service itself as effectively **none**, with the
  guidance *"treat the public URL as secret."*

Additionally the public health probe was not returning a response when checked, while
the local service was healthy — so the path is already unreliable, before anyone adds
four clients to it.

**Why "URL as secret" fails here specifically:** the tool surface includes vault
writes, note writes, and county-queue approve/reject. URL secrecy is a weak control
in general; for an endpoint that can approve a gate or write to long-term memory it is
not a control at all. And a public URL is not really secret — it travels through
client configs, logs, and provider backends.

### 3. Ingress options, compared for this situation

| Option | Stable hostname | Auth | Cost | Verdict |
|---|---|---|---|---|
| **Cloudflare quick tunnel** (current) | ❌ rotates | ❌ none | free | Not viable for configured connectors |
| **Tailscale Serve** (also active) | ✅ | tailnet identity | free | **Best for local + laptop clients.** Hosted assistants cannot reach it — see below |
| **Tailscale Funnel** | ✅ stable `*.ts.net`, valid cert | ❌ none built in | free | Cheapest public ingress. Must add app-level auth |
| **Cloudflare named tunnel + Access** | ✅ own domain | ✅ real (OIDC/OAuth) | free tier | The "right" answer; more setup, documented gotchas |

**The critical distinction the blueprint does not draw:** hosted assistants connect
from **the provider's servers**, not from the operator's browser. So Tailscale *Serve*
(tailnet-only) works for Claude Desktop on the laptop and for local agents, but
**grok.com and claude.ai cannot reach it** — they are not on the tailnet. Public
ingress is unavoidable for hosted seats. That resolves the tension left open in
§12.Q4: Tailscale-first is right for local clients, and insufficient on its own for
the Round Table §6 describes.

### 4. Auth: what is actually required

The MCP authorization spec (Nov 2025 revision) mandates OAuth 2.1 with PKCE for
internet-accessible servers, with Protected Resource Metadata (RFC 9728) and a 401 +
`WWW-Authenticate` discovery flow. That sounds like a large build.

It is not required here. Two findings soften it:

- Guidance for personal and small-team servers is explicit that **a static bearer
  token is sufficient**, and Claude documents support for authless, bearer, and OAuth
  servers (with DCR, CIMD, or operator-supplied client credentials). Bearer is
  confirmed working for Claude Code specifically.
- Alternatively, **put Cloudflare Access in front and let it be the OAuth layer** —
  no OAuth code in the MCP at all.

**Hard-won gotcha, worth more than the rest of this section.** When placing a
self-hosted MCP behind Cloudflare Zero Trust, hosted-assistant traffic gets flagged by
Bot Management and WAF and blocked — the failure looks like an authorization error and
is very hard to diagnose. The documented fix is to bypass auth *and* skip WAF for the
protocol's discovery and token endpoints:

- Access **Bypass** application for: `/.well-known/*`, `/token`, `/register`, plus the
  server's own MCP paths
- A **WAF custom rule** matching those same paths with action **Skip**, positioned
  **first**, skipping all components including Bot Management

Those paths are the OAuth discovery, token, and dynamic-client-registration
endpoints. Anyone wiring this without knowing that will lose an evening.

There are also open bug reports against Claude's custom-connector OAuth flow
(callback method-not-allowed before token exchange; tokens issued server-side but not
used). **Expect friction on the OAuth path.** That is a further argument for starting
with a bearer token.

**Unverified:** whether Grok's custom-connector UI accepts a static bearer token or
requires a full OAuth flow. Its docs say "complete any required authentication"
without specifying. **Test this with a throwaway endpoint before committing to a
design** — it determines whether bearer alone is enough or Access is required.

### 5. The shared-thread half — four candidates

Connecting all four AIs to one MCP gives them the same *read* context. It does not
make them respond to the same *question*. Options, cheapest first:

| Option | What it gives | Maturity | Fit |
|---|---|---|---|
| **~4 tools on the existing MCP** | `table_post`, `table_read`, `table_respond`, `table_close` — a durable thread each AI can read and append to | you own it | **Best.** No new dependency, no new port, reuses vault storage |
| **claude-ipc-mcp** | "Email for AIs" — named instances, directed messages, persistence across restarts. MIT, ~132 stars, 25 forks, v2.0.0. Supports Claude Code, Gemini, ChatGPT, any Python-capable assistant | moderate | Good reference implementation. Read its design even if not adopted |
| **Quorum-MCP** | Multi-round deliberation (independent → cross-review → synthesis) across Claude, OpenAI, Gemini, Cohere, Mistral, **and Ollama**. Modes include `quick_consensus` and `devils_advocate` | worth evaluating | **See below — potentially the answer to §12.Q2** |
| **agents-council / Agent-MCP / TheCouncil** | Agent-to-agent feedback; heavier orchestration frameworks | varies | Over-scoped for a solo operator |

### 6. Quorum-MCP is the most interesting find, because of Ollama

Two of its properties matter specifically for this stack:

- **It supports local Ollama models as council seats**, described as zero-cost,
  fully-private consensus — inference never leaves the box.
- **It detects Ollama models and runs them sequentially to avoid VRAM competition.**

That second point is unusually well-matched to this hardware. The vault records 8
vCPU, ~30 GB RAM, no GPU, and an explicit warning not to load multiple large local
models at once (loading the largest local model dropped free RAM to roughly 4 GB).
A council implementation that runs local seats *in parallel* would fall over on this
box. One that runs them sequentially will not.

**This is a genuine third answer to §12.Q2** — one neither Grok's finding nor mine
identified. A council of `gemma4` + `phi4-mini` + `qwen3:1.7b`, optionally plus the
free Ollama Cloud tier, is **$0 marginal, private, and needs no API keys.**

The honest caveat: three small local models deliberating produce three small-model
opinions. This is not equivalent to a frontier council, and for genuinely hard
architecture questions it may not be worth the wall-clock time on CPU inference. Its
real value is that it makes deliberation **free and repeatable**, so the mechanism can
be built, tested, and trusted before any paid seat is invited.

### 7. Where this leaves the Grok vs. Claude disagreement on §12.Q2

Three viable tiers, and they are complementary rather than competing:

| Tier | Vehicle | Cost | Use |
|---|---|---|---|
| **0** | Manual — subscription seats, shared MCP, findings in this folder | $0 | Working today. This repo is the evidence |
| **1** | Quorum-MCP on local Ollama seats | $0 | Automation, repeatable, private, no keys |
| **2** | Roundtable.sh, 2–3 frontier heads, `--rounds 2` (Grok's recommendation) | metered | Rare genuinely high-stakes questions |

**One fact the operator should weigh before Tier 2.** The vault's routing strategy
already flags it: *"your SuperGrok subscription is separate — API key bills API
usage."* Roundtable.sh heads for Grok and Claude bill **per-token API usage**, not the
subscriptions already being paid monthly. Its chair role wants an Anthropic API key
specifically, or deliberation mode degrades. So Tier 2 is not "using what you already
pay for" — it is a new metered spend, on a stack that currently has **no spend meter**
(see F1/F11 in the live-substrate review).

## Pushback / risks

1. **Auth before ingress — non-negotiable.** Exposing an unauthenticated MCP with
   vault-write and queue-approve tools on a stable public hostname is strictly worse
   than the current rotating URL, because a stable hostname is discoverable and
   permanent. If only one thing from this finding is done, make it the bearer token.
2. **Every connected AI inherits the full tool surface.** Anthropic's own connector
   documentation warns that a connected server can read, create, modify, and delete
   data, and that prompt injection can drive unintended tool calls. Four AIs on one
   unrestricted surface means any one of them — confused or manipulated by content it
   reads — can approve a gate or write to long-term memory. **Recommend a read-only
   token scope for council seats**, with write tools reserved for the operator's own
   session. This is the same "least privilege" idea as §3.4's scoped knowledge seeds,
   applied to tools instead of indexes.
3. **A stable hostname is a permanent target.** Quick-tunnel rotation is accidental
   protection that is currently doing real work. Removing it without adding auth in
   the same change is a net regression.
4. **Browser-extension bridges: do not use here.** An extension exists that injects
   MCP into chat UIs lacking native support. It requires broad permissions across
   assistant domains, and reports cite instability, reconnection failures, breakage
   on UI changes, and maintenance concerns. Granting a third-party extension read
   access to every AI conversation, to reach a server that can write to the vault, is
   a poor trade — especially now that Grok supports MCP natively and the gap it filled
   has largely closed.
5. **Cost of the shared thread is not zero even when inference is free.** Four AIs
   polling a thread is four sets of tool calls against subscription quotas. Cheap, but
   worth a kill condition.
6. **This is scope expansion.** Nothing here is in the blueprint's Phase 0–2. It is
   answering a direct operator question and should be treated as a **proposal**, not
   an accepted plan. The live-substrate review's F1/F11 conclusion stands: the cost
   config comes first.

## Recommendations

Ordered so each step is independently useful and reversible.

1. **Add a static bearer token to the MCP.** Small change, no new infrastructure,
   satisfies every client that matters. **Do this before any ingress change.**
2. **Add a read-only token scope** and give council seats that token. Operator keeps a
   separate token with write access. Directly limits risk 2.
3. **Switch public ingress from quick tunnel to a stable hostname.** Tailscale Funnel
   is the cheapest path — free, stable `*.ts.net`, valid cert, minutes to set up.
   Cloudflare named tunnel + Access is the stronger option if a real identity layer is
   wanted; budget an evening and pre-apply the bypass/WAF-skip rules from §4 above.
4. **Keep Tailscale Serve for local clients.** Laptop and local agents should never go
   out to the public internet to reach a service on the same tailnet.
5. **Test one hosted seat end to end before wiring all four.** Add the connector in
   **Grok** first — it is the seat whose auth behaviour is unverified, and the
   operator's SuperGrok tier already qualifies. Confirm whether bearer alone works.
6. **Then build the shared thread as ~4 tools on the existing MCP** (`table_post`,
   `table_read`, `table_respond`, `table_close`), storing threads in the vault so
   output is durable by construction — satisfying §6.2 point 4 with no new dependency.
   Read `claude-ipc-mcp` first for prior art on naming and persistence.
7. **Evaluate Quorum-MCP for the automated council, Ollama seats only, no API keys.**
   Judge it on one real §12 question against a local-model council. If the quality is
   usable, this is the automated Round Table at $0.
8. **Defer Roundtable.sh** until a spend meter exists (live-substrate review F1/F11)
   and the operator has consciously accepted metered API spend distinct from existing
   subscriptions.

**Note the ordering:** steps 1–2 are security, 3–5 are plumbing, 6–8 are the actual
Round Table. The interesting work is last on purpose — §10 of the blueprint names
exactly this failure mode.

## Open questions for the operator / other AIs

1. Approve adding **bearer-token auth** to the MCP before any ingress change? *(This
   is the one recommendation that should not wait.)*
2. Ingress preference: **Tailscale Funnel** (fastest, free, app-level auth) or
   **Cloudflare named tunnel + Access** (real identity layer, more setup)?
3. Accept **read-only tokens for council seats**, with writes reserved to the
   operator's own session?
4. Which hosted seats are actually wanted — Grok and Claude only, or ChatGPT and
   Gemini too? Each is a connector to configure and a token to rotate.
5. Worth a **Quorum-MCP spike on local models** ($0, no keys) before deciding anything
   about paid deliberation?
6. Does the earlier finding on repo visibility change now that connector URLs and auth
   design are being discussed in a public repo?

## Concrete next steps (for the next AI)

- [ ] Operator: answer Q1 and Q2 — everything else depends on them.
- [ ] Draft the bearer-token change as a **proposal diff only** (no execution): token
      from environment, constant-time comparison, 401 with `WWW-Authenticate`, and a
      read-only scope that filters the tool list.
- [ ] Verify empirically whether Grok's custom connector accepts a static bearer
      token. Record the result as a short finding — it determines the auth design and
      is not documented anywhere I could find.
- [ ] Do **not** expose a stable public hostname until auth is merged and tested.
- [ ] Draft `table_*` tool contracts as an addition to `mcp/tools.md`, marked proposal.
- [ ] Optional: Quorum-MCP spike on Ollama seats; run one §12 question; report quality
      and wall-clock honestly, including whether small-model output was actually useful.
- [ ] Re-verify the local-tier networking issue (F3 in the live-substrate review)
      first — a council of local models is pointless if the gateway cannot reach them.

## Kill conditions / cost notes

- **No new agent proposed.** This is ingress, auth, and a thread — infrastructure, not
  agents.
- **Bearer token:** rotatable, and revocation must be a single-file-plus-restart
  operation. If a token leaks, rotation cannot require a redesign.
- **Public ingress kill condition:** if the endpoint receives unauthenticated traffic
  from sources the operator does not recognise, take the hostname down and revert to
  tailnet-only. Cheap to reverse — that is the point of doing auth first.
- **Shared thread:** cap thread length and seat count; no cron-driven posting. If the
  table starts being used for low-value chatter, treat that as process failure and
  tighten the gate — the same discipline Grok's Round Table finding applies.
- **Quorum-MCP:** Ollama seats only for the spike. Any provider key added later needs
  explicit approval, a ceiling, and the spend meter from F1 in place first.
- **Cost of doing nothing:** $0, and Tier 0 keeps working. The manual round table is
  already producing findings. Nothing here is urgent except the auth gap, which is
  urgent independent of the Round Table.

---

**Attribution:** Claude (Anthropic), 2026-07-30, live MCP session. External claims
verified against primary sources this session rather than recalled; the one item I
could not verify (Grok's bearer-token support) is flagged as unverified rather than
assumed.

*The AIs can already be connected. The missing piece is a credential, not a product.*
