/**
 * Project Context OS — Git Hook Automation
 *
 * Installs and manages repository-local Git hooks (e.g. pre-commit) to enforce
 * credential scanning and context integrity automatically on commit.
 */

import fs from "node:fs";
import path from "node:path";

const PRE_COMMIT_HOOK_CONTENT = `#!/usr/bin/env sh
# Project Context OS — Automated Pre-Commit Safety Check
# Validates .project-context/ schema integrity and scans for secret leaks.

echo ">>> Project Context OS: Running pre-commit validation..."
node tools/project-context/bin/project-context.js validate
VALID_EXIT=$?

if [ $VALID_EXIT -ne 0 ]; then
  echo ">>> ERROR: Context OS validation failed or secret credentials detected."
  echo ">>> Aborting commit. Fix violations before committing."
  exit 1
fi

exit 0
`;

/**
 * Installs the Context OS pre-commit hook into .git/hooks/pre-commit.
 * @param {string} rootDir
 */
export function installGitHook(rootDir) {
  const gitDir = path.join(rootDir, ".git");
  if (!fs.existsSync(gitDir)) {
    return { success: false, message: "Not a Git repository (.git directory missing)." };
  }

  const hooksDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const preCommitPath = path.join(hooksDir, "pre-commit");
  fs.writeFileSync(preCommitPath, PRE_COMMIT_HOOK_CONTENT, { mode: 0o755 });

  return {
    success: true,
    message: "Pre-commit hook installed successfully.",
    hookPath: preCommitPath,
  };
}

/**
 * Removes the Context OS pre-commit hook.
 * @param {string} rootDir
 */
export function uninstallGitHook(rootDir) {
  const preCommitPath = path.join(rootDir, ".git", "hooks", "pre-commit");
  if (fs.existsSync(preCommitPath)) {
    fs.unlinkSync(preCommitPath);
    return { success: true, message: "Pre-commit hook uninstalled successfully." };
  }
  return { success: true, message: "Pre-commit hook was not installed." };
}
