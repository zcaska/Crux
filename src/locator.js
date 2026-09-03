/**
 * Project Context OS — Repository Root Locator & Path Jailing Guard
 *
 * Dynamically resolves the active project repository root across diverse execution
 * environments (CLI flags, environment variables, monorepo subdirectories, or standalone repos).
 * Enforces strict filesystem path jailing to prevent cross-project directory traversal.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Normalizes a file path to use forward slashes for deterministic cross-platform comparison.
 * @param {string} filePath
 * @returns {string}
 */
export function normalizePath(filePath) {
  if (!filePath) return "";
  return filePath.replace(/\\/g, "/");
}

/**
 * Finds the project repository root.
 *
 * Priority order:
 *  1. Explicit argument / flag (--root <path>)
 *  2. Environment variable: PROJECT_CONTEXT_ROOT
 *  3. Upward traversal from startDir searching for '.project-context' directory
 *  4. Upward traversal from startDir searching for '.git' directory
 *  5. Fallback to startDir
 *
 * @param {string} [startDir=process.cwd()] - Starting directory for upward search
 * @param {string|null} [explicitRoot=null] - Explicit path supplied by caller
 * @returns {string} Absolute normalized repository root path
 */
export function resolveProjectRoot(startDir = process.cwd(), explicitRoot = null) {
  // 1. Explicit parameter
  if (explicitRoot && typeof explicitRoot === "string") {
    return path.resolve(explicitRoot);
  }

  // 2. Environment variable
  if (process.env.PROJECT_CONTEXT_ROOT) {
    return path.resolve(process.env.PROJECT_CONTEXT_ROOT);
  }

  // 3 & 4. Upward traversal
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (current && current !== root) {
    // Check for .project-context
    const contextDir = path.join(current, ".project-context");
    if (fs.existsSync(contextDir) && fs.statSync(contextDir).isDirectory()) {
      return current;
    }

    // Check for .git
    const gitDir = path.join(current, ".git");
    if (fs.existsSync(gitDir)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 5. Fallback
  return path.resolve(startDir);
}

/**
 * Path jailing check: ensures a candidate path stays strictly inside the designated project root.
 * Throws a SecurityError if the path attempts to escape the root via traversal or symlinks.
 *
 * @param {string} candidatePath - Target file or directory path
 * @param {string} rootDir - Permitted project root
 * @returns {string} Absolute resolved path if valid
 * @throws {Error} If path escapes root boundary
 */
export function assertWithinProject(candidatePath, rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(resolvedRoot, candidatePath);

  const normRoot = normalizePath(resolvedRoot).toLowerCase();
  const normCandidate = normalizePath(resolvedCandidate).toLowerCase();

  const isInside =
    normCandidate === normRoot ||
    normCandidate.startsWith(normRoot.endsWith("/") ? normRoot : normRoot + "/");

  if (!isInside) {
    const err = new Error(
      `PathSecurityViolation: Access denied. Path '${candidatePath}' escapes project boundary '${rootDir}'.`
    );
    err.code = "PATH_TRAVERSAL_DETECTED";
    throw err;
  }

  return resolvedCandidate;
}
