/**
 * Project Context OS — Graphify Structural Integration Engine
 *
 * Inspects repository-local Graphify artifacts (graphify-out/) as a separate,
 * read-only structural source of truth.
 *
 * Explicit Graphify Integration States:
 *   - AVAILABLE: graphify-out/graph.json exists, is valid JSON, and contains graph nodes.
 *   - MISSING:   graphify-out/ does not exist or graph.json is absent.
 *   - STALE:     graphify-out/ exists and is valid, but is older than HEAD commit or source files.
 *   - INVALID:   graphify-out/ exists but graph.json is unparseable or schema-corrupted.
 *
 * Invariant: Never mutates or destroys graphify-out/. Pure read-only inspection.
 */

import fs from "node:fs";
import path from "node:path";
import { assertWithinProject } from "./locator.js";
import { execGit } from "./git.js";

export const GRAPHIFY_STATES = {
  AVAILABLE: "AVAILABLE",
  MISSING: "MISSING",
  STALE: "STALE",
  INVALID: "INVALID",
};

/**
 * In-memory parsed graph cache to prevent expensive repetitive JSON parsing.
 * Keyed by resolved graph.json path.
 */
const graphCache = new Map();

/**
 * Clears the in-memory graph cache (useful for testing and memory reclaim).
 */
export function clearGraphCache() {
  graphCache.clear();
}

/**
 * Returns the expected graphify output directory for the given project root.
 * @param {string} rootDir
 * @returns {string}
 */
export function getGraphifyDir(rootDir) {
  return path.resolve(rootDir, "graphify-out");
}

/**
 * Determines the status of Graphify in the designated project root.
 *
 * @param {string} rootDir
 * @returns {{
 *   state: 'AVAILABLE' | 'MISSING' | 'STALE' | 'INVALID',
 *   graphPath: string | null,
 *   nodeCount: number,
 *   edgeCount: number,
 *   builtCommit: string | null,
 *   headCommit: string | null,
 *   isStale: boolean,
 *   error?: string
 * }}
 */
export function inspectGraphifyStatus(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const graphifyDir = getGraphifyDir(resolvedRoot);
  const graphJsonPath = path.join(graphifyDir, "graph.json");
  const reportPath = path.join(graphifyDir, "GRAPH_REPORT.md");

  // 1. Check if graphify-out/ and graph.json exist
  if (!fs.existsSync(graphifyDir) || !fs.existsSync(graphJsonPath)) {
    return {
      state: GRAPHIFY_STATES.MISSING,
      graphPath: null,
      nodeCount: 0,
      edgeCount: 0,
      builtCommit: null,
      headCommit: null,
      isStale: false,
    };
  }

  // Jailing check
  assertWithinProject(graphJsonPath, resolvedRoot);

  // 2. Attempt parsing graph.json or reading cached version
  let graphData;
  try {
    const raw = fs.readFileSync(graphJsonPath, "utf-8");
    graphData = JSON.parse(raw);
  } catch (err) {
    return {
      state: GRAPHIFY_STATES.INVALID,
      graphPath: graphJsonPath,
      nodeCount: 0,
      edgeCount: 0,
      builtCommit: null,
      headCommit: null,
      isStale: false,
      error: `Failed to parse graph.json: ${err.message}`,
    };
  }

  // Verify basic structure
  const nodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];
  const edges = Array.isArray(graphData.links)
    ? graphData.links
    : Array.isArray(graphData.edges)
      ? graphData.edges
      : [];

  if (!Array.isArray(graphData.nodes)) {
    return {
      state: GRAPHIFY_STATES.INVALID,
      graphPath: graphJsonPath,
      nodeCount: 0,
      edgeCount: 0,
      builtCommit: null,
      headCommit: null,
      isStale: false,
      error: "graph.json missing top-level 'nodes' array.",
    };
  }

  // 3. Check Staleness via Git commit or file modification timestamps
  let builtCommit = graphData.built_at_commit || graphData.git_commit || null;
  let headCommit = null;
  let isStale = false;

  // If not in graph.json, extract built commit from GRAPH_REPORT.md if present
  if (!builtCommit && fs.existsSync(reportPath)) {
    try {
      const reportText = fs.readFileSync(reportPath, "utf-8");
      const commitMatch = reportText.match(/Built from commit:\s*`?([a-f0-9]+)`?/i);
      if (commitMatch) {
        builtCommit = commitMatch[1];
      }
    } catch {}
  }

  // Extract current HEAD commit via execGit
  try {
    headCommit = execGit("rev-parse --short HEAD", resolvedRoot);
    if (builtCommit && headCommit) {
      if (!headCommit.startsWith(builtCommit) && !builtCommit.startsWith(headCommit)) {
        isStale = true;
      }
    }
  } catch {
    // If not a git repo or detached HEAD, fallback to filesystem mtime comparisons
    try {
      const graphMtime = fs.statSync(graphJsonPath).mtimeMs;
      // Check if context STATE.md or common source files are substantially newer (> 1 minute)
      const stateFile = path.join(resolvedRoot, ".project-context", "STATE.md");
      if (fs.existsSync(stateFile)) {
        const stateMtime = fs.statSync(stateFile).mtimeMs;
        if (stateMtime > graphMtime + 60000) {
          isStale = true;
        }
      }
    } catch {}
  }

  return {
    state: isStale ? GRAPHIFY_STATES.STALE : GRAPHIFY_STATES.AVAILABLE,
    graphPath: graphJsonPath,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    builtCommit,
    headCommit,
    isStale,
  };
}

/**
 * Loads graph data with in-memory caching and mtime invalidation.
 * Indexed for fast O(1) neighbor and community lookups.
 *
 * @param {string} rootDir
 * @returns {{
 *   loaded: boolean,
 *   mtimeMs: number,
 *   data: object,
 *   nodeIndex: Map<string, object>,
 *   fileNodeMap: Map<string, Array<object>>,
 *   incomingEdges: Map<string, Array<object>>,
 *   outgoingEdges: Map<string, Array<object>>,
 *   communityMap: Map<string, Array<object>>,
 *   nodeCount: number,
 *   edgeCount: number
 * } | null}
 */
export function loadGraphData(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const graphifyDir = getGraphifyDir(resolvedRoot);
  const graphJsonPath = path.join(graphifyDir, "graph.json");

  if (!fs.existsSync(graphJsonPath)) {
    return null;
  }

  assertWithinProject(graphJsonPath, resolvedRoot);

  let stat;
  try {
    stat = fs.statSync(graphJsonPath);
  } catch {
    return null;
  }

  const cached = graphCache.get(graphJsonPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached;
  }

  try {
    const raw = fs.readFileSync(graphJsonPath, "utf-8");
    const data = JSON.parse(raw);
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const edges = Array.isArray(data.links)
      ? data.links
      : Array.isArray(data.edges)
        ? data.edges
        : [];

    const nodeIndex = new Map();
    const fileNodeMap = new Map();
    const communityMap = new Map();

    for (const n of nodes) {
      if (!n || !n.id) continue;
      nodeIndex.set(n.id, n);

      // Normalize source file path
      if (n.source_file) {
        const normFile = n.source_file.replace(/\\/g, "/");
        if (!fileNodeMap.has(normFile)) {
          fileNodeMap.set(normFile, []);
        }
        fileNodeMap.get(normFile).push(n);
      }

      // Community index
      if (n.community !== undefined) {
        const commKey = String(n.community);
        if (!communityMap.has(commKey)) {
          communityMap.set(commKey, []);
        }
        communityMap.get(commKey).push(n);
      }
      if (n.community_name) {
        const commNameKey = String(n.community_name).toLowerCase();
        if (!communityMap.has(commNameKey)) {
          communityMap.set(commNameKey, []);
        }
        communityMap.get(commNameKey).push(n);
      }
    }

    const outgoingEdges = new Map();
    const incomingEdges = new Map();

    for (const e of edges) {
      if (!e || !e.source || !e.target) continue;
      const srcId = typeof e.source === "object" ? e.source.id : e.source;
      const tgtId = typeof e.target === "object" ? e.target.id : e.target;

      if (!outgoingEdges.has(srcId)) outgoingEdges.set(srcId, []);
      outgoingEdges.get(srcId).push({ target: tgtId, relation: e.relation, edge: e });

      if (!incomingEdges.has(tgtId)) incomingEdges.set(tgtId, []);
      incomingEdges.get(tgtId).push({ source: srcId, relation: e.relation, edge: e });
    }

    const entry = {
      loaded: true,
      mtimeMs: stat.mtimeMs,
      data,
      nodeIndex,
      fileNodeMap,
      outgoingEdges,
      incomingEdges,
      communityMap,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };

    graphCache.set(graphJsonPath, entry);
    return entry;
  } catch {
    return null;
  }
}

/**
 * Traverses 1-hop structural dependencies and callers for a given source file.
 * Returns an array of connected source file paths.
 *
 * @param {string} rootDir
 * @param {string} filePath - Relative or base path of the source file
 * @param {object} [options={}]
 * @param {number} [options.limit=10]
 * @param {boolean} [options.includeCallers=true]
 * @param {boolean} [options.includeDependencies=true]
 * @returns {string[]} Deduplicated relative paths of neighbor files
 */
export function getStructuralNeighbors(rootDir, filePath, options = {}) {
  if (!filePath || typeof filePath !== "string") return [];

  const graph = loadGraphData(rootDir);
  if (!graph || !graph.loaded) return [];

  const limit = options.limit || 10;
  const includeCallers = options.includeCallers !== false;
  const includeDependencies = options.includeDependencies !== false;

  const normTarget = filePath.replace(/\\/g, "/").toLowerCase();
  const targetNodeIds = new Set();

  // Exact or suffix match on source_file
  for (const [fPath, nodes] of graph.fileNodeMap.entries()) {
    const fLower = fPath.toLowerCase();
    if (fLower === normTarget || fLower.endsWith(`/${normTarget}`) || normTarget.endsWith(`/${fLower}`)) {
      for (const n of nodes) {
        targetNodeIds.add(n.id);
      }
    }
  }

  if (targetNodeIds.size === 0) return [];

  const neighborFiles = new Set();

  for (const nodeId of targetNodeIds) {
    // 1. Dependencies (outgoing edges: this node -> targets)
    if (includeDependencies && graph.outgoingEdges.has(nodeId)) {
      for (const out of graph.outgoingEdges.get(nodeId)) {
        const tgtNode = graph.nodeIndex.get(out.target);
        if (tgtNode && tgtNode.source_file) {
          const tgtNorm = tgtNode.source_file.replace(/\\/g, "/");
          if (!normTarget.endsWith(tgtNorm.toLowerCase()) && !tgtNorm.toLowerCase().endsWith(normTarget)) {
            neighborFiles.add(tgtNorm);
          }
        }
      }
    }

    // 2. Callers (incoming edges: callers -> this node)
    if (includeCallers && graph.incomingEdges.has(nodeId)) {
      for (const inc of graph.incomingEdges.get(nodeId)) {
        const srcNode = graph.nodeIndex.get(inc.source);
        if (srcNode && srcNode.source_file) {
          const srcNorm = srcNode.source_file.replace(/\\/g, "/");
          if (!normTarget.endsWith(srcNorm.toLowerCase()) && !srcNorm.toLowerCase().endsWith(normTarget)) {
            neighborFiles.add(srcNorm);
          }
        }
      }
    }

    if (neighborFiles.size >= limit * 2) break;
  }

  return Array.from(neighborFiles).slice(0, limit);
}

/**
 * Traverses 1-hop structural dependencies and callers for a given source file,
 * returning structured relationship objects with relation provenance.
 *
 * @param {string} rootDir
 * @param {string} filePath
 * @param {object} [options={}]
 * @param {number} [options.limit=10]
 * @param {boolean} [options.includeCallers=true]
 * @param {boolean} [options.includeDependencies=true]
 * @returns {Array<{ file: string, relation: 'caller' | 'dependency', from: string }>}
 */
export function getDetailedStructuralNeighbors(rootDir, filePath, options = {}) {
  if (!filePath || typeof filePath !== "string") return [];

  const graph = loadGraphData(rootDir);
  if (!graph || !graph.loaded) return [];

  const limit = options.limit || 10;
  const includeCallers = options.includeCallers !== false;
  const includeDependencies = options.includeDependencies !== false;

  const normTarget = filePath.replace(/\\/g, "/").toLowerCase();
  const targetNodeIds = new Set();

  for (const [fPath, nodes] of graph.fileNodeMap.entries()) {
    const fLower = fPath.toLowerCase();
    if (fLower === normTarget || fLower.endsWith(`/${normTarget}`) || normTarget.endsWith(`/${fLower}`)) {
      for (const n of nodes) {
        targetNodeIds.add(n.id);
      }
    }
  }

  if (targetNodeIds.size === 0) return [];

  const seenFiles = new Set();
  const results = [];

  for (const nodeId of targetNodeIds) {
    // 1. Dependencies (outgoing edges: this node -> targets)
    if (includeDependencies && graph.outgoingEdges.has(nodeId)) {
      for (const out of graph.outgoingEdges.get(nodeId)) {
        const tgtNode = graph.nodeIndex.get(out.target);
        if (tgtNode && tgtNode.source_file) {
          const tgtNorm = tgtNode.source_file.replace(/\\/g, "/");
          const tgtLower = tgtNorm.toLowerCase();
          if (!normTarget.endsWith(tgtLower) && !tgtLower.endsWith(normTarget) && !seenFiles.has(tgtNorm)) {
            seenFiles.add(tgtNorm);
            results.push({
              file: tgtNorm,
              relation: "dependency",
              from: filePath,
            });
            if (results.length >= limit) break;
          }
        }
      }
    }

    // 2. Callers (incoming edges: callers -> this node)
    if (includeCallers && results.length < limit && graph.incomingEdges.has(nodeId)) {
      for (const inc of graph.incomingEdges.get(nodeId)) {
        const srcNode = graph.nodeIndex.get(inc.source);
        if (srcNode && srcNode.source_file) {
          const srcNorm = srcNode.source_file.replace(/\\/g, "/");
          const srcLower = srcNorm.toLowerCase();
          if (!normTarget.endsWith(srcLower) && !srcLower.endsWith(normTarget) && !seenFiles.has(srcNorm)) {
            seenFiles.add(srcNorm);
            results.push({
              file: srcNorm,
              relation: "caller",
              from: filePath,
            });
            if (results.length >= limit) break;
          }
        }
      }
    }

    if (results.length >= limit) break;
  }

  return results.slice(0, limit);
}

/**
 * Returns all source files belonging to a specific community ID or community name.
 *
 * @param {string} rootDir
 * @param {string | number} communityIdOrName
 * @returns {string[]} List of source files
 */
export function getCommunityFiles(rootDir, communityIdOrName) {
  if (communityIdOrName === undefined || communityIdOrName === null) return [];
  const graph = loadGraphData(rootDir);
  if (!graph || !graph.loaded) return [];

  const key = String(communityIdOrName).toLowerCase();
  const nodes = graph.communityMap.get(key) || [];
  const files = new Set();
  for (const n of nodes) {
    if (n.source_file) {
      files.add(n.source_file.replace(/\\/g, "/"));
    }
  }
  return Array.from(files);
}

/**
 * Reads a read-only structural summary from graph.json without loading massive graphs into memory.
 *
 * @param {string} rootDir
 * @param {object} [options={}]
 * @param {number} [options.maxNodes=20]
 * @returns {{
 *   available: boolean,
 *   state: string,
 *   nodeCount: number,
 *   edgeCount: number,
 *   godNodes: Array<{ id: string, label: string, degree?: number, source_file?: string }>,
 *   communitiesCount: number
 * }}
 */
export function getGraphifySummary(rootDir, options = {}) {
  const status = inspectGraphifyStatus(rootDir);
  if (status.state === GRAPHIFY_STATES.MISSING || status.state === GRAPHIFY_STATES.INVALID) {
    return {
      available: false,
      state: status.state,
      nodeCount: 0,
      edgeCount: 0,
      godNodes: [],
      communitiesCount: 0,
      error: status.error,
    };
  }

  const maxNodes = options.maxNodes || 20;

  try {
    const graph = loadGraphData(rootDir);
    if (!graph || !graph.loaded) {
      return {
        available: false,
        state: GRAPHIFY_STATES.INVALID,
        nodeCount: status.nodeCount,
        edgeCount: status.edgeCount,
        godNodes: [],
        communitiesCount: 0,
        error: "Failed to parse or index graph data",
      };
    }

    const nodes = Array.isArray(graph.data.nodes) ? graph.data.nodes : [];
    const communities = new Set();

    for (const n of nodes) {
      if (n.community !== undefined) communities.add(n.community);
    }

    const godNodes = nodes
      .slice(0, maxNodes)
      .map((n) => ({
        id: n.id,
        label: n.label || n.id,
        source_file: n.source_file,
      }));

    return {
      available: true,
      state: status.state,
      nodeCount: status.nodeCount,
      edgeCount: status.edgeCount,
      godNodes,
      communitiesCount: communities.size,
      builtCommit: status.builtCommit,
      isStale: status.isStale,
    };
  } catch (err) {
    return {
      available: false,
      state: GRAPHIFY_STATES.INVALID,
      nodeCount: status.nodeCount,
      edgeCount: status.edgeCount,
      godNodes: [],
      communitiesCount: 0,
      error: err.message,
    };
  }
}

/**
 * Alias for inspectGraphifyStatus with backward/forward-compatible property names.
 * @param {string} rootDir
 * @returns {object}
 */
export function getGraphifyStatus(rootDir) {
  const result = inspectGraphifyStatus(rootDir);
  return {
    ...result,
    exists: result.state !== GRAPHIFY_STATES.MISSING,
    nodesCount: result.nodeCount,
    edgesCount: result.edgeCount,
    godNodes: result.state === GRAPHIFY_STATES.AVAILABLE || result.state === GRAPHIFY_STATES.STALE
      ? (getGraphifySummary(rootDir).godNodes || [])
      : [],
    communitiesCount: result.state === GRAPHIFY_STATES.AVAILABLE || result.state === GRAPHIFY_STATES.STALE
      ? (getGraphifySummary(rootDir).communitiesCount || 0)
      : 0,
  };
}

