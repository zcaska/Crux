# Project Context OS — Model Context Protocol (MCP) Tools

The official Project Context OS MCP server exposes **29 official tools** built on the official Node.js `@modelcontextprotocol/sdk` over STDIO JSON-RPC.

---

## 1. Read Operations (14 Tools)

| Tool Name | Description | Key Parameters |
| :--- | :--- | :--- |
| `bootstrap_context` | **Universal Agent Bootstrap**. Returns synthesized Hot Context, active tasks, latest handoff, Git reality, and consistency warnings as structured data and Markdown briefing. | `agent`: target agent name, `task_id`: optional task focus |
| `get_project_state` | Returns authoritative project status snapshot from `STATE.md`. | None |
| `get_active_work` | Returns active agents, their isolated task descriptors, and aggregated view. | None |
| `list_agent_sessions` | Lists all registered agent sessions, idle durations, and staleness status. | None |
| `check_context_consistency` | Audits consistency between Git reality (staged/unstaged files) and Context OS records. | None |
| `get_tasks` | Returns project tasks from `TASKS.md`. | `status`: optional enum filter |
| `get_recent_changes` | Returns recent semantic changelog entries from `CHANGELOG.md`. | `limit`: integer (default: 10) |
| `get_recent_handoffs` | Returns recent archived agent handoffs from `handoffs/`. | `limit`: integer (default: 5) |
| `get_architecture` | Returns architecture specification (`ARCHITECTURE.md`). | None |
| `get_decisions` | Returns Architectural Decision Records (`DECISIONS.md`). | None |
| `search_project_context` | Full-text search across all `.project-context/` markdown files. | `query`: string (required) |
| `get_git_status` | Returns Git working tree status (branch, staged, unstaged, untracked). Works with zero-commit repositories. | None |
| `get_git_diff` | Returns Git diff output for staged or unstaged modifications. | `staged`: boolean, `file_path`: optional string |
| `get_context_snapshot` | Returns compact Hot Context snapshot. | `limit`: integer, `include_git`: boolean, `include_handoffs`: boolean |

---

## 2. Write & Intelligence Operations (15 Tools)

All write tools validate input schemas with Zod, run recursive regex scanning to block confidential credentials, and enforce path jailing strictly within the target repository.

| Tool Name | Description | Key Parameters |
| :--- | :--- | :--- |
| `start_agent_session` | Registers an active coding session for an agent, establishing isolated task descriptors with path traversal protection. | `agent` (required), `interface`, `router`, `model`, `task_id`, `task_title`, `objective`, `working_area` |
| `heartbeat_session` | Updates active session heartbeat timestamp, progress, and next action. | `agent` (required), `progress`, `next_action`, `status` |
| `end_agent_session` | Concludes an active session in an assisted manner, detecting Git modifications and generating an immutable handoff. | `agent` (required), `to_agent`, `task_id`, `completed_work`, `files_changed`, `tests`, `next_action` (required) |
| `recover_stale_sessions` | Safely recovers, adopts, or archives stale, interrupted, or crashed agent sessions without destroying context. | `agent`, `new_agent`, `action`: `INSPECT` \| `ADOPT` \| `ARCHIVE` |
| `update_project_state` | Updates high-level project status and objective in `STATE.md`. | `current_phase`, `current_status`, `current_objective`, `agent_identity` |
| `update_active_work` | Updates `active-work/<agent>.md` and recompiles `ACTIVE-WORK.md`. | `agent`, `active_task`, `task_title`, `status`, `objective`, `progress`, `files` |
| `create_task` | Creates a new task in `TASKS.md` with auto-assigned `TASK-XXX` ID. | `title` (required), `description`, `status`, `priority`, `owner` |
| `update_task` | Updates status or timestamps of an existing task in `TASKS.md`. | `id` (required, e.g. `TASK-001`), `status` |
| `record_decision` | Appends an ADR to `DECISIONS.md` (append-only). | `title` (required), `decision` (required), `context`, `reason`, `consequences` |
| `record_change` | Appends a semantic entry to `CHANGELOG.md`. | `task_id` (required), `summary` (required), `files`, `impact`, `tests` |
| `create_handoff` | Generates a permanent immutable handoff file in `handoffs/` with directory traversal protection. | `task` (required), `next_action` (required), `from_agent`, `to_agent`, `filename` |
| `assess_context_quality` | Evaluates 6 pillars (Freshness, Completeness, Consistency, Integrity, Activity, Recoverability) and computes 0-100% health score. | None |
| `get_relevant_context` | Deterministically computes Hot, Warm, and Cold context ranking files and decisions for a task or query. | `task_id`, `query` |
| `check_context_drift` | Audits Git ↔ Context semantic drift (untracked modifications, lingering files from completed tasks). | None |
| `check_invariants` | Enforces architectural invariants (ADR compliance, package dependency isolation, table drop protection). | None |

---

## 3. Client Configuration

Configure in your IDE's MCP settings (e.g. `.vscode/mcp.json`, Claude Desktop, Cursor, or Kilo Code):

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
