# Project Context OS — Capabilities & Support Matrix

This matrix documents the verification and support status of capabilities across **Project Context OS v5.0.0 (`@project-context/core`)**.

---

## Status Definitions

* **VERIFIED**: Fully implemented, backed by dedicated automated tests, and verified in real repository workflows.
* **SUPPORTED**: Designed and operational in production; standard supported functionality.
* **FALLBACK**: Operational alternative provided for environments lacking specific native protocols.
* **NOT SUPPORTED**: Intentionally or technologically unsupported in the current architecture.
* **FUTURE**: Planned for a future major release; intentionally omitted from v5.0.0 to avoid speculative complexity.

---

## Capabilities Matrix

| Area | Capability | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Core Context** | Repository-local Markdown storage | **VERIFIED** | `.project-context/` store tested across 760 core and 159 MCP assertions. |
| **Core Context** | Immutable Handoffs | **VERIFIED** | Write-once enforcement, directory traversal protection. |
| **Core Context** | Per-agent active work tracking | **VERIFIED** | Isolated files in `active-work/<agent>.md`, compiled in `ACTIVE-WORK.md`. |
| **Core Context** | Anti-credential scanner | **VERIFIED** | Regex scanning blocks API keys, bearer tokens, private keys. |
| **Core Context** | Hot Context Snapshot | **VERIFIED** | Compact Hot Context briefing under 50 lines / ~1,100 tokens with harmonized Graphify pointers. |
| **MCP Integration** | Official STDIO MCP Server | **VERIFIED** | Built on official `@modelcontextprotocol/sdk`; 29 official tools. |
| **MCP Integration** | Portable MCP invocation | **VERIFIED** | `npx @project-context/core mcp` works in arbitrary repositories. |
| **MCP Integration** | Claude Desktop / Cursor / Kilo | **SUPPORTED** | Tested via standard JSON client configurations. |
| **MCP Integration** | Direct ChatGPT web local STDIO | **NOT SUPPORTED** | ChatGPT web cannot connect directly to local STDIO without a network bridge. |
| **ChatGPT Workflow** | Remote MCP Adapter (`@project-context/adapter-chatgpt`) | **VERIFIED** | Frozen 8 read-only tools, No-Auth Streamable HTTP, verified by 159 loopback assertions. |
| **ChatGPT Workflow** | Compact Snapshot Fallback | **FALLBACK** | Paste `project-context snapshot` into chat; ADR-007 tested. |
| **Intelligence** | 6-Pillar Quality Diagnostic | **VERIFIED** | Evaluates Freshness, Completeness, Consistency, Integrity, Activity, Recoverability. |
| **Intelligence** | Deterministic Relevance Engine | **VERIFIED** | Tokenized keyword overlap & path discovery without vector DBs or external APIs. |
| **Intelligence** | Git ↔ Context Drift Detector | **VERIFIED** | Detects untracked modifications and lingering files from completed tasks. |
| **Intelligence** | Invariant Guard | **VERIFIED** | Configurable via `config.json` (`protectedTables`, `isolatedPackages`). |
| **Multi-Model** | 4-Dimensional Identity Model | **VERIFIED** | Separates `Agent`, `Interface`, `Router`, and `Model`. |
| **Multi-Model** | Model Switching (OmniRoute) | **VERIFIED** | Tested handoff from Gemini 3.8 Flash to Claude 3.7 Sonnet with 100% state recovery. |
| **Portability** | Dynamic Root Discovery | **VERIFIED** | Traverses upward to find `.project-context` or `.git`. |
| **Portability** | Path Jailing Security | **VERIFIED** | Blocks `../`, `../../..`, absolute paths with `PATH_TRAVERSAL_DETECTED`. |
| **Portability** | Clean-room external project | **VERIFIED** | Tested in AcadOS, CleanEnterpriseApp, and clean-room tarball distribution gates. |
| **Portability** | Multi-project isolation | **VERIFIED** | Adversarial suite Section 1 proves zero token or path leakage between `project-12` and `project-19`. |
| **Git Integration** | Working tree status & diffs | **VERIFIED** | Reads branch, staged, unstaged, untracked changes locally. |
| **Git Integration** | Zero-commit fresh repositories | **VERIFIED** | Safely resolves unborn branch and detects untracked files without throwing. |
| **Structural Context (5B)** | External Graphify Bridge | **VERIFIED** | Read-only inspection of `graphify-out/graph.json` across `AVAILABLE`, `MISSING`, `STALE`, and `INVALID` states. |
| **Context Fusion (5C)** | Dual-Source Progressive Retrieval | **VERIFIED** | Fuses semantic truth (`.project-context/`) with structural 1-hop AST neighbors (`graphify-out/`). |
| **Context Health (5D)** | Unified Diagnostic & Snapshot Harmonization | **VERIFIED** | Consolidated health diagnostics and bounded Graphify metadata in snapshots without raw AST leakage. |
| **Context Recovery (5E)** | Non-Destructive Reconciliation | **VERIFIED** | `reconcileContext` safely reconstructs missing canonical files without truncating user data. |
| **Coordination (5F)** | Multi-Agent Working-Area Collisions | **VERIFIED** | Exact taxonomy (`EXACT`, `CONTAINMENT_DIR_FILE`, `CONTAINMENT_DIR_DIR`, `DISJOINT`) and read-only diagnostics. |
| **Coordination (5F)** | Liveness vs. Crash Distinction | **VERIFIED** | Separates idle duration (`ACTIVE`, `ACTIVE_BUT_IDLE`, `STALE`, `ABANDONED`) from uncommitted crash state. |
| **Distribution (5G)** | Standalone npm tarball & Clean-Room Release | **VERIFIED** | Tarball packaging (28 whitelisted files, 254 kB) verified via automated clean-room install and MCP test. |
| **Distribution** | Public npm publication | **FUTURE** | Requires package ownership, organization, and CI pipeline setup. |
| **Lifecycle** | Backward-compatible v3/v4 discovery | **SUPPORTED** | Automatically provides fallback defaults when `config.json` is absent. |
