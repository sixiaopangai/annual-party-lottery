/**
 * 实时同步模块
 * WebSocket 为主，BroadcastChannel 为本地降级方案
 */

function buildRealtimeUrl(locationLike) {
  const base = typeof locationLike === 'string'
    ? new URL(locationLike)
    : new URL(locationLike.href);

  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = '/ws';
  base.search = '';
  base.hash = '';

  return base.toString();
}

class SyncManager {
  constructor() {
    this.channelName = 'lottery_sync_channel';
    this.channel = null;
    this.socket = null;
    this.activityId = '';
    this.role = 'viewer';
    this.handlers = new Map();
    this.pendingMessages = [];
    this.initFallbackChannel();
  }

  initFallbackChannel() {
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (event) => this.handleMessage(event.data);
    }
  }

  connect({ activityId, role = 'viewer' } = {}) {
    if (!activityId || typeof WebSocket === 'undefined') {
      return;
    }

    const needsReconnect = this.socket &&
      (this.activityId !== activityId || this.role !== role) &&
      this.socket.readyState <= WebSocket.OPEN;

    this.activityId = activityId;
    this.role = role;

    if (needsReconnect) {
      this.socket.close();
      this.socket = null;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.socket = new WebSocket(buildRealtimeUrl(window.location));

      this.socket.addEventListener('open', () => {
        this.socket.send(JSON.stringify({
          type: 'join',
          activityId: this.activityId,
          role: this.role,
        }));
        this.flushPendingMessages();
      });

      this.socket.addEventListener('message', (event) => {
        try {
          this.handleMessage(JSON.parse(event.data));
        } catch (error) {
          console.warn('[Sync] 无法解析消息', error);
        }
      });

      this.socket.addEventListener('close', () => {
        this.socket = null;
      });

      this.socket.addEventListener('error', (error) => {
        console.warn('[Sync] WebSocket 连接失败，已回退本地同步。', error);
      });
    } catch (error) {
      console.warn('[Sync] WebSocket 初始化失败，已回退本地同步。', error);
    }
  }

  flushPendingMessages() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (this.pendingMessages.length > 0) {
      this.socket.send(JSON.stringify(this.pendingMessages.shift()));
    }
  }

  broadcast(type, payload = {}) {
    const message = {
      type,
      payload,
      activityId: this.activityId,
      timestamp: Date.now(),
    };

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      this.pendingMessages.push(message);
      return;
    }

    if (this.channel) {
      this.channel.postMessage(message);
    }
  }

  on(type, callback) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type).push(callback);
  }

  handleMessage(message) {
    const { type, payload } = message;
    if (this.handlers.has(type)) {
      this.handlers.get(type).forEach(callback => callback(payload));
    }
  }

  close() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}

export { buildRealtimeUrl };
export const syncManager = new SyncManager();
