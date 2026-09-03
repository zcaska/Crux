# Universal Agent Operating Protocol

This document defines the standard operating lifecycle for any autonomous AI agent or human contributor operating in this repository.

---

## 1. The 7-Step Lifecycle

```text
READ
  ↓
UNDERSTAND
  ↓
PLAN
  ↓
EXECUTE
  ↓
TEST
  ↓
RECORD
  ↓
HAND OFF
```

---

## 2. Detailed Phase Breakdown

### Step 1: READ (Bootstrap Context)
Before performing any action, bootstrap your understanding of repository reality:
1. Run `git status` or call MCP `get_git_status`.
2. Call MCP `get_context_snapshot()` or run `npm run context:snapshot`.
3. Inspect `STATE.md` to see the current phase, status, and active objective.
4. Inspect `ACTIVE-WORK.md` to check what other agents are doing.
5. Check `.project-context/handoffs/` for the latest incoming handoff.

### Step 2: UNDERSTAND (Inspect Source & Invariants)
1. Read relevant code files in `frontend/`, `backend/`, or `supabase/`.
2. Inspect `ARCHITECTURE.md` to understand component boundaries and architectural invariants.
3. Review `DECISIONS.md` to avoid re-litigating previous architectural decisions.

### Step 3: PLAN (Register Active Work)
1. Formulate a discrete, atomic implementation plan.
2. If working on a new task, register or select it in `TASKS.md`.
3. Create or update your dedicated active-work file:
   `.project-context/active-work/<your-agent-name>.md`
   Declare your active task, objective, and files you will modify.
4. Call `update_active_work` or run `npm run context:active-work`.

### Step 4: EXECUTE (Targeted Implementation)
1. Make targeted, robust source code changes.
2. Avoid touching files owned or locked by concurrent active agents.
3. Never store credentials, API keys, or secrets in code or context.

### Step 5: TEST (Verification & Regression)
1. Run relevant automated test suites.
2. For frontend modifications, verify compilation:
   ```bash
   cd frontend && npm run build
   ```
3. For Context OS modifications, run:
   ```bash
   npm test
   npm run context:validate
   ```
4. Never proceed without verifying that your changes pass tests.

### Step 6: RECORD (Semantic Audit Log)
1. Record an entry in `CHANGELOG.md` detailing:
   - WHAT changed
   - WHY it changed
   - Behavioral and architectural impact
   - Tests run
2. Update task status in `TASKS.md` (e.g. `IN_PROGRESS` -> `COMPLETED`).
3. Update `STATE.md` with the new timestamp and current status.

### Step 7: HAND OFF (Session Transition)
1. If another agent or human session will continue the work, generate an immutable handoff:
   ```bash
   npm run context:handoff -- --to <agent> --task "<task>" --next "<action>"
   ```
   Or invoke the MCP write tool `create_handoff`.
2. Never overwrite historical handoff records.
3. Refresh the repository knowledge graph:
   ```bash
   graphify update .
   ```
