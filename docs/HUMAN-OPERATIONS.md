# Project Context OS — Human Operations Guide

This guide is for human developers and engineers using **Project Context OS** in daily development. It explains what to do in practical terms without requiring knowledge of internal mechanics.

---

## 1. Opening a Project (Starting Work)

When you open a repository that uses Project Context OS:

1. **Check System Health**: Run a quick diagnostic in your terminal:
   ```bash
   npx project-context doctor
   ```
   This confirms your Git repository is detected, `.project-context/` is intact, and no integrity issues exist.
2. **View Current Project Status**:
   ```bash
   npx project-context state
   ```
   This shows the active phase, overall status, current objective, and the last agent that modified the codebase.
3. **Launch Your Coding Agent**:
   Open Antigravity, Cursor, or Kilo Code. With MCP configured in `.vscode/mcp.json` or `.kilo/mcp.json`, the agent connects automatically.

---

## 2. Starting a New Conversation (Cold Recovery)

When you start a brand new conversation with an AI coding agent:

* **What the Agent Does**: The agent runs `bootstrap_context` (or `npx project-context bootstrap --agent <name>`).
* **What You Need to Say**: You do **not** need to paste past chat logs, summarize the codebase, or explain recent progress. Simply tell the agent what you want to work on, or prompt:
  > *"Bootstrap project context and report the next step."*
* **The Result**: The agent automatically identifies the current project reality, the latest handoff, and the exact next action.

---

## 3. Switching Coding Agents (e.g. Antigravity -> Claude -> Cursor)

When moving from one tool to another (e.g. from Antigravity to Claude Desktop or Cursor):

1. **Before Leaving the First Agent**:
   Ask the agent to conclude its session:
   > *"Conclude your session and create a handoff for the next agent."*
   The agent records its changes in `CHANGELOG.md`, transitions its active work to `COMPLETED`, and writes an immutable handoff into `.project-context/handoffs/`.
2. **Opening the Second Agent**:
   Simply prompt the new agent:
   > *"Bootstrap project context and continue from the latest handoff."*
   The new agent reads the handoff, claims the task, and resumes execution seamlessly (**H0 autonomous recovery**).

---

## 4. Switching Models via OmniRoute (e.g. Gemini -> Claude 3.7)

If you use OmniRoute as a model router:

* **OmniRoute's Role**: OmniRoute acts purely as a routing gateway between your IDE interface and model providers. It is **not** an agent and does **not** store context.
* **Context Persistence**: All context lives locally in `.project-context/` inside the Git repository.
* **Switching Models**: When you switch from Gemini 3.8 Flash to Claude 3.7 Sonnet in your router:
  1. No state is lost.
  2. The next agent session automatically records its model in its session descriptor (`active-work/<agent>.md`).
  3. Context remains 100% durable and identical.

---

## 5. Asking ChatGPT for Architecture or Planning (Snapshot Fallback)

Direct local STDIO MCP is not supported in the ChatGPT Web interface because browser sandboxes cannot access local operating system processes.

Use the official **Compact Snapshot Workflow**:

1. **Generate a Snapshot**:
   ```bash
   npx project-context snapshot
   ```
2. **Copy the Output**: The command produces a compact Markdown briefing (< 45 lines, ~1,100 tokens) summarizing project reality, active tasks, uncommitted files, and recent decisions.
3. **Paste into ChatGPT**: Paste the snippet into ChatGPT Web with your architectural question:
   > *"Here is my repository's Hot Context. Review our active tasks and provide an architectural recommendation for..."*
4. **Bring Decisions Back to the Project**:
   When ChatGPT provides a design or decision, ask your local agent (Antigravity or Kilo Code) or run:
   ```bash
   npx project-context decisions
   ```
   Record the decision as an ADR in `.project-context/DECISIONS.md`.

---

## 6. Ending a Work Session

Before closing your editor or ending your work day:

1. **Ask the Agent to Conclude**:
   > *"Please finish your current task, run tests, update active work, and create a handoff."*
2. **Verify Context Consistency**:
   ```bash
   npx project-context check-consistency
   ```
   This verifies there are no orphaned tasks, unstaged changes attributed to completed work, or uncommitted files.
3. **Commit Your Code**:
   ```bash
   git add .
   git commit -m "feat(scope): completed task and updated context"
   ```
   Because `.project-context/` is committed to Git, your entire project memory travels with the repository.

---

## 7. Diagnosing Problems & Troubleshooting

If an agent seems confused, reports conflicting tasks, or context seems stale, run these diagnostic commands in order:

```bash
# 1. Comprehensive environment & directory audit
npx project-context doctor

# 2. Schema integrity, task status enum, and credential leak scanner
npx project-context validate

# 3. 6-pillar quality assessment & health score (0-100%)
npx project-context health

# 4. Check for active session collisions or lingering files
npx project-context check-consistency

# 5. Check Git <-> Context semantic drift
npx project-context drift
```

### What Each Diagnostic Tells You:
* **`doctor`**: Verifies that `.project-context/` exists, all 7 core files are present, Git is functioning, and MCP tools are ready.
* **`validate`**: Ensures markdown frontmatter is valid YAML, no API secrets (`sk-`, `ghp_`) were committed, and task statuses use approved values.
* **`health`**: Scores project health across Freshness, Completeness, Consistency, Integrity, Activity, and Recoverability.
* **`check-consistency`**: Detects if an agent completed a task but left uncommitted files or didn't generate a handoff.
* **`drift`**: Reveals files modified in Git that are not mentioned in any active session or changelog entry.
