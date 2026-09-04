import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

import {
  readState, readActiveWork, readTasks, readChangelog, readHandoffs, readDecisions,
  searchProjectContext, getContextSnapshot, getGitStatus, getGitDiff,
  assessContextQuality, getRelevantContext, checkContextDrift, getContextDir,
  readFileSafe, getAgentBootstrap, startSession, heartbeatSession,
  updateActiveWork, updateState, createTask, updateTask, recordDecision,
  recordChange, createHandoff, assistedSessionEnd
} from '@project-context/core';

import { mcpRouterHandler, oauthRouter, oauthAuthMiddleware } from './mcp-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Initial Checks
const API_KEY = process.env.CHATGPT_API_KEY;
if (!API_KEY || API_KEY.trim() === '') {
  console.error("FATAL: CHATGPT_API_KEY environment variable is missing or empty.");
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

// 2. Global Middlewares
app.use(express.json({ limit: '100kb' })); // Bound payload size

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({ error: options.message });
  }
});
app.use(limiter);

// 3. Load Projects
let projects = {};
try {
  const data = await fs.readFile(path.join(__dirname, 'projects.json'), 'utf-8');
  projects = JSON.parse(data);
} catch (err) {
  console.error("FATAL: Failed to load projects.json", err);
  process.exit(1);
}

// OAuth Endpoints (unauthenticated to allow flow)
app.use('/api/projects/:projectId/oauth', oauthRouter);

// 4. Authentication Middleware
app.use(oauthAuthMiddleware);
app.use((req, res, next) => {
  if (req.isOAuthAuthed) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.substring(7).trim();
  if (token.length === 0) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const keyBuffer = Buffer.from(API_KEY);
    const tokenBuffer = Buffer.from(token);
    if (keyBuffer.length !== tokenBuffer.length || !crypto.timingSafeEqual(keyBuffer, tokenBuffer)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

// 5. Project Resolution Middleware
app.param('projectId', (req, res, next, id) => {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    return res.status(404).json({ error: "Project not found" }); // Return 404 to hide invalid characters
  }
  const repoRoot = projects[id];
  if (!repoRoot) {
    return res.status(404).json({ error: "Project not found" }); // Safe generic error
  }
  req.repoRoot = repoRoot;
  next();
});

// Helper for method not allowed
const methodNotAllowed = (req, res) => res.status(405).json({ error: "Method Not Allowed" });

// Initialize MCP Router
mcpRouterHandler(app);

// ==========================================
// A. SAFE READ
// ==========================================

const readRouter = express.Router({ mergeParams: true });
readRouter.route('/state').get((req, res, next) => { try { res.json(readState(req.repoRoot)); } catch (e) { next(e); } }).all(methodNotAllowed);
readRouter.route('/active-work').get((req, res, next) => { try { res.json(readActiveWork(req.repoRoot)); } catch (e) { next(e); } }).all(methodNotAllowed);
readRouter.route('/tasks').get((req, res, next) => { try { res.json(readTasks(req.repoRoot, req.query.status)); } catch (e) { next(e); } });
readRouter.route('/recent-changes').get((req, res, next) => { try { res.json(readChangelog(req.repoRoot, parseInt(req.query.limit) || 10)); } catch (e) { next(e); } });
readRouter.route('/recent-handoffs').get((req, res, next) => { try { res.json(readHandoffs(req.repoRoot, parseInt(req.query.limit) || 5)); } catch (e) { next(e); } });
readRouter.route('/architecture').get((req, res, next) => {
  try {
    const raw = readFileSafe(path.join(getContextDir(req.repoRoot), "ARCHITECTURE.md"));
    res.json({ content: raw || "ARCHITECTURE.md not found" });
  } catch (e) { next(e); }
}).all(methodNotAllowed);
readRouter.route('/decisions').get((req, res, next) => { try { res.json(readDecisions(req.repoRoot)); } catch (e) { next(e); } });
readRouter.route('/search').get((req, res, next) => { try { res.json(searchProjectContext(req.repoRoot, req.query.query)); } catch (e) { next(e); } }).all(methodNotAllowed);
readRouter.route('/git/status').get((req, res, next) => { try { res.json(getGitStatus(req.repoRoot)); } catch (e) { next(e); } }).all(methodNotAllowed);
readRouter.route('/git/diff').get((req, res, next) => { try { res.json({ diff: getGitDiff(req.repoRoot) }); } catch (e) { next(e); } }).all(methodNotAllowed);
readRouter.route('/snapshot').get((req, res, next) => { try { res.json(getContextSnapshot(req.repoRoot)); } catch (e) { next(e); } }).all(methodNotAllowed);
readRouter.route('/health').get((req, res, next) => { try { res.json(assessContextQuality(req.repoRoot)); } catch (e) { next(e); } }).all(methodNotAllowed);
readRouter.route('/relevant-context').post((req, res, next) => { try { res.json(getRelevantContext(req.repoRoot, req.body.task_id, req.body.focus_files)); } catch (e) { next(e); } }).all(methodNotAllowed);
readRouter.route('/drift').get((req, res, next) => { try { res.json(checkContextDrift(req.repoRoot)); } catch (e) { next(e); } }).all(methodNotAllowed);
app.use('/api/projects/:projectId', readRouter);

// ==========================================
// B. SAFE WRITE & C. CONFIRMATION REQUIRED
// ==========================================

const writeRouter = express.Router({ mergeParams: true });
writeRouter.route('/bootstrap').post((req, res, next) => { try { res.json({ content: getAgentBootstrap(req.repoRoot, req.body.agent_name || 'chatgpt') }); } catch (e) { next(e); } }).all(methodNotAllowed);
writeRouter.route('/session/start').post((req, res, next) => { try { res.json(startSession(req.repoRoot, req.body)); } catch (e) { next(e); } }).all(methodNotAllowed);
writeRouter.route('/session/heartbeat').post((req, res, next) => { try { res.json(heartbeatSession(req.repoRoot, req.body.agent_name, req.body)); } catch (e) { next(e); } }).all(methodNotAllowed);
writeRouter.route('/active-work').post((req, res, next) => { try { res.json(updateActiveWork(req.repoRoot, req.body)); } catch (e) { next(e); } }).all(methodNotAllowed);
writeRouter.route('/state').post((req, res, next) => { try { res.json(updateState(req.repoRoot, req.body)); } catch (e) { next(e); } });
writeRouter.route('/tasks').post((req, res, next) => { try { res.json(createTask(req.repoRoot, req.body)); } catch (e) { next(e); } });
writeRouter.route('/tasks/:taskId').put((req, res, next) => {
  if (!/^[a-zA-Z0-9-]+$/.test(req.params.taskId)) return res.status(400).json({ error: "Invalid task ID format" });
  try { res.json(updateTask(req.repoRoot, req.params.taskId, req.body)); } catch (e) { next(e); }
}).all(methodNotAllowed);
writeRouter.route('/decisions').post((req, res, next) => { try { res.json(recordDecision(req.repoRoot, req.body)); } catch (e) { next(e); } });
writeRouter.route('/recent-changes').post((req, res, next) => { try { res.json(recordChange(req.repoRoot, req.body)); } catch (e) { next(e); } });
writeRouter.route('/recent-handoffs').post((req, res, next) => { try { res.json({ path: createHandoff(req.repoRoot, req.body) }); } catch (e) { next(e); } });
writeRouter.route('/session/end').post((req, res, next) => { try { res.json(assistedSessionEnd(req.repoRoot, req.body)); } catch (e) { next(e); } }).all(methodNotAllowed);
app.use('/api/projects/:projectId', writeRouter);

// 6. Unknown Routes 404
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// 7. Error Handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: "Bad Request: Invalid JSON" });
  }
  
  console.error(`[ERROR] ${req.method} ${req.url} - ${err.message}`);
  
  // Safe generic error to client, avoiding absolute paths or internal details
  res.status(500).json({ error: "Internal Server Error", message: err.message.replace(/C:[\/\\][^'"]+/g, '[REDACTED PATH]') });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.BIND_HOST || '127.0.0.1'; // Force local binding by default
app.listen(PORT, HOST, () => {
  console.log(`Project Context OS ChatGPT Bridge securely listening on ${HOST}:${PORT}`);
});
