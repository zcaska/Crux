# Project Context OS — Capabilities & Support Matrix

This matrix documents the verification and support status of capabilities across **Project Context OS v4.0.0 (`@project-context/core`)**.

---

## Status Definitions

* **VERIFIED**: Fully implemented, backed by dedicated automated tests, and verified in real repository workflows.
* **SUPPORTED**: Designed and operational in production; standard supported functionality.
* **FALLBACK**: Operational alternative provided for environments lacking specific native protocols.
* **NOT SUPPORTED**: Intentionally or technologically unsupported in the current architecture.
* **FUTURE**: Planned for a future major release; intentionally omitted from v4.0.0 to avoid speculative complexity.

---

## Capabilities Matrix

| Area | Capability | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Core Context** | Repository-local Markdown storage | **VERIFIED** | `.project-context/` store tested across 289 automated assertions. |
| **Core Context** | Immutable Handoffs | **VERIFIED** | Write-once enforcement, directory traversal protection. |
| **Core Context** | Per-agent active work tracking | **VERIFIED** | Isolated files in `active-work/<agent>.md`, compiled in `ACTIVE-WORK.md`. |
| **Core Context** | Anti-credential scanner | **VERIFIED** | Regex scanning blocks API keys, bearer tokens, private keys. |
| **Core Context** | Hot Context Snapshot | **VERIFIED** | Compact Hot Context briefing under 50 lines / ~1,100 tokens. |
| **MCP Integration** | Official STDIO MCP Server | **VERIFIED** | Built on official `@modelcontextprotocol/sdk`; 29 official tools. |
| **MCP Integration** | Portable MCP invocation | **VERIFIED** | `npx @project-context/core mcp` works in arbitrary repositories. |
| **MCP Integration** | Claude Desktop / Cursor / Kilo | **SUPPORTED** | Tested via standard JSON client configurations. |
| **MCP Integration** | Direct ChatGPT web local STDIO | **NOT SUPPORTED** | ChatGPT web cannot connect directly to local STDIO without a network bridge. |
| **ChatGPT Workflow** | Compact Snapshot Fallback | **FALLBACK** | Paste `project-context snapshot` into chat; ADR-007 tested. |
| **Intelligence** | 6-Pillar Quality Diagnostic | **VERIFIED** | Evaluates Freshness, Completeness, Consistency, Integrity, Activity, Recoverability. |
| **Intelligence** | Deterministic Relevance Engine | **VERIFIED** | Tokenized keyword overlap & path discovery without vector DBs or external APIs. |
| **Intelligence** | Git ↔ Context Drift Detector | **VERIFIED** | Detects untracked modifications and lingering files from completed tasks. |
| **Intelligence** | Invariant Guard | **VERIFIED** | Configurable via `config.json` (`protectedTables`, `isolatedPackages`). |
| **Multi-Model** | 4-Dimensional Identity Model | **VERIFIED** | Separates `Agent`, `Interface`, `Router`, and `Model`. |
| **Multi-Model** | Model Switching (OmniRoute) | **VERIFIED** | Tested handoff from Gemini 3.8 Flash to Claude 3.7 Sonnet with 100% state recovery. |
| **Portability** | Dynamic Root Discovery | **VERIFIED** | Traverses upward to find `.project-context` or `.git`. |
| **Portability** | Path Jailing Security | **VERIFIED** | Blocks `../`, `../../..`, absolute paths with `PATH_TRAVERSAL_DETECTED`. |
| **Portability** | Clean-room external project | **VERIFIED** | Tested in AcadOS and synthetic ReleaseTestProject. |
| **Portability** | Two-project isolation | **VERIFIED** | 42/42 assertions passed across all 11 dimensions. |
| **Git Integration** | Working tree status & diffs | **VERIFIED** | Reads branch, staged, unstaged, untracked changes locally. |
| **Git Integration** | Zero-commit fresh repositories | **VERIFIED** | Safely resolves unborn branch and detects untracked files without throwing. |
| **Distribution** | Standalone npm tarball | **SUPPORTED** | `npm pack` generates clean tarball (27 files, 203 kB) with zero test leakage. |
| **Distribution** | Public npm publication | **FUTURE** | Requires package ownership, organization, and CI pipeline setup. |
| **Lifecycle** | Backward-compatible v3 discovery | **SUPPORTED** | Automatically provides fallback defaults when `config.json` is absent. |
| **Lifecycle** | Breaking Schema Migration Engine | **FUTURE** | Reserved for future major version when breaking schema transformations exist. |
