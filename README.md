# @project-context/core

**Universal Project Context OS — Portable, repository-local multi-agent context and MCP server.**

Project Context OS establishes the Git repository itself as the authoritative canonical source of truth for collaborating AI coding agents and human engineers. It provides zero-cloud context storage, automated agent handoffs, deterministic intelligence diagnostics, and an official Model Context Protocol (MCP) server.

---

## Installation

### In Any Software Repository:

`ash
npm install --save-dev @project-context/core
`

Or install globally:

`ash
npm install -g @project-context/core
`

---

## Quick Start

### 1. Initialize Context Store in Your Project

Run in your project root:

`ash
npx project-context init --name MyProject
`

This scaffolds the pristine, domain-neutral .project-context/ directory:
- config.json — Project identity & custom invariants
- STATE.md — Authoritative status and current milestone
- TASKS.md — Project task board with acceptance criteria
- ARCHITECTURE.md — Component boundaries & system architecture
- DECISIONS.md — Architectural Decision Records (ADRs)
- CHANGELOG.md — Semantic changelog (WHAT & WHY)
- ACTIVE-WORK.md — Compiled view of active sessions
- ctive-work/ — Isolated per-agent session descriptors
- handoffs/ — Immutable, write-once agent handoff records
- AGENTS.md — Universal 7-step operating protocol
- .vscode/mcp.json — Automatic MCP discovery config

### 2. Check Diagnostics

`ash
npx project-context doctor
`

Runs comprehensive environment, schema, and repository checks.

### 3. Agent Bootstrap

`ash
npx project-context bootstrap --agent antigravity
`

Delivers complete Hot Context briefing (reality, tasks, incoming handoff, Git ground truth).

### 4. Connect via Model Context Protocol (MCP)

Launch the STDIO MCP server directly:

`ash
npx project-context mcp
`

Or configure your AI editor/IDE (Cursor, Claude Desktop, Kilo Code, Antigravity):

`json
{
  mcpServers: {
    project-context: {
      command: npx,
      args: [@project-context/core, mcp],
      env: {
        PROJECT_CONTEXT_ROOT: "
 }
 }
 }
}
`

Exposes 29 official MCP tools across context retrieval, task management, session registration, quality diagnostics, drift detection, and automated handoffs.

---

## License

MIT
