/**
 * 抽奖主页面控制器
 */

import { StorageManager } from './storage.js';
import { LotteryEngine } from './lottery.js';
import { ParticleSystem } from './particles.js';
import { SoundManager } from './sound.js';
import { AuditLogger } from './audit.js';
import { DanmakuManager } from './danmaku.js';
import { syncManager } from './sync.js';
import { pullActivityFromServer, pushCurrentActivityToServer } from './activity-sync.js';

class LotteryApp {
  constructor() {
    this.state = {
      isRolling: false,
      currentPrizeIndex: 0,
      prizes: [],
      participants: [],
      scrollTimer: null,
      scrollSpeed: 30,
    };

    this.particles = new ParticleSystem('particles-canvas');
    this.sound = new SoundManager();
    this.audit = new AuditLogger();
    this.danmaku = new DanmakuManager('danmaku-container');
    this.remoteSyncTimer = null;

    this.init();
  }

  init() {
    StorageManager.init();
    this.loadData();
    this.bindEvents();
    this.particles.start();
    this.initRemoteSync();

    // 加载设置
    const settings = StorageManager.getSettings();
    this.sound.toggle(settings.soundEnabled !== false);
    this.danmaku.toggle(settings.danmakuEnabled === true);
    this.initSync();
    this.particles.toggle(settings.particlesEnabled !== false);
    this.render();
  }

  /**
   * 初始化实时同步联动
   */
  initSync() {
    const activityId = StorageManager.getCurrentActivity()?.id;
    if (activityId) {
      syncManager.connect({ activityId, role: 'host' });
    }

    // 监听弹幕消息
    syncManager.on('danmaku_message', (data) => {
      if (this.danmaku.enabled) {
        this.danmaku.send(data.text);
      }
    });

    // 监听签到通知
    syncManager.on('participant_joined', async (data) => {
      await this.refreshActivityFromServer();
      if (this.danmaku.enabled) {
        this.danmaku.send(`🎉 欢迎新朋友 ${data.name} 签到加入！`);
      }
    });

    syncManager.on('presence_update', (presence) => {
      this.updatePresence(presence);
    });

    // 响应观众同步请求
    syncManager.on('request_sync', () => {
      this.broadcastState();
    });
  }

  /**
   * 广播当前状态给观众端
   */
  broadcastState() {
    const currentPrize = this.state.prizes[this.state.currentPrizeIndex];
    syncManager.broadcast('state_change', {
      isRolling: this.state.isRolling,
      prize: currentPrize ? {
        level: currentPrize.level,
        name: currentPrize.name,
      } : {}
    });
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
        console.warn('[RemoteSync] 活动状态推送失败', error);
      }
    }, 120);
  }

  async refreshActivityFromServer() {
    const activityId = StorageManager.getCurrentActivity()?.id;
    if (!activityId) {
      return false;
    }

    try {
      await pullActivityFromServer(activityId);
      this.loadData();
      this.render();
      return true;
    } catch (error) {
      console.warn('[RemoteSync] 活动状态拉取失败', error);
      return false;
    }
  }

  loadData() {
    this.state.prizes = StorageManager.getPrizes();
    this.state.participants = StorageManager.getAvailableParticipants();

    // 找到第一个还有剩余名额的奖项
    const wonRecords = StorageManager.getWinners();
    for (let i = 0; i < this.state.prizes.length; i++) {
      const prize = this.state.prizes[i];
      const alreadyWon = wonRecords.filter(r => r.prizeId === prize.id)
        .reduce((sum, r) => sum + r.winners.length, 0);
      if (alreadyWon < prize.count) {
        this.state.currentPrizeIndex = i;
        break;
      }
      if (i === this.state.prizes.length - 1) {
        this.state.currentPrizeIndex = i;
      }
    }
  }

  bindEvents() {
    // 开始/停止按钮
    const btnStart = document.getElementById('btn-start');
    btnStart.addEventListener('click', () => {
      this.sound.init();
      if (this.state.isRolling) {
        this.stopRolling();
      } else {
        this.startRolling();
      }
    });

    // 下一奖项
    document.getElementById('btn-next-prize').addEventListener('click', () => {
      this.sound.playClick();
      this.nextPrize();
    });

    // 全屏
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });

    // 音效开关
    document.getElementById('btn-sound-toggle').addEventListener('click', () => {
      const settings = StorageManager.getSettings();
      settings.soundEnabled = !settings.soundEnabled;
      StorageManager.setSettings(settings);
      this.sound.toggle(settings.soundEnabled);
      this.updateSoundIcon(settings.soundEnabled);
    });

    // 快捷键：空格 = 开始/停止
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        this.sound.init();
        if (this.state.isRolling) {
          this.stopRolling();
        } else {
          this.startRolling();
        }
      }
    });

    // 无数据弹窗关闭
    document.getElementById('btn-modal-close')?.addEventListener('click', () => {
      document.getElementById('modal-no-data').classList.remove('active');
    });

    // 完成弹窗关闭
    document.getElementById('btn-complete-close')?.addEventListener('click', () => {
      document.getElementById('modal-complete').classList.remove('active');
    });
  }

  /**
   * 渲染界面
   */
  render() {
    const { prizes, currentPrizeIndex, participants } = this.state;
    const btnStart = document.getElementById('btn-start');
    const noDataModal = document.getElementById('modal-no-data');

    // 活动标题
    const activity = StorageManager.getCurrentActivity();
    if (activity?.settings?.title) {
      document.getElementById('activity-title').textContent = activity.settings.title;
    }

    // Logo
    if (activity?.settings?.logo) {
      const logo = document.getElementById('company-logo');
      logo.src = activity.settings.logo;
      logo.style.display = 'block';
    } else {
      document.getElementById('company-logo').style.display = 'none';
    }

    // 背景图
    if (activity?.settings?.backgroundImage) {
      document.body.style.backgroundImage = `url(${activity.settings.backgroundImage})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
    } else {
      document.body.style.backgroundImage = '';
    }

    // 主题色
    if (activity?.settings?.accentColor) {
      document.documentElement.style.setProperty('--accent-primary', activity.settings.accentColor);
      // 同时更新一些衍生色，简化处理，直接用同样的色值或微调
      document.documentElement.style.setProperty('--accent-secondary', activity.settings.accentColor);
      document.documentElement.style.setProperty('--text-accent', activity.settings.accentColor);
    }

    this.renderCheckinWall();

    if (noDataModal) {
      noDataModal.classList.remove('active');
    }

    if (prizes.length === 0) {
      document.getElementById('prize-level').style.display = 'none';
      document.getElementById('prize-name').textContent = '等待配置奖项';
      document.getElementById('prize-desc').textContent = '签到墙会继续实时显示到场嘉宾，管理员可稍后在后台配置奖品。';
      document.getElementById('prize-meta').style.display = 'none';
      document.getElementById('slot-container').innerHTML = '';
      document.getElementById('winner-display').style.display = 'none';
      btnStart.disabled = true;
      btnStart.style.opacity = '0.5';
      document.getElementById('btn-next-prize').style.display = 'none';
      return;
    }

    const currentPrize = prizes[currentPrizeIndex];
    if (!currentPrize) return;

    const allParticipants = StorageManager.getParticipants();
    btnStart.disabled = allParticipants.length === 0;
    btnStart.style.opacity = allParticipants.length === 0 ? '0.5' : '1';

    // 奖项信息
    const prizeLevelStr = currentPrize.level || '';
    const prizeLevelEl = document.getElementById('prize-level');
    prizeLevelEl.textContent = prizeLevelStr;
    prizeLevelEl.style.display = prizeLevelStr ? 'inline-block' : 'none';
      
    document.getElementById('prize-name').textContent = currentPrize.name || '';
    document.getElementById('prize-desc').textContent = currentPrize.description || '';

    // 计算剩余名额
    const wonRecords = StorageManager.getWinners();
    const alreadyWon = wonRecords.filter(r => r.prizeId === currentPrize.id)
      .reduce((sum, r) => sum + r.winners.length, 0);
    const remaining = Math.max(0, currentPrize.count - alreadyWon);

    document.getElementById('prize-meta').style.display = 'flex';
    document.getElementById('prize-remaining').innerHTML =
      `待抽: <strong>${remaining}</strong> 人`;
    document.getElementById('prize-total').innerHTML =
      `剩余人员: <strong>${participants.length}</strong> 人`;

    // 创建抽奖卡片
    this.createSlotCards(remaining);

    if (allParticipants.length === 0) {
      const firstCard = document.querySelector('.slot-card');
      if (firstCard) {
        firstCard.querySelector('.slot-name').textContent = '等待现场签到';
        firstCard.querySelector('.slot-dept').textContent = '签到成功后会立即显示在签到墙';
      }
    }

    // 更新底部中奖名单
    this.updateFooterWinners();
    this.renderCheckinWall();

    // 控制下一奖项按钮
    document.getElementById('btn-next-prize').style.display =
      remaining === 0 && currentPrizeIndex < prizes.length - 1 ? 'inline-flex' : 'none';

    this.broadcastState();
  }

  /**
   * 创建滚动卡片
   */
  createSlotCards(count) {
    const container = document.getElementById('slot-container');
    container.innerHTML = '';

    const displayCount = Math.min(count, 5); // 最多显示5个卡片
    for (let i = 0; i < displayCount; i++) {
      const card = document.createElement('div');
      card.className = 'slot-card glass-card';
      card.id = `slot-${i}`;
      card.innerHTML = `
        <div class="slot-avatar">
          <div class="avatar-placeholder">?</div>
        </div>
        <div class="slot-name">等待抽奖</div>
        <div class="slot-dept"></div>
      `;
      container.appendChild(card);
    }
  }

  /**
   * 开始滚动
   */
  startRolling() {
    const available = StorageManager.getAvailableParticipants();
    if (available.length === 0) {
      return;
    }

    const currentPrize = this.state.prizes[this.state.currentPrizeIndex];
    if (!currentPrize) return;

    const wonRecords = StorageManager.getWinners();
    const alreadyWon = wonRecords.filter(r => r.prizeId === currentPrize.id)
      .reduce((sum, r) => sum + r.winners.length, 0);
    const remaining = currentPrize.count - alreadyWon;

    if (remaining <= 0) return;

    this.state.isRolling = true;

    // 隐藏中奖展示，显示滚动卡片
    document.getElementById('winner-display').style.display = 'none';
    document.getElementById('slot-container').style.display = 'flex';

    // UI 状态
    const btn = document.getElementById('btn-start');
    btn.textContent = '停止';
    btn.classList.add('stop');
    document.getElementById('btn-next-prize').style.display = 'none';

    // 给卡片添加滚动样式
    document.querySelectorAll('.slot-card').forEach(c => c.classList.add('rolling'));

    // 音效
    this.sound.startRolling();

    // 开始快速切换名字
    this.state.scrollSpeed = 30;
    this.animateScroll(available);

    this.audit.log('START_ROLLING', {
      prizeLevel: currentPrize.level,
      prizeName: currentPrize.name,
    });
  }

  /**
   * 滚动动画
   */
  animateScroll(candidates) {
    if (!this.state.isRolling) return;

    const cards = document.querySelectorAll('.slot-card');
    cards.forEach(card => {
      const idx = Math.floor(Math.random() * candidates.length);
      const person = candidates[idx];
      const nameEl = card.querySelector('.slot-name');
      const deptEl = card.querySelector('.slot-dept');
      const avatarEl = card.querySelector('.slot-avatar');

      nameEl.textContent = person.name;
      deptEl.textContent = this.getParticipantMetaLabel(person);

      if (person.avatar) {
        avatarEl.innerHTML = `<img class="avatar-img" src="${person.avatar}" alt="${person.name}">`;
      } else {
        avatarEl.innerHTML = `<div class="avatar-placeholder">${person.name.charAt(0)}</div>`;
      }
    });

    this.state.scrollTimer = setTimeout(
      () => this.animateScroll(candidates),
      this.state.scrollSpeed
    );

    // 广播状态
    this.broadcastState();
  }

  /**
   * 停止滚动 — 执行抽奖
   */
  stopRolling() {
    this.state.isRolling = false;
    clearTimeout(this.state.scrollTimer);

    // 广播状态
    this.broadcastState();

    // 减速效果
    this.decelerateAndDraw();
  }

  /**
   * 减速动画后抽奖
   */
  async decelerateAndDraw() {
    const available = StorageManager.getAvailableParticipants();
    const currentPrize = this.state.prizes[this.state.currentPrizeIndex];
    const wonRecords = StorageManager.getWinners();
    const alreadyWon = wonRecords.filter(r => r.prizeId === currentPrize.id)
      .reduce((sum, r) => sum + r.winners.length, 0);
    const drawCount = Math.min(currentPrize.count - alreadyWon, available.length, 5);

    // 减速切换
    let speed = 30;
    const cards = document.querySelectorAll('.slot-card');

    for (let i = 0; i < 15; i++) {
      speed += 20 + i * 5;
      cards.forEach(card => {
        const idx = Math.floor(Math.random() * available.length);
        const person = available[idx];
        card.querySelector('.slot-name').textContent = person.name;
        card.querySelector('.slot-dept').textContent = this.getParticipantMetaLabel(person);
        if (person.avatar) {
          card.querySelector('.slot-avatar').innerHTML =
            `<img class="avatar-img" src="${person.avatar}" alt="${person.name}">`;
        } else {
          card.querySelector('.slot-avatar').innerHTML =
            `<div class="avatar-placeholder">${person.name.charAt(0)}</div>`;
        }
      });
      await this.sleep(speed);
    }

    // 执行正式抽奖
    const { winners, seed } = LotteryEngine.draw(available, drawCount);

    // 停止音效
    this.sound.stopRolling();

    // 显示最终结果在卡片上
    cards.forEach((card, i) => {
      card.classList.remove('rolling');
      if (winners[i]) {
        card.querySelector('.slot-name').textContent = winners[i].name;
        card.querySelector('.slot-dept').textContent = this.getParticipantMetaLabel(winners[i]);
        if (winners[i].avatar) {
          card.querySelector('.slot-avatar').innerHTML =
            `<img class="avatar-img" src="${winners[i].avatar}" alt="${winners[i].name}">`;
        } else {
          card.querySelector('.slot-avatar').innerHTML =
            `<div class="avatar-placeholder">${winners[i].name.charAt(0)}</div>`;
        }
      }
    });

    // 延迟后展示中奖动画
    await this.sleep(300);

    // 保存中奖记录
    StorageManager.addWinnerRecord({
      prizeId: currentPrize.id,
      prizeLevel: currentPrize.level,
      prizeName: currentPrize.name,
      winners: winners,
    });

    // 审计日志
    this.audit.logDraw(currentPrize.level, currentPrize.name, winners, seed);

    // 切换到中奖展示
    this.showWinners(winners);

    // 广播中奖结果
    syncManager.broadcast('draw_result', { winners });
    this.broadcastState();

    // 音效 + 粒子庆祝
    this.sound.playWin();
    this.particles.celebrate();

    // 更新数据
    this.state.participants = StorageManager.getAvailableParticipants();

    // 更新UI
    const btn = document.getElementById('btn-start');
    btn.textContent = '开始抽奖';
    btn.classList.remove('stop');

    // 检查当前奖项是否抽完
    const newWonRecords = StorageManager.getWinners();
    const totalWon = newWonRecords.filter(r => r.prizeId === currentPrize.id)
      .reduce((sum, r) => sum + r.winners.length, 0);

    if (totalWon >= currentPrize.count) {
      // 当前奖项抽完
      if (this.state.currentPrizeIndex < this.state.prizes.length - 1) {
        document.getElementById('btn-next-prize').style.display = 'inline-flex';
      } else {
        // 所有奖项抽完
        setTimeout(() => {
          document.getElementById('modal-complete').classList.add('active');
        }, 2000);
      }
    }

    // 更新底部中奖名单和奖项信息
    this.updatePrizeInfo();
    this.updateFooterWinners();
  }

  /**
   * 展示中奖者
   */
  showWinners(winners) {
    document.getElementById('slot-container').style.display = 'none';

    const display = document.getElementById('winner-display');
    display.style.display = 'block';

    const cardsContainer = document.getElementById('winner-cards');
    cardsContainer.innerHTML = '';

    winners.forEach((winner, i) => {
      const card = document.createElement('div');
      card.className = 'winner-card';
      card.style.animationDelay = `${i * 150}ms`;

      let avatarHtml;
      if (winner.avatar) {
        avatarHtml = `<img class="avatar-img" src="${winner.avatar}" alt="${winner.name}">`;
      } else {
        avatarHtml = `<div class="avatar-placeholder" style="font-size: var(--text-3xl); color: var(--accent-primary);">${winner.name.charAt(0)}</div>`;
      }

      card.innerHTML = `
        <div class="slot-avatar">${avatarHtml}</div>
        <div class="slot-name">${winner.name}</div>
        <div class="slot-dept">${this.getParticipantMetaLabel(winner)}</div>
      `;
      cardsContainer.appendChild(card);
    });
  }

  /**
   * 更新奖项信息
   */
  updatePrizeInfo() {
    const currentPrize = this.state.prizes[this.state.currentPrizeIndex];
    if (!currentPrize) return;

    const wonRecords = StorageManager.getWinners();
    const alreadyWon = wonRecords.filter(r => r.prizeId === currentPrize.id)
      .reduce((sum, r) => sum + r.winners.length, 0);
    const remaining = Math.max(0, currentPrize.count - alreadyWon);

    document.getElementById('prize-remaining').innerHTML =
      `待抽: <strong>${remaining}</strong> 人`;
    document.getElementById('prize-total').innerHTML =
      `剩余人员: <strong>${this.state.participants.length}</strong> 人`;
  }

  /**
   * 切换到下一奖项
   */
  nextPrize() {
    if (this.state.currentPrizeIndex < this.state.prizes.length - 1) {
      this.state.currentPrizeIndex++;
      document.getElementById('winner-display').style.display = 'none';
      document.getElementById('slot-container').style.display = 'flex';
      document.getElementById('btn-next-prize').style.display = 'none';
      this.render();
      this.broadcastState();

      // 奖项切换动画
      const prizeInfo = document.getElementById('prize-info');
      prizeInfo.style.animation = 'none';
      prizeInfo.offsetHeight; // 触发 reflow
      prizeInfo.style.animation = 'slideUp 0.6s ease';
    }
  }

  /**
   * 更新底部中奖名单
   */
  updateFooterWinners() {
    const container = document.getElementById('footer-winner-list');
    const records = StorageManager.getWinners();

    if (records.length === 0) {
      container.innerHTML = '<span style="color: var(--text-tertiary); font-size: var(--text-xs);">暂无</span>';
      return;
    }

    container.innerHTML = '';
    records.forEach(record => {
      record.winners.forEach(w => {
        const tag = document.createElement('span');
        tag.className = 'footer-winner-tag';
        tag.innerHTML = `
          <span class="prize-label">${record.prizeLevel}</span>
          ${w.name}
        `;
        container.appendChild(tag);
      });
    });
  }

  renderCheckinWall() {
    const list = document.getElementById('checkin-list');
    const count = document.getElementById('checkin-count');
    if (!list || !count) return;

    const participants = [...StorageManager.getParticipants()]
      .sort((a, b) => (b.signedAt || 0) - (a.signedAt || 0))
      .slice(0, 12);

    count.textContent = `${StorageManager.getParticipants().length} 人`;

    if (participants.length === 0) {
      list.innerHTML = `
        <div class="checkin-item" style="grid-column: 1 / -1;">
          <div class="checkin-name">现场还没有人签到</div>
          <div class="checkin-time">管理员可先在后台补录，或等待扫码签到</div>
        </div>
      `;
      return;
    }

    list.innerHTML = participants.map(person => `
      <div class="checkin-item">
        <div class="checkin-avatar">
          ${person.avatar
            ? `<img src="${person.avatar}" alt="${person.name}">`
            : `<div class="avatar-placeholder">${person.name.charAt(0)}</div>`
          }
        </div>
        <div class="checkin-name">${person.name}</div>
        <div class="checkin-time">${this.formatCheckinTime(person.signedAt)}</div>
      </div>
    `).join('');
  }

  getParticipantMetaLabel(person) {
    if (person.source === 'manual') {
      return '手动补录';
    }

    return '现场签到';
  }

  formatCheckinTime(timestamp) {
    if (!timestamp) {
      return '刚刚签到';
    }

    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  updateSoundIcon(enabled) {
    const btn = document.getElementById('btn-sound-toggle');
    btn.style.opacity = enabled ? '1' : '0.4';
  }

  updatePresence(presence) {
    const el = document.getElementById('sync-presence');
    if (!el) return;
    el.textContent = `在线 ${presence.total}`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 启动
document.addEventListener('DOMContentLoaded', () => {
  window.lotteryApp = new LotteryApp();
});
