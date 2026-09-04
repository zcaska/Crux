# Getting Started & Operational Onboarding Guide (v5.0.0)

**Project Context OS (`@project-context/core`)** is a portable, vendor-neutral, repository-local context synchronization, progressive fusion, and multi-agent collaboration infrastructure for software projects.

---

## 1. What Problem Does It Solve?

When multiple AI coding agents (Antigravity, Claude, Cursor, Codex, Kilo Code, ChatGPT, etc.) work on a codebase, human developers waste substantial time and tokens manually re-explaining context at every session transition:
* What is the current milestone and status?
* What architectural decisions (ADRs) constrain this repository?
* What was the previous agent working on?
* What exact next step should be executed right now?
* What changes were tested and verified?

External cloud databases introduce network latency, API credentials, recurring costs, and vendor lock-in.

**Project Context OS turns the Git repository itself into the single canonical source of truth.** It stores human-readable Markdown records inside `.project-context/`, provides an offline CLI, exposes an official Model Context Protocol (MCP) server with **29 tools**, and automates agent handoffs so that incoming agents can bootstrap and resume work with **zero human explanation (H0 autonomy)**.

---

## 2. Greenfield Project Onboarding (Step-by-Step)

### Step 1: Install Package
In your project root:
```bash
npm install --save-dev @project-context/core
```

### Step 2: Initialize Context Store
Initialize `.project-context/` in your repository:
```bash
npx project-context init --name "MyApplication" --description "Core enterprise platform"
```
This scaffolds:
* `.project-context/config.json`: Project identity and component hints.
* `.project-context/STATE.md`: High-level status, phase, and active objectives.
* `.project-context/TASKS.md`: Project task board with acceptance criteria.
* `.project-context/ARCHITECTURE.md`: Architecture specification.
* `.project-context/DECISIONS.md`: Append-only Architectural Decision Records (ADRs).
* `.project-context/CHANGELOG.md`: Semantic changelog explaining WHAT and WHY.
* `.project-context/ACTIVE-WORK.md`: Aggregated active work table.
* `.project-context/active-work/`: Directory for isolated agent descriptors.
* `.project-context/handoffs/`: Directory for permanent, immutable handoff records.
* `AGENTS.md`: Universal 7-step operating protocol.

### Step 3: Run Doctor & Diagnostics
Confirm repository integrity:
```bash
npx project-context doctor
npx project-context diagnostics
```

### Step 4: Configure Model Context Protocol (MCP)
Add Project Context OS to your MCP client configuration (e.g. `.vscode/mcp.json`, Claude Desktop, Cursor, or Kilo Code):
```json
{
  "mcpServers": {
    "project-context": {
      "command": "npx",
      "args": ["@project-context/core", "mcp"],
      "env": {
        "PROJECT_CONTEXT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

---

## 3. Existing Project Adoption & Reconciliation

If adopting an existing repository that already has partial or legacy context:

1. **Adopt In-Place**:
   ```bash
   npx project-context init --adopt
   ```
   * Existing `STATE.md`, `TASKS.md`, `DECISIONS.md`, and `config.json` are preserved 100% without truncation.
   * Any missing canonical directories (`active-work/`, `handoffs/`, `schemas/`) are safely created.
2. **Reconcile Context**:
   ```bash
   npx project-context doctor
   ```
   If any canonical artifacts were missing, doctor reports them and non-destructive reconciliation restores them from domain-neutral templates.

---

## 4. Multi-Project Operational Setup & Isolation

Crux is **strictly project-local**. There is **NO global registry** and **NO cross-project scanning**. Each project owns its own `.project-context/` independently.

### Operating Multiple Independent Projects:
1. **Explicit Root Flag**: Run CLI commands against specific repositories without navigating into them:
   ```bash
   npx project-context --root /path/to/project-alpha state
   npx project-context --root /path/to/project-beta state
   ```
2. **Environment Variable**: Set `PROJECT_CONTEXT_ROOT`:
   ```bash
   export PROJECT_CONTEXT_ROOT=/path/to/project-alpha
   npx project-context diagnostics
   ```
3. **Multi-Project Isolation Guarantee**:
   * Context tokens, tasks, sessions, and handoffs from Project A never leak into Project B.
   * Path jailing (`assertWithinProject`) prevents cross-project traversal (`../../`).

---

## 5. Graphify Structural Integration

Graphify (`graphify-out/graph.json`) provides external structural code relationships (AST dependencies, god nodes, hyperedges).

* **Read-Only Relationship**: Crux reads Graphify data but never mutates, overwrites, or executes Graphify.
* **4-State Bridge**:
  * `AVAILABLE`: Graphify output exists and is valid JSON. Warm context queries surface 1-hop AST neighbors.
  * `MISSING`: No `graphify-out/` exists. Crux functions normally in pure semantic mode.
  * `STALE`: Source code modified more recently than `graph.json`. Crux warns in diagnostics but remains operational.
  * `INVALID`: Corrupted JSON. Crux logs a warning and gracefully falls back to semantic context.

---

## 6. Daily Multi-Agent Collaboration Workflow

```text
[Agent Alpha]                          [Git & Context OS]                         [Agent Beta]
      │                                        │                                       │
      ├─────── 1. bootstrap_context ──────────►│                                       │
      │◄────── Hot Context & Reality ──────────┤                                       │
      │                                        │                                       │
      ├─────── 2. start_agent_session ────────►│ (writes active-work/alpha.md)         │
      │        (claims TASK-001, files)        │                                       │
      │                                        │                                       │
      ├─────── 3. Edits code & runs tests ─────┤                                       │
      │                                        │                                       │
      ├─────── 4. end_agent_session ──────────►│ (creates immutable handoff,           │
      │        (records next action)           │  transitions alpha to COMPLETED)      │
      │                                        │                                       │
      │                                        │◄────── 5. bootstrap_context ──────────┤
      │                                        ├─────── Recovers TASK-001 & Next ─────►│
      │                                        │        (Zero human re-explanation!)   │
```

---

## 7. Operational Observability & Diagnostic Commands

```bash
npx project-context state              # Concise project snapshot
npx project-context diagnostics        # Full machine-readable operational diagnostics (JSON export)
npx project-context health             # 6-pillar Context Quality score (0-100%)
npx project-context check-consistency  # Audit Git reality vs. Context OS records
npx project-context drift              # Git <-> Context semantic drift detection
npx project-context relevance <task>   # Task-tailored Warm Context rankings (Dual-source fusion)
npx project-context attention          # High-priority alerts & working-area collisions
npx project-context validate           # Schema integrity & anti-secret scanner
```

---

## 8. Remote ChatGPT Boundary

| Client | Interface | Surface | Status |
| :--- | :--- | :--- | :--- |
| **Antigravity / Claude / Cursor / Kilo** | Local STDIO | Full 29 Tools (Read & Write) | **VERIFIED** |
| **ChatGPT Custom Web App** | Streamable HTTP | Curated 8 Read-Only Tools | **VERIFIED** |
| **ChatGPT Web (Manual)** | Markdown Paste | Compact Snapshot Fallback (<45 lines) | **VERIFIED** |

