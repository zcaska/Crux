/**
 * Project Context OS — Security & Anti-Credential Scanner
 *
 * Scans strings, structured objects, and file contents to detect and prevent
 * accidental persistence of API keys, bearer tokens, private keys, passwords,
 * and confidential credentials.
 *
 * NOTE: Regex pattern scanning is a heuristic layer of defense, not a 100% guarantee.
 */

export const SECRET_PATTERNS = [
  { name: "OpenAI / Anthropic Secret Key", regex: /sk-[a-zA-Z0-9_\-]{20,}/ },
  { name: "GitHub Personal Access Token", regex: /ghp_[a-zA-Z0-9]{20,}/ },
  { name: "GitHub OAuth Token", regex: /gho_[a-zA-Z0-9]{20,}/ },
  { name: "Slack Token", regex: /xox[baprs]-[a-zA-Z0-9\-]{10,}/ },
  { name: "HTTP Bearer Token", regex: /bearer\s+[a-zA-Z0-9_\-\.]{30,}/i },
  { name: "Supabase Secret Key", regex: /sb_secret_[a-zA-Z0-9_\-]{20,}/i },
  { name: "JWT Token", regex: /eyJ[a-zA-Z0-9_\-]{20,}\.eyJ[a-zA-Z0-9_\-]{20,}/ },
  { name: "Private Cryptographic Key", regex: /-----BEGIN\s+([A-Z\s]+)?PRIVATE\s+KEY-----/ },
  { name: "Password Assignment", regex: /(?:password|passwd|pwd)\s*[:=]\s*["']?[^"'\s\n]{8,}["']?/i },
  { name: "Secret Assignment", regex: /(?:secret|client_secret)\s*[:=]\s*["']?[^"'\s\n]{8,}["']?/i },
  { name: "API Key Assignment", regex: /(?:api_key|apikey|api-key)\s*[:=]\s*["']?[^"'\s\n]{8,}["']?/i },
  { name: "Auth Token Assignment", regex: /(?:auth_token|access_token)\s*[:=]\s*["']?[^"'\s\n]{8,}["']?/i },
];

/**
 * Scans arbitrary text or data structures and returns details on any discovered secret patterns.
 * @param {unknown} data - The data to inspect
 * @param {string} [path="root"] - Path identifier for error tracking
 * @returns {Array<{ path: string, patternName: string }>} Discovered violations
 */
export function scanForSecrets(data, path = "root") {
  const violations = [];

  if (data === null || data === undefined) {
    return violations;
  }

  if (typeof data === "string") {
    for (const pat of SECRET_PATTERNS) {
      if (pat.regex.test(data)) {
        violations.push({ path, patternName: pat.name });
      }
    }
    return violations;
  }

  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      violations.push(...scanForSecrets(item, `${path}[${index}]`));
    });
    return violations;
  }

  if (typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("apikey") ||
        lowerKey.includes("api_key") ||
        lowerKey.includes("token") ||
        lowerKey.includes("private_key")
      ) {
        if (typeof value === "string" && value.length > 8) {
          violations.push({
            path: `${path}.${key}`,
            patternName: `Sensitive key name "${key}" with credential value`,
          });
        }
      }
      violations.push(...scanForSecrets(value, `${path}.${key}`));
    }
  }

  return violations;
}

/**
 * Asserts that the given data contains no secret patterns.
 * Throws an Error if any confidential credential is detected.
 * @param {unknown} data
 * @param {string} [path="root"]
 */
export function assertNoSecrets(data, path = "root") {
  const violations = scanForSecrets(data, path);
  if (violations.length > 0) {
    const details = violations.map((v) => `${v.path} (${v.patternName})`).join("; ");
    throw new Error(
      `Security violation: Secret credential pattern detected at: ${details}. Refusing to persist or display.`
    );
  }
}
