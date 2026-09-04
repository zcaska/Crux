# Crux Phase 5 — Architecture Design Specification
**Status**: APPROVED / AUTHORITATIVE  
**Date**: 2026-09-04  
**Authors**: Architecture Specialist Agent & Orchestrator  
**Version**: 5.0.0  

---

## 1. Executive Summary & Directional Invariants

Project Context OS (Crux) is an autonomous, repository-local persistent context runtime designed for human and AI collaborative software engineering.

### The Decided Architectural Direction:
1. **Strict Repository Locality**: Crux is purely project-local. There is **NO** global multi-project registry, no centralized database, and no cloud synchronization service. Each software repository independently owns and manages its `.project-context/` directory.
2. **Deterministic Root Jailing**: A Crux runtime instance operates exclusively within its resolved project root. Cross-project directory traversal, sibling repository inspection, and parent directory escaping are strictly prohibited and actively jailed at runtime.
3. **Dual Source of Truth (Progressive Context Fusion)**:
   - **Crux** is the authoritative source of truth for **Semantic & Operational Context** (`.project-context/`): project identity, active tasks, architectural decisions (ADRs), multi-agent concurrency records, immutable handoffs, and semantic changelogs.
   - **Graphify** is the separate, external source of truth for **Structural & Code Relationships** (`graphify-out/`): AST dependencies, hyperedges, community clusters, and god nodes.
   - Crux consumes Graphify strictly via **read-only inspection**. Crux never merges Graphify's data model into `.project-context/`, nor does it perform destructive AST rebuilds.
4. **Non-Destructive Adoption Guarantee**: Initializing or adopting Crux in an existing repository must never truncate, mutate, or erase pre-existing context files. Inconsistent or partial states must be reconciled non-destructively or reported as diagnostic warnings.

---

## 2. Project Identity & Lifecycle Model

Crux defines four explicit lifecycle states for project context stores:

```text
               ┌───────────────────────┐
               │ Target Project Root   │
               └──────────┬────────────┘
                          │
         Does .project-context/ exist?
             /                         \
           NO                           YES
          /                               \
┌───────────────────────┐       Is directory valid?
│       NEW State       │          /             \
│  (Clean Initialization)        YES              NO
└───────────────────────┘        /                  \
                        ┌───────────────────┐    ┌────────────────────┐
                        │  EXISTING State   │    │  INCONSISTENT or   │
                        │ (Safe Adoption)   │    │   INVALID State    │
                        └───────────────────┘    └────────────────────┘
```

### 2.1 State Definitions
1. **NEW**: No `.project-context/` directory exists.
   - Action: Scaffold complete directory structure (`active-work/`, `handoffs/`, `schemas/`), default templates (`MANIFEST.md`, `STATE.md`, `TASKS.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `CHANGELOG.md`, `ACTIVE-WORK.md`), `config.json`, `AGENTS.md`, and `.vscode/mcp.json`.
   - Result: `isNew: true`, all files created, zero overwritten.
2. **EXISTING**: `.project-context/` exists and contains valid canonical files.
   - Action: Adopt context in-place. Verify `config.json` identity. Preserve 100% of user data.
   - Result: `isNew: false`, `createdFiles: []`, all existing files in `preservedFiles`.
3. **INCONSISTENT**: `.project-context/` exists, but is missing non-critical canonical files (e.g. `CHANGELOG.md` or `handoffs/README.md`) or has missing optional directories.
   - Action: Safely reconcile by creating *only* missing files from domain-neutral templates. Never overwrite or truncate existing files. Report non-critical inconsistencies as diagnostic warnings.
4. **INVALID**: `.project-context/` is a non-directory file, has unreadable permissions, or contains corrupted, unparseable critical frontmatter that cannot be safely read without risk of data loss.
   - Action: Fail fast with a descriptive `ContextIntegrityError`. Do NOT attempt destructive auto-recovery or wiping.

### 2.2 Public API (`src/init.js`)
```javascript
export function initProjectContext(rootDir, options = {}) {
  // options.mode: 'auto' | 'create' | 'adopt'
  // options.force: boolean (default: false)
}
```
- `mode: 'create'`: Errors if `.project-context/` already exists and is non-empty.
- `mode: 'adopt'`: Preserves existing files, ensures directory structure, reports missing pieces.
- `mode: 'auto'` (default): Idempotently creates if missing, safely adopts if present.

---

## 3. Path Jailing & Security Isolation

To guarantee that Crux instances never inspect sibling projects or parent hierarchies, all filesystem calls must pass through path validation:

### 3.1 Repository Root Resolution (`src/locator.js`)
Resolution precedence remains deterministic:
1. Explicit CLI argument (`--root <path>`)
2. Environment variable (`PROJECT_CONTEXT_ROOT`)
3. Upward traversal from `startDir` stopping at the *first* directory containing `.project-context`
4. Upward traversal from `startDir` stopping at `.git`
5. Fallback to `startDir`

### 3.2 Anti-Traversal Enforcement (`assertWithinProject`)
```javascript
export function assertWithinProject(candidatePath, rootDir)
```
- Normalizes paths cross-platform (`/` and `\`).
- Case-insensitively compares resolved candidate path against `rootDir`.
- If `candidatePath` attempts relative traversal (`../`, `..\\`) that escapes `rootDir`, throws `PATH_TRAVERSAL_DETECTED`.
- Resolves symlinks: If a symlink resolves to a target outside `rootDir`, access is denied with `SYMLINK_ESCAPE_DETECTED`.

---

## 4. Graphify Structural Integration & States

Graphify remains a completely separate system residing at `graphify-out/` within the project root. Crux integrates with Graphify via read-only status inspection and structural summaries.

### 4.1 The 4 Graphify States
Crux evaluates Graphify presence and health across four explicit states:

| State | Condition | Crux Behavior |
| :--- | :--- | :--- |
| **`AVAILABLE`** | `graphify-out/graph.json` exists, is valid JSON, and has valid node/edge collections. | Crux extracts god nodes, community counts, and candidate file links to enrich Warm Context ranking. |
| **`MISSING`** | `graphify-out/` does not exist or `graph.json` is absent. | Crux functions normally in pure semantic mode. Context Health score is unaffected. |
| **`STALE`** | `graphify-out/graph.json` exists, but Git commit timestamps or file modification times of tracked code files are newer than `graph.json` mtime. | Crux warns about possible structural staleness, but continues to provide semantic context. No automatic rebuilds. |
| **`INVALID`** | `graphify-out/graph.json` exists but cannot be parsed as JSON or lacks required schema properties. | Crux flags a diagnostic warning in `runDoctor` and degrades gracefully to pure semantic context without crashing. |

### 4.2 Progressive Context Fusion
When `AVAILABLE`, Crux merges Graphify structural pointers into its warm context engine (`getRelevantContext` in `src/relevance.js`):
1. **Semantic Query First**: Crux matches tasks, ADRs, and changelogs.
2. **Structural Enhancement**: If a matched file is a Graphify node, Crux extracts its 1-hop structural neighbors (dependencies and callers) from `graph.json` to append to `suggested_files`.
3. **Pure Separation**: Crux never writes to `graphify-out/` and never requires Python or network execution during context operations.

---

## 5. Remote MCP Integration Contract (`integrations/chatgpt/`)

The remote ChatGPT adapter (`integrations/chatgpt/`) must strictly preserve the verified Phase 4 contracts:

1. **Authentication Mode**: No-Auth mode (Streamable HTTP / ChatGPT Web Custom App compatible).
2. **Curated Read-Only Tool Surface**: Exactly 8 tools:
   - `get_context_snapshot`
   - `get_project_state`
   - `get_tasks`
   - `get_architecture`
   - `get_decisions`
   - `search_project_context`
   - `get_relevant_context`
   - `get_git_status`
3. **Hard Invariants**:
   - Zero write tools, zero mutation endpoints, zero shell access.
   - Project root is fixed at server startup via `--root` or `PROJECT_CONTEXT_ROOT`.
   - Tool calls cannot override or supply arbitrary `projectRoot` parameters.
   - All outgoing responses are audited by `assertNoSecrets`.
   - Dual-format output: text `content` + typed `structuredContent` conforming to declared `outputSchema`.

---

## 6. Implementation Plan & Agent Delegation Order

Implementation proceeds sequentially to maintain clean separation of concerns and zero concurrent merge conflicts:

1. **Phase 5.1 — Core Specialist**:
   - Enhance `src/locator.js`: Add symlink escape detection and hardened jailing.
   - Enhance `src/init.js`: Implement explicit `create` vs. `adopt` lifecycle modes, non-destructive reconciliation, and safety reporting.
   - Enhance `src/doctor.js` & `src/validator.js`: Validate project identity and adoption health.
2. **Phase 5.2 — Graphify Specialist**:
   - Create `src/graphify.js`: Deterministic state inspector (`AVAILABLE`, `MISSING`, `STALE`, `INVALID`) and read-only graph summary reader.
   - Wire `src/graphify.js` into `src/doctor.js` and `src/relevance.js` for progressive Context Fusion.
   - Document staleness heuristics and limitations.
3. **Phase 5.3 — MCP Specialist**:
   - Verify `integrations/chatgpt/index.js` against Phase 5 core updates.
   - Ensure `get_relevant_context` surfaces Graphify structural hints when `AVAILABLE`.
   - Re-verify 100% pass rate in `integrations/chatgpt/test-loopback.js`.
4. **Phase 5.4 — QA Specialist**:
   - Implement `tests/adversarial-phase5.test.js`:
     - Multi-project isolation: `project-12` vs. `project-19`.
     - Parent traversal & symlink escape attacks.
     - Adoption non-destructive invariance.
     - Graphify state transitions.
   - Run full regression suites (core 289 tests + adapter 159 tests + adversarial tests).
5. **Phase 5.5 — Orchestration Review & Final Report**:
   - Review all git diffs.
   - Verify zero uncommitted leaks.
   - Deliver comprehensive final Phase 5 report.
