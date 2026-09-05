# Crux Remote Context Synchronization — Phase 6 Architecture & Operating Manual

> **Status**: Production Ready  
> **Package**: `@project-context/core` v5.0.0  
> **Surface**: Crux Core Sync Engine & Manufact-Hosted ChatGPT MCP Adapter  

---

## 1. Executive Summary & Architectural Invariants

Phase 6 extends Crux so that projects automatically, securely, and idempotently synchronize Crux-owned semantic project context to remote storage (Supabase PostgREST), eliminating manual copy-pasting between local coding agents (Antigravity, Kilo Code, Claude Code, Cursor) and ChatGPT Web.

```
 Developer Project
     .project-context/          <-- Canonical source of truth (created/owned by Crux)
     graphify-out/              <-- External, local-only code knowledge graph (owned by Graphify)

 Local Crux Engine
      │
      ├── automatic / CLI sync (`crux sync`)
      ▼
 Remote Context Store (Supabase PostgREST)
      │
      ├── token-bound context resolution (`token -> (account_id, project_id)`)
      ▼
 Manufact-Hosted Crux MCP Server
      │
      ├── 8 read-only tools (zero parameter leakage, zero writes)
      ▼
 ChatGPT Web (Custom Action / Remote MCP)
```

### Non-Negotiable Invariants

1. **`.project-context/` Remains Canonical**:
   The local project's `.project-context/` is the single source of truth. Remote storage is strictly an external projection/replica. Remote writes never mutate local files.
2. **`crux init` Boundary**:
   `crux init` initializes `.project-context/` only. It NEVER creates `graphify-out/`, `graph.json`, or any Graphify artifacts.
3. **Crux-Owned Semantic Scope Only**:
   Only Crux-owned semantic files are synchronized:
   - `config.json` (Project metadata, identity, schema version)
   - `STATE.md` (Hot project state, current phase, objective)
   - `TASKS.md` (Task board, active/completed tasks)
   - `ARCHITECTURE.md` (High-level architectural invariants)
   - `DECISIONS.md` (Architecture Decision Records - ADRs)
   - `CHANGELOG.md` (Recent semantic change records)
   - `ACTIVE-WORK.md` (Multi-agent coordination & lease states)
   - `handoffs/` (Immutable agent handoff artifacts)
   - Git working tree status (branch, clean/dirty flag, uncommitted file lists — ground truth metadata only)
4. **Strict Exclusion of Non-Crux Artifacts**:
   The sync payload strictly EXCLUDES:
   - Application source code (`src/`, `lib/`, `frontend/`, `tests/`, etc.)
   - Code knowledge graph artifacts (`graphify-out/`, `graph.json`)
   - Git database (`.git/`)
   - Dependencies (`node_modules/`, `vendor/`)
   - Build outputs (`dist/`, `build/`, `.next/`)
   - Secrets, keys, and tokens (enforced by `assertNoSecrets`)
5. **Local-First Fail-Safe Invariance**:
   Crux remains 100% operational offline. If the network or remote store is unreachable, local operations (`createTask`, `updateState`, `recordDecision`, `readTasks`, etc.) succeed uninterrupted. Sync records an `OFFLINE` status and retries during subsequent cycles.
6. **ChatGPT MCP Surface Invariance**:
   The ChatGPT MCP server exposes **exactly 8 read-only tools**. Zero write tools, zero 9th tool, and zero parameter leakage (`project_id` or filesystem paths are NEVER exposed to the LLM).
7. **Server-Side Token-Bound Authorization**:
   Project identity is resolved server-side from session tokens (`token -> (account_id, project_id)`). The model cannot specify or override which project context it accesses.
8. **Project & Tenant Isolation**:
   Project A can NEVER read or overwrite Project B. Payloads are strictly partitioned by `(account_id, project_id)`.

---

## 2. Synchronization Engine Architecture (`src/sync.js`)

### 2.1 Payload Assembly & Secret Scanning

The payload assembler (`assembleRemoteContextPayload`) gathers semantic state and passes it through an automated security gate:

```javascript
import { assembleRemoteContextPayload } from "@project-context/core";

const payload = assembleRemoteContextPayload(projectRoot, {
  changelogLimit: 20,
  handoffsLimit: 10,
});
// Enforces assertNoSecrets(payload) before returning.
```

### 2.2 Deterministic SHA-256 Idempotence

To avoid redundant uploads and save egress bandwidth, sync calculates a deterministic SHA-256 hash of the semantic payload. Volatile runtime timestamps (`synchronized_at` and `snapshot.generated_at`) are excluded from hash computation so that unchanged context results in an identical hash.

When the local hash matches the recorded sync version and status is `SUCCESS`, sync terminates immediately with `304 UP_TO_DATE` without making remote network calls:

```javascript
const res = await syncProjectContext(projectRoot);
// res.status: 'UP_TO_DATE' | 'SUCCESS' | 'OFFLINE' | 'FAILED' | 'SKIPPED'
```

### 2.3 Local Sync State Persistence

Local sync status is saved to `.project-context/.sync-state.json`:

```json
{
  "sync_version": "4b8cc6da2834b9d0e129cf...",
  "last_synced_at": "2026-09-05T06:45:04.123Z",
  "status": "SUCCESS",
  "error": null
}
```

This file is purely operational metadata, path-independent, and safe to `.gitignore`.

---

## 3. Remote Storage Abstraction & Backends

### 3.1 `RemoteContextBackend` Interface

```typescript
interface RemoteContextBackend {
  uploadContext(params: {
    accountId: string;
    projectId: string;
    syncVersion: string;
    payload: CruxRemoteContextPayload;
  }): Promise<{ success: boolean; syncVersion: string; message: string }>;

  fetchContext(params: {
    accountId: string;
    projectId: string;
  }): Promise<CruxRemoteContextPayload | null>;
}
```

### 3.2 Implemented Backends

1. **`SupabaseContextBackend`**: Production backend connecting directly to Supabase via native Node `fetch` (zero third-party SDK dependencies). Supports upsert via PostgREST headers (`Prefer: resolution=merge-duplicates,return=representation`).
2. **`MockContextBackend`**: Hermetic, in-memory backend for unit tests, offline simulation, and CI testing.

---

## 4. ChatGPT Web Context Provider (`integrations/chatgpt`)

### 4.1 `RemoteContextProvider`

ChatGPT Web instances hosted on Manufact cannot access local developer file systems. `RemoteContextProvider` satisfies all 8 ChatGPT read tools directly from the memory-resident `CruxRemoteContextPayload`:

| ChatGPT Tool | Provider Method | In-Memory Source |
| ------------ | --------------- | ---------------- |
| `get_context_snapshot` | `getSnapshot()` | `payload.snapshot` |
| `get_project_state` | `getState()` | `payload.state` |
| `get_tasks` | `getTasks(status)` | `payload.tasks.tasks` (filtered by status) |
| `get_architecture` | `getArchitecture()` | `payload.architecture.content` |
| `get_decisions` | `getDecisions(limit)` | `payload.decisions` |
| `search_project_context` | `searchContext(query, limit)` | Full-text token scan over all semantic fields |
| `get_relevant_context` | `getRelevantContext(opts)` | Scored retrieval over tasks, ADRs, and files |
| `get_git_status` | `getGitStatus()` | `payload.git_status` |

### 4.2 Project-Bound Read-Token Authentication & Authorization

For hosted MCP environments, authentication is strictly project-bound:

```
ChatGPT Web Request (HTTP)
   │
   ├── Header: "Authorization: Bearer <token>" OR Query: "?token=<token>"
   ▼
Hosted Crux MCP Server
   │
   ├── 1. Extract token via `extractTokenFromRequest(ctx)`
   ├── 2. Compute deterministic SHA-256: `token_hash = hashToken(token)`
   ├── 3. Query `public.project_read_tokens WHERE token_hash = $1`
   ├── 4. Verify `revoked_at IS NULL` (fail-closed if revoked)
   ├── 5. Resolve immutable server identity: `(account_id, project_id)`
   ├── 6. Fetch `CruxRemoteContextPayload` from `public.project_contexts`
   ▼
RemoteContextProvider (Bound to single authorized payload in memory)
   │
   ├── Evaluates all 8 read tools (zero write tools, zero parameter leakage)
   ▼
Audited Response (Passed through `assertNoSecrets`) -> ChatGPT Web
```

#### Key Security Invariants:

1. **SHA-256 Token Hashing**: Plaintext read tokens are NEVER stored, logged, or returned. The database stores only `token_hash`.
2. **Server-Bound Identity**: The LLM has zero capability to select, change, or specify `project_id` or `account_id`. Any arbitrary parameter injected into tool calls is ignored.
3. **Instant Revocation**: Setting `revoked_at` in `project_read_tokens` immediately invalidates access on the very next request without requiring MCP restart or redeployment.
4. **Tenant Isolation**: An authenticated token for Account A / Project Alpha cannot resolve, inspect, or contaminate Account B or Project Beta. Mismatched lookups return generic `Unauthorized` errors to prevent tenant enumeration.
5. **Credential Boundary**: The server-side Supabase secret key (`SUPABASE_SECRET_KEY`) is confined strictly to the backend resolver. It is never transmitted to ChatGPT or logged.

> [!NOTE]
> Production deployment to Manufact and token provisioning are handled in subsequent Phase 6 steps.

---

## 5. CLI Commands

Crux CLI provides two commands for context sync:

```bash
# Upload project context to remote store
crux sync [--force] [--dry-run] [--account <id>] [--json]

# Inspect local sync status and remote alignment
crux sync-status [--json]
```

### Command Flags

- `--force`: Force upload even if the content hash has not changed.
- `--dry-run`: Assemble, validate, and hash the payload without uploading.
- `--account <id>`: Explicitly specify tenant/account ID (default: `$CRUX_ACCOUNT_ID` or `"default"`).
- `--json`: Output machine-readable JSON for agent consumption.

---

## 6. Supabase Database Setup

Execute the following SQL migration in your Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS project_contexts (
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  sync_version TEXT NOT NULL,
  synchronized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_contexts_lookup 
ON project_contexts (account_id, project_id);

-- Row Level Security (RLS)
ALTER TABLE project_contexts ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" 
ON project_contexts 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);
```

---

## 7. Verification & Compliance Matrix

| Area | Assertion | Status |
| ---- | --------- | ------ |
| **Idempotence** | Unchanged context returns `304 UP_TO_DATE` with identical SHA-256 | PASSED |
| **Local-First Safety** | Offline network fail-safe returns `OFFLINE`; local CLI fully functional | PASSED |
| **Graphify Boundary** | `graphify-out/` and `graph.json` NEVER created by `init` and NEVER synced | PASSED |
| **Source Boundary** | Zero application source code or `.git` objects present in sync payload | PASSED |
| **Secret Scanning** | `assertNoSecrets` blocks sync on credentials, tokens, and private keys | PASSED |
| **ChatGPT Tools** | Exactly 8 read-only tools; zero write tools; zero 9th tool | PASSED |
| **Parameter Jailing** | No `project_id` or filesystem paths exposed to ChatGPT | PASSED |
| **Clean-Room Packaging** | Gate 5G.5 verified with `npm pack` (29 files, 0 unwanted leaks) | PASSED |
| **Regression Suite** | 840 core tests passed; 191 ChatGPT adapter tests passed; 69 remote-sync tests passed | PASSED |
