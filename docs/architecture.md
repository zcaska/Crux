# Project Context OS — Architecture Specification (v5.0.0)

This document details the architectural design of **Project Context OS (`@project-context/core`)**, its component boundaries, progressive context fusion, and vendor-neutral multi-agent execution model.

---

## 1. Boundary Isolation & Project Locality

Project Context OS enforces complete decoupling between target application repositories and the persistent context layer:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        TARGET HOST REPOSITORY                          │
│                                                                        │
│   Application Source Code             Project Context Layer            │
│   (e.g. Node, Python, Rust, Go)       (.project-context/)              │
│             ▲                                  ▲                       │
│             │                                  │                       │
└─────────────┼──────────────────────────────────┼───────────────────────┘
              │                                  │
              │                      ┌───────────┴──────────┐
              │                      │ @project-context/core│
              │                      │    (v5.0.0 Engine)   │
              │                      └───────────┬──────────┘
              │                                  │
              │                      ┌───────────┴──────────┐
              │                      │   CLI & MCP Server   │
              │                      │ (29 Core / 8 ChatGPT)│
              │                      └──────────────────────┘
              │                                  ▲
              │                                  │
     Zero Dependency Coupling            Compatible AI Agents
   (No app imports Context OS)         (Antigravity, Claude, Cursor)
```

### Invariants:
1. **Core Decoupling**: Reusable engine code inside `src/` must NEVER import application business logic, application database clients, or application UI frameworks.
2. **Domain-Neutrality**: The engine is purely generic. All domain rules, invariants, and protected paths are configured via `.project-context/config.json`.
3. **No External Cloud Dependencies**: Context OS is strictly repository-local and offline-first. No external telemetry, vector DBs, or hosted cloud synchronization.
4. **Path Jailing**: All file writes and reads pass through `assertWithinProject(targetPath, rootDir)` to prevent parent directory escapes and symlink hijacking.

---

## 2. Tri-Authority Ground Truth Model

When establishing project state, agents must respect this strict authority hierarchy:

1. **Git Working Tree (Historical & Ground Truth)**: Working tree files, staging area, branch status, and commit history represent what physically exists in the repository right now.
2. **`.project-context/` (Semantic Authority)**: Authoritative source of truth for project identity, active tasks, Architectural Decision Records (ADRs), per-agent concurrency records, and semantic changelogs.
3. **`graphify-out/` (Structural Authority)**: Read-only external source of truth for AST relationships, hyperedges, community clusters, and god nodes. Crux consumes Graphify strictly via read-only inspection and progressive context fusion.
4. **`AGENTS.md` (Operational Protocol)**: Authoritative rules governing agent interaction, 7-step lifecycle execution, and working-area collision avoidance.

---

## 3. Hot Context vs. Warm Context vs. Cold Context Partitioning

Project Context OS partitions context into three deterministic tiers to maximize LLM token efficiency:

### Hot Context (Loaded on Agent Bootstrap)
Information essential for immediate reasoning (~1,100 tokens):
* `STATE.md`: Authoritative concise project snapshot.
* `ACTIVE-WORK.md`: Aggregated active work across all agents.
* `active-work/<agent>.md`: The specific agent's active task descriptor.
* Active tasks (`IN_PROGRESS` or `READY`) from `TASKS.md`.
* Latest relevant handoff from `handoffs/`.
* Git uncommitted changes from working tree.
* Harmonized structural metadata from `graphify-out/` (state, node count, edge count).

### Warm Context (Progressive Dual-Source Fusion)
Dynamically retrieved based on the agent's target task or query:
* **Semantic Ranking**: Overlapping ADRs, recent changes, and task definitions from `.project-context/`.
* **Structural 1-Hop Neighbors**: Calling functions and direct dependencies extracted from `graphify-out/graph.json` without raw AST dumps.

### Cold Context (Retrieved On-Demand)
Deep historical context retrieved only when specifically investigated:
* Completed or cancelled tasks in `TASKS.md`.
* Historical superseded ADRs in `DECISIONS.md`.
* Archived immutable handoffs in `handoffs/`.
* Full git diffs and commit histories via `search_project_context`.

---

## 4. Multi-Agent Coordination & Working-Area Collisions

Crux coordinates multiple autonomous agents without a centralized coordinator or locking daemon:

1. **Isolated Descriptors**: Each agent writes strictly to `.project-context/active-work/<agent>.md`.
2. **Deterministic Collision Taxonomy**:
   * `EXACT`: Both agents claim the identical file or directory.
   * `CONTAINMENT_DIR_FILE`: One agent claims a directory while another claims a file within it.
   * `CONTAINMENT_DIR_DIR`: Nested directory overlaps.
   * `DISJOINT`: Non-overlapping paths (safe concurrent execution).
3. **Advisory-Only Policy**: Collision detection is strictly read-only and advisory. Crux never automatically terminates sessions or reassigns file ownership.
4. **Temporal Liveness vs. Crash State**: Elapsed idle time transitions sessions across `ACTIVE` (<=1h), `ACTIVE_BUT_IDLE` (1–24h), `STALE` (24–72h), and `ABANDONED` (>72h). A session is only evaluated as `CRASHED` if in-flight uncommitted Git modifications match its declared working area.

---

## 5. Model Context Protocol (MCP) Boundaries

Project Context OS provides two distinct, non-overlapping MCP surfaces:

1. **Local Core MCP Server (`src/mcp-server.js`)**:
   * Official `@modelcontextprotocol/sdk` STDIO transport.
   * Exposes **29 tools** (14 read tools, 15 controlled write & intelligence tools) for local IDE agents (Antigravity, Claude Desktop, Cursor, Kilo Code).
   * Enforces Zod input validation, path jailing, and anti-credential secret scrubbing.
2. **Remote ChatGPT Adapter (`integrations/chatgpt/`)**:
   * Streamable HTTP transport designed for ChatGPT Custom Web Actions.
   * **Strictly frozen at exactly 8 read-only tools**: `get_context_snapshot`, `get_project_state`, `get_tasks`, `get_architecture`, `get_decisions`, `search_project_context`, `get_relevant_context`, `get_git_status`.
   * Zero mutation endpoints, zero AST leaks, fixed project root jailing.

