/**
 * 管理后台逻辑
 */

import { StorageManager } from './storage.js';
import { AuditLogger } from './audit.js';
import { QrCodeManager } from './qrcode.js';
import { pushCurrentActivityToServer } from './activity-sync.js';

class AdminApp {
  constructor() {
    this.audit = new AuditLogger();
    this.remoteSyncTimer = null;
    this.init();
  }

  init() {
    StorageManager.init();
    this.bindNavigation();
    this.bindParticipants();
    this.bindPrizes();
    this.bindActivities();
    this.bindSettings();
    this.bindLogs();
    this.bindQrCode();
    this.initRemoteSync();

    // 解析 Hash 路由以自动跳转对应的菜单模块
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const targetNav = document.getElementById(`nav-${hash}`);
      if (targetNav) targetNav.click();
    }

    this.renderAll();
  }

  initRemoteSync() {
    window.addEventListener('lottery-storage-changed', () => {
      this.scheduleRemoteSync();
    });

    this.scheduleRemoteSync();
  }

  scheduleRemoteSync() {
    clearTimeout(this.remoteSyncTimer);
    this.remoteSyncTimer = setTimeout(async () => {
      try {
        await pushCurrentActivityToServer();
      } catch (error) {
        console.warn('[RemoteSync] 后台活动状态推送失败', error);
      }
    }, 120);
  }

  // === 导航 ===
  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        const section = document.getElementById(`section-${item.dataset.section}`);
        if (section) section.classList.add('active');
        this.renderAll();
      });
    });
  }

  // === 人员管理 ===
  bindParticipants() {
    // 添加人员弹窗
    document.getElementById('btn-add-person').addEventListener('click', () => {
      this.clearPersonForm();
      document.getElementById('modal-add-person').classList.add('active');
    });

    document.getElementById('btn-cancel-person').addEventListener('click', () => {
      document.getElementById('modal-add-person').classList.remove('active');
    });

    document.getElementById('btn-save-person').addEventListener('click', () => {
      const name = document.getElementById('input-person-name').value.trim();
      const avatar = document.getElementById('input-person-avatar').value.trim();

      if (!name) {
        this.toast('请填写昵称');
        return;
      }

      const success = StorageManager.addParticipant({ name, avatar, source: 'manual' });
      if (success) {
        this.audit.log('ADD_PERSON', { name });
        document.getElementById('modal-add-person').classList.remove('active');
        this.renderParticipants();
        this.toast('人员添加成功');
      } else {
        const storageError = StorageManager.consumeLastError();
        this.toast(storageError?.message || '人员添加失败，请重试');
      }
    });

    // 清空人员
    document.getElementById('btn-clear-participants').addEventListener('click', () => {
      if (confirm('确定清空所有人员吗？此操作将同时清空【中奖记录】，且不可恢复。')) {
        const clearedParticipants = StorageManager.setParticipants([]);
        const clearedWinners = clearedParticipants && StorageManager.clearWinners();
        if (!clearedParticipants || !clearedWinners) {
          this.toastStorageError();
          return;
        }
        this.audit.log('CLEAR_PARTICIPANTS');
        this.renderParticipants();
        this.toast('已清空人员及中奖数据');
      }
    });
  }

  renderParticipants() {
    const participants = StorageManager.getParticipants();
    const wonIds = StorageManager.getWonParticipantIds();
    const tbody = document.getElementById('participants-tbody');
    const empty = document.getElementById('participants-empty');
    const table = document.getElementById('participants-table');

    if (participants.length === 0) {
      table.style.display = 'none';
      empty.style.display = 'block';
    } else {
      table.style.display = 'table';
      empty.style.display = 'none';
    }

    const sortedParticipants = [...participants].sort((a, b) => (b.signedAt || 0) - (a.signedAt || 0));

    tbody.innerHTML = sortedParticipants.map(p => `
      <tr>
        <td>${this.renderAvatarMarkup(p, 'participant-avatar')}</td>
        <td>${p.name}</td>
        <td>${p.signedAt ? new Date(p.signedAt).toLocaleString('zh-CN') : '-'}</td>
        <td class="${wonIds.has(p.id) ? 'status-won' : 'status-available'}">
          ${wonIds.has(p.id) ? (StorageManager.getSettings().allowRepeatedWinning ? '已中奖 (可连抽)' : '已中奖') : '未中奖'}
        </td>
        <td><button class="btn-delete" onclick="adminApp.deletePerson('${p.id}')">删除</button></td>
      </tr>
    `).join('');

    // 统计
    const validWonCount = participants.filter(p => wonIds.has(p.id)).length;
    const settings = StorageManager.getSettings();
    const availableTotal = settings.allowRepeatedWinning ? participants.length : participants.length - validWonCount;
    const latestParticipant = sortedParticipants[0];

    document.getElementById('stat-total-people').textContent = participants.length;
    document.getElementById('stat-last-signin').textContent = latestParticipant?.name || '-';
    document.getElementById('stat-won-people').textContent = validWonCount;
    document.getElementById('stat-available').textContent = availableTotal;
  }

  deletePerson(id) {
    if (!StorageManager.removeParticipant(id)) {
      this.toastStorageError();
      return;
    }
    this.audit.log('DELETE_PERSON', { id });
    this.renderParticipants();
    this.toast('已删除');
  }

  clearPersonForm() {
    document.getElementById('input-person-name').value = '';
    document.getElementById('input-person-avatar').value = '';
  }

  // === 奖项管理 ===
  bindPrizes() {
    // 清空奖项
    document.getElementById('btn-clear-prizes').addEventListener('click', () => {
      if (confirm('确定要清空所有已配置的奖项吗？此操作将同时清空【中奖记录】，且不可恢复。')) {
        const clearedPrizes = StorageManager.setPrizes([]);
        const clearedWinners = clearedPrizes && StorageManager.clearWinners();
        if (!clearedPrizes || !clearedWinners) {
          this.toastStorageError();
          return;
        }
        this.audit.log('CLEAR_PRIZES');
        this.renderPrizes();
        this.toast('已清空奖项及中奖数据');
      }
    });

    // 加载示例奖项
    document.getElementById('btn-load-sample-prizes').addEventListener('click', () => {
      const samplePrizes = [
        { level: '特等奖', name: 'MacBook Pro M3 Max', description: '顶层生产力工具', count: 1 },
        { level: '一等奖', name: 'iPhone 16 Pro', description: '最新旗舰手机', count: 3 },
        { level: '二等奖', name: 'iPad Air 6', description: '移动便携平板', count: 5 },
        { level: '三等奖', name: 'AirPods Pro 2', description: '降噪无线耳机', count: 10 },
        { level: '幸运奖', name: '定制品牌周边', description: '精美伴手礼', count: 20 }
      ];
      
      for (const prize of samplePrizes) {
        if (!StorageManager.addPrize(prize)) {
          this.toastStorageError('示例奖项保存失败，请稍后重试');
          return;
        }
        this.audit.log('ADD_PRIZE', { level: prize.level, name: prize.name, count: prize.count });
      }
      
      this.renderPrizes();
      this.toast(`已成功加载 ${samplePrizes.length} 个示例奖项`);
    });

    document.getElementById('btn-add-prize').addEventListener('click', () => {
      this.clearPrizeForm();
      document.getElementById('modal-add-prize').classList.add('active');
    });

    document.getElementById('btn-cancel-prize').addEventListener('click', () => {
      document.getElementById('modal-add-prize').classList.remove('active');
    });

    document.getElementById('btn-save-prize').addEventListener('click', () => {
      const level = document.getElementById('input-prize-level').value.trim();
      const name = document.getElementById('input-prize-name').value.trim();
      const desc = document.getElementById('input-prize-desc').value.trim();
      const count = parseInt(document.getElementById('input-prize-count').value) || 1;

      if (!level || !name) {
        this.toast('请填写奖项等级和奖品名称');
        return;
      }

      const prize = StorageManager.addPrize({ level, name, description: desc, count, image: '' });
      if (!prize) {
        this.toastStorageError();
        return;
      }
      this.audit.log('ADD_PRIZE', { level, name, count });
      document.getElementById('modal-add-prize').classList.remove('active');
      this.renderPrizes();
      this.toast('奖项添加成功');
    });
  }

  renderPrizes() {
    const prizes = StorageManager.getPrizes();
    const grid = document.getElementById('prizes-grid');
    const empty = document.getElementById('prizes-empty');

    if (prizes.length === 0) {
      grid.style.display = 'none';
      empty.style.display = 'block';
    } else {
      grid.style.display = 'grid';
      empty.style.display = 'none';
    }

    const wonRecords = StorageManager.getWinners();

    grid.innerHTML = prizes.map((p, i) => {
      const alreadyWon = wonRecords.filter(r => r.prizeId === p.id)
        .reduce((sum, r) => sum + r.winners.length, 0);
      return `
        <div class="prize-card">
          <div class="prize-card-header">
            <span class="prize-card-level">${p.level}</span>
            <span style="color: var(--text-tertiary); font-size: var(--text-xs);">#${i + 1}</span>
          </div>
          <div class="prize-card-name">${p.name}</div>
          <div class="prize-card-desc">${p.description || '暂无描述'}</div>
          <div class="prize-card-meta">
            <span>名额: ${alreadyWon}/${p.count}</span>
            <div class="prize-card-actions">
              <button class="glass-btn glass-btn--danger glass-btn--sm" onclick="adminApp.deletePrize('${p.id}')">删除</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  deletePrize(id) {
    if (!StorageManager.removePrize(id)) {
      this.toastStorageError();
      return;
    }
    this.audit.log('DELETE_PRIZE', { id });
    this.renderPrizes();
    this.toast('奖项已删除');
  }

  clearPrizeForm() {
    document.getElementById('input-prize-level').value = '';
    document.getElementById('input-prize-name').value = '';
    document.getElementById('input-prize-desc').value = '';
    document.getElementById('input-prize-count').value = '1';
  }

  // === 活动管理 ===
  bindActivities() {
    document.getElementById('btn-create-activity').addEventListener('click', () => {
      const name = prompt('请输入活动名称：');
      if (name && name.trim()) {
        const activity = StorageManager.createActivity(name.trim());
        if (!activity) {
          this.toastStorageError();
          return;
        }
        this.audit.log('CREATE_ACTIVITY', { name: name.trim() });
        this.renderActivities();
        this.renderAll();
        this.toast('活动创建成功');
      }
    });
  }

  renderActivities() {
    const activities = StorageManager.getAllActivities();
    const current = StorageManager.getCurrentActivity();
    const list = document.getElementById('activities-list');

    list.innerHTML = activities.map(a => `
      <div class="activity-item ${a.id === current?.id ? 'current' : ''} ${a.archived ? 'archived' : ''}">
        <div>
          <div class="activity-name">
            ${a.name}
            ${a.id === current?.id ? '<span class="glass-badge glass-badge--gold" style="margin-left: 8px;">当前</span>' : ''}
            ${a.archived ? '<span class="glass-badge" style="margin-left: 8px;">已归档</span>' : ''}
          </div>
          <div class="activity-meta">
            创建于: ${new Date(a.createdAt).toLocaleString('zh-CN')} · 
            人员: ${a.participants?.length || 0} · 
            奖项: ${a.prizes?.length || 0}
          </div>
        </div>
        <div class="activity-actions">
          ${a.id !== current?.id ? `<button class="glass-btn glass-btn--sm" onclick="adminApp.switchActivity('${a.id}')">切换</button>` : ''}
          ${!a.archived ? `<button class="glass-btn glass-btn--sm" onclick="adminApp.archiveActivity('${a.id}')">归档</button>` : ''}
          <button class="glass-btn glass-btn--danger glass-btn--sm" onclick="adminApp.deleteActivity('${a.id}')">删除</button>
        </div>
      </div>
    `).join('');
  }

  switchActivity(id) {
    if (!StorageManager.switchActivity(id)) {
      this.toastStorageError();
      return;
    }
    this.renderAll();
    this.toast('已切换活动');
  }

  archiveActivity(id) {
    if (!StorageManager.archiveActivity(id)) {
      this.toastStorageError();
      return;
    }
    this.renderActivities();
    this.toast('活动已归档');
  }

  deleteActivity(id) {
    if (confirm('确定删除此活动？所有相关数据将丢失。')) {
      if (!StorageManager.deleteActivity(id)) {
        this.toastStorageError();
        return;
      }
      this.audit.log('DELETE_ACTIVITY', { id });
      this.renderAll();
      this.toast('活动已删除');
    }
  }

  // === 设置 ===
  bindSettings() {
    // 标题
    document.getElementById('setting-title').addEventListener('change', (e) => {
      const act = StorageManager.getCurrentActivity();
      if (act) {
        act.settings = act.settings || {};
        act.settings.title = e.target.value;
        act.name = e.target.value; // 同步更改外层活动名称
        if (!StorageManager.saveActivity(act)) {
          this.toastStorageError();
          return;
        }
        this.renderActivities(); // 刷新活动列表显示
        this.toast('活动名称已同步更新');
      }
    });

    // Logo
    document.getElementById('setting-logo').addEventListener('change', (e) => {
      const act = StorageManager.getCurrentActivity();
      if (act) {
        act.settings = act.settings || {};
        act.settings.logo = e.target.value.trim();
        if (!StorageManager.saveActivity(act)) {
          this.toastStorageError();
          return;
        }
        this.toast('Logo 已保存');
      }
    });

    // 背景图
    document.getElementById('setting-bg').addEventListener('change', (e) => {
      const act = StorageManager.getCurrentActivity();
      if (act) {
        act.settings = act.settings || {};
        act.settings.backgroundImage = e.target.value.trim();
        if (!StorageManager.saveActivity(act)) {
          this.toastStorageError();
          return;
        }
        this.toast('背景图已同步');
      }
    });

    // 主题色
    document.getElementById('setting-accent-color').addEventListener('change', (e) => {
      const act = StorageManager.getCurrentActivity();
      if (act) {
        act.settings = act.settings || {};
        act.settings.accentColor = e.target.value;
        if (!StorageManager.saveActivity(act)) {
          this.toastStorageError();
          return;
        }
        this.toast('主题色已更新');
      }
    });

    // 开关设置
    ['sound', 'particles', 'danmaku', 'repeat'].forEach(key => {
      document.getElementById(`setting-${key}`).addEventListener('change', (e) => {
        const s = StorageManager.getSettings();
        if (key === 'repeat') {
          s.allowRepeatedWinning = e.target.checked;
        } else {
          s[`${key}Enabled`] = e.target.checked;
        }
        if (!StorageManager.setSettings(s)) {
          this.toastStorageError();
          return;
        }
        this.renderParticipants(); // 更新人员列表上的“可抽奖人数”状态
      });
    });

    // 清除中奖记录
    document.getElementById('btn-clear-winners').addEventListener('click', () => {
      if (confirm('确定清除当前活动的所有中奖记录？此操作不可撤销。')) {
        if (!StorageManager.clearWinners()) {
          this.toastStorageError();
          return;
        }
        this.audit.log('CLEAR_WINNERS');
        this.renderAll();
        this.toast('中奖记录已清除');
      }
    });

    // 重置所有数据
    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (confirm('确定重置所有数据？此操作将清除所有活动、人员、奖项和中奖记录，不可撤销。')) {
        if (!StorageManager.clearAll()) {
          this.toastStorageError();
          return;
        }
        if (!StorageManager.init()) {
          this.toastStorageError('默认活动初始化失败，请刷新页面后重试');
          return;
        }
        this.audit.log('CLEAR_ALL');
        this.renderAll();
        this.toast('所有数据已重置');
      }
    });
  }

  // === 二维码与签到 ===
  bindQrCode() {
    document.getElementById('btn-show-qrcode').addEventListener('click', async () => {
      const act = StorageManager.getCurrentActivity();
      if (!act) return;
      
      const container = document.getElementById('qrcode-container');
      const success = await QrCodeManager.generateSignQRCode(act.id, container);
      document.getElementById('modal-qrcode').classList.add('active');
      if (!success) {
        this.toast('二维码生成失败，已回退为签到链接');
      }
    });

    document.getElementById('btn-close-qrcode').addEventListener('click', () => {
      document.getElementById('modal-qrcode').classList.remove('active');
    });

    document.getElementById('btn-open-sign').addEventListener('click', () => {
      const act = StorageManager.getCurrentActivity();
      if (act) {
        window.open(`sign.html?activityId=${act.id}`, '_blank');
      }
    });

    document.getElementById('btn-open-viewer').addEventListener('click', () => {
      const act = StorageManager.getCurrentActivity();
      if (act) {
        window.open(`gate.html?activityId=${act.id}`, '_blank');
      }
    });
  }

  // === 日志 ===
  bindLogs() {
    document.getElementById('btn-export-logs').addEventListener('click', () => {
      this.audit.exportLogs();
    });

    document.getElementById('btn-clear-logs').addEventListener('click', () => {
      if (confirm('确定清空所有操作日志？')) {
        if (!this.audit.clear()) {
          this.toast('日志清空失败，请稍后重试');
          return;
        }
        this.renderLogs();
        this.toast('日志已清空');
      }
    });
  }

  renderLogs() {
    const logs = this.audit.getLogs().reverse().slice(0, 100);
    const anomalies = this.audit.detectAnomalies();
    const anomaliesEl = document.getElementById('logs-anomalies');
    const tbody = document.getElementById('logs-tbody');

    const actionMap = {
      'DRAW': '抽奖',
      'START_ROLLING': '开始滚动',
      'ADD_PERSON': '添加人员',
      'DELETE_PERSON': '删除人员',
      'IMPORT_JSON': 'JSON导入',
      'IMPORT_CSV': 'CSV导入',
      'LOAD_SAMPLE': '加载示例',
      'ADD_PRIZE': '添加奖项',
      'DELETE_PRIZE': '删除奖项',
      'CREATE_ACTIVITY': '创建活动',
      'DELETE_ACTIVITY': '删除活动',
      'CLEAR_WINNERS': '清除中奖',
      'CLEAR_ALL': '重置数据',
    };

    if (anomaliesEl) {
      anomaliesEl.innerHTML = anomalies.length === 0
        ? `
          <div class="glass-card logs-anomaly-card">
            <strong>异常检测</strong>
            <span class="logs-anomaly-time">当前未发现高频抽奖异常</span>
          </div>
        `
        : anomalies.map(anomaly => `
          <div class="glass-card logs-anomaly-card">
            <strong>异常预警</strong>
            <div style="margin-top: 8px; color: var(--text-primary);">${anomaly.message}</div>
            <span class="logs-anomaly-time">${new Date(anomaly.timestamp).toLocaleString('zh-CN')}</span>
          </div>
        `).join('');
    }

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="white-space: nowrap;">${l.time}</td>
        <td><span class="glass-badge">${actionMap[l.action] || l.action}</span></td>
        <td style="color: var(--text-secondary); font-size: var(--text-xs);">
          ${this.formatLogDetails(l)}
        </td>
      </tr>
    `).join('');
  }

  formatLogDetails(log) {
    const d = log.details;
    switch (log.action) {
      case 'DRAW':
        return `${d.prizeLevel} ${d.prizeName} → ${d.winners?.map(w => w.name).join(', ')}`;
      case 'ADD_PERSON':
        return `${d.name}`;
      case 'ADD_PRIZE':
        return `${d.level} ${d.name} ×${d.count}`;
      default:
        return JSON.stringify(d).substring(0, 80);
    }
  }

  renderSettings() {
    const settings = StorageManager.getSettings();
    const activity = StorageManager.getCurrentActivity();

    document.getElementById('setting-title').value = activity?.settings?.title || '';
    document.getElementById('setting-logo').value = activity?.settings?.logo || '';
    document.getElementById('setting-bg').value = activity?.settings?.backgroundImage || '';
    document.getElementById('setting-accent-color').value = activity?.settings?.accentColor || '#c9a84c';
    
    document.getElementById('setting-sound').checked = settings.soundEnabled !== false;
    document.getElementById('setting-particles').checked = settings.particlesEnabled !== false;
    document.getElementById('setting-danmaku').checked = settings.danmakuEnabled === true;
    document.getElementById('setting-repeat').checked = settings.allowRepeatedWinning === true;
  }

  // === 渲染 ===
  renderAll() {
    this.renderParticipants();
    this.renderPrizes();
    this.renderActivities();
    this.renderLogs();
    this.renderSettings();
  }

  toastStorageError(fallbackMessage = '本地数据保存失败，请刷新页面后重试。') {
    const error = StorageManager.consumeLastError();
    this.toast(error?.message || fallbackMessage);
  }

  renderAvatarMarkup(person, className = 'avatar-inline') {
    if (person.avatar) {
      return `<img class="${className}" src="${person.avatar}" alt="${person.name}">`;
    }

    return `<span class="${className} avatar-inline--placeholder">${(person.name || '?').charAt(0)}</span>`;
  }

  // === Toast 提示 ===
  toast(message) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
  }
}

// 启动
document.addEventListener('DOMContentLoaded', () => {
  window.adminApp = new AdminApp();
});
