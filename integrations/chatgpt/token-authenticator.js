/**
 * Project Context OS — Project-Bound Read Token Authenticator (Phase 6)
 *
 * Implements secure SHA-256 token hashing, lookup, revocation verification,
 * and immutable project binding for the hosted Crux ChatGPT MCP adapter.
 *
 * Security Invariants:
 *  1. Tokens are hashed with SHA-256 before lookup; plaintext tokens are NEVER stored.
 *  2. Plaintext tokens are NEVER logged, committed, or returned to clients.
 *  3. Tokens with `revoked_at IS NOT NULL` are strictly rejected.
 *  4. Identity (account_id, project_id) is strictly server-bound; LLM arguments
 *     can NEVER override or influence project selection.
 *  5. Error messages never leak whether a token exists for another project or tenant.
 */

import crypto from "node:crypto";
import { RemoteContextProvider } from "./remote-context-provider.js";

/**
 * Computes deterministic SHA-256 hex hash of a read token.
 * @param {string} token
 * @returns {string} SHA-256 hex digest
 */
export function hashToken(token) {
  if (!token || typeof token !== "string" || token.trim() === "") {
    throw new Error("Invalid token: token must be a non-empty string.");
  }
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Safely extracts authentication token from HTTP context (Bearer header or query parameter).
 * @param {object} ctx - mcp-use / Hono context
 * @returns {string|null} Plaintext token or null if missing
 */
export function extractTokenFromRequest(ctx) {
  if (!ctx || typeof ctx !== "object") return null;

  const req = ctx.request || ctx.req || ctx;

  // 1. Check HTTP Authorization header: Bearer <token>
  let authHeader = null;
  if (typeof req.header === "function") {
    authHeader = req.header("authorization") || req.header("Authorization");
  } else if (req.headers) {
    if (typeof req.headers.get === "function") {
      authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    } else {
      authHeader = req.headers.authorization || req.headers.Authorization;
    }
  } else if (typeof ctx.header === "function") {
    authHeader = ctx.header("authorization") || ctx.header("Authorization");
  }

  if (typeof authHeader === "string") {
    const trimmed = authHeader.trim();
    if (/^Bearer\s+/i.test(trimmed)) {
      const extracted = trimmed.replace(/^Bearer\s+/i, "").trim();
      if (extracted.length > 0) {
        return extracted;
      }
    }
  }

  // 2. Check query parameter: ?token=<token>
  if (typeof req.query === "function") {
    const qToken = req.query("token");
    if (typeof qToken === "string" && qToken.trim().length > 0) {
      return qToken.trim();
    }
  } else if (req.query && typeof req.query.token === "string") {
    const qToken = req.query.token.trim();
    if (qToken.length > 0) {
      return qToken;
    }
  }

  // 3. Check URL query string
  if (typeof req.url === "string" && req.url.includes("?")) {
    try {
      const url = new URL(req.url, "http://localhost");
      const qToken = url.searchParams.get("token");
      if (qToken && qToken.trim().length > 0) {
        return qToken.trim();
      }
    } catch {
      // ignore malformed URL
    }
  }

  return null;
}

/**
 * In-memory Mock Authenticator for hermetic tests and local simulation.
 */
export class MockTokenAuthenticator {
  constructor() {
    // Key: tokenHash -> { tokenHash, accountId, projectId, createdAt, revokedAt }
    this.tokenStore = new Map();
  }

  /**
   * Registers a project read token (stores only token_hash).
   * @param {object} params
   * @param {string} params.accountId
   * @param {string} params.projectId
   * @param {string} params.plaintextToken
   * @returns {{ tokenHash: string, accountId: string, projectId: string }}
   */
  registerToken({ accountId, projectId, plaintextToken }) {
    if (!accountId || !projectId || !plaintextToken) {
      throw new Error("registerToken requires accountId, projectId, and plaintextToken.");
    }
    const tokenHash = hashToken(plaintextToken);
    this.tokenStore.set(tokenHash, {
      tokenHash,
      accountId,
      projectId,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    });
    return { tokenHash, accountId, projectId };
  }

  /**
   * Marks a token as revoked.
   * @param {string} plaintextToken
   */
  revokeToken(plaintextToken) {
    const tokenHash = hashToken(plaintextToken);
    const rec = this.tokenStore.get(tokenHash);
    if (rec) {
      rec.revokedAt = new Date().toISOString();
    }
  }

  /**
   * Resolves a plaintext token to its bound (accountId, projectId).
   * @param {string} plaintextToken
   * @returns {Promise<{ accountId: string, projectId: string }>}
   */
  async resolveTokenIdentity(plaintextToken) {
    if (!plaintextToken || typeof plaintextToken !== "string" || plaintextToken.trim() === "") {
      throw new Error("Unauthorized: Missing or empty project read token.");
    }
    const tokenHash = hashToken(plaintextToken);
    const rec = this.tokenStore.get(tokenHash);

    if (!rec) {
      throw new Error("Unauthorized: Invalid project read token.");
    }

    if (rec.revokedAt !== null && rec.revokedAt !== undefined) {
      throw new Error("Unauthorized: Project read token has been revoked.");
    }

    return {
      accountId: rec.accountId,
      projectId: rec.projectId,
    };
  }

  clear() {
    this.tokenStore.clear();
  }
}

/**
 * Production Supabase Token Authenticator.
 * Queries `public.project_read_tokens` via HTTPS PostgREST without external cloud SDKs.
 */
export class SupabaseTokenAuthenticator {
  constructor(options = {}) {
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || "";
    this.apiKey = options.apiKey || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || "";
    this.tableName = options.tableName || "project_read_tokens";
    this.timeoutMs = options.timeoutMs || 5000;
  }

  _getHeaders() {
    const headers = {
      "Content-Type": "application/json",
      apikey: this.apiKey,
      Accept: "application/json",
    };
    if (this.apiKey.startsWith("eyJ")) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Resolves a plaintext token to its bound (accountId, projectId) using Supabase.
   * @param {string} plaintextToken
   * @returns {Promise<{ accountId: string, projectId: string }>}
   */
  async resolveTokenIdentity(plaintextToken) {
    if (!plaintextToken || typeof plaintextToken !== "string" || plaintextToken.trim() === "") {
      throw new Error("Unauthorized: Missing or empty project read token.");
    }

    if (!this.supabaseUrl || !this.apiKey) {
      throw new Error("Supabase configuration missing: SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
    }

    const tokenHash = hashToken(plaintextToken);
    const query = new URLSearchParams({
      token_hash: `eq.${tokenHash}`,
      select: "token_hash,account_id,project_id,created_at,revoked_at",
      limit: "1",
    });

    const endpoint = `${this.supabaseUrl.replace(/\/$/, "")}/rest/v1/${this.tableName}?${query.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: this._getHeaders(),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error("Unauthorized: Authentication lookup failed.");
      }

      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("Unauthorized: Invalid project read token.");
      }

      const record = rows[0];
      if (record.revoked_at !== null && record.revoked_at !== undefined) {
        throw new Error("Unauthorized: Project read token has been revoked.");
      }

      return {
        accountId: record.account_id,
        projectId: record.project_id,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Creates a token resolver function for createChatGPTAdapter.
 * Bridges token resolution directly with context fetching and RemoteContextProvider.
 *
 * @param {MockTokenAuthenticator|SupabaseTokenAuthenticator} authenticator
 * @param {object} contextBackend - Backend with fetchContext({ accountId, projectId })
 * @returns {(token: string) => Promise<{ accountId: string, projectId: string, provider: RemoteContextProvider }>}
 */
export function createTokenResolver(authenticator, contextBackend) {
  if (!authenticator || typeof authenticator.resolveTokenIdentity !== "function") {
    throw new Error("createTokenResolver requires a valid TokenAuthenticator with resolveTokenIdentity().");
  }
  if (!contextBackend || typeof contextBackend.fetchContext !== "function") {
    throw new Error("createTokenResolver requires a valid contextBackend with fetchContext().");
  }

  return async function tokenResolver(plaintextToken) {
    // 1. Authenticate token and resolve (accountId, projectId)
    const { accountId, projectId } = await authenticator.resolveTokenIdentity(plaintextToken);

    // 2. Fetch semantic context payload for that exact bound identity
    const payload = await contextBackend.fetchContext({ accountId, projectId });
    if (!payload) {
      throw new Error(`Unauthorized: No synchronized context found for bound project '${projectId}'.`);
    }

    // 3. Bind RemoteContextProvider strictly to the authorized payload
    const provider = new RemoteContextProvider(payload);
    return {
      accountId,
      projectId,
      provider,
    };
  };
}
