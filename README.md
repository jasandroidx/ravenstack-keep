# Ravenstack Keep

**A walkable home base for a personal home server — a castle you live in, not a dashboard you stare at.**

The Keep is a 2D walkable world (Phaser) that sits on top of a real home server. You walk in as a character, move between rooms, talk to the crew who run each one, and step through doors into your actual tools. One front door, everything behind it.

Live code is in [`ui-v2/`](./ui-v2/) — see [`AGENTS.md`](./AGENTS.md) for how it's served, how to run it locally, and the deploy loop. Old [`ui/`](./ui/) (48×48 tiles) is frozen — do not add to it or port code from it into `ui-v2/`.

## Why this exists

This started as one thing: a place where the owner's AI agents work on their own projects, on their own, making money. It has grown since then, because the owner has — from zero, about six months ago, to running his own stack and learning the whole cyber world as he goes.

So the Keep is now several things at once, and the castle holds all of them:

- **His own internet.** A personal build for search, media, tools, and agents that does not report back to Google or any other cloud watcher. Self-hosted, on his own server, on his own network.
- **His life, in order.** Goals, plans, money, and daily work, visible as rooms and quests instead of buried in tabs and apps.
- **His second brain.** Notes and knowledge, distilled and retrievable — the owner training his own brain, not renting someone else's.
- **His agent workforce.** Local models wired up as the crew, working in rooms you can walk into, not hidden behind a chat window.

One front door, everything behind it, all of it his.

## Rooms and what they are for

- **Library wing (required)** — the RAG library. The entire RAG architecture is built here, with the Obsidian vault hooked up. This is the second brain: ask the library, and it answers from your own notes.
- **Workshop** — builds AND troubleshooting. Where connectors, skills, and plugins get made, and where health checks and diagnostics run for the whole stack. Valerie the super mechanic runs it.
- **Drawing Room** — where the Craft apps live (photo, vector, design, and the rest). Walk in, make something, walk out with it.
- **Tower** — research and recon. **Citadel** — models and voice. **Treasury** — money and plans. **Great Hall** — today's work, the command deck.

## What it is now

- **Courtyard** — where you start. The morning check: what's green, what's red, what needs you.
- **Fortress Interior** — the hall and its rooms, reached by walking to the top of the courtyard and selecting the gate. Throne, kitchen, library, workshop, armory, bedroom, chapel, storeroom.
- **Rooms that do things** — doors open and close, walking through a door puts you in a different area, and objects respond: sit on the throne, smell the food in the kitchen, talk to the crew.
- **Crew NPCs** — each room has someone who runs it. Oracle in the library, Raziel in the centre, Valerie the super mechanic in the Workshop. Talk to them with E; they answer from the models running on the home server.
- **Live on a home server** — served from a headless machine on the owner's tailnet, wired to open-source tools: local models, self-hosted search, media, and system monitoring. No cloud account required to run it.

## The idea

Most home servers are a page of tiles. The Keep turns that into a place:

- **Rooms are areas of life.** Library = notes and knowledge. Workshop = builds and diagnostics. Tower = research. Treasury = money and plans. Hall = today's work.
- **Library wing: the RAG library, required, not optional.** A full wing where the RAG architecture is built and the Obsidian vault hooks up — the second brain, in the Keep. This is Jason training his own brain: his notes, distilled and retrievable, walking distance from everything else he runs.
- **Doors are your tools.** The Teleportation Room (planned, not built yet) will hold mirrors for the Raven Pages — search, recon, system tools, and the rest — so stepping through a mirror is how you open a tool, not clicking a tab.
- **Quests are goals.** Work shows up as things to do in the world, with visible state: a door unlocks, a mirror lights up, a room changes when the work is done.
- **Agents work here too.** The Keep is built to be driven by agents as well as by walking around it: room state, flags, and NPC talk are all structured, so an agent can read the world, run a check, and report back.

## Tech

- Phaser 3.90, TypeScript, React host
- Node 22, Vite build
- Local models over the tailnet for NPC talk, with a free-tier fallback
- Game state in flags (localStorage today; server-side persistence is on the roadmap)

## Run it

```bash
npm install
npm run dev
```

See [`AGENTS.md`](./AGENTS.md) for the real serve/deploy loop — this repo's short version is not the production path.

## Roadmap — big jobs coming up

These are real, scoped coding jobs, not wishes. Each one is session-sized work with visible results in the world:

- **Library wing: build the RAG architecture.** Vault ingest, retrieval, and a library you can walk into and ask. The second brain, built out, not bolted on.
- **Keep as an MCP server.** Room state, NPC talk, and quests callable by other agents — the Keep becomes the dispatch board the whole agent crew works through.
- **Teleportation Room.** Mirrors for every Raven Page, hall and courtyard returns only — stepping through a mirror opens a tool.
- **Server-side flags and quests.** State moves off localStorage so progress follows you across devices, and quests become first-class world state.
- **Drawing Room: Craft apps, wired in.** Photo, vector, and design tools as a room you work in, not a separate app you tab to.
- **Workshop health-check system.** Builds, diagnostics, and live health checks for the whole stack, reported in-room by the crew.
- **Guard talk, bed/rest, and the book/secret tunnel** in the Interior — the remaining interaction systems, one at a time.

## Ownership

Built and owned by Jason Boyd, with his agent crew (including GhostWriter, a Grok Bot crew member) doing implementation under his direction. This is a personal project, not a product, and not a fork: the world, the rooms, and the code here are his.

License: TBD — ask before reusing.
