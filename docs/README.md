# Project Context OS v4.0.0

**Project Context OS (`@project-context/core`)** is a portable, vendor-neutral, repository-local context and agent-handoff infrastructure layer for software projects worked on by multiple AI agents and human engineers.

---

## The Problem

When multiple coding agents (Antigravity, Claude, ChatGPT, Codex, Cursor, Kilo Code, etc.) collaborate on a software codebase, every session switch forces the human operator to manually re-explain:
* What is the current project status and milestone?
* What architectural decisions (ADRs) were made?
* What was the previous agent working on?
* What remains unfinished or blocked?
* What changes were actually verified with tests?

External cloud databases (such as Supabase, Firestore, or proprietary platforms) introduce network dependencies, latency, secret management, cost, and vendor lock-in.

---

## The Solution

Project Context OS establishes the **Git repository itself** as the canonical source of truth:
1. **Repository-Local Markdown State** (`.project-context/`): Human-readable, Git-diffable, merge-friendly documents.
2. **Universal Operating Protocol** (`AGENTS.md`): Strict 7-step lifecycle (`READ -> UNDERSTAND -> PLAN -> EXECUTE -> TEST -> RECORD -> HAND OFF`).
3. **Universal CLI Tooling** (`project-context`): Instant queries, doctor diagnostics, and lifecycle commands.
4. **Official MCP Server** (`@modelcontextprotocol/sdk`): Exposes **29 official tools** over STDIO JSON-RPC.
5. **Multi-Agent Concurrency**: Per-agent active work tracking (`active-work/<agent>.md`) preventing concurrent overwrite collisions.
6. **Immutable Handoffs** (`handoffs/`): Permanent, write-once handoff records ensuring historical auditability.
7. **Context-Aware Smart Bootstrap**: Compact Hot Context briefings (~1,100 tokens) providing an 83%+ reduction in context overhead.
8. **Dynamic Root Resolution & Path Jailing**: Upward root discovery with directory traversal protection.
9. **Multi-Model Interoperability**: 4-dimensional identity separation (`Agent`, `Interface`, `Router`, `Model`) enabling seamless model switching (e.g. Gemini -> Claude via OmniRoute).

---

## Quick Start

### In Any Software Repository (Standalone):

```bash
# 1. Install package
npm install --save-dev @project-context/core

# 2. Initialize context store
npx project-context init --name "MyProject"

# 3. Verify health
npx project-context doctor

# 4. Agent bootstrap
npx project-context bootstrap --agent "antigravity"

# 5. Launch MCP server
npx project-context mcp
```

### In CareerOS Repository:

```bash
npm run context:state        # View project snapshot
npm run context:bootstrap    # Receive hot context briefing
npm run context:health       # Assess 6-pillar context quality (0-100%)
npm run context:validate     # Run integrity validator & secret scanner
npm run context:handoff      # Generate an immutable agent handoff
npm test                     # Run complete automated test suite
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
