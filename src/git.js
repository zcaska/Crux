/**
 * Project Context OS — Git Integration Helper
 *
 * Provides factual Git status, recent commit log, and diff information.
 * All git operations are read-only and local to the repository.
 */

import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Executes a git command safely in the given directory.
 * @param {string} command
 * @param {string} cwd
 * @returns {string}
 */
export function execGit(command, cwd) {
  try {
    return execSync(`git ${command}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    }).trim();
  } catch (err) {
    // If git fails or repository is in detached/fresh state
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(`Git command failed ("git ${command}"): ${stderr}`);
  }
}

/**
 * Returns structured Git working tree status.
 * @param {string} rootDir
 */
export function getGitStatus(rootDir) {
  try {
    let branch = "unknown";
    try {
      branch = execGit("branch --show-current", rootDir);
      if (!branch) {
        branch = execGit("symbolic-ref --short HEAD", rootDir);
      }
    } catch {
      try {
        branch = execGit("rev-parse --abbrev-ref HEAD", rootDir);
      } catch {
        branch = "main (initial)";
      }
    }

    const rawStatus = execGit("status --porcelain=v1", rootDir);

    const staged = [];
    const unstaged = [];
    const untracked = [];

    if (rawStatus) {
      for (const line of rawStatus.split("\n")) {
        const trimmed = line.trimEnd();
        if (!trimmed) continue;
        const x = trimmed[0];
        const y = trimmed[1];
        const filePath = trimmed.slice(3).trim();

        if (x === "?" && y === "?") {
          untracked.push(filePath);
        } else {
          if (x && x !== " " && x !== "?") {
            staged.push({ path: filePath, status: x });
          }
          if (y && y !== " " && y !== "?") {
            unstaged.push({ path: filePath, status: y });
          }
        }
      }
    }

    return {
      branch,
      isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
      staged,
      unstaged,
      untracked,
      totalChanges: staged.length + unstaged.length + untracked.length,
    };
  } catch (err) {
    return {
      branch: "unknown",
      isClean: false,
      staged: [],
      unstaged: [],
      untracked: [],
      totalChanges: 0,
      error: err.message,
    };
  }
}

/**
 * Returns recent Git commits.
 * @param {string} rootDir
 * @param {number} [limit=10]
 */
export function getGitRecentCommits(rootDir, limit = 10) {
  try {
    const raw = execGit(`log -n ${limit} --pretty=format:"%h|%an|%ad|%s" --date=short`, rootDir);
    if (!raw) return [];
    return raw
      .split("\n")
      .map((line) => {
        const parts = line.split("|");
        return {
          hash: parts[0] || "",
          author: parts[1] || "",
          date: parts[2] || "",
          message: parts.slice(3).join("|") || "",
        };
      })
      .filter((c) => Boolean(c.hash));
  } catch {
    return [];
  }
}

/**
 * Returns Git diff for unstaged or staged changes.
 * @param {string} rootDir
 * @param {boolean} [staged=false]
 * @param {string} [filePath]
 */
export function getGitDiff(rootDir, staged = false, filePath = "") {
  try {
    const target = filePath ? ` -- "${filePath}"` : "";
    const flags = staged ? "--cached" : "";
    return execGit(`diff ${flags}${target}`, rootDir);
  } catch (err) {
    return `Error retrieving git diff: ${err.message}`;
  }
}
