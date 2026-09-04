/**
 * Project Context OS — ChatGPT Remote MCP Adapter (Phase 3)
 *
 * Controlled Read-Only Semantic Interface for ChatGPT Web over Streamable HTTP.
 * Built with the mcp-use framework.
 *
 * Exposes exactly EIGHT curated read tools:
 *   1. get_context_snapshot   (Hot Context Synthesizer)
 *   2. get_project_state      (High-Level Project Status)
 *   3. get_tasks              (Task Board & Status Filtering)
 *   4. get_architecture       (Architecture Invariants & System Boundaries)
 *   5. get_decisions          (Architectural Decision Records / ADRs)
 *   6. search_project_context (Cold Archive Keyword Search)
 *   7. get_relevant_context   (Deterministic Task/Topic Warm Context Ranking)
 *   8. get_git_status         (Working Tree Ground Truth)
 *
 * Pure interface layer. Zero duplicated state. Zero markdown parsing.
 * Every response is audited via canonical assertNoSecrets before transmission.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { MCPServer } from "mcp-use";
import { fromJsonSchema } from "@modelcontextprotocol/server";
import {
  getContextSnapshot,
  readState,
  readTasks,
  readDecisions,
  searchProjectContext,
  getRelevantContext,
  getGitStatus,
  readFileSafe,
  getContextDir,
  resolveProjectRoot,
  assertNoSecrets
} from "@project-context/core";

// ─────────────────────────────────────────────────────────────────────────────
// 1. DETERMINISTIC PROJECT ROOT RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

export function getTargetProjectRoot(cliArgs = process.argv.slice(2)) {
  // 1. Check PROJECT_CONTEXT_ROOT env variable
  if (process.env.PROJECT_CONTEXT_ROOT && process.env.PROJECT_CONTEXT_ROOT.trim() !== "") {
    const envRoot = path.resolve(process.env.PROJECT_CONTEXT_ROOT.trim());
    if (fs.existsSync(envRoot)) {
      return envRoot;
    }
    throw new Error(
      `Configured PROJECT_CONTEXT_ROOT does not exist on disk: '${envRoot}'`
    );
  }

  // 2. Check explicit --root CLI argument
  const rootIdx = cliArgs.indexOf("--root");
  if (rootIdx !== -1 && cliArgs[rootIdx + 1]) {
    const explicitRoot = path.resolve(cliArgs[rootIdx + 1]);
    if (fs.existsSync(explicitRoot)) {
      return explicitRoot;
    }
    throw new Error(
      `Explicit --root path does not exist on disk: '${explicitRoot}'`
    );
  }

  // 3. Fallback to canonical resolveProjectRoot() upward search
  const discovered = resolveProjectRoot(process.cwd());
  const hasContext = fs.existsSync(path.join(discovered, ".project-context"));
  const hasGit = fs.existsSync(path.join(discovered, ".git"));

  if (!hasContext && !hasGit) {
    throw new Error(
      `Unable to locate a valid Project Context OS repository root from '${process.cwd()}'. Set PROJECT_CONTEXT_ROOT or provide --root <path>.`
    );
  }

  return discovered;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SERVER FACTORY (8 CURATED READ TOOLS)
// ─────────────────────────────────────────────────────────────────────────────

export function createChatGPTAdapter(targetProjectRoot, options = {}) {
  if (!targetProjectRoot || typeof targetProjectRoot !== "string") {
    throw new Error("Target project root path is required.");
  }

  const resolvedRoot = path.resolve(targetProjectRoot);
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`Target project root does not exist: '${resolvedRoot}'`);
  }

  const secret = options.secret !== undefined ? options.secret : process.env.CHATGPT_MCP_SECRET;

  const serverConfig = {
    name: "project-context-chatgpt",
    version: "1.0.0"
  };

  const configuredHosts = options.allowedHosts || process.env.ALLOWED_HOSTS;
  if (configuredHosts) {
    const list = Array.isArray(configuredHosts)
      ? configuredHosts
      : configuredHosts.split(",").map((h) => h.trim()).filter(Boolean);
    serverConfig.allowedHosts = list;
  }

  const server = new MCPServer(serverConfig);

  // Authentication Middleware (Constant-time Bearer token validation)
  if (secret && typeof secret === "string" && secret.trim() !== "") {
    const expectedSecret = secret.trim();
    const expectedBuffer = Buffer.from(expectedSecret, "utf-8");

    server.use(async (c, next) => {
      const authHeader = c.req.header("authorization") || c.req.header("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return c.text("Unauthorized: Missing or invalid Authorization header", 401, {
          "WWW-Authenticate": 'Bearer realm="ProjectContext"'
        });
      }

      const token = authHeader.slice(7).trim();
      const tokenBuffer = Buffer.from(token, "utf-8");

      if (
        tokenBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)
      ) {
        return c.text("Unauthorized: Invalid Bearer token", 401, {
          "WWW-Authenticate": 'Bearer realm="ProjectContext"'
        });
      }

      await next();
    });
  }

  // Helper to format safe success responses
  const formatResponse = (data, toolName) => {
    assertNoSecrets(data, toolName);
    return {
      content: [
        {
          type: "text",
          text: typeof data === "string" ? data : JSON.stringify(data, null, 2)
        }
      ]
    };
  };

  // Helper to format error responses
  const formatError = (err) => ({
    isError: true,
    content: [
      {
        type: "text",
        text: `Error: ${err instanceof Error ? err.message : String(err)}`
      }
    ]
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TOOL 1: get_context_snapshot (Primary Hot Context Bootstrap)
  // ───────────────────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "get_context_snapshot",
      description:
        "Primary bootstrap tool. Returns synthesized Hot Context: project identity, current status, active agent work, priority tasks, latest handoff, recent decisions, uncommitted git status, and cold context pointers.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 5,
            description: "Max items for recent lists (changes, decisions, handoffs)"
          },
          include_git: {
            type: "boolean",
            default: true,
            description: "Include current Git working tree status"
          },
          include_handoffs: {
            type: "boolean",
            default: true,
            description: "Include latest relevant handoff"
          },
          include_decisions: {
            type: "boolean",
            default: true,
            description: "Include recent architectural decisions"
          }
        }
      })
    },
    async (args = {}) => {
      try {
        const options = {
          limit: typeof args.limit === "number" ? args.limit : 5,
          include_git: args.include_git !== false,
          include_handoffs: args.include_handoffs !== false,
          include_decisions: args.include_decisions !== false
        };
        const snapshot = getContextSnapshot(resolvedRoot, options);
        return formatResponse(snapshot, "get_context_snapshot");
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // TOOL 2: get_project_state (Authoritative High-Level Status)
  // ───────────────────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "get_project_state",
      description:
        "Returns the authoritative project status snapshot and metadata from .project-context/STATE.md.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {}
      })
    },
    async () => {
      try {
        const state = readState(resolvedRoot);
        const payload = {
          exists: state.exists,
          meta: state.meta,
          raw: state.raw
        };
        return formatResponse(payload, "get_project_state");
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // TOOL 3: get_tasks (Task Board with Status Filter)
  // ───────────────────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "get_tasks",
      description:
        "Returns project tasks from .project-context/TASKS.md, optionally filtered by status (BACKLOG, READY, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED).",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["BACKLOG", "READY", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"],
            description: "Optional status filter"
          }
        }
      })
    },
    async (args = {}) => {
      try {
        const res = readTasks(resolvedRoot, args.status);
        const payload = {
          count: res.tasks.length,
          status_filter: args.status || "ALL",
          tasks: res.tasks
        };
        return formatResponse(payload, "get_tasks");
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // TOOL 4: get_architecture (System Boundaries & Invariants)
  // ───────────────────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "get_architecture",
      description:
        "Returns the project architecture specification, system boundaries, and architectural invariants from .project-context/ARCHITECTURE.md.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {}
      })
    },
    async () => {
      try {
        const archPath = path.join(getContextDir(resolvedRoot), "ARCHITECTURE.md");
        const raw = readFileSafe(archPath) || "ARCHITECTURE.md not found.";
        return formatResponse(raw, "get_architecture");
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // TOOL 5: get_decisions (Architectural Decision Records)
  // ───────────────────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "get_decisions",
      description:
        "Returns Architectural Decision Records (ADRs) from .project-context/DECISIONS.md.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            default: 20,
            description: "Maximum number of decisions to return (most recent first)"
          }
        }
      })
    },
    async (args = {}) => {
      try {
        const res = readDecisions(resolvedRoot);
        const limit = typeof args.limit === "number" ? args.limit : 20;
        const decisions = (res.decisions || []).slice(-limit).reverse();
        return formatResponse(decisions, "get_decisions");
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // TOOL 6: search_project_context (Full-Text Search Across Context Files)
  // ───────────────────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "search_project_context",
      description:
        "Searches across all .project-context/ markdown files for keywords, concepts, or historical records.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          query: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            description: "Keyword or phrase to search for"
          }
        },
        required: ["query"]
      })
    },
    async (args = {}) => {
      try {
        if (!args.query || args.query.trim() === "") {
          return formatError(new Error("Search query must not be empty."));
        }
        const matches = searchProjectContext(resolvedRoot, args.query.trim());
        const payload = {
          query: args.query.trim(),
          match_count: matches.length,
          matches
        };
        return formatResponse(payload, "search_project_context");
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // TOOL 7: get_relevant_context (Task/Topic Deterministic Warm Context)
  // ───────────────────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "get_relevant_context",
      description:
        "Computes deterministic, ranked Warm Context for a specific task or query: relevant ADRs, recent changes, completed tasks, and candidate files.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          task_id: {
            type: "string",
            maxLength: 50,
            description: "Optional task identifier e.g. TASK-002"
          },
          query: {
            type: "string",
            maxLength: 200,
            description: "Optional topic query or component name"
          },
          files: {
            type: "array",
            maxItems: 20,
            items: {
              type: "string",
              maxLength: 200
            },
            description: "Optional list of relevant files being inspected"
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 5,
            description: "Maximum items per category"
          }
        }
      })
    },
    async (args = {}) => {
      try {
        const options = {
          task_id: args.task_id || undefined,
          query: args.query || undefined,
          files: Array.isArray(args.files) ? args.files : undefined,
          limit: typeof args.limit === "number" ? args.limit : 5
        };
        const relevant = getRelevantContext(resolvedRoot, options);
        return formatResponse(relevant, "get_relevant_context");
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // TOOL 8: get_git_status (Working Tree Ground Truth)
  // ───────────────────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "get_git_status",
      description:
        "Returns Git working tree status: current branch, staged modifications, unstaged modifications, and untracked files.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {}
      })
    },
    async () => {
      try {
        const status = getGitStatus(resolvedRoot);
        return formatResponse(status, "get_git_status");
      } catch (err) {
        return formatError(err);
      }
    }
  );

  return server;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOCAL SERVER RUNNER
// ─────────────────────────────────────────────────────────────────────────────

export async function startChatGPTAdapter(options = {}) {
  const targetRoot = options.rootDir || getTargetProjectRoot();
  const port = options.port !== undefined ? options.port : parseInt(process.env.PORT || "3000", 10);
  const host = "127.0.0.1"; // Strictly bound to loopback

  const server = createChatGPTAdapter(targetRoot, options);
  const running = await server.listen(port, { host });

  return {
    server,
    port: running.port,
    url: running.url,
    targetRoot
  };
}

// Direct CLI execution
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const targetRoot = getTargetProjectRoot();
    console.log(`[Project Context OS] Target Project Root: ${targetRoot}`);
    const authConfigured = Boolean(process.env.CHATGPT_MCP_SECRET && process.env.CHATGPT_MCP_SECRET.trim() !== "");
    console.log(`[Project Context OS] Authentication: ${authConfigured ? "ENABLED (Bearer token enforced)" : "DISABLED (Local only)"}`);
    const { port, url } = await startChatGPTAdapter({ rootDir: targetRoot });
    console.log(`[Project Context OS] ChatGPT MCP Adapter running on ${url} (port ${port})`);
    console.log(`[Project Context OS] Streamable HTTP endpoint: ${url}`);
    console.log(`[Project Context OS] Local Inspector: http://localhost:${port}/mcp/inspector`);
  } catch (err) {
    console.error(`[FATAL] Failed to start adapter: ${err.message}`);
    process.exit(1);
  }
}

// Default export satisfying the mcp-use entry contract:
// `mcp-use dev` and `mcp-use start` import the module and inspect `export default`.
let defaultServerInstance = null;
export default (() => {
  if (!defaultServerInstance) {
    try {
      const root = getTargetProjectRoot();
      defaultServerInstance = createChatGPTAdapter(root);
    } catch {
      // In isolated environments or build time, lazily permit fallback
      defaultServerInstance = createChatGPTAdapter(process.cwd());
    }
  }
  return defaultServerInstance;
})();
