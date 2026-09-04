# Project Context OS — ChatGPT MCP Adapter (Phase 3)

This directory contains the **clean-room transport adapter** that bridges Project Context OS to the Model Context Protocol over **Streamable HTTP** using the `mcp-use` framework.

> [!NOTE]
> **Status:** Local Proof of Concept — Controlled Read-Only Interface (Phase 3).
> Remote public exposure, authenticated tunnels, and direct ChatGPT Web connectivity are scheduled for future phases (Phase 5/6).

---

## Architecture Overview

```text
┌────────────────────────────────────────────────────────┐
│                   PROJECT CONTEXT OS                   │
│                (@project-context/core)                 │
│                                                        │
│  src/core.js    src/snapshot.js    src/security.js     │
│  src/git.js     src/relevance.js   src/locator.js      │
└───────────────────────────┬────────────────────────────┘
                            │ (Local Programmatic Imports)
                            ▼
      ┌───────────────────────────────────────────┐
      │       integrations/chatgpt/index.js       │
      │        (mcp-use Streamable HTTP)          │
      │                                           │
      │   Exposes 8 Curated Read-Only Tools       │
      └─────────────────────┬─────────────────────┘
                            │ (Streamable HTTP / JSON-RPC)
                            ▼
                    Local MCP Client
             (e.g., test-loopback.js)
```

- **Zero Duplicated State:** All state reading is performed by canonical `@project-context/core`.
- **Zero Markdown Reconstruction:** Raw files and structured JSON are read via canonical core engines.
- **Strictly Local:** Binds exclusively to `127.0.0.1`.
- **Anti-Credential Protection:** Every payload passes through `assertNoSecrets` before transmission.

---

## Exposed Tools (8 Curated Read Tools)

| Tool Name | Canonical Core API | Description |
| :--- | :--- | :--- |
| `get_context_snapshot` | `getContextSnapshot(rootDir, options)` | Primary bootstrap: Hot Context (state, active work, tasks, handoff, decisions, git). |
| `get_project_state` | `readState(rootDir)` | High-level status snapshot and YAML metadata from `STATE.md`. |
| `get_tasks` | `readTasks(rootDir, status?)` | Project task board with optional status filtering (`BACKLOG`, `READY`, `IN_PROGRESS`, etc.). |
| `get_architecture` | `readFileSafe(path.join(ctx, "ARCHITECTURE.md"))` | System architecture specification, system boundaries, and architectural invariants. |
| `get_decisions` | `readDecisions(rootDir)` | Architectural Decision Records (ADRs) from `DECISIONS.md` with bounded limit. |
| `search_project_context` | `searchProjectContext(rootDir, query)` | Full-text keyword search across all `.project-context/` markdown files (max 50). |
| `get_relevant_context` | `getRelevantContext(rootDir, options)` | Deterministic, ranked Warm Context for a specific task ID or query topic. |
| `get_git_status` | `getGitStatus(rootDir)` | Working tree ground truth: branch, staged, unstaged, untracked files. |

*Zero write tools. Zero lifecycle tools. Zero shell or code execution tools.*

---

## Prerequisites

- Node.js `v24.15.0` or higher
- npm `11.12.1` or higher
- An existing Project Context OS repository (with `.project-context/` or `.git`)

---

## Installation

Install dependencies locally inside this directory only:

```bash
cd integrations/chatgpt
npm install
```

*(This isolates `mcp-use` from the root `@project-context/core` engine package).*

---

## Configuration: Project Root

The adapter binds to a single target repository on startup using canonical priority:

1. **`PROJECT_CONTEXT_ROOT` environment variable** (Recommended):
   ```bash
   # Windows PowerShell
   $env:PROJECT_CONTEXT_ROOT = "C:/Users/AGP/Documents/Projects/Job-Hunt"
   ```

2. **`--root` CLI parameter**:
   ```bash
   node index.js --root "C:/Users/AGP/Documents/Projects/Job-Hunt"
   ```

3. **Automatic upward discovery** from current working directory via canonical `resolveProjectRoot()`.

---

## Starting the Adapter

```bash
node index.js
```

### Local Endpoints

- **Streamable HTTP MCP Endpoint:**  
  `http://127.0.0.1:3000/mcp`
- **Interactive MCP Inspector UI:**  
  `http://127.0.0.1:3000/mcp/inspector`

---

## Running the Loopback Test Suite

The automated test suite verifies all 8 tools end-to-end over Streamable HTTP:

```bash
npm test
# or
node test-loopback.js
```

### Verified Assertions

1. Server starts and binds to loopback dynamically.
2. Client connects via `StreamableHTTPClientTransport`.
3. Discovers exactly 8 tools (surface guard: zero write/lifecycle tools).
4. Invokes and validates output for every single tool.
5. Verifies schema structure, bounded limits, and status filtering.
6. Enforces `assertNoSecrets` against every tool payload.
7. Confirms file timestamps on disk are untouched (read-only invariance).
8. Validates failure paths for nonexistent project roots and empty queries.

---

## Security Model & Limitations

- **Local-Only Binding:** Bound strictly to loopback (`127.0.0.1`).
- **Read-Only Invariance:** Disk state remains completely unchanged before and after tool calls.
- **Fixed Boundary:** Remote callers cannot pass arbitrary directory paths or traversal sequences.
- **Anti-Credential Protection:** All outgoing tool payloads are scanned by canonical `assertNoSecrets`.
