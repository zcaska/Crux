# Migration from Supabase Agent Bridge to Project Context OS

This document explains the architectural rationale and component-by-component classification for migrating from the legacy Supabase-based Agent Bridge experiment to **Project Context OS**.

---

## 1. Executive Summary & Rationale

During earlier experimentation, CareerOS implemented an "Agent Bridge" backed by Supabase tables (`project_state`, `agent_tasks`, `agent_events`, `agent_handoffs`) and a Supabase Edge Function (`/functions/v1/agent-bridge`).

### Problems Identified in the Old Approach:
1. **Cloud Dependency**: An AI coding agent could not inspect context or hand off work without an active internet connection and valid Supabase credentials.
2. **Coupling Application DB to Engineering Context**: Developer collaboration state was mixed into the same database hosting product users, job listings, and resumes.
3. **Merge Conflict & Branch Desynchronization**: Remote database state did not follow Git branches. If an agent switched Git branches, the remote database retained state from the other branch.
4. **Latency & Auth Friction**: Edge Function invocations required JWT authentication, token refreshing, and network round-trips for simple state checks.

### Target Architecture:
Project Context OS cleanly decouples the two layers:

```text
CareerOS Application
        │
        └── Supabase Cloud Backend
             ├── application database (jobs, profiles, resumes, matches, interviews)
             ├── authentication
             └── application edge functions (calculate-match, parse-resume)


Project Context OS
        │
        ├── Git Repository
        ├── .project-context/ Markdown Store
        ├── AGENTS.md Protocol
        ├── Local CLI (tools/project-context/)
        └── Official MCP Server (@modelcontextprotocol/sdk)
```

---

## 2. Legacy Component Classification

Every file related to the old Agent Bridge experiment has been audited and classified:

### 1. KEEP (CareerOS Application Infrastructure)
These components belong to the real CareerOS product and are preserved without modification:
* `frontend/` — Entire application UI, routing, and React components.
* `backend/` — Prisma schemas, controllers, and API services.
* `supabase/migrations/00001_initial_schema.sql` — Application tables (`profiles`, `resumes`, `jobs`, `applications`, `matches`, `interviews`).
* `supabase/migrations/00002_enhancements.sql` — Application indexes and triggers.
* `supabase/migrations/00003_product_hardening.sql` — Hardened application RLS.
* `supabase/functions/calculate-match/` — AI job match engine edge function.
* `supabase/functions/parse-resume/` — PDF resume parsing edge function.

### 2. REPLACE (Legacy Context Infrastructure → Project Context OS)
These components represented the old context mechanism and are superseded by local equivalents:
* `scripts/agent-bridge.mjs` → Replaced by `tools/project-context/bin/project-context.js` and npm scripts (`npm run context:*`).
* `scripts/test-agent-bridge.mjs` & `scripts/test-phase1b-acceptance.mjs` → Replaced by `tools/project-context/tests/run-all-tests.js` (`npm test`).
* `supabase/functions/agent-bridge/` → Replaced by local filesystem storage (`.project-context/`) and the local official MCP server (`tools/project-context/src/mcp-server.js`).
* `docs/project/architecture.md`, `agent-operating-protocol.md`, `openapi.json`, `openapi.yaml` → Replaced by universal documentation in `docs/project-context-os/` and root `AGENTS.md`.

### 3. PRESERVE / ADAPT (Useful Concepts & Semantics)
Valuable concepts developed during the Agent Bridge experiment were extracted, adapted, and preserved:
* **Multi-Layer Identity Model**: The 4-layer model (`agent`, `interface`, `router`, `model`) was adopted into `.project-context/MANIFEST.md` and the official MCP server.
* **Anti-Credential Scanning**: The recursive regex scanner (`assertNoSecrets`) was modernized and ported into `tools/project-context/src/security.js`.
* **Task Statuses & Priorities**: The standardized enums (`BACKLOG`, `READY`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, `CANCELLED`) were preserved in `TASKS.md`.
* **Immutable Handoff Semantics**: The handoff structure was adapted into write-once filesystem records in `.project-context/handoffs/`.

### 4. REMOVE (Deprecated Artifacts)
No historical database tables are forcibly dropped in Phase 1 to ensure zero disruption to deployed environments. Any legacy Agent Bridge tables in Supabase (`agent_tasks`, `agent_events`, `agent_handoffs`, `project_state`) may remain dormant until a planned database cleanup phase.

---

## 3. Migration Action Matrix

| Old Agent Bridge Feature | New Project Context OS Feature | Status |
| :--- | :--- | :--- |
| Supabase `project_state` table | `.project-context/STATE.md` | **ACTIVE** |
| Supabase `agent_tasks` table | `.project-context/TASKS.md` | **ACTIVE** |
| Supabase `agent_events` table | `.project-context/CHANGELOG.md` | **ACTIVE** |
| Supabase `agent_handoffs` table | `.project-context/handoffs/*.md` | **ACTIVE** |
| `scripts/agent-bridge.mjs` CLI | `node tools/project-context/bin/project-context.js` | **ACTIVE** |
| Remote Edge Function `/context` | Local MCP `get_context_snapshot()` | **ACTIVE** |
| Remote Edge Function `/handoffs` | Local MCP `create_handoff` | **ACTIVE** |
| Cloud JWT Bearer Authentication | Local Filesystem Permissions & STDIO Transport | **ACTIVE** |
