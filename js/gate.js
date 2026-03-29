import { fetchActivityFromServer, getActivityIdFromUrl } from './server-api.js';
import { buildSignUrl, createQrSvgDataUrl } from './qrcode.js';
import { syncManager } from './sync.js';

class GateApp {
  constructor() {
    this.activityId = getActivityIdFromUrl('');
    this.activity = null;
    this.init();
  }

  async init() {
    if (!this.activityId) {
      return;
    }

    syncManager.connect({ activityId: this.activityId, role: 'admin' });
    syncManager.on('participant_joined', () => {
      this.loadActivity();
    });
    syncManager.on('presence_update', (presence) => {
      this.renderPresence(presence);
    });

    await this.loadActivity();
    await this.renderQrCode();
  }

  async loadActivity() {
    try {
      this.activity = await fetchActivityFromServer(this.activityId);
      this.renderActivity();
    } catch (error) {
      console.warn('[Gate] 活动加载失败', error);
    }
  }

  async renderQrCode() {
    const container = document.getElementById('gate-qrcode');
    if (!container || !this.activityId) return;

    const signUrl = buildSignUrl(window.location.href, this.activityId);
    const qrDataUrl = await createQrSvgDataUrl(signUrl, 280);
    container.innerHTML = `<img src="${qrDataUrl}" alt="签到二维码" style="width: 280px; height: 280px; background: white; padding: 12px; border-radius: 16px;">`;
  }

  renderActivity() {
    if (!this.activity) return;

    document.getElementById('gate-activity-title').textContent = this.activity.settings?.title || this.activity.name;
    document.getElementById('gate-sign-count').textContent = String(this.activity.participants?.length || 0);

    const list = document.getElementById('gate-checkin-list');
    const recent = [...(this.activity.participants || [])]
      .sort((a, b) => (b.signedAt || 0) - (a.signedAt || 0))
      .slice(0, 8);

    if (recent.length === 0) {
      list.innerHTML = `<div class="gate-person" style="grid-column: 1 / -1;"><div class="gate-name">等待现场扫码签到</div></div>`;
      return;
    }

    list.innerHTML = recent.map(person => `
      <div class="gate-person">
        <div class="gate-avatar">
          ${person.avatar
            ? `<img src="${person.avatar}" alt="${person.name}">`
            : `<span>${person.name.charAt(0)}</span>`
          }
        </div>
        <div class="gate-name">${person.name}</div>
        <div class="gate-time">${this.formatTime(person.signedAt)}</div>
      </div>
    `).join('');
  }

  renderPresence(presence) {
    document.getElementById('gate-online-count').textContent = String(presence.total || 0);
  }

  formatTime(timestamp) {
    if (!timestamp) return '刚刚签到';
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new GateApp();
});
