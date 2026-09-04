# Project Context OS v5.0.0

**Project Context OS (`@project-context/core`)** is a portable, vendor-neutral, repository-local context, progressive fusion, and multi-agent coordination infrastructure layer for software projects worked on by multiple AI agents and human engineers.

---

## The Problem

When multiple coding agents (Antigravity, Claude, ChatGPT, Codex, Cursor, Kilo Code, etc.) collaborate on a software codebase, every session switch forces the human operator to manually re-explain:
* What is the current project status and milestone?
* What architectural decisions (ADRs) were made?
* What was the previous agent working on?
* What remains unfinished or blocked?
* What changes were actually verified with tests?

External cloud databases introduce network dependencies, latency, secret management, cost, and vendor lock-in.

---

## The Solution

Project Context OS establishes the **Git repository itself** as the canonical source of truth:
1. **Repository-Local Markdown State** (`.project-context/`): Human-readable, Git-diffable, merge-friendly documents as the authoritative semantic source of truth.
2. **External Structural Bridge & Context Fusion** (`graphify-out/`): Read-only integration with Graphify code dependency graphs; dual-source progressive context fusion combines semantic and structural reality.
3. **Universal Operating Protocol** (`AGENTS.md`): Strict 7-step lifecycle (`READ -> UNDERSTAND -> PLAN -> EXECUTE -> TEST -> RECORD -> HAND OFF`) with collision avoidance.
4. **Universal CLI Tooling** (`project-context`): Instant queries, health diagnostics, drift audits, and lifecycle commands.
5. **Official MCP Server** (`@modelcontextprotocol/sdk`): Exposes **29 official tools** over STDIO JSON-RPC.
6. **Multi-Agent Concurrency & Collision Diagnostics**: Isolated per-agent descriptors (`active-work/<agent>.md`) with deterministic working-area collision detection.
7. **Immutable Handoffs** (`handoffs/`): Permanent, write-once handoff records ensuring historical auditability.
8. **Context-Aware Smart Bootstrap & Harmonized Snapshots**: Compact Hot Context briefings (~1,100 tokens) with bounded structural pointers.
9. **Dynamic Root Resolution & Path Jailing**: Upward root discovery with directory traversal protection.
10. **Multi-Model Interoperability**: 4-dimensional identity separation (`Agent`, `Interface`, `Router`, `Model`) enabling seamless model switching (e.g. Gemini -> Claude via OmniRoute).

---

## Quick Start

### In Any Software Repository:

```bash
# 1. Install package
npm install --save-dev @project-context/core

# 2. Initialize context store
npx project-context init --name "MyProject"

# 3. Verify health & unified diagnostics
npx project-context doctor
npx project-context diagnostics

# 4. Agent bootstrap
npx project-context bootstrap --agent "antigravity"

# 5. Launch MCP server
npx project-context mcp
```

### Core Verification & Inspection:

```bash
npx project-context state              # View project snapshot
npx project-context bootstrap          # Receive hot context briefing
npx project-context health             # Assess 6-pillar context quality (0-100%)
npx project-context validate           # Run integrity validator & secret scanner
npx project-context diagnostics        # Export machine-readable operational diagnostics
npm test                               # Run complete automated test suite (760 assertions)
```

---

## Universal MCP Client Configuration

To connect any Model Context Protocol compatible client (Claude Desktop, Cursor, Kilo Code, Antigravity):

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

---

## Documentation Index

* [Operational Handoff Manual](OPERATIONAL-HANDOFF.md): Primary operational manual for engineers and agents.
* [Product Freeze Specification](PRODUCT-FREEZE.md): v4.0.0 boundary, stable surfaces, and explicit non-goals.
* [Agent Operating Protocol](AGENT-OPERATING-PROTOCOL.md): Daily 7-step practical lifecycle protocol for AI agents.
* [Human Operations Guide](HUMAN-OPERATIONS.md): Day-to-day workflow, model switching, and troubleshooting.
* [Product Freeze Checklist](PRODUCT-FREEZE-CHECKLIST.md): Certification and release sign-offs.
* [Getting Started Guide](GETTING-STARTED.md): Practical 10-step first-use workflow and model configuration.
* [Maintainer Guide](MAINTAINER-GUIDE.md): Architecture invariants, packaging, test standards, and release engineering.
* [Architecture Specification](architecture.md): Dual-architecture isolation, universal core boundary, and invariants.
* [MCP Tools Guide](mcp-tools.md): Complete specification of all 29 MCP tools (14 read tools, 15 write/lifecycle tools).
* [Capabilities & Support Matrix](capabilities-matrix.md): Status of features (VERIFIED, SUPPORTED, FALLBACK, NOT SUPPORTED, FUTURE).
* [Operating Protocol](operating-protocol.md): The universal 7-step agent lifecycle protocol.
* [Context Schemas](context-schema.md): Data models, frontmatter definitions, and task status enums.
* [Agent Handoffs Guide](agent-handoffs.md): Conventions, immutability rules, and assisted handoff workflows.
* [Migration from Agent Bridge](migration-from-agent-bridge.md): Architectural separation from legacy Supabase Agent Bridge.
