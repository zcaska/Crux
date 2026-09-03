# Project Context OS — Architecture Specification

This document details the architectural design of **Project Context OS**, its component hierarchy, its separation from the CareerOS application, and its future-proof vendor-neutral design.

---

## 1. Dual-Architecture Isolation

A core tenet of this codebase is the absolute separation between the application product and the agent collaboration infrastructure:

```text
                                CAREEROS REPOSITORY
                                         │
             ┌───────────────────────────┴───────────────────────────┐
             │                                                       │
   CareerOS Application                                    Project Context OS
   (Product System)                                        (Agent Collaboration Layer)
             │                                                       │
   ┌─────────┴─────────┐                                   ┌─────────┴─────────┐
   │                   │                                   │                   │
Frontend            Backend                             Git Repository    .project-context/
(Vite + React 19)   (Prisma + Services)                 Working Tree      Filesystem Store
   │                   │                                   │                   │
   └─────────┬─────────┘                                   └─────────┬─────────┘
             │                                                       │
          Supabase                                            Context OS Core
     (PostgreSQL Database,                                  (Parsing, Validation,
      Auth, App Edge Functions)                              Security, Snapshot)
                                                                     │
                                                           ┌─────────┴─────────┐
                                                           │                   │
                                                      Local CLI           Official MCP
                                                   (project-context)     (@modelcontextprotocol/sdk)
                                                           │                   │
                                                           └─────────┬─────────┘
                                                                     │
                                                        Compatible Coding Agents
                                                        (Antigravity, Claude, Codex,
                                                         ChatGPT, Cursor, etc.)
```

### Invariants:
1. **Application Source Code**: `frontend/` and `backend/` contain CareerOS product code. They never import, invoke, or depend on `.project-context/` or `tools/project-context/`.
2. **Context OS Scope**: Context OS manages repository intelligence. It operates only within `.project-context/` and provides read-only inspection of source code and Git. It never modifies application business logic automatically.
3. **Application Database**: Supabase remains CareerOS's application database (profiles, jobs, resumes, matches, interviews). Project Context OS does not use Supabase.

---

## 2. Source-of-Truth Hierarchy

When establishing project state, agents must respect this strict priority:

1. **Git Repository Status & Working Tree**: What code actually exists in the filesystem right now.
2. **`.project-context/` Markdown Documents**: Authoritative project status, active tasks, decisions, and handoffs.
3. **`AGENTS.md`**: Behavioral instructions and invariants.
4. **Actual Source Code & Configuration Files**: Behavioral ground truth.
5. **Git Commit History & Diffs**: Historical progression of changes.

---

## 3. Hot Context vs Cold Context Partitioning

LLMs have limited context windows and high latency/cost when processing large historical dumps. Project Context OS partitions context into two explicit tiers:

### Hot Context (Loaded on Agent Bootstrap)
Information essential for immediate reasoning:
* `STATE.md`: Authoritative concise project snapshot.
* `ACTIVE-WORK.md`: Aggregated active work across all agents.
* `active-work/<agent>.md`: The specific agent's active task descriptor.
* Active tasks (`IN_PROGRESS` or `READY`) from `TASKS.md`.
* Latest relevant handoff from `handoffs/`.
* Recent decisions from `DECISIONS.md`.
* Recent semantic changelog entries from `CHANGELOG.md`.
* Uncommitted files from `git status`.

### Cold Context (Retrieved On-Demand)
Deep historical context retrieved only when specifically investigated:
* Completed or cancelled tasks in `TASKS.md`.
* Archived historical handoffs in `handoffs/`.
* Older changelog records.
* Historical superseded decisions in `DECISIONS.md`.
* Full git diffs and commit histories.

Cold context is queried through `search_project_context(query)` or `npm run context:search <query>`.

---

## 4. Official Model Context Protocol (MCP) Integration

Rather than using proprietary AI APIs or non-standard JSON-RPC, Project Context OS adopts the **official Model Context Protocol Node.js SDK** (`@modelcontextprotocol/sdk`).

```text
Any MCP-Compatible Client
(Antigravity, Claude Desktop, Cursor, Codex)
            │  (STDIO JSON-RPC 2.0)
            ▼
   McpServer + StdioServerTransport
   (tools/project-context/src/mcp-server.js)
            │
            ├─► Read Tools (11)
            └─► Write Tools (7)
                    │
                    ▼
            Context OS Core + Security Scanner
                    │
                    ▼
            .project-context/ + Git
```

### Architecture Benefits:
* **Protocol Compliance**: Handles standard MCP handshakes, capability negotiation, tool listing, and typed tool calls.
* **Vendor Neutrality**: Works with any AI vendor that supports MCP.
* **Security Isolation**: Runs as a local subprocess communicating strictly via standard input/output.
