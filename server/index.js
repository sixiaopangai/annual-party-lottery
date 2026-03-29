import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocketServer } from 'ws';

import { createStateStore } from './state-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const distDir = join(projectRoot, 'dist');
const dataFile = join(projectRoot, 'data', 'server-state.json');
const port = Number(process.env.PORT || 3300);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function loadInitialState() {
  try {
    const text = await readFile(dataFile, 'utf8');
    return JSON.parse(text);
  } catch {
    return { activities: [] };
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function parseJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function safeFilePath(pathname) {
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const resolved = normalize(join(distDir, decodeURIComponent(requestPath)));
  return resolved.startsWith(distDir) ? resolved : null;
}

async function serveStatic(pathname, res) {
  const filePath = safeFilePath(pathname);
  if (!filePath) {
    sendJson(res, 403, { ok: false, message: 'Forbidden' });
    return;
  }

  try {
    const data = await readFile(filePath);
    const type = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

function createBroadcaster(wss) {
  return function broadcastToActivity(activityId, message, excludeSocket = null) {
    const serialized = JSON.stringify(message);

    wss.clients.forEach(client => {
      if (client.readyState !== 1) {
        return;
      }

      if (client.activityId !== activityId) {
        return;
      }

      if (excludeSocket && client === excludeSocket) {
        return;
      }

      client.send(serialized);
    });
  };
}

async function main() {
  const initialState = await loadInitialState();
  const store = createStateStore(initialState);
  const wss = new WebSocketServer({ noServer: true });
  const broadcastToActivity = createBroadcaster(wss);
  let persistTimer = null;
  let clientSequence = 0;

  async function persistState() {
    await mkdir(dirname(dataFile), { recursive: true });
    await writeFile(dataFile, JSON.stringify(store.exportState(), null, 2), 'utf8');
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistState().catch(error => {
        console.error('[server] persist failed', error);
      });
    }, 100);
  }

  function broadcastPresence(activityId) {
    broadcastToActivity(activityId, {
      type: 'presence_update',
      payload: store.getPresence(activityId),
    });
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const pathname = url.pathname;
      const activityMatch = pathname.match(/^\/api\/activities\/([^/]+)(?:\/([^/]+))?$/);

      if (pathname === '/api/health' && req.method === 'GET') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (activityMatch) {
        const activityId = decodeURIComponent(activityMatch[1]);
        const action = activityMatch[2] || '';

        if (req.method === 'GET' && action === '') {
          const activity = store.getActivity(activityId);
          if (!activity) {
            sendJson(res, 404, { ok: false, message: '活动不存在' });
            return;
          }

          sendJson(res, 200, {
            ok: true,
            activity,
            presence: store.getPresence(activityId),
          });
          return;
        }

        if (req.method === 'PUT' && action === '') {
          const body = await parseJsonBody(req);
          const savedActivity = store.upsertActivity({
            ...body.activity,
            id: activityId,
          });
          schedulePersist();

          sendJson(res, 200, {
            ok: true,
            activity: savedActivity,
          });
          return;
        }

        if (req.method === 'POST' && action === 'participants') {
          const body = await parseJsonBody(req);
          const result = store.addParticipant(activityId, body.participant || {});

          if (!result.ok) {
            const statusCode = result.reason === 'duplicate'
              ? 409
              : result.reason === 'missing_name'
                ? 400
                : 404;
            sendJson(res, statusCode, {
              ok: false,
              reason: result.reason,
              message: result.reason === 'duplicate'
                ? '您已签到，请勿重复提交。'
                : result.reason === 'missing_name'
                  ? '请填写昵称后再签到。'
                  : '活动不存在',
            });
            return;
          }

          schedulePersist();
          broadcastToActivity(activityId, {
            type: 'participant_joined',
            payload: result.participant,
          });
          broadcastPresence(activityId);

          sendJson(res, 200, {
            ok: true,
            participant: result.participant,
            presence: store.getPresence(activityId),
          });
          return;
        }

        if (req.method === 'GET' && action === 'query') {
          const result = store.queryWinner(activityId, {
            id: url.searchParams.get('employeeId') || url.searchParams.get('id') || '',
            name: url.searchParams.get('name') || '',
          });

          if (!result.foundActivity) {
            sendJson(res, 404, { ok: false, message: '活动不存在' });
            return;
          }

          sendJson(res, 200, {
            ok: true,
            ...result,
          });
          return;
        }

        if (req.method === 'GET' && action === 'presence') {
          sendJson(res, 200, {
            ok: true,
            presence: store.getPresence(activityId),
          });
          return;
        }
      }

      await serveStatic(pathname, res);
    } catch (error) {
      console.error('[server] request failed', error);
      sendJson(res, 500, { ok: false, message: '服务器内部错误' });
    }
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', ws => {
    ws.clientId = `client-${++clientSequence}`;

    ws.on('message', raw => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message.type === 'join') {
        ws.activityId = message.activityId;
        ws.role = message.role || message.payload?.role || 'viewer';
        store.connectClient(ws.clientId, ws.activityId, ws.role);
        broadcastPresence(ws.activityId);
        return;
      }

      if (!ws.activityId) {
        return;
      }

      broadcastToActivity(ws.activityId, {
        type: message.type,
        payload: message.payload || {},
      }, ws);
    });

    ws.on('close', () => {
      const activityId = store.disconnectClient(ws.clientId);
      if (activityId) {
        broadcastPresence(activityId);
      }
    });
  });

  server.listen(port, () => {
    console.log(`[server] listening on http://0.0.0.0:${port}`);
  });
}

main().catch(error => {
  console.error('[server] failed to start', error);
  process.exit(1);
});
