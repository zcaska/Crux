/**
 * Project Context OS — Deterministic Context Relevance Engine
 *
 * Implements tokenized and path-based deterministic relevance scoring to partition
 * project context into Hot, Warm, and Cold tiers.
 *
 * Signals used:
 *   - Exact Task ID references (weight: 10.0)
 *   - File path overlap & directory prefix matches (weight: 5.0)
 *   - Tokenized keyword similarity (weight: 2.0)
 *   - Component tag matching (weight: 3.0)
 *   - Recency boost (weight: 1.0)
 */

import fs from "node:fs";
import path from "node:path";
import { readDecisions, readChangelog, readTasks } from "./core.js";
import { readProjectConfig } from "./config.js";
import {
  inspectGraphifyStatus,
  getStructuralNeighbors,
  getDetailedStructuralNeighbors,
  loadGraphData,
  getCommunityFiles,
  GRAPHIFY_STATES,
} from "./graphify.js";
import { assertNoSecrets } from "./security.js";

// Stopwords to filter out during tokenization
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
  "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were", "will",
  "with", "this", "these", "those", "have", "been", "project", "context",
]);

/**
 * Tokenizes and normalizes text into distinctive lowercase terms.
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenize(text) {
  if (!text || typeof text !== "string") return new Set();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_\-\/]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Computes Jaccard similarity between two token sets.
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} 0.0 to 1.0
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Checks if two file paths share directory prefixes or base names.
 * @param {string} pathA
 * @param {string} pathB
 * @returns {number} 0.0 to 1.0
 */
function pathRelevance(pathA, pathB) {
  if (!pathA || !pathB) return 0;
  const normA = pathA.replace(/\\/g, "/").toLowerCase();
  const normB = pathB.replace(/\\/g, "/").toLowerCase();
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.8;
  const dirA = path.dirname(normA);
  const dirB = path.dirname(normB);
  if (dirA !== "." && dirA === dirB) return 0.6;
  if (path.basename(normA) === path.basename(normB)) return 0.5;
  return 0;
}

/**
 * Retrieves deterministic, ranked Warm Context for a specific task or query.
 *
 * @param {string} rootDir
 * @param {object} [options={}]
 * @param {string} [options.task_id] - Target Task ID (e.g. TASK-002)
 * @param {string} [options.query] - Free-text query or topic
 * @param {string[]} [options.files] - Target files being inspected or modified
 * @param {number} [options.limit=5] - Maximum items per category
 * @returns {{
 *   query_context: { task_id?: string, query?: string, files?: string[] },
 *   relevant_decisions: Array<{ id: string, title: string, status: string, score: number, reason: string }>,
 *   relevant_changes: Array<{ date: string, task_id: string, summary: string, score: number, matched_files: string[] }>,
 *   relevant_completed_tasks: Array<{ id: string, title: string, score: number }>,
 *   suggested_files: string[]
 * }}
 */
export function getRelevantContext(rootDir, options = {}) {
  const { task_id, query = "", files = [], limit = 5 } = options;

  const { tasks } = readTasks(rootDir);
  const { decisions } = readDecisions(rootDir);
  const { entries: changelog } = readChangelog(rootDir, 30);

  // 1. Identify target task metadata if task_id provided
  let targetTask = null;
  if (task_id) {
    targetTask = tasks.find((t) => t.id === task_id);
  }

  // Construct target query text & tokens
  const targetText = [
    query,
    targetTask?.title || "",
    targetTask?.description || "",
    targetTask?.acceptance_criteria?.join(" ") || "",
  ].join(" ");

  const targetTokens = tokenize(targetText);
  const targetFiles = [...files];

  // 2. Score Decisions (ADRs)
  const scoredDecisions = decisions.map((dec) => {
    let score = 0;
    const reasons = [];

    // Check direct task reference
    if (task_id && dec.raw && dec.raw.includes(task_id)) {
      score += 10.0;
      reasons.push(`Directly references ${task_id}`);
    }

    // Token similarity
    const decTokens = tokenize(`${dec.title} ${dec.decision} ${dec.context || ""} ${dec.reason || ""}`);
    const tokenSim = jaccardSimilarity(targetTokens, decTokens);
    if (tokenSim > 0.02) {
      score += tokenSim * 10.0;
      reasons.push("Keyword topic alignment");
    }

    // Component alignment
    if (targetText.toLowerCase().includes("mcp") && dec.title.toLowerCase().includes("mcp")) {
      score += 4.0;
      reasons.push("MCP architecture alignment");
    }

    return {
      id: dec.id,
      title: dec.title,
      status: dec.status,
      score: Number(score.toFixed(2)),
      reason: reasons.join("; ") || "General architectural context",
    };
  });

  scoredDecisions.sort((a, b) => b.score - a.score);

  // 3. Score Changelog Entries
  const scoredChanges = changelog.map((entry) => {
    let score = 0;
    const matchedFiles = [];

    // Exact task match
    if (task_id && entry.task_id === task_id) {
      score += 10.0;
    }

    // File overlap
    if (Array.isArray(entry.files)) {
      for (const ef of entry.files) {
        for (const tf of targetFiles) {
          const pr = pathRelevance(ef, tf);
          if (pr > 0.3) {
            score += pr * 5.0;
            matchedFiles.push(ef);
          }
        }
      }
    }

    // Token similarity with summary
    const entryTokens = tokenize(`${entry.summary} ${entry.title || ""}`);
    const sim = jaccardSimilarity(targetTokens, entryTokens);
    if (sim > 0.05) {
      score += sim * 6.0;
    }

    return {
      date: entry.date,
      task_id: entry.task_id,
      summary: entry.summary,
      score: Number(score.toFixed(2)),
      matched_files: Array.from(new Set(matchedFiles)),
    };
  });

  scoredChanges.sort((a, b) => b.score - a.score);

  // 4. Score Completed Tasks for Precedence
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED" && t.id !== task_id);
  const scoredCompletedTasks = completedTasks.map((ct) => {
    let score = 0;
    if (targetTask && targetTask.dependencies && targetTask.dependencies.includes(ct.id)) {
      score += 8.0;
    }
    const ctTokens = tokenize(`${ct.title} ${ct.description || ""}`);
    const sim = jaccardSimilarity(targetTokens, ctTokens);
    score += sim * 5.0;

    return {
      id: ct.id,
      title: ct.title,
      score: Number(score.toFixed(2)),
    };
  });

  scoredCompletedTasks.sort((a, b) => b.score - a.score);

  // 5. Derive Suggested Relevant File Pointers
  const suggestedFiles = new Set();
  for (const c of scoredChanges.slice(0, 5)) {
    for (const f of c.matched_files || []) {
      suggestedFiles.add(f);
    }
  }

  // Extract explicit file paths from target task description & criteria
  if (targetTask) {
    const taskContent = `${targetTask.description || ""} ${(targetTask.acceptance_criteria || []).join(" ")}`;
    const pathMatches = taskContent.match(/[a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+/g) || [];
    for (const pm of pathMatches) {
      if (pm.includes("/") && !pm.startsWith("http") && !pm.startsWith("node_modules")) {
        suggestedFiles.add(pm);
      }
    }
  }

  // Load custom project component hints from config.json if configured
  const lowerTarget = targetText.toLowerCase();
  const projCfg = readProjectConfig(rootDir);
  const customHints = projCfg.component_hints || projCfg.invariants?.componentPaths || {};
  for (const [kw, paths] of Object.entries(customHints)) {
    if (lowerTarget.includes(kw.toLowerCase())) {
      const arr = Array.isArray(paths) ? paths : [paths];
      arr.forEach((p) => suggestedFiles.add(p));
    }
  }

  if (lowerTarget.includes("mcp") || lowerTarget.includes("context")) {
    if (fs.existsSync(path.join(rootDir, "tools", "project-context", "src", "mcp-server.js"))) {
      suggestedFiles.add("tools/project-context/src/mcp-server.js");
      suggestedFiles.add("tools/project-context/src/core.js");
    }
  }

  // 6. Progressive Context Fusion: Enrich candidate files with 1-hop Graphify structural neighbors
  try {
    const graphStatus = inspectGraphifyStatus(rootDir);
    if (graphStatus.state === GRAPHIFY_STATES.AVAILABLE || graphStatus.state === GRAPHIFY_STATES.STALE) {
      // Seed neighbors from initial suggested files and target files
      const seedFiles = [...Array.from(suggestedFiles).slice(0, 3), ...targetFiles.slice(0, 3)];
      for (const sf of seedFiles) {
        const neighbors = getStructuralNeighbors(rootDir, sf, { limit: 3 });
        for (const n of neighbors) {
          suggestedFiles.add(n);
          if (suggestedFiles.size >= 15) break;
        }
        if (suggestedFiles.size >= 15) break;
      }
    }
  } catch {
    // Graceful degradation: If Graphify inspection fails or graph is corrupted, continue cleanly
  }

  return {
    query_context: {
      task_id,
      query: query || undefined,
      files: targetFiles.length > 0 ? targetFiles : undefined,
    },
    relevant_decisions: scoredDecisions.filter((d) => d.score > 0).slice(0, limit),
    relevant_changes: scoredChanges.filter((c) => c.score > 0).slice(0, limit),
    relevant_completed_tasks: scoredCompletedTasks.filter((t) => t.score > 0).slice(0, limit),
    suggested_files: Array.from(suggestedFiles).slice(0, 15),
  };
}

/**
 * Executes Dual-Source Progressive Context Fusion:
 * Composes Crux semantic context, Graphify structural context, and Git state
 * into a single bounded, deterministic, safe FusedContext structure.
 *
 * @param {string} rootDir - Target project root
 * @param {object} [options={}]
 * @param {string} [options.task_id] - Optional target task ID (e.g. TASK-002)
 * @param {string} [options.query] - Optional free-text topic query
 * @param {string[]} [options.files] - Optional list of files being inspected
 * @param {number} [options.limit=5] - Semantic item limit (default 5)
 * @param {number} [options.maxNeighbors=5] - Max structural neighbors (default 5)
 * @param {number} [options.maxCommunityFiles=5] - Max community cluster files (default 5)
 * @param {number} [options.maxSuggestedFiles=15] - Hard cap on combined suggested files (default 15)
 * @returns {{
 *   project_id: string,
 *   project_name: string,
 *   query_context: { task_id?: string, query?: string, files?: string[] },
 *   semantic_context: {
 *     decisions: Array<{ id: string, title: string, status: string, score: number, reason: string }>,
 *     changes: Array<{ date: string, task_id: string, summary: string, score: number, matched_files: string[] }>,
 *     completed_tasks: Array<{ id: string, title: string, score: number }>
 *   },
 *   structural_context: {
 *     state: 'AVAILABLE' | 'STALE' | 'MISSING' | 'INVALID',
 *     is_stale: boolean,
 *     built_commit: string | null,
 *     head_commit: string | null,
 *     neighbors: Array<{ file: string, relation: 'caller' | 'dependency', from: string }>,
 *     community?: { id: number | string, name?: string, files: string[] },
 *     error?: string
 *   },
 *   suggested_files: string[]
 * }}
 */
export function getFusedContext(rootDir, options = {}) {
  const {
    task_id,
    query = "",
    files = [],
    limit = 5,
    maxNeighbors = 5,
    maxCommunityFiles = 5,
    maxSuggestedFiles = 15,
  } = options;

  // 1. Resolve project root and read identity
  const projCfg = readProjectConfig(rootDir);
  const projectId = projCfg.project_id || path.basename(path.resolve(rootDir)) || "project";
  const projectName = projCfg.project_name || path.basename(path.resolve(rootDir)) || "Project";

  // 2. Fetch semantic context using deterministic relevance engine
  const baseSemantic = getRelevantContext(rootDir, {
    task_id,
    query,
    files,
    limit,
  });

  // 3. Inspect Graphify structural state
  let graphStatus;
  try {
    graphStatus = inspectGraphifyStatus(rootDir);
  } catch (err) {
    graphStatus = {
      state: GRAPHIFY_STATES.INVALID,
      isStale: false,
      builtCommit: null,
      headCommit: null,
      error: err.message,
    };
  }

  // 4. Extract 1-hop structural relationships and community cluster if AVAILABLE or STALE
  const structuralNeighbors = [];
  let primaryCommunity = undefined;
  const combinedFiles = new Set(baseSemantic.suggested_files);

  if (graphStatus.state === GRAPHIFY_STATES.AVAILABLE || graphStatus.state === GRAPHIFY_STATES.STALE) {
    try {
      const graphData = loadGraphData(rootDir);
      // Determine seed files from explicit files or top semantic suggestions
      const seedFiles = files.length > 0
        ? files.slice(0, 3)
        : baseSemantic.suggested_files.slice(0, 3);

      const seenNeighborFiles = new Set();

      for (const seed of seedFiles) {
        if (!seed || typeof seed !== "string") continue;
        const normSeed = seed.replace(/\\/g, "/");

        // Extract detailed neighbors with relation provenance
        const neighbors = getDetailedStructuralNeighbors(rootDir, normSeed, {
          limit: maxNeighbors,
          includeCallers: true,
          includeDependencies: true,
        });

        for (const n of neighbors) {
          if (!seenNeighborFiles.has(n.file)) {
            seenNeighborFiles.add(n.file);
            structuralNeighbors.push(n);
            combinedFiles.add(n.file);
          }
          if (structuralNeighbors.length >= maxNeighbors) break;
        }

        // Identify community cluster for first seed node if available
        if (!primaryCommunity && graphData && graphData.fileNodeMap) {
          const normSeedLower = normSeed.toLowerCase();
          for (const [fPath, nodes] of graphData.fileNodeMap.entries()) {
            const fLower = fPath.toLowerCase();
            if (fLower === normSeedLower || fLower.endsWith(`/${normSeedLower}`) || normSeedLower.endsWith(`/${fLower}`)) {
              const matchedNode = nodes[0];
              if (matchedNode && matchedNode.community !== undefined) {
                const commFiles = getCommunityFiles(rootDir, matchedNode.community);
                primaryCommunity = {
                  id: matchedNode.community,
                  name: matchedNode.community_name || undefined,
                  files: commFiles.slice(0, maxCommunityFiles),
                };
                for (const cf of primaryCommunity.files) {
                  combinedFiles.add(cf);
                }
              }
              break;
            }
          }
        }

        if (structuralNeighbors.length >= maxNeighbors) break;
      }
    } catch {
      // Fail closed gracefully on graph extraction errors
    }
  }

  // 5. Construct final FusedContext object
  const fused = {
    project_id: projectId,
    project_name: projectName,
    query_context: {
      task_id: task_id || undefined,
      query: query || undefined,
      files: files.length > 0 ? files : undefined,
    },
    semantic_context: {
      decisions: baseSemantic.relevant_decisions.slice(0, limit),
      changes: baseSemantic.relevant_changes.slice(0, limit),
      completed_tasks: baseSemantic.relevant_completed_tasks.slice(0, limit),
    },
    structural_context: {
      state: graphStatus.state,
      is_stale: Boolean(graphStatus.isStale),
      built_commit: graphStatus.builtCommit || null,
      head_commit: graphStatus.headCommit || null,
      neighbors: structuralNeighbors.slice(0, maxNeighbors),
      community: primaryCommunity,
      error: graphStatus.error || undefined,
    },
    suggested_files: Array.from(combinedFiles).slice(0, maxSuggestedFiles),
  };

  // 6. Security verification: audit against credentials or secrets
  assertNoSecrets(fused, "getFusedContext");

  return fused;
}

// Alias for getFusedContext
export const fuseContext = getFusedContext;
