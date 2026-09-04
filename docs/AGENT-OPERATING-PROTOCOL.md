# Universal Daily Agent Operating Protocol (v5.0.0)

This document defines the authoritative, mandatory lifecycle protocol for every autonomous AI coding agent (Antigravity, Claude, Cursor, Codex, Kilo Code, ChatGPT, etc.) operating in any repository equipped with **Project Context OS**.

---

## 1. The Universal 7-Step Agent Lifecycle

Every agent invocation follows this strict sequential lifecycle:

```text
1. READ        → Inspect Git working tree, bootstrap Hot Context & check collisions
2. UNDERSTAND  → Inspect source code, architectural invariants, decisions & Graphify
3. PLAN        → Check working-area overlap, claim task & register isolated descriptor
4. EXECUTE     → Implement focused, high-quality code modifications
5. TEST        → Run automated test suites and verify zero regressions
6. RECORD      → Record changes in CHANGELOG, update TASKS, and update STATE
7. HAND OFF    → Generate an immutable handoff record if transitioning sessions
```

---

## 2. Step-by-Step Operating Instructions

### Step 1: READ (Universal Bootstrap & Diagnostics)
Immediately upon invocation, before doing any other work, execute the universal context bootstrap:
* **Via MCP**: Call `bootstrap_context(agent="<your-agent-name>")`
* **Via CLI**: Run `npx project-context bootstrap --agent <your-agent-name>`

This synthesizes and returns:
* **Project Reality**: Current phase, overall status, active milestone, and context health.
* **Active Agents & Collisions**: Who is currently working, what tasks they own, and any working-area collisions.
* **Incoming Handoff**: The latest handoff record containing the **Exact Recommended Next Step**.
* **Git Ground Truth**: Current branch, uncommitted modifications, and staged files.
* **Task-Tailored Warm Context**: Dual-source progressive context fusion combining relevant ADRs and Graphify 1-hop AST neighbors.

### Step 2: UNDERSTAND (Context & Collision Review)
* Review `.project-context/STATE.md` to ground your session in current project reality.
* Run collision diagnostics to verify your intended files are conflict-free:
  ```bash
  npx project-context diagnostics
  ```
* Read any ADRs in `.project-context/DECISIONS.md` relevant to your planned changes.
* Verify project invariants in `.project-context/config.json`.

### Step 3: PLAN (Collision Guard & Session Start)
* Claim or create an active task in `.project-context/TASKS.md` (transitioning status to `IN_PROGRESS`).
* Ensure your declared `working_area` does not trigger an `EXACT` or `CONTAINMENT_DIR_FILE` collision with an active agent.
* Register your active session:
  * **Via MCP**: Call `start_agent_session(agent="<agent>", task_id="<task>", task_title="<title>", objective="<objective>", working_area=[...])`
  * **Via CLI**: Run:
    ```bash
    npx project-context session-start \
      --agent <agent> \
      --interface <interface> \
      --router <router> \
      --model <model> \
      --task <task_id> \
      --title "<title>" \
      --objective "<objective>"
    ```
* This creates your isolated descriptor at `.project-context/active-work/<agent>.md` and compiles `.project-context/ACTIVE-WORK.md`.

### Step 4: EXECUTE (Focused Modifications)
* Perform targeted code edits strictly within your declared working area.
* For long-running tasks, send periodic heartbeats:
  * **Via MCP**: Call `heartbeat_session(agent="<agent>", progress="<summary of progress>")`
  * **Via CLI**: Run `npx project-context session-heartbeat --agent <agent> --progress "<summary>"`

### Step 5: TEST (Verification)
* Run the project's automated test suite and build commands.
* Run Context OS integrity checks:
  ```bash
  npx project-context validate
  npx project-context health
  ```
* Ensure zero regressions on both the application and the context store.

### Step 6: RECORD (Semantic Recording)
* Record your change in the semantic changelog:
  * **Via MCP**: Call `record_change(task_id="<task>", summary="<what/why>", files=[...], impact="<impact>", tests="<tests>")`
  * **Via CLI**: Run `npx project-context changes`
* Update task status in `.project-context/TASKS.md` (e.g. `IN_PROGRESS` -> `COMPLETED`).
* Update `.project-context/STATE.md` with new timestamp and verified status.

### Step 7: HAND OFF (Assisted Session Conclusion)
If concluding the session or preparing for another agent or model to continue:
* Conclude session and create an immutable handoff:
  * **Via MCP**: Call `end_agent_session(agent="<agent>", to_agent="<next-agent|any>", next_action="<exact next step>")`
  * **Via CLI**: Run:
    ```bash
    npx project-context session-end \
      --agent <agent> \
      --to <next-agent> \
      --next "<Exact recommended next step for incoming agent>"
    ```
* This generates a permanent, write-once file in `.project-context/handoffs/` and updates your active work descriptor to `COMPLETED`.

---

## 3. Critical Invariants

1. **Zero Multi-Agent Collisions**: You own `.project-context/active-work/<your-agent-name>.md`. Never overwrite or delete another agent's active-work descriptor.
2. **Zero Credentials**: Never write API keys, access tokens (`sk-`, `ghp_`), or bearer tokens into `.project-context/`. The built-in scanner rejects violations automatically.
3. **Write-Once Handoffs**: Never attempt to modify or overwrite an existing file in `.project-context/handoffs/`. Each handoff is permanently immutable.
4. **Authoritative Git Reality**: Ground all claims in the actual working tree and test execution. Never claim a test passed or a task completed without verified execution.
5. **Read-Only Graphify**: Never edit or rebuild `graphify-out/` directly during normal context operations; consume it strictly via read-only fusion.

