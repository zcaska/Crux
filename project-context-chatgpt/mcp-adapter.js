import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import crypto from 'crypto';
import express from 'express';

import {
  readState, readTasks, readChangelog, readDecisions,
  getContextSnapshot, getRelevantContext, getContextDir,
  readFileSafe
} from '@project-context/core';

export const mcpTransports = new Map();

// --- OAuth 2.1 In-Memory Store ---
const authCodes = new Map(); // code -> { challenge, clientId, redirectUri, expiresAt }
const accessTokens = new Map(); // token -> { clientId, expiresAt }
const refreshTokens = new Map(); // refreshToken -> { clientId, expiresAt }

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function base64URLEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest();
}

export function oauthAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (accessTokens.has(token)) {
      const tokenData = accessTokens.get(token);
      if (tokenData.expiresAt > Date.now()) {
        req.isOAuthAuthed = true;
        return next();
      } else {
        accessTokens.delete(token); // expired
      }
    }
  }
  next();
}

export const oauthRouter = express.Router({ mergeParams: true });

oauthRouter.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: `https://${req.headers.host}/api/projects/${req.params.projectId}/mcp`,
    authorization_servers: [
      `https://${req.headers.host}/api/projects/${req.params.projectId}/oauth`
    ]
  });
});

oauthRouter.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: `https://${req.headers.host}/api/projects/${req.params.projectId}/oauth`,
    authorization_endpoint: `https://${req.headers.host}/api/projects/${req.params.projectId}/oauth/authorize`,
    token_endpoint: `https://${req.headers.host}/api/projects/${req.params.projectId}/oauth/token`,
    registration_endpoint: `https://${req.headers.host}/api/projects/${req.params.projectId}/oauth/register`,
    scopes_supported: ["offline_access"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"]
  });
});

oauthRouter.get('/authorize', (req, res) => {
  const { response_type, client_id, redirect_uri, state, code_challenge, code_challenge_method } = req.query;

  if (response_type !== 'code' || !client_id || !redirect_uri || !code_challenge || code_challenge_method !== 'S256') {
    return res.status(400).send("Invalid OAuth 2.1 authorization request. PKCE S256 is required.");
  }

  // Render a simple consent screen
  res.send(`
    <html>
      <head><title>Authorize Project Context OS</title></head>
      <body>
        <h2>Authorize ChatGPT to access Project Context OS (${req.params.projectId})</h2>
        <form method="POST" action="/api/projects/${req.params.projectId}/oauth/authorize">
          <input type="hidden" name="client_id" value="${client_id}" />
          <input type="hidden" name="redirect_uri" value="${redirect_uri}" />
          <input type="hidden" name="state" value="${state}" />
          <input type="hidden" name="code_challenge" value="${code_challenge}" />
          <button type="submit">Grant Access</button>
        </form>
      </body>
    </html>
  `);
});

oauthRouter.post('/authorize', express.urlencoded({ extended: false }), (req, res) => {
  const { client_id, redirect_uri, state, code_challenge } = req.body;
  
  if (!client_id || !redirect_uri || !code_challenge) {
    return res.status(400).send("Missing parameters");
  }

  const code = generateToken();
  authCodes.set(code, {
    challenge: code_challenge,
    clientId: client_id,
    redirectUri: redirect_uri,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
  });

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  res.redirect(redirectUrl.toString());
});

oauthRouter.post('/token', express.urlencoded({ extended: false }), (req, res) => {
  const { grant_type, code, client_id, redirect_uri, code_verifier, refresh_token } = req.body;

  if (grant_type === 'authorization_code') {
    if (!code || !client_id || !code_verifier) {
      return res.status(400).json({ error: "invalid_request", error_description: "Missing code, client_id, or code_verifier" });
    }

    const codeData = authCodes.get(code);
    if (!codeData || codeData.expiresAt < Date.now()) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired code" });
    }

    if (codeData.clientId !== client_id) {
      return res.status(400).json({ error: "invalid_client", error_description: "Client ID mismatch" });
    }

    // PKCE verification
    const expectedChallenge = base64URLEncode(sha256(code_verifier));
    if (expectedChallenge !== codeData.challenge) {
      return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    }

    // Consume code
    authCodes.delete(code);

    const accessToken = generateToken();
    const refreshToken = generateToken();
    const expiresIn = 3600; // 1 hour

    accessTokens.set(accessToken, { clientId: client_id, expiresAt: Date.now() + expiresIn * 1000 });
    refreshTokens.set(refreshToken, { clientId: client_id, expiresAt: Date.now() + 30 * 24 * 3600 * 1000 }); // 30 days

    return res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: refreshToken
    });

  } else if (grant_type === 'refresh_token') {
    if (!refresh_token || !client_id) {
      return res.status(400).json({ error: "invalid_request", error_description: "Missing refresh_token or client_id" });
    }

    const refreshData = refreshTokens.get(refresh_token);
    if (!refreshData || refreshData.expiresAt < Date.now()) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired refresh token" });
    }

    if (refreshData.clientId !== client_id) {
      return res.status(400).json({ error: "invalid_client", error_description: "Client ID mismatch" });
    }

    // Rotate tokens
    refreshTokens.delete(refresh_token);
    const newAccessToken = generateToken();
    const newRefreshToken = generateToken();
    const expiresIn = 3600;

    accessTokens.set(newAccessToken, { clientId: client_id, expiresAt: Date.now() + expiresIn * 1000 });
    refreshTokens.set(newRefreshToken, { clientId: client_id, expiresAt: Date.now() + 30 * 24 * 3600 * 1000 });

    return res.json({
      access_token: newAccessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: newRefreshToken
    });
  }

  return res.status(400).json({ error: "unsupported_grant_type" });
});

// --- MCP Server Logic ---

export function createMcpServer(projectId, repoRoot) {
  const mcpServer = new Server({
    name: "ProjectContextOS-" + projectId,
    version: "1.0.0"
  }, {
    capabilities: {
      tools: {}
    }
  });

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_project_state",
          description: "Returns the authoritative snapshot of the current project state.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "get_tasks",
          description: "Returns the project task board.",
          inputSchema: { type: "object", properties: { status: { type: "string" } } }
        },
        {
          name: "get_architecture",
          description: "Returns the project's architectural invariants.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "get_recent_changes",
          description: "Returns recent semantic changes.",
          inputSchema: { type: "object", properties: { limit: { type: "number" } } }
        },
        {
          name: "get_decisions",
          description: "Returns architectural decision records (ADRs).",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "get_context_snapshot",
          description: "Returns a compact Hot Context snapshot.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "get_relevant_context",
          description: "Compute task-tailored warm context.",
          inputSchema: {
            type: "object",
            properties: {
              task_id: { type: "string" },
              focus_files: { type: "array", items: { type: "string" } }
            },
            required: ["task_id"]
          }
        }
      ]
    };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      let result;
      switch (request.params.name) {
        case "get_project_state":
          result = readState(repoRoot);
          break;
        case "get_tasks":
          result = readTasks(repoRoot, request.params.arguments?.status);
          break;
        case "get_architecture": {
          const raw = readFileSafe(path.join(getContextDir(repoRoot), "ARCHITECTURE.md"));
          result = { content: raw || "ARCHITECTURE.md not found" };
          break;
        }
        case "get_recent_changes":
          result = readChangelog(repoRoot, request.params.arguments?.limit || 10);
          break;
        case "get_decisions":
          result = readDecisions(repoRoot);
          break;
        case "get_context_snapshot":
          result = getContextSnapshot(repoRoot);
          break;
        case "get_relevant_context":
          result = getRelevantContext(repoRoot, request.params.arguments.task_id, request.params.arguments.focus_files);
          break;
        default:
          throw new Error("Unknown tool: " + request.params.name);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: "Error: " + e.message }],
        isError: true
      };
    }
  });

  return mcpServer;
}

export function mcpRouterHandler(app) {
  app.get('/api/projects/:projectId/.well-known/oauth-protected-resource', (req, res) => {
    res.json({
      resource: `https://${req.headers.host}/api/projects/${req.params.projectId}/mcp`,
      authorization_servers: [
        `https://${req.headers.host}/api/projects/${req.params.projectId}/oauth`
      ]
    });
  });

  app.get('/api/projects/:projectId/mcp', async (req, res, next) => {
    try {
      const transport = new SSEServerTransport(`/api/projects/${req.params.projectId}/mcp/messages`, res);
      
      let projectTransports = mcpTransports.get(req.params.projectId);
      if (!projectTransports) {
        projectTransports = new Map();
        mcpTransports.set(req.params.projectId, projectTransports);
      }
      projectTransports.set(transport.sessionId, transport);

      const mcpServer = createMcpServer(req.params.projectId, req.repoRoot);
      await mcpServer.connect(transport);
      
      res.on('close', () => {
        projectTransports.delete(transport.sessionId);
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/projects/:projectId/mcp/messages', async (req, res, next) => {
    try {
      const sessionId = req.query.sessionId;
      if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
      }
      
      const projectTransports = mcpTransports.get(req.params.projectId);
      if (!projectTransports) {
        return res.status(404).json({ error: "No active MCP sessions for project" });
      }
      
      const transport = projectTransports.get(sessionId);
      if (!transport) {
        return res.status(404).json({ error: "MCP Session not found" });
      }
      
      await transport.handlePostMessage(req, res, req.body);
    } catch (e) {
      next(e);
    }
  });
}
