# Project Context OS — Phase 2: Multi-Agent Interoperability & Lifecycle Automation

## Overview

Phase 2 transforms Project Context OS into a seamless, vendor-neutral collaboration infrastructure across different AI coding agents (Antigravity, Claude, Codex, Cursor, ChatGPT). It eliminates manual re-explanation of project state when switching agents while maintaining zero dependency on cloud context stores.

---

## 1. Universal Agent Bootstrap

Incoming agents enter the repository without prior conversation memory. Instead of dumping the entire repository history, Context OS provides an automated, compact **Hot Context Briefing** synthesized from current project reality, active tasks, Git status, latest handoffs, and consistency warnings.

### CLI Usage:
```bash
# Markdown Briefing
npm run context:bootstrap

# Structured JSON
node tools/project-context/bin/project-context.js bootstrap --agent claude --json
```

### MCP Tool Usage:
* Tool: `bootstrap_context`
* Arguments: `{ "agent": "claude" }`
* Response: `{ bootstrap: HotContextSnapshot, briefing_markdown: string }`

---

## 2. Agent Session Registration & Heartbeats

Context OS explicitly preserves the 4-layer identity model:
* `agent`: The core persona (e.g. `antigravity`, `claude`, `codex`).
* `interface`: The IDE or client tool (e.g. `kilo-code`, `cursor`, `claude-desktop`).
* `router`: The model routing layer (e.g. `omniroute`, `direct`).
* `model`: The underlying LLM (e.g. `gemini-3.8-flash`, `claude-3-5-sonnet`).

Each active session maintains its isolated task descriptor in `.project-context/active-work/<agent>.md`. The aggregated view `.project-context/ACTIVE-WORK.md` is compiled automatically.

### CLI Usage:
```bash
# Register a session
node tools/project-context/bin/project-context.js session-start \
  --agent claude \
  --task TASK-002 \
  --objective "Enhance resume parser"

# Record a heartbeat
node tools/project-context/bin/project-context.js session-heartbeat \
  --agent claude \
  --progress "Parsed LaTeX layouts"

# List all sessions and staleness
npm run context:sessions
```

### MCP Tools:
* `start_agent_session`: Registers session, establishes isolated file, and recompiles aggregate view.
* `heartbeat_session`: Updates last activity timestamp, progress, and status.
* `list_agent_sessions`: Lists all active/stale sessions and idle durations.

---

## 3. Assisted Session-End & Immutable Handoffs

When an agent concludes its work, Context OS inspects Git working tree reality, extracts modified files, compiles tests performed, and writes an **immutable handoff document** in `.project-context/handoffs/`.

### Handoff Immutability Invariant:
* Handoff files are strictly **write-once**.
* File naming convention: `YYYY-MM-DDTHH-mm-ssZ_<from-agent>_to_<to-agent>.md`.
* Direct overwrites trigger an immediate error (`EEXIST`).

### CLI Usage:
```bash
node tools/project-context/bin/project-context.js session-end \
  --agent claude \
  --to antigravity \
  --next "Run integration tests and verify edge function" \
  --complete
```

### MCP Tool:
* `end_agent_session`: Automatically gathers Git diffs/status, writes the immutable handoff, transitions the agent active-work descriptor to `COMPLETED`, and recompiles `ACTIVE-WORK.md`.

---

## 4. Git ↔ Context Consistency Checker

Context OS enforces clear separation of concerns:
* **Git**: Ground truth for **WHAT** changed (file diffs, commits, tree status).
* **Context OS**: Ground truth for **WHY** it changed, active objectives, decisions, and session handoffs.

The consistency engine detects discrepancies:
1. **Uncommitted Changes After Completion**: Agent active work is marked `COMPLETED` while uncommitted files remain in Git.
2. **Stale Active Sessions**: An active agent descriptor has been idle for >24 hours.
3. **Unrecorded Code Modifications**: Working tree has significant changes (>5 files) not yet reflected in `CHANGELOG.md`.
4. **Completed Task Without Documentation**: Task marked `COMPLETED` in `TASKS.md` with no corresponding changelog entry.
5. **Invalid Handoff References**: Handoff pointing to a non-existent task ID.

### CLI Usage:
```bash
npm run context:check
```

### MCP Tool:
* `check_context_consistency`: Audits Git reality vs Context OS records.

---

## 5. Crash & Stale Session Recovery

If an agent process crashes, disconnects, or is terminated without generating a handoff:
1. Context OS preserves all existing files — **never destroys context**.
2. Incoming agents can inspect stalled sessions via `recover --action INSPECT`.
3. An incoming agent can safely adopt the abandoned task via `recover --action ADOPT --new-agent <agent>`.
4. Context OS transitions the crashed agent descriptor to `COMPLETED` (adopted), starts a new session for the incoming agent inheriting the task, and records an audit trail entry in `CHANGELOG.md`.

### CLI Usage:
```bash
# Inspect crashed or stale sessions
npm run context:recover

# Adopt an interrupted task
node tools/project-context/bin/project-context.js recover \
  --agent crashed-agent \
  --new-agent antigravity \
  --action ADOPT
```

---

## 6. Git Hook Automation

To prevent accidental secret leaks or malformed context files from entering the Git history, Context OS provides an automated pre-commit hook:

```bash
# Install pre-commit hook
node tools/project-context/bin/project-context.js install-hooks

# Uninstall pre-commit hook
node tools/project-context/bin/project-context.js uninstall-hooks
```

The hook automatically executes `node tools/project-context/bin/project-context.js validate` on every commit and halts execution if secret credentials (e.g. `sk-...`, `ghp_...`, private keys) or schema violations are detected.

---

## 7. Client Configuration Templates

Pre-built MCP configuration files are available in `tools/project-context/templates/`:
* **Kilo Code / VS Code**: `tools/project-context/templates/kilo-mcp.json`
* **Claude Desktop**: `tools/project-context/templates/claude-desktop-mcp.json`
* **Cursor**: `tools/project-context/templates/cursor-mcp.json`

To inspect client templates:
```bash
node tools/project-context/bin/project-context.js init-client kilo
```

---

## 8. Session Lifecycle Reality Check (Automation Classification)

To maintain architectural honesty and operational stability, Context OS distinguishes three levels of lifecycle automation:

| Level | Mechanism | Operational Trigger | Why It Operates This Way |
| :--- | :--- | :--- | :--- |
| **Truly Automatic** | Git Pre-Commit Hook (`.git/hooks/pre-commit`) | Executed by `git commit` | Hardware/filesystem-level trigger; guarantees credentials (`sk-...`, `ghp_...`) and schema corruptions can never be committed. |
| **Truly Automatic** | Diff Inspection & Handoff Compilation (`end_agent_session`) | Triggered inside tool call | Inspects Git working tree, gathers modified/staged files, and packages handoff without manual typing. |
| **Agent-Enforced** | Universal Bootstrap (`npm run context:bootstrap` / `bootstrap_context`) | Executed by agent upon reading `AGENTS.md` Step 0 | Because `AGENTS.md` is automatically loaded into the agent system prompt on entry, the agent executes bootstrap without human reminders. |
| **Agent-Enforced** | Session Start & Heartbeat (`start_agent_session`, `heartbeat_session`) | Executed by agent when claiming/updating tasks | Preserves multi-agent concurrency by creating individual `.project-context/active-work/<agent>.md` files. |
| **Human-Triggered** | Client MCP Discovery Setup (`.vscode/mcp.json`) | Configured once per IDE/workspace | Standard MCP client connection required to attach editor tools to the local STDIO transport. |

---

## 9. Real Integration Environment Architecture

The real production development environment combines:
1. **Antigravity IDE**: Primary autonomous engineering agent runtime.
2. **Kilo Code**: Editor interface and tool dispatch layer.
3. **OmniRoute**: Model routing layer for LLM inference (e.g. Gemini, Claude). OmniRoute is purely an inference gateway and **NEVER** stores or synchronizes Context OS state.
4. **Project Context OS**: Canonical, repository-local source of truth (`.project-context/` + Git + official MCP server `@modelcontextprotocol/sdk`).
5. **No Cloud Context / No Semantic Indexing Dependency**: Kilo semantic indexing is disabled. All context discovery is deterministic, offline-first, and repository-local.

