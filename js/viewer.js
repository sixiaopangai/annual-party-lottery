/**
 * 观众端页面逻辑
 */

import { StorageManager } from './storage.js';
import { getActivityIdFromUrl, fetchActivityFromServer } from './server-api.js';
import { syncManager } from './sync.js';

class ViewerApp {
  constructor() {
    StorageManager.init();
    this.activityId = getActivityIdFromUrl(StorageManager.getCurrentActivity()?.id || '');
    this.init();
  }

  async init() {
    await this.loadActivityMeta();
    this.bindSync();
    this.bindDanmaku();
  }

  async loadActivityMeta() {
    if (!this.activityId) {
      return;
    }

    try {
      const activity = await fetchActivityFromServer(this.activityId);
      document.getElementById('viewer-activity-title').textContent = activity.settings?.title || activity.name;
    } catch {
      const localActivity = StorageManager.getActivityById(this.activityId) || StorageManager.getCurrentActivity();
      if (localActivity) {
        document.getElementById('viewer-activity-title').textContent = localActivity.settings?.title || localActivity.name;
      }
    }
  }

  bindSync() {
    if (this.activityId) {
      syncManager.connect({ activityId: this.activityId, role: 'viewer' });
    }

    // 监听大屏状态变化
    syncManager.on('state_change', (data) => {
      this.updateState(data);
    });

    // 监听抽奖结果
    syncManager.on('draw_result', (data) => {
      this.showWinners(data.winners);
    });

    syncManager.on('presence_update', (presence) => {
      this.updatePresence(presence);
    });

    // 请求当前状态（如果是刚打开页面）
    syncManager.broadcast('request_sync', { time: Date.now() });
  }

  updateState(data) {
    const { isRolling, prize } = data;
    
    document.getElementById('view-prize-level').textContent = prize.level || '';
    document.getElementById('view-prize-name').textContent = prize.name || '准备中';
    
    const rollingEl = document.getElementById('view-rolling');
    const winnersEl = document.getElementById('view-winners');
    const statusEl = document.getElementById('status-text');

    if (isRolling) {
      rollingEl.style.display = 'block';
      winnersEl.innerHTML = '';
      statusEl.textContent = '抽奖进行中';
      statusEl.classList.add('glass-badge--gold');
    } else {
      rollingEl.style.display = 'none';
      statusEl.textContent = '等待开奖';
      statusEl.classList.remove('glass-badge--gold');
    }
  }

  showWinners(winners) {
    const winnersEl = document.getElementById('view-winners');
    winnersEl.innerHTML = '';
    
    winners.forEach((w, i) => {
      const el = document.createElement('div');
      el.className = 'winner-item';
      el.style.animationDelay = `${i * 100}ms`;
      el.textContent = w.name;
      winnersEl.appendChild(el);
    });

    document.getElementById('status-text').textContent = '已开奖';
  }

  updatePresence(presence) {
    document.getElementById('viewer-presence').textContent = `在线 ${presence.total}`;
  }

  bindDanmaku() {
    const form = document.getElementById('danmaku-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('danmaku-text');
      const text = input.value.trim();
      
      if (text) {
        syncManager.broadcast('danmaku_message', { text });
        input.value = '';
        this.toast('已发送');
      }
    });
  }

  toast(msg) {
    const btn = document.querySelector('.danmaku-form button');
    const oldText = btn.textContent;
    btn.textContent = msg;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = oldText;
      btn.disabled = false;
    }, 2000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ViewerApp();
});
