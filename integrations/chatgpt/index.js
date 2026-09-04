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

  // ───────────────────────────────────────────────────────────────────────────
  // MCP OUTPUT SCHEMAS (Hardening for ChatGPT Web & typed MCP clients)
  // ───────────────────────────────────────────────────────────────────────────
  const OUTPUT_SCHEMAS = {
    get_context_snapshot: fromJsonSchema({
      type: "object",
      properties: {
        _type: { type: "string" },
        version: { type: "string" },
        generated_at: { type: "string" },
        project: {
          type: "object",
          properties: {
            name: { type: "string" },
            phase: { type: "string" },
            status: { type: "string" },
            objective: { type: "string" },
            last_context_update: { type: "string" },
            last_agent: { type: "string" },
            current_agent: { type: ["object", "null"] }
          },
          required: ["name", "status"]
        },
        active_agents: { type: "array" },
        active_tasks: { type: "array" },
        latest_handoff: { type: ["object", "null"] },
        recent_changes: { type: "array" },
        recent_decisions: { type: "array" },
        git: { type: ["object", "null"] },
        cold_context_pointers: { type: "object" }
      },
      required: ["_type", "generated_at", "project", "active_tasks", "cold_context_pointers"]
    }),

    get_project_state: fromJsonSchema({
      type: "object",
      properties: {
        exists: { type: "boolean" },
        meta: { type: ["object", "null"] },
        raw: { type: "string" }
      },
      required: ["exists", "raw"]
    }),

    get_tasks: fromJsonSchema({
      type: "object",
      properties: {
        count: { type: "integer" },
        total_matched: { type: "integer" },
        status_filter: { type: "string" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              status: { type: "string" },
              priority: { type: "string" },
              owner: { type: "string" },
              created_date: { type: "string" },
              updated_date: { type: "string" },
              dependencies: { type: "string" },
              description: { type: "string" },
              acceptance_criteria: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["id", "title", "status"]
          }
        }
      },
      required: ["count", "total_matched", "status_filter", "tasks"]
    }),

    get_architecture: fromJsonSchema({
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Authoritative markdown specification and invariants of ARCHITECTURE.md"
        }
      },
      required: ["content"]
    }),

    get_decisions: fromJsonSchema({
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          date: { type: "string" },
          status: { type: "string" },
          decision: { type: "string" },
          context: { type: "string" },
          reason: { type: "string" },
          raw: { type: "string" }
        },
        required: ["id", "title", "status", "decision"]
      }
    }),

    search_project_context: fromJsonSchema({
      type: "object",
      properties: {
        query: { type: "string" },
        match_count: { type: "integer" },
        total_matches: { type: "integer" },
        matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file: { type: "string" },
              lineNumber: { type: "integer" },
              lineContent: { type: "string" }
            },
            required: ["file", "lineNumber", "lineContent"]
          }
        }
      },
      required: ["query", "match_count", "total_matches", "matches"]
    }),

    get_relevant_context: fromJsonSchema({
      type: "object",
      properties: {
        query_context: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            query: { type: "string" },
            files: { type: "array", items: { type: "string" } }
          }
        },
        relevant_decisions: { type: "array" },
        relevant_changes: { type: "array" },
        relevant_completed_tasks: { type: "array" },
        suggested_files: { type: "array", items: { type: "string" } }
      },
      required: ["query_context", "relevant_decisions", "relevant_changes", "suggested_files"]
    }),

    get_git_status: fromJsonSchema({
      type: "object",
      properties: {
        branch: { type: "string" },
        isClean: { type: "boolean" },
        staged: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              status: { type: "string" }
            },
            required: ["path", "status"]
          }
        },
        unstaged: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              status: { type: "string" }
            },
            required: ["path", "status"]
          }
        },
        untracked: {
          type: "array",
          items: { type: "string" }
        },
        totalChanges: { type: "integer" }
      },
      required: ["branch", "isClean", "staged", "unstaged", "untracked"]
    })
  };

  // Helper to format safe success responses (providing both text content and structuredContent)
  const formatResponse = (data, toolName) => {
    assertNoSecrets(data, toolName);

    const text = typeof data === "string"
      ? data
      : (data && typeof data === "object" && typeof data.content === "string" && Object.keys(data).length === 1)
        ? data.content
        : JSON.stringify(data, null, 2);

    const structuredContent = (typeof data === "string")
      ? { content: data }
      : data;

    return {
      content: [
        {
          type: "text",
          text
        }
      ],
      structuredContent
    };
  };

  // Helper to format safe error responses without leaking internal filesystem paths or stack traces
  const formatError = (err) => {
    const rawMsg = err instanceof Error ? err.message : String(err);
    // Sanitize any absolute paths that might leak
    const sanitizedMsg = rawMsg.replace(/([a-zA-Z]:\\[^:\n\r"']+)|(\/[a-zA-Z0-9_\-\.\/]+)/g, "<path>");
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${sanitizedMsg}`
        }
      ]
    };
  };

  // Read-only annotations contract for all curated tools
  const READ_ONLY_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  // ───────────────────────────────────────────────────────────────────────────
  // TOOL 1: get_context_snapshot (Primary Hot Context Bootstrap)
  // ───────────────────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "get_context_snapshot",
      title: "Get Context Snapshot",
      description:
        "Primary bootstrap tool. Returns synthesized Hot Context: project identity, current status, active agent work, priority tasks, latest handoff, recent decisions, uncommitted git status, and cold context pointers.",
      annotations: READ_ONLY_ANNOTATIONS,
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
      }),
      outputSchema: OUTPUT_SCHEMAS.get_context_snapshot
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
      title: "Get Project State",
      description:
        "Returns the authoritative project status snapshot and metadata from .project-context/STATE.md.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {}
      }),
      outputSchema: OUTPUT_SCHEMAS.get_project_state
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
      title: "Get Tasks",
      description:
        "Returns project tasks from .project-context/TASKS.md, optionally filtered by status (BACKLOG, READY, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["BACKLOG", "READY", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"],
            description: "Optional status filter"
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            default: 50,
            description: "Maximum number of tasks to return (1-50, default 50)"
          }
        }
      }),
      outputSchema: OUTPUT_SCHEMAS.get_tasks
    },
    async (args = {}) => {
      try {
        const res = readTasks(resolvedRoot, args.status);
        const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 50) : 50;
        const tasks = (res.tasks || []).slice(0, limit);
        const payload = {
          count: tasks.length,
          total_matched: res.tasks.length,
          status_filter: args.status || "ALL",
          tasks
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
      title: "Get Architecture",
      description:
        "Returns the project architecture specification, system boundaries, and architectural invariants from .project-context/ARCHITECTURE.md.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {}
      }),
      outputSchema: OUTPUT_SCHEMAS.get_architecture
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
      title: "Get Decisions",
      description:
        "Returns Architectural Decision Records (ADRs) from .project-context/DECISIONS.md.",
      annotations: READ_ONLY_ANNOTATIONS,
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
      }),
      outputSchema: OUTPUT_SCHEMAS.get_decisions
    },
    async (args = {}) => {
      try {
        const res = readDecisions(resolvedRoot);
        const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 50) : 20;
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
      title: "Search Project Context",
      description:
        "Searches across all .project-context/ markdown files for keywords, concepts, or historical records.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          query: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            description: "Keyword or phrase to search for (1-200 characters)"
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            default: 25,
            description: "Maximum number of search matches to return (1-50, default 25)"
          }
        },
        required: ["query"]
      }),
      outputSchema: OUTPUT_SCHEMAS.search_project_context
    },
    async (args = {}) => {
      try {
        if (!args.query || typeof args.query !== "string" || args.query.trim() === "") {
          return formatError(new Error("Search query must not be empty."));
        }
        if (args.query.length > 200) {
          return formatError(new Error("Search query exceeds maximum length of 200 characters."));
        }
        const matches = searchProjectContext(resolvedRoot, args.query.trim());
        const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 50) : 25;
        const boundedMatches = matches.slice(0, limit);
        const payload = {
          query: args.query.trim(),
          match_count: boundedMatches.length,
          total_matches: matches.length,
          matches: boundedMatches
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
      title: "Get Relevant Context",
      description:
        "Computes deterministic, ranked Warm Context for a specific task or query: relevant ADRs, recent changes, completed tasks, and candidate files.",
      annotations: READ_ONLY_ANNOTATIONS,
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
            description: "Optional list of relevant files being inspected (max 20)"
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 5,
            description: "Maximum items per category (1-20, default 5)"
          }
        }
      }),
      outputSchema: OUTPUT_SCHEMAS.get_relevant_context
    },
    async (args = {}) => {
      try {
        const options = {
          task_id: args.task_id ? String(args.task_id).slice(0, 50) : undefined,
          query: args.query ? String(args.query).slice(0, 200) : undefined,
          files: Array.isArray(args.files) ? args.files.slice(0, 20).map(f => String(f).slice(0, 200)) : undefined,
          limit: typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 20) : 5
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
      title: "Get Git Status",
      description:
        "Returns Git working tree status: current branch, staged modifications, unstaged modifications, and untracked files.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {}
      }),
      outputSchema: OUTPUT_SCHEMAS.get_git_status
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
    console.log("[Project Context OS] Authentication: No Auth (Streamable HTTP / ChatGPT Web)");
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
