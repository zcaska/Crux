/**
 * Project Context OS — Remote Context Synchronization Engine (Phase 6)
 *
 * Implements secure, project-isolated, idempotent synchronization of
 * Crux-owned semantic context to remote storage (Supabase / Mock).
 *
 * Architectural Invariants:
 *  1. Local .project-context/ remains canonical source of truth.
 *  2. Synchronizes ONLY Crux-owned semantic context.
 *  3. Strictly excludes source code, .git/, node_modules/, and graphify-out/.
 *  4. Scans for secret credentials with assertNoSecrets before any transmission.
 *  5. Operates offline-safe: failures never block or corrupt local Crux operations.
 *  6. Idempotent: computes SHA-256 payload hash to avoid redundant network writes.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  getContextDir,
  readState,
  readTasks,
  readDecisions,
  readChangelog,
  readHandoffs,
  readActiveWork,
  readFileSafe,
} from "./core.js";
import { getContextSnapshot } from "./snapshot.js";
import { getGitStatus } from "./git.js";
import { getProjectIdentity, readProjectConfig } from "./config.js";
import { resolveProjectRoot } from "./locator.js";
import { assertNoSecrets } from "./security.js";

export const SYNC_VERSION = "1.0.0";

export const SYNC_STATUS = {
  SUCCESS: "SUCCESS",
  UP_TO_DATE: "UP_TO_DATE",
  FAILED: "FAILED",
  OFFLINE: "OFFLINE",
  SKIPPED: "SKIPPED",
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. CANONICAL PAYLOAD ASSEMBLER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assembles the Crux-owned semantic context into a structured, bounded payload.
 * Strictly excludes: source code, .git, node_modules, and graphify-out.
 *
 * @param {string} rootDir - Project repository root
 * @param {object} [options={}]
 * @returns {object} CruxRemoteContextPayload
 */
export function assembleRemoteContextPayload(rootDir, options = {}) {
  const resolvedRoot = resolveProjectRoot(rootDir);
  const contextDir = getContextDir(resolvedRoot);

  if (!fs.existsSync(contextDir)) {
    throw new Error(`Cannot assemble remote context: '.project-context' does not exist at '${resolvedRoot}'.`);
  }

  const identity = getProjectIdentity(resolvedRoot);

  // 1. Snapshot (Primary Hot Context)
  const snapshot = getContextSnapshot(resolvedRoot, {
    limit: options.limit || 10,
    include_git: true,
    include_handoffs: true,
    include_decisions: true,
  });

  // 2. High-level state
  const stateObj = readState(resolvedRoot);

  // 3. Tasks board
  const tasksObj = readTasks(resolvedRoot);

  // 4. Architecture invariants & specifications
  const archPath = path.join(contextDir, "ARCHITECTURE.md");
  const architectureContent = readFileSafe(archPath) || "# Architecture\n*No ARCHITECTURE.md found.*";

  // 5. Decisions (ADRs)
  const decisionsObj = readDecisions(resolvedRoot);

  // 6. Active work & agents
  const activeWorkObj = readActiveWork(resolvedRoot);

  // 7. Recent semantic changelog
  const changelogObj = readChangelog(resolvedRoot, options.changelogLimit || 20);

  // 8. Recent immutable handoffs
  const handoffsObj = readHandoffs(resolvedRoot, options.handoffsLimit || 10);

  // 9. Git working tree status (clean ground truth)
  const gitStatus = getGitStatus(resolvedRoot);

  const payload = {
    _type: "CruxRemoteContextPayload",
    schema_version: SYNC_VERSION,
    synchronized_at: new Date().toISOString(),
    project: {
      id: identity.id,
      name: identity.name,
      description: identity.description,
      schema_version: identity.schema_version,
    },
    source_revision: {
      branch: gitStatus.branch || "unknown",
      commit: snapshot.git?.recent_commits?.[0]?.hash || "unknown",
      is_clean: Boolean(gitStatus.isClean),
    },
    snapshot,
    state: {
      exists: stateObj.exists,
      meta: stateObj.meta,
      raw: stateObj.raw,
    },
    tasks: {
      count: (tasksObj.tasks || []).length,
      tasks: tasksObj.tasks || [],
    },
    architecture: {
      content: architectureContent,
    },
    decisions: decisionsObj.decisions || [],
    active_work: {
      agents: activeWorkObj.agents || [],
      aggregateRaw: activeWorkObj.aggregateRaw || "",
    },
    changelog: {
      entries: changelogObj.entries || [],
    },
    handoffs: (handoffsObj.handoffs || []).map((h) => ({
      filename: h.filename,
      timestamp: h.timestamp,
      from_agent: typeof h.from_agent === "object" ? h.from_agent.agent : h.from_agent,
      to_agent: h.to_agent,
      task_id: h.task_id,
      task_title: h.task_title,
      raw: h.raw,
    })),
    git_status: {
      branch: gitStatus.branch,
      isClean: gitStatus.isClean,
      staged: gitStatus.staged || [],
      unstaged: gitStatus.unstaged || [],
      untracked: gitStatus.untracked || [],
      totalChanges: (gitStatus.staged?.length || 0) + (gitStatus.unstaged?.length || 0) + (gitStatus.untracked?.length || 0),
    },
  };

  // Enforce zero-credential security audit before any return
  assertNoSecrets(payload, "assembleRemoteContextPayload");

  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOCAL SYNC STATE MANAGEMENT (.project-context/.sync-state.json)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads local synchronization state.
 * @param {string} rootDir
 */
export function getLocalSyncState(rootDir) {
  const contextDir = getContextDir(resolveProjectRoot(rootDir));
  const syncStatePath = path.join(contextDir, ".sync-state.json");
  const raw = readFileSafe(syncStatePath);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  return {
    sync_version: null,
    last_synced_at: null,
    status: "NOT_SYNCED",
  };
}

/**
 * Updates local synchronization state.
 * @param {string} rootDir
 * @param {object} updates
 */
export function saveLocalSyncState(rootDir, updates) {
  const contextDir = getContextDir(resolveProjectRoot(rootDir));
  if (!fs.existsSync(contextDir)) return;
  const syncStatePath = path.join(contextDir, ".sync-state.json");
  const current = getLocalSyncState(rootDir);
  const merged = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(syncStatePath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  return merged;
}

/**
 * Resolves account and project identity with anti-spoofing and format validation.
 * Ensures CLI arguments cannot override configured account boundaries.
 *
 * @param {string} rootDir
 * @param {object} [options={}]
 * @returns {{ accountId: string, projectId: string, projectName: string }}
 */
export function resolveAccountAndProject(rootDir, options = {}) {
  const resolvedRoot = resolveProjectRoot(rootDir);
  const identity = getProjectIdentity(resolvedRoot);
  const cfg = readProjectConfig(resolvedRoot);

  const envAccount = process.env.CRUX_ACCOUNT_ID;
  const configAccount = cfg.account_id;
  const requestedAccount = options.accountId || options.account;

  let resolvedAccount = requestedAccount || configAccount || envAccount || "default";

  // Anti-spoofing check: If project config explicitly binds an account, verify match
  if (configAccount && requestedAccount && requestedAccount !== configAccount) {
    throw new Error(
      `Account spoofing prevented: Project is bound to account '${configAccount}', but requested '--account ${requestedAccount}'.`
    );
  }

  // Anti-spoofing check: If environment explicitly binds an account, verify match
  if (envAccount && requestedAccount && requestedAccount !== envAccount) {
    throw new Error(
      `Account spoofing prevented: Environment is configured for account '${envAccount}', but requested '--account ${requestedAccount}'.`
    );
  }

  // Strict format validation
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(resolvedAccount)) {
    throw new Error(
      `Invalid account_id '${resolvedAccount}': Must contain only 1-64 alphanumeric, dash, or underscore characters.`
    );
  }

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(identity.id)) {
    throw new Error(
      `Invalid project_id '${identity.id}': Must contain only 1-64 alphanumeric, dash, or underscore characters.`
    );
  }

  return {
    accountId: resolvedAccount,
    projectId: identity.id,
    projectName: identity.name,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. REMOTE STORAGE BACKEND ABSTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base interface for remote context storage backends.
 */
export class RemoteContextBackend {
  /**
   * Uploads project context to remote store.
   * @param {object} params
   * @param {string} params.accountId
   * @param {string} params.projectId
   * @param {string} params.syncVersion
   * @param {object} params.payload
   * @returns {Promise<{ success: boolean, syncVersion: string, message?: string }>}
   */
  async uploadContext(_params) {
    throw new Error("uploadContext must be implemented by subclass.");
  }

  /**
   * Fetches project context from remote store.
   * @param {object} params
   * @param {string} params.accountId
   * @param {string} params.projectId
   * @returns {Promise<object|null>}
   */
  async fetchContext(_params) {
    throw new Error("fetchContext must be implemented by subclass.");
  }
}

/**
 * In-memory Mock Backend for hermetic testing and local simulation.
 */
export class MockContextBackend extends RemoteContextBackend {
  constructor() {
    super();
    this.store = new Map(); // Key: `${accountId}:${projectId}` -> { syncVersion, payload, updatedAt }
    this.isOnline = true;
    this.latencyMs = 0;
  }

  setOnline(online) {
    this.isOnline = Boolean(online);
  }

  _makeKey(accountId, projectId) {
    return `${accountId}:${projectId}`;
  }

  async uploadContext({ accountId, projectId, syncVersion, payload }) {
    if (!this.isOnline) {
      throw new Error("Remote service unavailable: Connection refused (offline).");
    }
    const key = this._makeKey(accountId, projectId);
    const existing = this.store.get(key);
    if (existing) {
      // 1. Idempotence check
      if (existing.syncVersion === syncVersion) {
        return {
          success: true,
          syncVersion,
          message: `Successfully synchronized ${projectId} for account ${accountId} (up-to-date)`,
        };
      }
      // 2. Concurrency & Stale-Write Protection:
      // An older snapshot must not silently overwrite a newer remote state
      const existingTime = new Date(existing.payload.synchronized_at || existing.updatedAt).getTime();
      const incomingTime = new Date(payload.synchronized_at || 0).getTime();
      if (incomingTime < existingTime) {
        throw new Error(
          `Stale write rejected: Incoming context timestamp (${payload.synchronized_at}) is older than existing remote context timestamp (${existing.payload.synchronized_at || existing.updatedAt}).`
        );
      }
    }
    this.store.set(key, {
      accountId,
      projectId,
      syncVersion,
      payload: JSON.parse(JSON.stringify(payload)),
      updatedAt: new Date().toISOString(),
    });
    return {
      success: true,
      syncVersion,
      message: `Successfully synchronized ${projectId} for account ${accountId}`,
    };
  }

  async fetchContext({ accountId, projectId }) {
    if (!this.isOnline) {
      throw new Error("Remote service unavailable: Connection refused (offline).");
    }
    const key = this._makeKey(accountId, projectId);
    const item = this.store.get(key);
    return item ? JSON.parse(JSON.stringify(item.payload)) : null;
  }

  clear() {
    this.store.clear();
  }
}

/**
 * Production Supabase PostgREST Backend.
 * Connects directly to Supabase via native fetch without external cloud SDKs.
 */
export class SupabaseContextBackend extends RemoteContextBackend {
  constructor(options = {}) {
    super();
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || "";
    this.apiKey = options.apiKey || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || "";
    this.tableName = options.tableName || "project_contexts";
    this.timeoutMs = options.timeoutMs || 8000;
  }

  _getHeaders() {
    const headers = {
      "Content-Type": "application/json",
      apikey: this.apiKey,
      Prefer: "resolution=merge-duplicates,return=representation",
    };
    if (this.apiKey.startsWith("eyJ")) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async uploadContext({ accountId, projectId, syncVersion, payload }) {
    if (!this.supabaseUrl || !this.apiKey) {
      throw new Error("Supabase configuration missing: SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
    }

    const endpoint = `${this.supabaseUrl.replace(/\/$/, "")}/rest/v1/${this.tableName}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const body = JSON.stringify([
        {
          account_id: accountId,
          project_id: projectId,
          sync_version: syncVersion,
          payload,
          synchronized_at: payload.synchronized_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: this._getHeaders(),
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (errText.includes("Stale write rejected")) {
          throw new Error(`Stale write rejected: Cannot overwrite newer remote context with older snapshot.`);
        }
        throw new Error(`Supabase upload failed with HTTP ${res.status}: ${errText}`);
      }

      return {
        success: true,
        syncVersion,
        message: `Successfully synchronized ${projectId} to Supabase.`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchContext({ accountId, projectId }) {
    if (!this.supabaseUrl || !this.apiKey) {
      throw new Error("Supabase configuration missing: SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
    }

    const query = new URLSearchParams({
      account_id: `eq.${accountId}`,
      project_id: `eq.${projectId}`,
      select: "payload,sync_version,synchronized_at",
      limit: "1",
    });

    const endpoint = `${this.supabaseUrl.replace(/\/$/, "")}/rest/v1/${this.tableName}?${query.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = {
        apikey: this.apiKey,
        Accept: "application/json",
      };
      if (this.apiKey.startsWith("eyJ")) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const res = await fetch(endpoint, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Supabase fetch failed with HTTP ${res.status}: ${errText}`);
      }

      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0].payload;
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MAIN SYNCHRONIZATION API
// ─────────────────────────────────────────────────────────────────────────────

// Shared default backend instance
let activeBackend = null;

export function setActiveRemoteBackend(backend) {
  activeBackend = backend;
}

export function getActiveRemoteBackend() {
  if (!activeBackend) {
    if (process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY)) {
      activeBackend = new SupabaseContextBackend();
    } else {
      activeBackend = new MockContextBackend();
    }
  }
  return activeBackend;
}

/**
 * Synchronizes Crux-owned semantic context to remote storage.
 *
 * @param {string} rootDir - Project repository root
 * @param {object} [options={}]
 * @param {RemoteContextBackend} [options.backend] - Explicit backend to use
 * @param {string} [options.accountId="default"] - Logical account / tenant identifier
 * @param {boolean} [options.force=false] - Force upload even if content hash matches
 * @param {boolean} [options.dryRun=false] - Return payload without uploading
 * @param {number} [options.retries=2] - Number of bounded retries on transient network error
 * @returns {Promise<{
 *   status: 'SUCCESS' | 'UP_TO_DATE' | 'OFFLINE' | 'FAILED' | 'SKIPPED',
 *   project_id: string,
 *   sync_version: string,
 *   synchronized_at?: string,
 *   message: string,
 *   error?: string
 * }>}
 */
export async function syncProjectContext(rootDir, options = {}) {
  const resolvedRoot = resolveProjectRoot(rootDir);
  let identity;
  let accountId;
  try {
    const resolved = resolveAccountAndProject(resolvedRoot, options);
    accountId = resolved.accountId;
    identity = { id: resolved.projectId, name: resolved.projectName };
  } catch (err) {
    return {
      status: SYNC_STATUS.FAILED,
      project_id: options.projectId || "unknown",
      sync_version: "",
      message: `Account or project authorization failure: ${err.message}`,
      error: err.message,
    };
  }

  const backend = options.backend || getActiveRemoteBackend();

  // 1. Assemble canonical payload
  let payload;
  try {
    payload = assembleRemoteContextPayload(resolvedRoot, options);
  } catch (err) {
    return {
      status: SYNC_STATUS.FAILED,
      project_id: identity.id,
      sync_version: "",
      message: `Failed to assemble project context payload: ${err.message}`,
      error: err.message,
    };
  }

  // 2. Compute deterministic content hash (SHA-256)
  // Exclude volatile timestamps when computing content hash for stable idempotence
  const hashPayload = {
    ...payload,
    synchronized_at: undefined,
    snapshot: payload.snapshot ? {
      ...payload.snapshot,
      generated_at: undefined,
    } : undefined,
  };
  const contentHash = crypto.createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex");
  payload.sync_version = contentHash;

  // 3. Dry-run mode
  if (options.dryRun) {
    return {
      status: SYNC_STATUS.SKIPPED,
      project_id: identity.id,
      sync_version: contentHash,
      message: "Dry-run mode: context assembled and validated, not uploaded.",
      payload,
    };
  }

  // 4. Idempotence Check
  const localState = getLocalSyncState(resolvedRoot);
  if (!options.force && localState.sync_version === contentHash && localState.status === SYNC_STATUS.SUCCESS) {
    return {
      status: SYNC_STATUS.UP_TO_DATE,
      project_id: identity.id,
      sync_version: contentHash,
      synchronized_at: localState.last_synced_at,
      message: `Context is already up-to-date (version ${contentHash.slice(0, 8)}).`,
    };
  }

  // 5. Bounded upload with retries
  const maxRetries = typeof options.retries === "number" ? options.retries : 2;
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      const uploadResult = await backend.uploadContext({
        accountId,
        projectId: identity.id,
        syncVersion: contentHash,
        payload,
      });

      const now = new Date().toISOString();
      saveLocalSyncState(resolvedRoot, {
        sync_version: contentHash,
        last_synced_at: now,
        status: SYNC_STATUS.SUCCESS,
        error: null,
      });

      return {
        status: SYNC_STATUS.SUCCESS,
        project_id: identity.id,
        sync_version: contentHash,
        synchronized_at: now,
        message: uploadResult.message || `Successfully synchronized context for ${identity.id}`,
      };
    } catch (err) {
      lastError = err;
      attempt++;
      if (attempt <= maxRetries) {
        // Exponential backoff: 50ms, 100ms...
        await new Promise((r) => setTimeout(r, attempt * 50));
      }
    }
  }

  // If all attempts fail, fail-safe without crashing local Crux
  const isNetworkOffline =
    lastError?.message?.includes("unavailable") ||
    lastError?.message?.includes("fetch failed") ||
    lastError?.message?.includes("ECONNREFUSED") ||
    lastError?.name === "AbortError";

  const failureStatus = isNetworkOffline ? SYNC_STATUS.OFFLINE : SYNC_STATUS.FAILED;
  saveLocalSyncState(resolvedRoot, {
    status: failureStatus,
    error: lastError?.message || "Unknown synchronization failure",
  });

  return {
    status: failureStatus,
    project_id: identity.id,
    sync_version: contentHash,
    message: isNetworkOffline
      ? `Remote service unavailable (working offline). Local context remains canonical.`
      : `Synchronization failed: ${lastError?.message}`,
    error: lastError?.message,
  };
}
