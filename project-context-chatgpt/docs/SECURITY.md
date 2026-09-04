# SECURITY BOUNDARIES

The `project-context-chatgpt` bridge acts as the secure interface between ChatGPT Web and local `Project Context OS`.

## 1. Authentication
- All API requests MUST include a valid `Bearer` token matching the `CHATGPT_API_KEY` environment variable.
- Authentication failures do not reveal whether a project exists.
- The token comparison uses `crypto.timingSafeEqual` to prevent timing attacks.

## 2. Project Identity & Isolation
- ChatGPT passes semantic aliases (e.g., `career-os`), not absolute file paths.
- The `projects.json` registry explicitly maps aliases to local canonical root directories.
- Any project alias not matching `/^[a-zA-Z0-9-]+$/` is immediately rejected. Path traversal (`../`, `%2e`) is inherently blocked by this regex.

## 3. Tool Allowlist
- Only 27 safe tools (READ, SAFE WRITE, CONFIRMATION REQUIRED) are mapped to explicit HTTP endpoints.
- Dangerous internal administrative tools (like `check_context_consistency` and `recover_stale_sessions`) are completely omitted. ChatGPT cannot dynamically request any tool outside this static interface.

## 4. Symlink Limitations
- **Important:** Project Context OS `v4.0.0` uses lexical path normalization. The bridge enforces that requests begin at the registered project root. However, if an attacker creates malicious symlinks within the trusted `CareerOS` repository that point outside it, reading them may traverse boundaries. 
- **Mitigation:** Only mount trusted project directories into `projects.json`.

## 5. Denial of Service / Rate Limiting
- A lightweight memory-based rate limiter (`express-rate-limit`) restricts each IP to 100 requests per 15 minutes.
- Express JSON body parser is limited to `100kb` to prevent memory exhaustion via massive payloads.

## 6. Server Binding
- By default, the bridge binds strictly to `127.0.0.1`. It will not listen on `0.0.0.0` (all network interfaces) unless `BIND_HOST` is explicitly overridden. This prevents exposing the un-tunneled endpoint to the local LAN.
