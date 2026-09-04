/**
 * Project Context OS — Agent Session Registry
 *
 * Manages active agent sessions, heartbeats, and working areas across different
 * models, interfaces, and routers. Maintains per-agent isolation in
 * .project-context/active-work/<agent>.md and automatically recompiles ACTIVE-WORK.md.
 */

import fs from "node:fs";
import path from "node:path";
import {
  readActiveWork,
  updateActiveWork,
  recompileActiveWork,
  readState,
  updateState,
  getContextDir,
  parseFrontmatter,
} from "./core.js";
import { assertNoSecrets } from "./security.js";

const DEFAULT_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Registers and starts an agent session.
 * @param {string} rootDir
 * @param {object} sessionInput
 */
export function startSession(rootDir, sessionInput) {
  assertNoSecrets(sessionInput, "startSession");

  const agent = (sessionInput.agent || "").trim().toLowerCase();
  if (!agent) {
    throw new Error("Agent name is required to start a session.");
  }
  if (agent.includes("..") || agent.includes("/") || agent.includes("\\")) {
    const err = new Error(`PathSecurityViolation: Agent name '${sessionInput.agent}' contains illegal path traversal characters.`);
    err.code = "PATH_TRAVERSAL_DETECTED";
    throw err;
  }

  const now = new Date().toISOString();
  const sessionData = {
    agent,
    interface: sessionInput.interface || "kilo-code",
    router: sessionInput.router || "omniroute",
    model: sessionInput.model || "unknown",
    active_task: sessionInput.active_task || sessionInput.task_id || "NONE",
    task_title: sessionInput.task_title || sessionInput.title || "Active Session",
    status: "IN_PROGRESS",
    started_at: now,
    last_activity: now,
    updated_at: now,
    objective: sessionInput.objective || "Active development session.",
    progress: sessionInput.progress || "Session started.",
    working_area: sessionInput.working_area || sessionInput.files || [],
    files: sessionInput.files || sessionInput.working_area || [],
    tests: sessionInput.tests || [],
    blockers: sessionInput.blockers || "None.",
    next_action: sessionInput.next_action || "Bootstrap context and commence tasks.",
  };

  // Update active-work descriptor
  const activeRes = updateActiveWork(rootDir, sessionData);

  // Update current agent in project state
  updateState(rootDir, {
    last_agent: agent,
    current_agent: {
      agent,
      interface: sessionData.interface,
      router: sessionData.router,
      model: sessionData.model,
    },
    active_work_summary: `${agent} working on ${sessionData.active_task}: ${sessionData.task_title}`,
  });

  return {
    success: true,
    agent,
    interface: sessionData.interface,
    router: sessionData.router,
    model: sessionData.model,
    session: sessionData,
    filePath: activeRes.filePath,
  };
}

/**
 * Updates an active session heartbeat and current progress.
 * @param {string} rootDir
 * @param {string} agent
 * @param {object} [updates={}]
 */
export function heartbeatSession(rootDir, agent, updates = {}) {
  assertNoSecrets(updates, "heartbeatSession");

  const agentName = (agent || "").trim().toLowerCase();
  const contextDir = getContextDir(rootDir);
  const filePath = path.join(contextDir, "active-work", `${agentName}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`No active session found for agent '${agentName}'. Please start a session first.`);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const { meta } = parseFrontmatter(raw);
  const now = new Date().toISOString();

  const merged = {
    agent: agentName,
    interface: updates.interface || meta.interface || "kilo-code",
    router: updates.router || meta.router || "omniroute",
    model: updates.model || meta.model || "unknown",
    active_task: updates.active_task || updates.task_id || meta.active_task || "NONE",
    task_title: updates.task_title || meta.task_title || "Active Task",
    status: updates.status || meta.status || "IN_PROGRESS",
    started_at: meta.started_at || now,
    last_activity: now,
    updated_at: now,
    objective: updates.objective || "Session in progress.",
    progress: updates.progress || "Heartbeat recorded.",
    working_area: updates.working_area || updates.files || [],
    files: updates.files || [],
    tests: updates.tests || [],
    blockers: updates.blockers || "None.",
    next_action: updates.next_action || "Continue execution.",
  };

  updateActiveWork(rootDir, merged);

  return {
    success: true,
    agent: agentName,
    last_activity: now,
    status: merged.status,
  };
}

/**
 * Lists all registered agent sessions and calculates staleness and granular liveness.
 * @param {string} rootDir
 * @param {object} [options={}]
 * @param {number} [options.staleThresholdMs=86400000]
 */
export function listSessions(rootDir, options = {}) {
  const staleThreshold = options.staleThresholdMs || DEFAULT_STALE_THRESHOLD_MS;
  const { agents } = readActiveWork(rootDir);
  const now = Date.now();

  const ONE_HOUR_MS = 60 * 60 * 1000;
  const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

  const sessions = agents.map((a) => {
    const lastActivityTime = a.last_activity ? new Date(a.last_activity).getTime() : new Date(a.updated_at).getTime();
    const idleDurationMs = Math.max(0, now - lastActivityTime);
    const isStale = a.status === "IN_PROGRESS" && idleDurationMs > staleThreshold;

    let liveness = "UNKNOWN";
    if (a.status === "COMPLETED") {
      liveness = "COMPLETED";
    } else if (a.status === "IN_PROGRESS") {
      if (idleDurationMs <= ONE_HOUR_MS) {
        liveness = "ACTIVE";
      } else if (idleDurationMs <= staleThreshold) {
        liveness = "ACTIVE_BUT_IDLE";
      } else if (idleDurationMs <= SEVENTY_TWO_HOURS_MS) {
        liveness = "STALE";
      } else {
        liveness = "ABANDONED";
      }
    }

    return {
      agent: a.agent,
      interface: a.interface,
      router: a.router,
      model: a.model,
      active_task: a.active_task,
      task_title: a.task_title,
      status: a.status,
      liveness,
      started_at: a.started_at,
      last_activity: a.last_activity || a.updated_at,
      updated_at: a.updated_at,
      working_area: a.working_area || a.files || [],
      files: a.files || a.working_area || [],
      idleDurationMs,
      idleDurationHours: (idleDurationMs / (1000 * 60 * 60)).toFixed(1),
      isStale,
      file: a.file,
    };
  });

  return {
    total: sessions.length,
    active_count: sessions.filter((s) => s.status === "IN_PROGRESS" && !s.isStale).length,
    stale_count: sessions.filter((s) => s.isStale).length,
    completed_count: sessions.filter((s) => s.status === "COMPLETED").length,
    sessions,
  };
}

/**
 * Detects working area collisions between concurrent active sessions.
 * @param {string} rootDir
 * @returns {{ hasCollisions: boolean, count: number, collisions: Array<{ agent_a: string, agent_b: string, task_a: string, task_b: string, area_a: string, area_b: string, type: 'EXACT'|'OVERLAP', subtype: 'EXACT'|'CONTAINMENT_DIR_FILE'|'CONTAINMENT_DIR_DIR', recommendation: string }> }}
 */
export function checkWorkingAreaCollisions(rootDir) {
  const { agents } = readActiveWork(rootDir);
  const active = agents.filter((a) => a.status === "IN_PROGRESS");
  const collisions = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const areasA = a.working_area || a.files || [];
      const areasB = b.working_area || b.files || [];

      for (const pA of areasA) {
        for (const pB of areasB) {
          const normA = pA.replace(/\\/g, "/").toLowerCase();
          const normB = pB.replace(/\\/g, "/").toLowerCase();

          const prefixA = normA.endsWith("/") ? normA : normA + "/";
          const prefixB = normB.endsWith("/") ? normB : normB + "/";

          if (normA === normB) {
            collisions.push({
              agent_a: a.agent,
              agent_b: b.agent,
              task_a: a.active_task || "NONE",
              task_b: b.active_task || "NONE",
              area_a: pA,
              area_b: pB,
              type: "EXACT",
              subtype: "EXACT",
              recommendation: `Exact collision on '${pA}'. Agents '${a.agent}' and '${b.agent}' should coordinate sequentially via handoffs or partition file responsibilities.`,
            });
          } else if (normA.startsWith(prefixB) || normB.startsWith(prefixA)) {
            // Determine whether containment is dir->file or dir->dir
            const aIsParent = normB.startsWith(prefixA);
            const parentArea = aIsParent ? pA : pB;
            const childArea = aIsParent ? pB : pA;
            const parentNorm = aIsParent ? normA : normB;
            const childNorm = aIsParent ? normB : normA;

            const isChildFile = path.extname(childNorm).length > 0 || !childArea.endsWith("/");
            const isParentDir = parentArea.endsWith("/") || path.extname(parentNorm).length === 0;

            const subtype = (isParentDir && isChildFile) ? "CONTAINMENT_DIR_FILE" : "CONTAINMENT_DIR_DIR";

            collisions.push({
              agent_a: a.agent,
              agent_b: b.agent,
              task_a: a.active_task || "NONE",
              task_b: b.active_task || "NONE",
              area_a: pA,
              area_b: pB,
              type: "OVERLAP",
              subtype,
              recommendation: `Hierarchical scope overlap: '${parentArea}' contains '${childArea}'. Recommend excluding '${childArea}' from the parent directory scope or sequencing tasks.`,
            });
          }
        }
      }
    }
  }

  return {
    hasCollisions: collisions.length > 0,
    count: collisions.length,
    collisions,
  };
}

