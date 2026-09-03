# Project Context OS — Product Freeze Specification (v4.0.0)

* **Product**: `@project-context/core`
* **Version**: `4.0.0`
* **Status**: **`FROZEN`**
* **Freeze Date**: `2026-09-03`
* **Release Verdict**: **`RELEASE READY`**

---

## 1. Product Statement

Project Context OS (`@project-context/core`) is feature-complete and frozen at version **4.0.0**. It serves as an offline-first, vendor-neutral, repository-local collaboration and context infrastructure for software projects worked on by autonomous AI coding agents and human engineers.

The v4.0.0 product boundary is formally locked. No architectural redesigns, new MCP tools, cloud backends, or speculative features will be added to the v4 product line.

---

## 2. Stable Public Surfaces

The following surfaces constitute the authoritative, stable, and frozen public API of `@project-context/core@4.0.0`:

| Surface | Nature | Definition & Guarantee |
| :--- | :--- | :--- |
| **CLI Router** | Universal Executable | `project-context <command>` (and `npx @project-context/core <command>`). Supports 24 commands across Universal Lifecycle, Context Intelligence, Multi-Agent Coordination, and Core Context. |
| **Official MCP Server** | STDIO JSON-RPC Protocol | Built on `@modelcontextprotocol/sdk`. Exposes exactly **29 official tools** (14 read tools, 15 write/lifecycle tools) conforming to the Model Context Protocol specification. |
| **`.project-context/` Store** | Filesystem Markdown Store | Canonical repository store containing `config.json`, `STATE.md`, `TASKS.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `CHANGELOG.md`, `ACTIVE-WORK.md`, `active-work/*.md`, and `handoffs/*.md`. |
| **Project Configuration** | Project Invariants | `.project-context/config.json` parameterizing project name, description, component hints, and architectural invariants (`protectedTables`, `isolatedPackages`, `migrationsDirs`). |
| **Context Bootstrap** | Hot Context Generation | `bootstrap_context` tool and `project-context bootstrap` command generating structured Hot Context (~1,100 tokens, 83%+ overhead reduction) with project reality, active tasks, Git status, and latest handoff. |
| **Task Management** | Task Board | Markdown-based task lifecycle with structured statuses: `BACKLOG`, `READY`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, `CANCELLED`. |
| **Architectural Decisions** | Append-Only Log | Historical append-only ADR records (`DECISIONS.md`) preventing retroactive history mutation. |
| **Semantic Changelog** | Semantic Log | Append-only changelog entries (`CHANGELOG.md`) documenting WHAT changed, WHY, architectural impact, and verification test results. |
| **Active Work & Concurrency** | Concurrency Isolation | Per-agent isolated files (`active-work/<agent>.md`) preventing merge race conditions, with automated compilation to `ACTIVE-WORK.md`. |
| **Immutable Handoffs** | Write-Once Auditability | Permanent timestamped handoff records (`handoffs/YYYY-MM-DDTHH-mm-ssZ_<from>_to_<to>.md`) ensuring auditability and autonomous cold-start resumption (H0 recovery). |
| **Agent Sessions** | Heartbeats & Liveness | Session registry with 4-dimensional conceptual identity (`Agent`, `Interface`, `Router`, `Model`), heartbeat timestamps, and working area collision alerts. |
| **Context Snapshots** | Cold Context Pointers | Compact Hot Context snapshots (< 45 lines) with pointers to cold context archives. |
| **Context Quality & Health** | 6-Pillar Diagnostics | 0–100% health scoring model across Freshness, Completeness, Consistency, Integrity, Activity, and Recoverability. |
| **Semantic Drift Detection** | Git ↔ Context Audit | Audits uncommitted modifications, untracked working areas, and lingering files from completed tasks. |
| **Attention System** | Urgency & Alerts | Aggregates uncommitted modifications, working area collisions, and stale sessions into prioritized attention items. |
| **Consistency & Validation** | Schema Integrity | Anti-credential regex scanner blocking API keys/tokens, strict schema format verification, and task status validation. |

---

## 3. Explicit Non-Goals for v4.0.0

The following capabilities are **strictly outside the v4.0.0 product boundary** and will not be introduced into the v4.x release line:

1. **Cloud Synchronization & Hosted Storage**:
   * *Non-Goal*: No remote servers, cloud databases, hosted synchronization services, or SaaS platforms.
   * *Rationale*: Context OS is offline-first and repository-local. Context lives in Git alongside the source code.
2. **Embeddings & Vector Databases**:
   * *Non-Goal*: No vector stores (pgvector, Chroma, Pinecone, FAISS), embeddings endpoints, or semantic neural search.
   * *Rationale*: Context OS uses deterministic Jaccard token similarity and path-prefix discovery, achieving 100% information completeness with zero external API dependencies or opaque non-deterministic scoring.
3. **Provider-Specific Proprietary Memory**:
   * *Non-Goal*: No OpenAI Assistants threads, Anthropic prompt caching tie-ins, or vendor-locked memory formats.
   * *Rationale*: The context model is model-agnostic, router-independent, and interface-neutral.
4. **Direct ChatGPT Web STDIO Sockets**:
   * *Non-Goal*: No direct local STDIO socket connection for web browser interfaces without external tunneling.
   * *Rationale*: Browser sandboxes cannot establish local STDIO process pipes. The verified operational fallback is the compact snapshot workflow (`project-context snapshot`).
5. **Automated Destructive Schema Migration Engine**:
   * *Non-Goal*: No `project-context migrate` tool or automated schema rewrite engine in v4.0.0.
   * *Rationale*: v4.0.0 context formats are 100% non-breaking and backwards-compatible with v3. Backward compatibility is handled passively via defaults in `src/config.js`. Breaking migrations are intentionally reserved for v5.0.0.
6. **Enterprise Symlink Canonicalization**:
   * *Non-Goal*: No physical symlink resolution (`fs.realpathSync`) traversal enforcement.
   * *Rationale*: Path jailing enforces strict lexical path normalization (`path.resolve`). Environments with complex symlinked parent directories configure `PROJECT_CONTEXT_ROOT` directly.
7. **Background Daemons & Telemetry**:
   * *Non-Goal*: No background resident daemon processes, background file watchers, or user analytics telemetry.
   * *Rationale*: Context OS is an on-demand, deterministic tool invoked by CLI or MCP clients.

---

## 4. Change Control & Maintenance Policy

* **Feature Freeze**: Zero new features, parameters, or tools will be merged into v4.0.0.
* **Bug Fixes Only**: Only genuine bugs affecting reliability, security, installation, or documentation accuracy will be patched.
* **Release Artifact**: The canonical distributable artifact is `@project-context/core@4.0.0` packaged via `npm pack`.
