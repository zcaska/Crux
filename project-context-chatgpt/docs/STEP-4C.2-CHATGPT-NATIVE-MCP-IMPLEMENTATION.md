# Step 4C.2 — ChatGPT Native MCP Implementation Report (ARCHIVED / EXPERIMENTAL)

> [!WARNING]
> This native ChatGPT MCP integration is ABANDONED and isolated to this experimental repository (`project-context-chatgpt`).
> CareerOS permanently uses the canonical SNAPSHOT workflow (`project-context snapshot`) for ChatGPT.

## Verdict
**EXPERIMENT ABANDONED — ARCHIVED OUTSIDE CAREEROS**

---

### CORRECTION: Authentication Architecture
OAuth was the selected authentication mechanism for this private Project Context OS Custom MCP integration experiment.

To resolve the authentication requirement, a standards-compliant **OAuth 2.1 Authorization Server** was integrated directly into the `project-context-chatgpt` adapter. This server strictly supports:
*   Authorization Code Flow with PKCE (S256).
*   Refresh tokens (to maintain persistent connectivity without dropping the session).
*   In-memory token generation that seamlessly bridges into the existing REST Bearer-token middlewares.

---

## 1. Final Architecture
The Project Context OS core (`@project-context/core v4.0.0`) remains entirely unmodified. The native MCP implementation was integrated directly into the `project-context-chatgpt` adapter layer.

Architecture flow:
`ChatGPT Custom MCP App -> Secure MCP Tunnel -> Project Context ChatGPT MCP Adapter (Express) -> Project Context OS Core -> Local File System`

The existing REST bridge was perfectly preserved. The MCP endpoints are mapped identically alongside them at `/api/projects/:projectId/mcp`.

## 2. Transport Decision
**Transport Selected**: SSE compatibility implementation.
**Reasoning**: The current SDK robustly supports HTTP+SSE as the standard bridging mechanism for web-based remote clients. Streamable HTTP is the modern MCP transport, and the adapter can be upgraded to it after ChatGPT D1 validation. 

## 3. OAuth Decision
**OAuth Architecture**: Implemented minimal OAuth 2.1 compliant server.
**Authentication Flow**: Authorization Code + PKCE.
**Reasoning**: The server provides `/oauth/authorize` and `/oauth/token` endpoints. It issues an authorization code, validates PKCE, and issues both an `access_token` and `refresh_token`. The adapter's authentication middleware validates these dynamic tokens alongside the legacy static API key.

## 4. OAuth Discovery & Metadata
The implementation exposes the required OAuth metadata for ChatGPT discovery:
- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`

These endpoints correctly advertise:
- `authorization_endpoint`
- `token_endpoint`
- `scopes_supported`: `["offline_access"]`
- `response_types_supported`: `["code"]`
- `grant_types_supported`: `["authorization_code", "refresh_token"]`
- `code_challenge_methods_supported`: `["S256"]`

## 5. Secure Tunnel Decision
**Secure Tunnel Selected**: OpenAI Secure MCP Tunnel.
**Reasoning**: The primary supported architecture is `Local MCP -> Secure MCP Tunnel -> ChatGPT Custom MCP App`. This ensures the server is not exposed to the public internet. ngrok may still be used as temporary interoperability infrastructure.

## 6. Tool Allowlist
For the D1 Read-Only Gate, ONLY the following tools have been exposed:
* `get_project_state`
* `get_tasks`
* `get_architecture`
* `get_recent_changes`
* `get_decisions`
* `get_context_snapshot`
* `get_relevant_context`

No state mutation tools have been enabled.

## 7. Security Model
The MCP layer successfully inherited the robust security controls of the REST bridge:
* **Authentication**: Enforced via OAuth 2.1 access tokens.
* **Project Isolation**: MCP sessions are scoped precisely to the `:projectId` validated by the path parameters.
* **Path Traversal Protection**: Project aliases must pass strict Regex (`/^[a-zA-Z0-9-]+$/`).
* **Request Validation**: Handled inherently by the MCP SDK.
* **Wildcard CORS**: Prevented; same Express policies apply.
* **Local Binding**: The bridge remains securely bound to `127.0.0.1`.

## 8. Local MCP Client Evidence
A local test script (`test_mcp.js`) leveraging the official `@modelcontextprotocol/sdk` client successfully initialized the connection, retrieved the allowed tools, and executed `get_project_state` successfully. A separate OAuth test suite (`test_oauth.js`) independently verified the PKCE flow and refresh token rotation.

## 9. REST & Core Regression Evidence
The existing REST test suites (`tests.js` & `test_gate_c.js`) passed successfully, proving the OAuth and MCP injections were entirely additive. `npm run context:validate` confirmed `@project-context/core` remains 100% healthy with no schema corruption.

## 10. Verification Verdicts
**LOCAL MCP D1: PASS**
**OAUTH IMPLEMENTATION: PASS**
**CHATGPT OAUTH CONTRACT: VERIFIED**
**CHATGPT D1: EXPERIMENT ARCHIVED**
**ChatGPT redirect URI: NOT VERIFIED** (Exact URL must be obtained directly from the ChatGPT Custom MCP UI during setup).
