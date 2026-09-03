# Project Context OS — Operational Handoff (v4.0.0)

This is the primary operational manual for engineers and agents using **Project Context OS** (`@project-context/core@4.0.0`).

---

## 1. What is Project Context OS?

Project Context OS is a portable, vendor-neutral, offline-first context management and multi-agent coordination system that lives directly inside your software repository. It stores canonical project memory in human-readable Markdown files under `.project-context/`, exposes an official Model Context Protocol (MCP) server with **29 tools**, and provides an offline CLI so that different AI agents and models can collaborate without losing state or requiring human re-explanation.

---

## 2. How Do I Install It in a New Repository?

In your repository root:
```bash
# Via npm (standard distribution):
npm install --save-dev @project-context/core

# Or from an offline package tarball:
npm install --save-dev ./project-context-core-4.0.0.tgz
```

---

## 3. How Do I Initialize a Project?

Run the idempotent initialization command:
```bash
npx project-context init --name "MyApplication" --description "Core enterprise platform"
```
This automatically creates:
* `.project-context/config.json`: Project identity and invariant configuration.
* `.project-context/STATE.md`: Authoritative high-level project status.
* `.project-context/TASKS.md`: Task board with acceptance criteria.
* `.project-context/ARCHITECTURE.md`: Architectural specification.
* `.project-context/DECISIONS.md`: Architectural Decision Records (ADRs).
* `.project-context/CHANGELOG.md`: Semantic changelog explaining WHAT and WHY.
* `.project-context/ACTIVE-WORK.md`: Aggregate active agent table.
* `.project-context/active-work/`: Directory for isolated agent sessions.
* `.project-context/handoffs/`: Directory for write-once immutable handoffs.
* `AGENTS.md`: Universal 7-step operating protocol.
* `.vscode/mcp.json`: Scaffolded MCP server client configuration.

---

## 4. How Do I Connect Antigravity?

Antigravity connects via standard Model Context Protocol (MCP). In `.vscode/mcp.json`:
```json
{
  "mcpServers": {
    "project-context": {
      "command": "npx",
      "args": ["@project-context/core", "mcp"],
      "cwd": "${workspaceFolder}",
      "env": {
        "PROJECT_CONTEXT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```
*(In CareerOS repository, `command: "node"` and `args: ["tools/project-context/src/mcp-server.js"]` connects directly to the local source).*

When Antigravity opens the workspace, it automatically discovers all 29 tools.

---

## 5. How Do I Connect Kilo Code?

Kilo Code connects via the exact same MCP protocol. Ensure `.kilo/mcp.json` (or `.vscode/mcp.json`) is configured:
```json
{
  "mcpServers": {
    "project-context": {
      "command": "npx",
      "args": ["@project-context/core", "mcp"],
      "cwd": "${workspaceFolder}",
      "env": {
        "PROJECT_CONTEXT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```
**Architecture Rule**: Kilo Code interacts with `.project-context/` through MCP. Never maintain a second, duplicate Kilo-specific memory store.

---

## 6. How Does OmniRoute Fit?

```text
[Kilo / Agent Interface]
         │
         ▼
    [OmniRoute]  ────────► (Routes prompt to Gemini, Claude, OpenAI, etc.)
         │
         ▼
     [AI Model]
         │
         ▼ (Invokes MCP tools)
[Project Context OS]
         │
         ▼
 [.project-context/] ────► (Durable Canonical Truth in Git)
```

OmniRoute is strictly a **model routing proxy**. It does **not** store context, track tasks, or manage memory. All project memory lives in `.project-context/`.

---

## 7. How Do I Switch Models?

1. Conclude the current session or create a handoff from Model A (e.g. Gemini 3.8 Flash).
2. Change your model in OmniRoute or your IDE to Model B (e.g. Claude 3.7 Sonnet).
3. In the new conversation, invoke the bootstrap:
   ```bash
   npx project-context bootstrap --agent <new-agent-name>
   ```
4. Model B automatically receives project state, active tasks, uncommitted files, and the latest handoff with the exact next action. No chat history is required.

---

## 8. How Do I Use It with ChatGPT?

Direct local STDIO MCP is **not supported** in ChatGPT Web (web browsers cannot communicate directly with local processes).

Use the verified **Compact Snapshot Fallback**:
1. Run:
   ```bash
   npx project-context snapshot
   ```
2. Copy the resulting Markdown text (< 45 lines, ~1,100 tokens).
3. Paste it into ChatGPT Web with your architecture or planning query.
4. When ChatGPT returns a recommendation or plan, bring it back into your project:
   - Ask Antigravity or Kilo Code to apply the change, or
   - Manually record an ADR in `.project-context/DECISIONS.md`.

---

## 9. How Does an Agent Start a Session?

* **Via MCP**:
  ```json
  {
    "name": "start_session",
    "arguments": {
      "agent": "coder-1",
      "task_id": "TASK-001",
      "title": "Database Schema Setup",
      "objective": "Create initial database migration",
      "files": ["migrations/001_init.sql"]
    }
  }
  ```
* **Via CLI**:
  ```bash
  npx project-context session-start \
    --agent coder-1 \
    --interface kilo-code \
    --router omniroute \
    --model claude-3-7-sonnet \
    --task TASK-001 \
    --title "Database Schema Setup" \
    --objective "Create initial database migration"
  ```

---

## 10. How Does an Agent Finish a Session?

* **Via MCP**:
  ```json
  {
    "name": "end_session",
    "arguments": {
      "agent": "coder-1",
      "to_agent": "reviewer",
      "next_action": "Review migrations/001_init.sql and run test suite",
      "mark_completed": true
    }
  }
  ```
* **Via CLI**:
  ```bash
  npx project-context session-end \
    --agent coder-1 \
    --to reviewer \
    --next "Review migrations/001_init.sql and run test suite" \
    --mark-completed
  ```

---

## 11. How Does Another Agent Recover Context (Cold Start)?

An incoming agent with zero knowledge simply runs:
```bash
npx project-context bootstrap --agent reviewer
```
The bootstrap payload delivers:
* Project Name & Status
* Completed & In-Flight Tasks
* Previous Agent (`coder-1`)
* Modified Files (`migrations/001_init.sql`)
* **Exact Recommended Next Action**: `"Review migrations/001_init.sql and run test suite"`

The incoming agent resumes execution immediately without human intervention (**H0 recovery**).

---

## 12. How Do I Diagnose Problems?

Run this troubleshooting sequence in order:

```bash
# 1. Environment & directory integrity
npx project-context doctor

# 2. Schema formatting & secret scan
npx project-context validate

# 3. 6-pillar Context Quality score (0-100%)
npx project-context health

# 4. Detect stale sessions or uncommitted files
npx project-context check-consistency

# 5. Detect Git <-> Context drift
npx project-context drift
```

---

## 13. What Are the Known Limitations?

1. **Path Jailing Lexical Normalization**: Path traversal security (`assertWithinProject`) resolves paths lexically (`path.resolve`). If your project root is hosted inside deeply nested symlinks outside the working drive, set `PROJECT_CONTEXT_ROOT` explicitly in `.env` or client configuration.
2. **ChatGPT Web Direct MCP**: Web browser sandboxes cannot open local process sockets without external network tunneling. The compact snapshot workflow is the supported fallback.
3. **Automated Schema Migration Runner**: Schema transformations across major versions are handled passively via default values in `src/config.js`. A formal `project-context migrate` runner is deferred to v5.0.0.

---

## 14. What Should I NEVER Assume?

* **NEVER assume context is saved in the cloud**: Context OS does not sync to any remote cloud. If you do not commit `.project-context/` to Git, your context stays only on your local machine.
* **NEVER assume agents know your conversation history**: Always rely on `bootstrap_context` and handoffs. Agents do not share conversation memory across sessions.
* **NEVER put API keys in `.project-context/`**: The built-in scanner blocks and rejects API keys (`sk-`, `ghp_`) and tokens automatically.
* **NEVER edit another agent's active work file**: Each agent owns `.project-context/active-work/<agent>.md`. The aggregated `ACTIVE-WORK.md` is compiled automatically.
