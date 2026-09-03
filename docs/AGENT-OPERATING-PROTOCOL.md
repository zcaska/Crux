# Universal Daily Agent Operating Protocol

This document defines the authoritative, mandatory lifecycle protocol for every autonomous AI coding agent (Antigravity, Claude, Cursor, Codex, Kilo Code, ChatGPT, etc.) operating in any repository equipped with **Project Context OS**.

---

## 1. The Universal 7-Step Agent Lifecycle

Every agent invocation follows this strict sequential lifecycle:

```text
1. READ        → Inspect Git working tree & bootstrap Hot Context
2. UNDERSTAND  → Inspect source code, architectural invariants, and decisions
3. PLAN        → Formulate atomic steps, register task, and write active-work descriptor
4. EXECUTE     → Implement focused, high-quality code modifications
5. TEST        → Run automated test suites and verify zero regressions
6. RECORD      → Record changes in CHANGELOG, update TASKS, and update STATE
7. HAND OFF    → Generate an immutable handoff record if transitioning sessions
```

---

## 2. Step-by-Step Operating Instructions

### Step 1: READ (Universal Bootstrap)
Immediately upon invocation, before doing any other work, execute the universal context bootstrap:
* **Via MCP**: Call `bootstrap_context(agent="<your-agent-name>")`
* **Via CLI**: Run `npx project-context bootstrap --agent <your-agent-name>`

This synthesizes and returns:
* **Project Reality**: Current phase, overall status, active milestone, and context health.
* **Active Agents**: Who is currently working, what tasks they own, and their working areas.
* **Incoming Handoff**: The latest handoff record containing the **Exact Recommended Next Step**.
* **Git Ground Truth**: Current branch, uncommitted modifications, and staged files.
* **Task-Tailored Warm Context**: Highly relevant Architectural Decision Records (ADRs) and candidate files.

### Step 2: UNDERSTAND (Context Review)
* Review `.project-context/STATE.md` to ground your session in current project reality.
* Check `.project-context/ACTIVE-WORK.md` to ensure your planned task does not collide with another active agent's working area.
* Read any ADRs in `.project-context/DECISIONS.md` relevant to your planned changes.
* Verify project invariants in `.project-context/config.json`.

### Step 3: PLAN (Task Registration & Session Start)
* Claim or create an active task in `.project-context/TASKS.md` (transitioning status to `IN_PROGRESS`).
* Register your active session:
  * **Via MCP**: Call `start_session(agent="<agent>", task_id="<task>", title="<title>", objective="<objective>", files=[...])`
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
  * **Via MCP**: Call `end_session(agent="<agent>", to_agent="<next-agent|any>", next_action="<exact next step>", mark_completed=true)`
  * **Via CLI**: Run:
    ```bash
    npx project-context session-end \
      --agent <agent> \
      --to <next-agent> \
      --next "<Exact recommended next step for incoming agent>" \
      --mark-completed
    ```
* This generates a permanent, write-once file in `.project-context/handoffs/` and updates your active work descriptor to `COMPLETED`.

---

## 3. Critical Invariants

1. **Zero Multi-Agent Collisions**: You own `.project-context/active-work/<your-agent-name>.md`. Never overwrite or delete another agent's active-work descriptor.
2. **Zero Credentials**: Never write API keys, access tokens (`sk-`, `ghp_`), or bearer tokens into `.project-context/`. The built-in scanner rejects violations automatically.
3. **Write-Once Handoffs**: Never attempt to modify or overwrite an existing file in `.project-context/handoffs/`. Each handoff is permanently immutable.
4. **Authoritative Git Reality**: Ground all claims in the actual working tree and test execution. Never claim a test passed or a task completed without verified execution.
