/**
 * Project Context OS — Remote Context Provider for ChatGPT MCP (Phase 6)
 *
 * Provides an in-memory / remote implementation of the 8 curated read tools
 * using a synchronized CruxRemoteContextPayload.
 *
 * Implements:
 *  1. getSnapshot(options)
 *  2. getState()
 *  3. getTasks(status, limit)
 *  4. getArchitecture()
 *  5. getDecisions(limit)
 *  6. searchContext(query, limit)
 *  7. getRelevantContext(options)
 *  8. getGitStatus()
 *
 * Enforces strict project isolation: operates strictly within the bound
 * project payload. Never crosses boundaries or executes filesystem commands.
 */

import { assertNoSecrets } from "../../src/index.js";

export class RemoteContextProvider {
  /**
   * @param {object} payload - CruxRemoteContextPayload
   */
  constructor(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("RemoteContextProvider requires a valid CruxRemoteContextPayload object.");
    }
    assertNoSecrets(payload, "RemoteContextProvider.constructor");
    this.payload = payload;
  }

  /**
   * Returns the bound project identifier.
   */
  getProjectId() {
    return this.payload.project?.id || "unknown";
  }

  /**
   * Tool 1: get_context_snapshot
   * @param {object} [options={}]
   */
  getSnapshot(options = {}) {
    const limit = typeof options.limit === "number" ? options.limit : 5;
    const includeGit = options.include_git !== false;
    const includeHandoffs = options.include_handoffs !== false;
    const includeDecisions = options.include_decisions !== false;

    const baseSnapshot = this.payload.snapshot || {};

    const snapshot = {
      _type: "HotContextSnapshot",
      version: baseSnapshot.version || "1.0.0",
      generated_at: baseSnapshot.generated_at || this.payload.synchronized_at || new Date().toISOString(),
      project: {
        name: this.payload.project?.name || baseSnapshot.project?.name || "Project",
        phase: baseSnapshot.project?.phase || "Active",
        status: baseSnapshot.project?.status || this.payload.state?.meta?.current_status || "READY",
        objective: baseSnapshot.project?.objective || this.payload.state?.meta?.current_objective || "Active Development",
        last_context_update: baseSnapshot.project?.last_context_update || this.payload.state?.meta?.last_context_update || "",
        last_agent: baseSnapshot.project?.last_agent || this.payload.state?.meta?.last_agent || "unknown",
        current_agent: baseSnapshot.project?.current_agent || null,
      },
      active_agents: baseSnapshot.active_agents || this.payload.active_work?.agents || [],
      active_tasks: (baseSnapshot.active_tasks || (this.payload.tasks?.tasks || []).filter(t => ["IN_PROGRESS", "READY", "BLOCKED"].includes(t.status))),
      latest_handoff: includeHandoffs ? (baseSnapshot.latest_handoff || this.payload.handoffs?.[0] || null) : null,
      recent_changes: (baseSnapshot.recent_changes || this.payload.changelog?.entries || []).slice(0, limit),
      recent_decisions: includeDecisions
        ? (baseSnapshot.recent_decisions || (this.payload.decisions || []).slice(-limit).reverse())
        : [],
      git: includeGit ? (baseSnapshot.git || this.payload.git_status || null) : null,
      cold_context_pointers: baseSnapshot.cold_context_pointers || {
        total_completed_tasks: (this.payload.tasks?.tasks || []).filter(t => t.status === "COMPLETED").length,
        tasks_archive: ".project-context/TASKS.md",
        decisions_archive: ".project-context/DECISIONS.md",
        changelog_archive: ".project-context/CHANGELOG.md",
        handoffs_archive: ".project-context/handoffs/",
      },
    };

    assertNoSecrets(snapshot, "RemoteContextProvider.getSnapshot");
    return snapshot;
  }

  /**
   * Tool 2: get_project_state
   */
  getState() {
    const state = this.payload.state || { exists: false, meta: null, raw: "" };
    const result = {
      exists: Boolean(state.exists),
      meta: state.meta || null,
      raw: state.raw || "",
    };
    assertNoSecrets(result, "RemoteContextProvider.getState");
    return result;
  }

  /**
   * Tool 3: get_tasks
   * @param {string} [statusFilter]
   * @param {number} [limit=50]
   */
  getTasks(statusFilter, limit = 50) {
    const allTasks = this.payload.tasks?.tasks || [];
    let filtered = allTasks;

    if (statusFilter && statusFilter !== "ALL") {
      filtered = allTasks.filter((t) => t.status === statusFilter);
    }

    const boundedLimit = Math.min(Math.max(1, limit), 50);
    const resultTasks = filtered.slice(0, boundedLimit);

    const result = {
      count: resultTasks.length,
      total_matched: filtered.length,
      status_filter: statusFilter || "ALL",
      tasks: resultTasks,
    };
    assertNoSecrets(result, "RemoteContextProvider.getTasks");
    return result;
  }

  /**
   * Tool 4: get_architecture
   */
  getArchitecture() {
    const content = this.payload.architecture?.content || "# Architecture\n*No architecture specification.*";
    assertNoSecrets(content, "RemoteContextProvider.getArchitecture");
    return content;
  }

  /**
   * Tool 5: get_decisions
   * @param {number} [limit=20]
   */
  getDecisions(limit = 20) {
    const allDecisions = this.payload.decisions || [];
    const boundedLimit = Math.min(Math.max(1, limit), 50);
    const result = allDecisions.slice(-boundedLimit).reverse();
    assertNoSecrets(result, "RemoteContextProvider.getDecisions");
    return result;
  }

  /**
   * Tool 6: search_project_context
   * Performs full-text search across all embedded context documents.
   *
   * @param {string} query
   * @param {number} [limit=25]
   */
  searchContext(query, limit = 25) {
    if (!query || typeof query !== "string" || query.trim() === "") {
      throw new Error("Search query must not be empty.");
    }
    const q = query.trim().toLowerCase();
    const boundedLimit = Math.min(Math.max(1, limit), 50);
    const matches = [];

    // Search helper
    const searchDoc = (relPath, content) => {
      if (!content || typeof content !== "string") return;
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          matches.push({
            file: relPath,
            lineNumber: i + 1,
            lineContent: lines[i].trim(),
          });
          if (matches.length >= 100) return; // Bounded internal match collection
        }
      }
    };

    // 1. STATE.md
    if (this.payload.state?.raw) {
      searchDoc(".project-context/STATE.md", this.payload.state.raw);
    }

    // 2. ARCHITECTURE.md
    if (this.payload.architecture?.content) {
      searchDoc(".project-context/ARCHITECTURE.md", this.payload.architecture.content);
    }

    // 3. DECISIONS.md
    for (const d of this.payload.decisions || []) {
      const dContent = d.raw || `${d.id}: ${d.title}\n${d.decision}\n${d.context || ""}`;
      searchDoc(".project-context/DECISIONS.md", dContent);
    }

    // 4. TASKS.md
    for (const t of this.payload.tasks?.tasks || []) {
      const tContent = `${t.id}: ${t.title} [${t.status}]\n${t.description || ""}`;
      searchDoc(".project-context/TASKS.md", tContent);
    }

    // 5. ACTIVE-WORK.md
    if (this.payload.active_work?.aggregateRaw) {
      searchDoc(".project-context/ACTIVE-WORK.md", this.payload.active_work.aggregateRaw);
    }

    // 6. CHANGELOG.md
    for (const c of this.payload.changelog?.entries || []) {
      const cContent = `${c.date} [${c.task_id}]: ${c.summary || c.title || ""}`;
      searchDoc(".project-context/CHANGELOG.md", cContent);
    }

    // 7. handoffs
    for (const h of this.payload.handoffs || []) {
      const hContent = h.raw || `Handoff ${h.filename} to ${h.to_agent}: ${h.task_title || h.task_id}`;
      searchDoc(`.project-context/handoffs/${h.filename}`, hContent);
    }

    const boundedMatches = matches.slice(0, boundedLimit);
    const result = {
      query: query.trim(),
      match_count: boundedMatches.length,
      total_matches: matches.length,
      matches: boundedMatches,
    };

    assertNoSecrets(result, "RemoteContextProvider.searchContext");
    return result;
  }

  /**
   * Tool 7: get_relevant_context
   * @param {object} [options={}]
   */
  getRelevantContext(options = {}) {
    const limit = Math.min(Math.max(1, options.limit || 5), 20);
    const targetTaskId = options.task_id ? String(options.task_id).toLowerCase() : null;
    const query = options.query ? String(options.query).toLowerCase() : null;
    const inputFiles = Array.isArray(options.files) ? options.files : [];

    // Filter relevant decisions
    const decisions = (this.payload.decisions || []).filter((d) => {
      if (!query && !targetTaskId) return true;
      const text = `${d.id} ${d.title} ${d.decision} ${d.context || ""}`.toLowerCase();
      if (targetTaskId && text.includes(targetTaskId)) return true;
      if (query && text.includes(query)) return true;
      return false;
    }).slice(0, limit);

    // Filter relevant changes
    const changes = (this.payload.changelog?.entries || []).filter((c) => {
      if (!query && !targetTaskId) return true;
      const text = `${c.task_id} ${c.summary || ""} ${c.title || ""}`.toLowerCase();
      if (targetTaskId && text.includes(targetTaskId)) return true;
      if (query && text.includes(query)) return true;
      return false;
    }).slice(0, limit);

    // Filter relevant completed tasks
    const completedTasks = (this.payload.tasks?.tasks || []).filter((t) => {
      if (t.status !== "COMPLETED") return false;
      if (!query && !targetTaskId) return true;
      const text = `${t.id} ${t.title} ${t.description || ""}`.toLowerCase();
      if (targetTaskId && text.includes(targetTaskId)) return true;
      if (query && text.includes(query)) return true;
      return false;
    }).slice(0, limit);

    // Candidate suggested files from changes and handoffs
    const suggestedFiles = new Set(inputFiles);
    for (const c of changes) {
      if (Array.isArray(c.files)) {
        c.files.forEach((f) => suggestedFiles.add(f));
      }
    }

    const result = {
      query_context: {
        task_id: options.task_id || undefined,
        query: options.query || undefined,
        files: inputFiles,
      },
      relevant_decisions: decisions,
      relevant_changes: changes,
      relevant_completed_tasks: completedTasks,
      suggested_files: Array.from(suggestedFiles).slice(0, 15),
    };

    assertNoSecrets(result, "RemoteContextProvider.getRelevantContext");
    return result;
  }

  /**
   * Tool 8: get_git_status
   */
  getGitStatus() {
    const git = this.payload.git_status || {
      branch: this.payload.source_revision?.branch || "unknown",
      isClean: this.payload.source_revision?.is_clean !== false,
      staged: [],
      unstaged: [],
      untracked: [],
      totalChanges: 0,
    };

    const result = {
      branch: git.branch || "unknown",
      isClean: Boolean(git.isClean),
      staged: git.staged || [],
      unstaged: git.unstaged || [],
      untracked: git.untracked || [],
      totalChanges: (git.staged?.length || 0) + (git.unstaged?.length || 0) + (git.untracked?.length || 0),
    };

    assertNoSecrets(result, "RemoteContextProvider.getGitStatus");
    return result;
  }
}

/**
 * Local Context Provider wrapping canonical core engines.
 */
export class LocalContextProvider {
  constructor(resolvedRoot) {
    this.resolvedRoot = resolvedRoot;
  }

  getProjectId() {
    const path = import("node:path");
    return "local";
  }

  async getSnapshot(options = {}) {
    const { getContextSnapshot } = await import("../../src/index.js");
    return getContextSnapshot(this.resolvedRoot, options);
  }

  async getState() {
    const { readState } = await import("../../src/index.js");
    const state = readState(this.resolvedRoot);
    return {
      exists: state.exists,
      meta: state.meta,
      raw: state.raw,
    };
  }

  async getTasks(status, limit = 50) {
    const { readTasks } = await import("../../src/index.js");
    const res = readTasks(this.resolvedRoot, status);
    const boundedLimit = Math.min(Math.max(1, limit), 50);
    const tasks = (res.tasks || []).slice(0, boundedLimit);
    return {
      count: tasks.length,
      total_matched: res.tasks.length,
      status_filter: status || "ALL",
      tasks,
    };
  }

  async getArchitecture() {
    const path = await import("node:path");
    const { readFileSafe, getContextDir } = await import("../../src/index.js");
    const archPath = path.join(getContextDir(this.resolvedRoot), "ARCHITECTURE.md");
    return readFileSafe(archPath) || "ARCHITECTURE.md not found.";
  }

  async getDecisions(limit = 20) {
    const { readDecisions } = await import("../../src/index.js");
    const res = readDecisions(this.resolvedRoot);
    const boundedLimit = Math.min(Math.max(1, limit), 50);
    return (res.decisions || []).slice(-boundedLimit).reverse();
  }

  async searchContext(query, limit = 25) {
    const { searchProjectContext } = await import("../../src/index.js");
    if (!query || typeof query !== "string" || query.trim() === "") {
      throw new Error("Search query must not be empty.");
    }
    const matches = searchProjectContext(this.resolvedRoot, query.trim());
    const boundedLimit = Math.min(Math.max(1, limit), 50);
    const boundedMatches = matches.slice(0, boundedLimit);
    return {
      query: query.trim(),
      match_count: boundedMatches.length,
      total_matches: matches.length,
      matches: boundedMatches,
    };
  }

  async getRelevantContext(options = {}) {
    const { getRelevantContext } = await import("../../src/index.js");
    return getRelevantContext(this.resolvedRoot, options);
  }

  async getGitStatus() {
    const { getGitStatus } = await import("../../src/index.js");
    return getGitStatus(this.resolvedRoot);
  }
}
