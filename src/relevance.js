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

  return {
    query_context: {
      task_id,
      query: query || undefined,
      files: targetFiles.length > 0 ? targetFiles : undefined,
    },
    relevant_decisions: scoredDecisions.filter((d) => d.score > 0).slice(0, limit),
    relevant_changes: scoredChanges.filter((c) => c.score > 0).slice(0, limit),
    relevant_completed_tasks: scoredCompletedTasks.filter((t) => t.score > 0).slice(0, limit),
    suggested_files: Array.from(suggestedFiles).slice(0, 10),
  };
}
