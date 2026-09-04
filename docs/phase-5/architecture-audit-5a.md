# Phase 5A Architecture Audit: Project Identity & Lifecycle Model

**Specialist**: Architecture Specialist  
**Target Subsystem**: Core Identity (`src/config.js`), Lifecycle & Initializer (`src/init.js`), Root Resolution & Jailing (`src/locator.js`)  
**Status**: AUDIT COMPLETE / RECOMMENDATIONS AUTHORITATIVE  
**Date**: 2026-09-04  

---

## 1. Context & Architectural Mandate

In Crux Phase 5, the architectural principle is **STRICT PROJECT LOCALITY**:
- Crux is a project-local runtime. One Crux runtime operates against one canonical project root.
- There is **NO** global multi-project registry, no centralized context database, no automatic sibling-project scanning, and no LLM-selected project switching.
- Project boundaries must be enforced deterministically by the runtime, not guessed by the model.

---

## 2. Forensic Audit of Phase 5A Capabilities

### A. Canonical Project Root
- **Mechanism**: `resolveProjectRoot(startDir = process.cwd(), explicitRoot = null)` in `src/locator.js`.
- **Precedence Order**:
  1. Explicit caller parameter (`explicitRoot`) — supplied at process startup via CLI `--root`.
  2. Environment variable (`PROJECT_CONTEXT_ROOT`).
  3. Upward traversal from `startDir` searching for `.project-context` directory.
  4. Upward traversal from `startDir` searching for `.git` directory.
  5. Fallback to `startDir`.
- **Security Boundary Verification**:
  - Remote MCP tool calls (`integrations/chatgpt/`) bind the project root **once at server initialization time**. Remote calls cannot supply an untrusted `projectRoot` parameter to override the server's jailed root.
  - Sibling directory traversal (`../../`) is forbidden and arrested by `assertWithinProject`.
- **Audit Verdict**: Mechanically sound and secure.

### B. Stable Project Identity Model
- **Current State**:
  - `src/config.js` uses `path.basename(rootDir)` fallback for `project_id` and `project_name` when `config.json` does not exist.
  - When written, `config.json` stores:
    ```json
    {
      "schema_version": "1.0.0",
      "project_id": "careeros",
      "project_name": "CareerOS",
      "description": "AI-Powered Career & Job Hunting Platform",
      "created_at": "...",
      "invariants": {}
    }
    ```
- **Evaluation of Identity Source**:
  - *Absolute path as identity*: **FLAWED**. Moving a repository from `C:\Projects\A` to `D:\Work\A` or cloning on another developer machine would break identity if tied to the absolute path string.
  - *Global UUID infrastructure*: **UNNECESSARY COMPLEXITY** and introduces state sync problems across git branches/clones.
  - *Authoritative Solution*: **DURABLE PROJECT IDENTITY STORED IN `.project-context/config.json`**.
    - Once initialized, `config.json` is checked into version control alongside the repository.
    - `project_id` is a stable slugified identifier (e.g. `careeros`, `project-12`).
    - Moving the directory from `C:\Projects\A` to `D:\Work\A` retains `project_id` and `project_name` precisely because they are read from `.project-context/config.json`.
- **Relocation Behavior**:
  - If a repo is moved to another directory or drive, `resolveProjectRoot()` correctly resolves the *new* filesystem location, while `readProjectConfig()` continues to return the *same* persistent `project_id`.
  - Identity does not depend on absolute path strings.

### C. Context Lifecycle States & Initialization Modes
The system must support:
- **States**:
  - `NEW`: `.project-context/` directory does not exist.
  - `EXISTING`: `.project-context/` exists with all canonical files present.
  - `INCONSISTENT`: `.project-context/` exists, but is missing some canonical files or directories.
  - `INVALID`: `.project-context` exists as a non-directory file, is unreadable, or contains unparseable critical frontmatter.
- **Modes in `initProjectContext(rootDir, options = {})`**:
  - `create`:
    - If context missing -> creates it (`lifecycleState: "NEW"`).
    - If context already exists -> fails with `CONTEXT_ALREADY_EXISTS`.
    - Non-destructive: must never silently overwrite.
  - `adopt`:
    - If context exists -> adopts it, reconciles missing files non-destructively, preserves all existing user content (`lifecycleState: "EXISTING"` or `"RECONCILED"`).
    - If context missing -> fails with `CONTEXT_NOT_FOUND`.
    - Must not create an unexpected context in a bare directory.
  - `auto` (default):
    - If context missing -> creates it (`NEW`).
    - If context exists and valid -> adopts it (`EXISTING`).
    - If context exists but partial -> reconciles missing template files while preserving 100% of existing user files (`RECONCILED` / `INCONSISTENT`).
    - If context invalid -> fails with `CONTEXT_INVALID_STATE` or `ContextIntegrityError`.

### D. Non-Destructive Adoption Guarantees
- Existing context files must **NEVER** be overwritten during normal initialization or adoption.
- In `src/init.js`, `writeTemplate` checks `if (!fs.existsSync(fullPath) || options.force)`.
- If the file exists, it is added to `preservedFiles` and left completely untouched.
- `options.force = true` is strictly reserved for deliberate administrative rewrites and is never enabled by default.

---

## 3. Recommended Core Specialist Actions for Phase 5A

1. **Explicit Lifecycle State in `initProjectContext` & `config.js`**:
   - Verify that `initProjectContext` returns structured lifecycle info:
     ```javascript
     {
       initialized: true,
       isNew: boolean,
       lifecycleState: 'NEW' | 'EXISTING' | 'RECONCILED',
       modeRequested: 'auto' | 'create' | 'adopt',
       createdFiles: string[],
       preservedFiles: string[],
       project: {
         id: string,
         name: string,
         root: string,
         contextDir: string
       }
     }
     ```
2. **Deterministic Context Status Inspector**:
   - Provide a dedicated inspector function `inspectContextLifecycle(rootDir)`:
     - Returns `{ state: 'NEW' | 'EXISTING' | 'INCONSISTENT' | 'INVALID', contextDir, missingFiles, corruptFiles }`.
     - Allows `initProjectContext`, `doctor`, and CLI to classify existing context prior to executing actions.
3. **CLI Support**:
   - Ensure CLI `project-context init` accepts `--mode <auto|create|adopt>` in addition to `--force`, `--name`, and `--root`.
4. **Relocation & Idempotency Testing**:
   - QA must test moving a project folder and verifying that `getProjectIdentity()` yields the same `id` and `name` without data loss or path corruption.
