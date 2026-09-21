# Ravenstack Keep — Repository Health Audit Report

**Date:** September 19, 2026
**Auditor:** Jules (Senior Maintainer Persona)
**Target Repository:** `jasandroidx/ravenstack-keep` (Branch: `ravenstack`)

---

## Executive Summary

Ravenstack Keep is a sovereign, 16-bit cyber-arcane visual command layer, spatial telemetry engine, and progressive multi-agent forge for an OpenClaw / ReClaw AI operations fortress. This repository houses the visual command interface (`ui-v2/`), the FastMCP control plane and Starlette HTTP API (`mcp/`), declarative agent specifications (`agents/`), research skills (`skills/`), and architectural review logs (`reviews/`).

The overall repository structure is sound, modular, and well-aligned with its sovereign local-first vision. However, our non-destructive audit identified key operational risks, documentation drift, and build failures that must be addressed:
1. **Broken Build (`ui-v2`):** `pnpm build` in `ui-v2` fails because the `firebase` package is declared in the root `package.json` rather than `ui-v2/package.json`, causing Vite/Rolldown module resolution errors.
2. **Security & CORS Defaults:** The Starlette HTTP API (`mcp/src/http_api.py`) enables `allow_origins=["*"]` with `allow_credentials=True`, presenting a cross-origin security risk for local control plane APIs.
3. **Lockfile & Workspace Inconsistency:** Duplicate lockfiles exist (`package-lock.json`, `bun.lock`, `ui-v2/pnpm-lock.yaml`), and root `package.json` uses `npm` scripts and `"workspaces"` without a `pnpm-workspace.yaml` file, triggering pnpm warnings.
4. **Documentation Drift:** `README.md` and `mcp/README.md` describe the MCP server as a "skeleton only" or "contract only", whereas a functional FastMCP server (`mcp/src/server.py`) and HTTP API (`mcp/src/http_api.py`) already exist.
5. **Frozen Legacy Artifacts:** The legacy 48×48 tile UI (`ui/`) remains in the tree (~25MB) alongside frozen art scripts and screenshots without a root archive marker.

---

## 1. Plain-English Project Explanation

Ravenstack Keep serves as the **spatial command surface** for an operator managing an autonomous multi-agent AI system (OpenClaw / ReClaw). Instead of managing AI agents through transient chat interfaces, Ravenstack Keep models agents as permanent residents living in physical chambers inside a virtual 16-bit fortress (e.g., Great Hall, Armory, Alchemy Lab, Observatory, Vault).

Key components:
* **Visual Command Layer (`ui-v2/`):** A modern Web application built with React 19, Phaser 3, TanStack Router, Tailwind CSS v4, and PGlite (embedded WASM Postgres). It renders the walkable Great Hall, agent workbenches (Oracle, Mechanic, Sentinel, Clawforge), War Table human approval gates, and Drive/Quarantine viewers.
* **Control Plane & FastMCP Bridge (`mcp/`):** A Python FastMCP server (`server.py`) and HTTP API (`http_api.py`) running on ports `:8100` and `:8120`. It handles spatial telemetry, gate approvals (`confirm=true`), room occupancy status, and Scribe document ingestion.
* **Declarative Agent Specs (`agents/`):** Markdown and JSON specifications for citadel agents (Raziel, Clawforge, Oracle, Scribe, Corvid), enforcing mandatory kill conditions, model tiers (local vs escalate), tool boundaries, and human gates.
* **Skills & Research (`skills/`):** Python toolkits and research routines enforcing anti-fabrication standards, local-first search caching, and multi-model council discussions.

---

## 2. Entry Points, Services, Scripts, and Deployment Paths

### Entry Points & Services
| Component | Entry Point / Executable | Port / Protocol | Description |
| :--- | :--- | :--- | :--- |
| **FastMCP Control Plane** | `mcp/src/server.py` | `:8100` (FastMCP / SSE / Stdio) | Main FastMCP bridge serving spatial telemetry, agent status, and gate controls. |
| **Keep HTTP API** | `mcp/src/http_api.py` | `:8120` (HTTP / Starlette) | Thin REST API providing `/api/health`, `/api/castle-map`, `/api/gates`, and Scribe dropzone uploads. |
| **Visual Command Surface** | `ui-v2/src/router.tsx` | `:3000` (HTTP / Vite) | React + Phaser 3 SPA/SSR frontend. |
| **Database Migrations** | `ui-v2/scripts/migrate.mjs` | Node.js | PGlite WASM database schema initializer (`0001_auth.sql` through `0004_gallery.sql`). |
| **Bridge Diagnostics** | `ui-v2/scripts/probe-bridge.mjs` | Node.js | Probes `:8120` HTTP API and `:8100` FastMCP server health. |

### Docker & Deployment Paths
* **Active UI Docker Spec:** Located in `ui-v2/deploy/Dockerfile` and `ui-v2/deploy/docker-compose.yml`. Builds `ui-v2` using `node:22-alpine`, exposes port `:3000`, and executes `pnpm dev`.
* **Deployment Gap:** There is currently no `Dockerfile` or `docker-compose.yml` service definition for running the Python FastMCP server (`mcp/src/server.py`) or Keep HTTP API (`mcp/src/http_api.py`) as a containerized service.

---

## 3. Audit Findings: Broken, Stale, or Misleading Documentation

1. **`README.md` & `mcp/README.md` Stale Status:**
   * Documentation states: *"No production Keep MCP server yet — contract only."*
   * Reality: `mcp/src/server.py` implements a working FastMCP server with SQLite backing, room telemetry, and human-in-the-loop gate management.
2. **Workspace Tooling Instructions in `package.json`:**
   * Root `package.json` defines `"workspaces": ["ui-v2"]` and scripts running `npm run dev --workspace=ui-v2`.
   * Project policy strictly enforces `pnpm`. Running `pnpm` commands at root warns: `The "workspaces" field in package.json is not supported by pnpm. Create a "pnpm-workspace.yaml" file instead.`
3. **Legacy `ui/` Documentation:**
   * `ui/README.md` and `ui/docs/` detail the 48×48 tile rendering pipeline without a clear banner stating that `ui/` is frozen forever and superseded by `ui-v2/`.

---

## 4. Audit Findings: Tech Debt, Unused Files, and Dead Code

1. **Frozen Legacy Frontend (`ui/`):**
   * The original Phaser 3 engine (`ui/`) contains ~25MB of code, asset generation scripts (`ui/scripts/generate_keep_art.py`), tilemaps, and debug screenshots (`ui/debug-screenshot.png`). It is permanently frozen and creates clutter.
2. **Duplicate Lockfiles:**
   * The root directory contains `package-lock.json` and `bun.lock`, while `ui-v2/` uses `pnpm-lock.yaml`. Multiple lockfiles across different package managers lead to non-deterministic dependency versions.
3. **Orphaned Configuration File:**
   * `firebase-applet-config.json` resides in the root folder without any code references in `mcp/` or `ui-v2/`.
4. **Misplaced Frontend Dependency:**
   * `firebase` is listed in root `package.json` (`"firebase": "^12.18.0"`), but imported in `ui-v2/src/lib/drive/google-auth.ts`. `ui-v2/package.json` missing `firebase` causes `pnpm build` failures in `ui-v2`.

---

## 5. Audit Findings: Missing Tests & High-Value Testing Roadmap

### Current Test Suite Coverage
* **`mcp/test_server.py`:** 2 unit tests verifying FastMCP server metadata and registered tool names.
* **`ui-v2/src/lib/cn.test.ts`:** 5 tests for Tailwind class name merging (`cn` utility).
* **`ui-v2/src/lib/sandbox.test.ts`:** 4 tests for preview guest host matching.

### High-Value Tests to Add First (Top 3)
1. **`mcp/tests/test_gates.py` (Human Gate Reliability):**
   * Test human approval gate lifecycle: creation, listing pending gates, approving with `confirm=true`, and rejecting unconfirmed approval requests.
2. **`mcp/tests/test_http_api.py` (Telemetry & Upload API):**
   * Test Starlette REST endpoints (`GET /api/health`, `GET /api/castle-map`), verifying paper vs live data flags and file extension/size validation on POST upload dropzone.
3. **`schemas/tests/test_agent_specs.py` (Agent Specification Schema Validation):**
   * Validate all JSON specs in `agents/*.agent-spec.json` against `schemas/agent-spec.schema.json` to guarantee mandatory fields (such as `kill_condition`, `name`, `room`, `tools`) are present and compliant.

---

## 6. Audit Findings: Dependency Risks

1. **`ui-v2` Missing Package Import:**
   * `ui-v2/src/lib/drive/google-auth.ts` imports `firebase/app` and `firebase/auth`. Because `firebase` is absent from `ui-v2/package.json`, Vite/Rolldown fails during production builds.
2. **Deprecated JavaScript Dependencies (`ui-v2/package.json`):**
   * `recharts@2.15.4` (Deprecated by maintainers; migration to v3 recommended).
   * `eslint@9.39.5` (Deprecated version warning emitted during pnpm install).
3. **Unpinned Python Dependencies (`mcp/requirements.txt`):**
   * `fastmcp>=2.0.0`, `jsonschema>=4.20.0`, `starlette`, `uvicorn`, `pydantic` are unpinned or use broad minimum bounds, risking unexpected breakage when installed in new environments.

---

## 7. Audit Findings: Security Risks

1. **Permissive Cross-Origin Resource Sharing (CORS):**
   * In `mcp/src/http_api.py`:
     ```python
     app.add_middleware(
         CORSMiddleware,
         allow_origins=["*"],
         allow_credentials=True,
         allow_methods=["*"],
         allow_headers=["*"],
     )
     ```
   * *Risk:* Setting `allow_credentials=True` with wildcard `allow_origins=["*"]` allows malicious external sites loaded in the operator's browser to execute cross-origin requests against the local Keep API on port `:8120`.
2. **Unsanitized Dropzone File Ingestion:**
   * In `mcp/src/http_api.py`, uploaded file names are handled directly. Path traversal risks exist if file names are not strictly sanitized before writing to local disk/vault paths.
3. **Unauthenticated Control Plane Endpoints:**
   * Neither `mcp/src/server.py` nor `mcp/src/http_api.py` requires API token authentication by default, relying entirely on network isolation (Tailscale / local loopback).

---

## 8. Prioritized Remediation Backlog

### P0 — Security / Data Loss / Broken Startup
- [ ] **Fix `ui-v2` Build Failure:** Move `firebase` from root `package.json` into `ui-v2/package.json` dependencies.
- [ ] **Restrict API CORS:** Update `mcp/src/http_api.py` CORS configuration to restrict allowed origins to explicit local UI origin (`http://localhost:3000`, `http://127.0.0.1:3000`).
- [ ] **Configure pnpm Workspace:** Add `pnpm-workspace.yaml` at root and update root `package.json` scripts to use `pnpm` commands.

### P1 — Core Reliability
- [ ] **Pin Python Dependencies:** Lock exact working versions in `mcp/requirements.txt`.
- [ ] **Implement Top 3 Test Suites:** Add `mcp/tests/test_gates.py`, `mcp/tests/test_http_api.py`, and `schemas/tests/test_agent_specs.py`.
- [ ] **Add MCP Docker Service:** Add Python FastMCP / HTTP API container definition in `ui-v2/deploy/docker-compose.yml`.

### P2 — Maintainability
- [ ] **Update Documentation:** Revise `README.md` and `mcp/README.md` to accurately reflect live FastMCP and HTTP API implementations.
- [ ] **Isolate Legacy UI:** Add clear archival notice in `ui/README.md` and remove obsolete root lockfiles (`package-lock.json`, `bun.lock`).
- [ ] **Upgrade JS Dependencies:** Upgrade `eslint` and `recharts` in `ui-v2/package.json`.

### P3 — Nice-to-Have
- [ ] **Automated CI/CD Workflow:** Add GitHub Actions workflow for automated testing, linting, and build verification.
- [ ] **OpenAPI Spec Export:** Generate OpenAPI documentation for `mcp/src/http_api.py`.

---

## 9. Executed Verification Commands & Results

### Command 1: FastMCP Server Unit Tests
**Command:** `python3 -m pytest mcp/test_server.py`
**Exit Code:** `0` (Success)
**Output Summary:**
```text
============================= test session starts ==============================
platform linux -- Python 3.12.13, pytest-9.1.1, pluggy-1.6.0
rootdir: /app/mcp
configfile: pyproject.toml
plugins: anyio-4.15.1
collected 2 items

mcp/test_server.py ..                                                    [100%]

============================== 2 passed in 2.24s ===============================
```

### Command 2: UI-v2 Unit Tests
**Command:** `cd ui-v2 && pnpm test`
**Exit Code:** `0` (Success)
**Output Summary:**
```text
> ravenstack-keep-hall@ test /app/ui-v2
> node --experimental-strip-types --test 'scripts/**/*.test.mjs' 'src/**/*.test.ts'

TAP version 13
ok 1 - cn utility
ok 2 - isSandboxPreviewGuestHost
# tests 9
# suites 2
# pass 9
# fail 0
# duration_ms 257.434606
```

### Command 3: UI-v2 Code Linter
**Command:** `cd ui-v2 && pnpm lint`
**Exit Code:** `0` (Success)
**Output Summary:**
```text
> ravenstack-keep-hall@ lint /app/ui-v2
> eslint .
```

### Command 4: UI-v2 Production Build
**Command:** `cd ui-v2 && pnpm build`
**Exit Code:** `1` (Failed — Diagnostic Captured)
**Error Summary:**
```text
Error: [vite]: Rolldown failed to resolve import "firebase/app" from "/app/ui-v2/src/lib/drive/google-auth.ts".
This is most likely unintended because it can break your application at runtime.
If you do want to externalize this module explicitly add it to `build.rolldownOptions.external`
```

---
*Report compiled by Jules — Ravenstack Keep Sovereign Operations Team.*
