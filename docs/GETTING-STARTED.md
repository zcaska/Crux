# Getting Started with Project Context OS

**Project Context OS (`@project-context/core`)** is a portable, vendor-neutral, repository-local context synchronization and multi-agent collaboration infrastructure for software projects.

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

## 2. 10-Step Practical First-Use Workflow

### Step 1: Install Package
In your project root:
```bash
npm install --save-dev @project-context/core
```
*(Or install locally from a tarball: `npm install --save-dev ./project-context-core-4.0.0.tgz`)*

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

### Step 3: Verify Health
Run the diagnostic doctor to confirm repository integrity:
```bash
npx project-context doctor
```

### Step 4: Connect via Model Context Protocol (MCP)
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

### Step 5: Bootstrap Agent A
When an AI agent begins work, it calls the `bootstrap_context` MCP tool or runs:
```bash
npx project-context bootstrap --agent agent-alpha
```
The agent receives a synthesized Hot Context briefing containing:
* Project identity, milestone, and current status
* Active collaborating agents
* Current task board priorities
* Latest handoff with the **Exact Recommended Next Step**
* Git ground truth (uncommitted modifications and branch status)
* Task-tailored warm context (suggested candidate files and relevant ADRs)

### Step 6: Start Session & Work
Agent Alpha claims a task and registers an active session:
```bash
npx project-context session-start \
  --agent agent-alpha \
  --interface kilo-code \
  --router omniroute \
  --model gemini-3.8-flash \
  --task TASK-001 \
  --title "Storage Layer" \
  --objective "Implement user schema"
```
While developing, the agent records heartbeats:
```bash
npx project-context session-heartbeat \
  --agent agent-alpha \
  --progress "Created database migration in migrations/001_init.sql"
```

### Step 7: Record Changes
Once modifications are made and verified, record a semantic entry in `CHANGELOG.md`:
```bash
npx project-context changes
```
Or via MCP: call `record_change(task_id, summary, files, impact, tests)`.

### Step 8: Create an Immutable Handoff & Conclude Session
When Agent Alpha finishes its turn or reaches a stopping point, it concludes the session:
```bash
npx project-context session-end \
  --agent agent-alpha \
  --to agent-beta \
  --next "Implement user repository in src/repositories/userRepo.ts and run tests" \
  --mark-completed
```
This generates a permanent, write-once record in `.project-context/handoffs/` (e.g. `2026-09-03T14-00-00Z_agent-alpha_to_agent-beta.md`) and updates Agent Alpha's active work descriptor to `COMPLETED`.

### Step 9: Start Agent B (Cold Recovery)
Now launch a completely separate session, potentially using a different model (e.g. Claude 3.7 Sonnet) or interface (e.g. Cursor). Agent B does NOT have access to Agent Alpha's chat transcript.

Agent B executes universal bootstrap:
```bash
npx project-context bootstrap --agent agent-beta
```

### Step 10: Recover Context & Continue Work
From the bootstrap briefing, Agent B automatically recovers:
1. Target task ID: `TASK-001`.
2. Previous agent: `agent-alpha`.
3. Modified files: `migrations/001_init.sql`.
4. **Exact Recommended Next Action**: `"Implement user repository in src/repositories/userRepo.ts and run tests"`.

Agent B registers its session and continues immediately with zero verbal prompting.

---

## 3. 4-Dimensional Multi-Model & Router Interoperability

Project Context OS cleanly separates identity into four orthogonal dimensions:
1. **Agent**: The autonomous role or identity (e.g. `antigravity`, `coder`, `auditor`).
2. **Interface**: The development tool or IDE client (e.g. `kilo-code`, `cursor`, `claude-desktop`).
3. **Router**: The proxy or gateway orchestrating model requests (e.g. `omniroute`, `direct`).
4. **Model**: The LLM powering the agent (e.g. `gemini-3.8-flash`, `claude-3-7-sonnet`, `gpt-4o`).

Because repository state is stored in Git and Markdown, model switches preserve 100% of context.

---

## 4. ChatGPT Workflow Boundary

| Environment | Mode | Status | Workflow |
| :--- | :--- | :--- | :--- |
| **Claude Desktop / Cursor / Kilo Code** | Direct Local STDIO MCP | **VERIFIED** | Full read and write tool execution over STDIO JSON-RPC. |
| **ChatGPT Web Interface** | Direct Local STDIO MCP | **NOT SUPPORTED** | Web browsers cannot connect directly to local process sockets without external network tunneling. |
| **ChatGPT Web Interface** | Compact Snapshot Fallback | **VERIFIED (FALLBACK)** | Run `npx project-context snapshot`, paste compact Hot Context briefing (< 45 lines, ~1,100 tokens) into chat, conduct planning/reasoning, and update context via compatible agent or CLI. |

---

## 5. Observability & Diagnostic Commands

```bash
npx project-context state              # Concise project snapshot
npx project-context health             # 6-pillar Context Quality score (0-100%)
npx project-context drift              # Git <-> Context semantic drift detection
npx project-context relevance <task>   # Task-tailored Warm Context rankings
npx project-context attention          # High-priority alerts & collisions
npx project-context validate           # Schema integrity & anti-secret scanner
```

---

## 6. Known Non-Blocking Limitations

1. **Path Jailing Lexical Enforcement**: Path traversal protection (`assertWithinProject`) strictly checks lexical paths (`path.resolve`) against the root. On operating systems with complex symlinked parent roots, set `PROJECT_CONTEXT_ROOT` explicitly.
2. **Schema Migrations**: v4.0.0 context files are backwards-compatible with v3. Automated breaking schema migration tooling is deferred to v5.0.0.
