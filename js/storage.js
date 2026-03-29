/**
 * 数据存储管理模块
 * 使用 LocalStorage 实现数据持久化
 */

const STORAGE_KEYS = {
  ACTIVITIES: 'lottery_activities',
  CURRENT_ACTIVITY: 'lottery_current_activity',
  SETTINGS: 'lottery_settings',
  AUDIT_LOG: 'lottery_audit_log',
};

class StorageManager {
  static normalizeParticipant(person = {}) {
    const name = (person.name || person.nickname || '').trim();
    const authId = (person.authId || '').trim();
    const id = (person.id || '').trim() || authId || this.generateId();

    return {
      id,
      authId,
      name,
      avatar: person.avatar || '',
      signedAt: person.signedAt || Date.now(),
      source: person.source || (authId ? 'h5_sign' : 'manual'),
    };
  }

  static emitChange(key) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
      return;
    }

    window.dispatchEvent(new CustomEvent('lottery-storage-changed', {
      detail: { key },
    }));
  }

  static setLastError(action, key, error) {
    const errorText = `${error?.name || ''} ${error?.message || ''}`.trim();
    const isQuotaError = /quota|storage/i.test(errorText);
    const message = action === 'read'
      ? '本地数据读取失败，系统已回退到默认值。'
      : isQuotaError
        ? '浏览器存储空间不足，保存失败。请先导出数据或清理旧活动后重试。'
        : '本地数据保存失败，请刷新页面后重试。';

    this._lastError = {
      action,
      key,
      error,
      message,
      timestamp: Date.now(),
    };
  }

  static consumeLastError() {
    const error = this._lastError || null;
    this._lastError = null;
    return error;
  }

  /**
   * 获取数据
   * @param {string} key
   * @param {*} defaultValue
   * @returns {*}
   */
  static get(key, defaultValue = null) {
    try {
      this._lastError = null;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      this.setLastError('read', key, e);
      console.error(`[Storage] 读取失败: ${key}`, e);
      return defaultValue;
    }
  }

  /**
   * 保存数据
   * @param {string} key
   * @param {*} value
   */
  static set(key, value) {
    try {
      this._lastError = null;
      localStorage.setItem(key, JSON.stringify(value));
      this.emitChange(key);
      return true;
    } catch (e) {
      this.setLastError('write', key, e);
      console.error(`[Storage] 保存失败: ${key}`, e);
      return false;
    }
  }

  /**
   * 删除数据
   * @param {string} key
   */
  static remove(key) {
    try {
      this._lastError = null;
      localStorage.removeItem(key);
      this.emitChange(key);
      return true;
    } catch (e) {
      this.setLastError('write', key, e);
      console.error(`[Storage] 删除失败: ${key}`, e);
      return false;
    }
  }

  /**
   * 清空所有抽奖数据
   */
  static clearAll() {
    return Object.values(STORAGE_KEYS).every(key => this.remove(key));
  }

  // === 人员管理 ===

  /**
   * 获取当前活动的人员列表
   * @returns {Array}
   */
  static getParticipants() {
    const activity = this.getCurrentActivity();
    return activity ? activity.participants || [] : [];
  }

  /**
   * 保存人员列表到当前活动
   * @param {Array} participants
   */
  static setParticipants(participants) {
    const activity = this.getCurrentActivity();
    if (activity) {
      activity.participants = participants;
      return this.saveActivity(activity);
    }

    return false;
  }

  /**
   * 添加人员（自动去重）
   * @param {Object} person - { id, name, department, avatar }
   * @returns {boolean} 是否成功添加
   */
  static addParticipant(person) {
    const normalized = this.normalizeParticipant(person);
    const participants = this.getParticipants();
    if (!normalized.name) {
      return false;
    }

    if (participants.some(p =>
      (normalized.authId && p.authId && p.authId === normalized.authId) ||
      p.id === normalized.id
    )) {
      return false; // 重复
    }
    participants.push(normalized);
    return this.setParticipants(participants);
  }

  /**
   * 删除人员
   * @param {string} id
   */
  static removeParticipant(id) {
    const participants = this.getParticipants().filter(p => p.id !== id);
    return this.setParticipants(participants);
  }

  /**
   * 批量导入人员（JSON / 数组）
   * @param {Array} people
   * @returns {{ added: number, duplicates: number }}
   */
  static importParticipants(people) {
    const participants = this.getParticipants();
    const existingIds = new Set(participants.map(p => p.id));
    let added = 0;
    let duplicates = 0;

    people.forEach(person => {
      const normalized = this.normalizeParticipant(person);
      if (!normalized.name) {
        return;
      }

      if (existingIds.has(normalized.id)) {
        duplicates++;
      } else {
        participants.push(normalized);
        existingIds.add(normalized.id);
        added++;
      }
    });

    const saved = this.setParticipants(participants);
    return { added, duplicates, saved };
  }

  // === 奖项管理 ===

  /**
   * 获取当前活动的奖项列表
   * @returns {Array}
   */
  static getPrizes() {
    const activity = this.getCurrentActivity();
    return activity ? activity.prizes || [] : [];
  }

  /**
   * 保存奖项列表
   * @param {Array} prizes
   */
  static setPrizes(prizes) {
    const activity = this.getCurrentActivity();
    if (activity) {
      activity.prizes = prizes;
      return this.saveActivity(activity);
    }

    return false;
  }

  /**
   * 添加奖项
   * @param {Object} prize
   */
  static addPrize(prize) {
    const prizes = this.getPrizes();
    if (!prize.id) prize.id = this.generateId();
    prizes.push(prize);
    return this.setPrizes(prizes) ? prize : null;
  }

  /**
   * 更新奖项
   * @param {string} id
   * @param {Object} updates
   */
  static updatePrize(id, updates) {
    const prizes = this.getPrizes().map(p =>
      p.id === id ? { ...p, ...updates } : p
    );
    return this.setPrizes(prizes);
  }

  /**
   * 删除奖项
   * @param {string} id
   */
  static removePrize(id) {
    const prizes = this.getPrizes().filter(p => p.id !== id);
    return this.setPrizes(prizes);
  }

  // === 中奖记录 ===

  /**
   * 获取中奖记录
   * @returns {Array}
   */
  static getWinners() {
    const activity = this.getCurrentActivity();
    return activity ? activity.winners || [] : [];
  }

  /**
   * 添加中奖记录
   * @param {Object} record - { prizeId, prizeName, prizeLevel, winners: [{id, name, ...}], timestamp }
   */
  static addWinnerRecord(record) {
    const activity = this.getCurrentActivity();
    if (activity) {
      if (!activity.winners) activity.winners = [];
      record.timestamp = Date.now();
      activity.winners.push(record);
      return this.saveActivity(activity);
    }

    return false;
  }

  /**
   * 获取所有已中奖人员 ID 列表
   * @returns {Set<string>}
   */
  static getWonParticipantIds() {
    const winners = this.getWinners();
    const ids = new Set();
    winners.forEach(record => {
      record.winners.forEach(w => ids.add(w.id));
    });
    return ids;
  }

  /**
   * 获取可参与抽奖的人员（排除已中奖，除非开启可重复中奖）
   * @returns {Array}
   */
  static getAvailableParticipants() {
    const all = this.getParticipants();
    const settings = this.getSettings();
    if (settings.allowRepeatedWinning) {
      return all;
    }
    const wonIds = this.getWonParticipantIds();
    return all.filter(p => !wonIds.has(p.id));
  }

  /**
   * 清除中奖记录
   */
  static clearWinners() {
    const activity = this.getCurrentActivity();
    if (activity) {
      activity.winners = [];
      return this.saveActivity(activity);
    }

    return false;
  }

  // === 活动管理 ===

  /**
   * 获取当前活动
   * @returns {Object|null}
   */
  static getCurrentActivity() {
    const currentId = this.get(STORAGE_KEYS.CURRENT_ACTIVITY);
    const activities = this.getAllActivities();
    return activities.find(a => a.id === currentId) || activities[0] || null;
  }

  /**
   * 获取所有活动
   * @returns {Array}
   */
  static getAllActivities() {
    return this.get(STORAGE_KEYS.ACTIVITIES, []);
  }

  /**
   * 根据 ID 获取活动
   * @param {string} id
   * @returns {Object|null}
   */
  static getActivityById(id) {
    return this.getAllActivities().find(activity => activity.id === id) || null;
  }

  /**
   * 创建新活动
   * @param {string} name
   * @returns {Object}
   */
  static createActivity(name) {
    const activities = this.getAllActivities();
    const activity = {
      id: this.generateId(),
      name,
      createdAt: Date.now(),
      archived: false,
      participants: [],
      prizes: [],
      winners: [],
      settings: {
        title: name,
        logo: '',
        backgroundImage: '',
      },
    };
    activities.push(activity);

    if (!this.set(STORAGE_KEYS.ACTIVITIES, activities)) {
      return null;
    }

    if (!this.set(STORAGE_KEYS.CURRENT_ACTIVITY, activity.id)) {
      return null;
    }

    return activity;
  }

  /**
   * 切换当前活动
   * @param {string} id
   */
  static switchActivity(id) {
    return this.set(STORAGE_KEYS.CURRENT_ACTIVITY, id);
  }

  /**
   * 保存活动数据
   * @param {Object} activity
   */
  static saveActivity(activity) {
    const activities = this.getAllActivities().map(a =>
      a.id === activity.id ? activity : a
    );
    return this.set(STORAGE_KEYS.ACTIVITIES, activities);
  }

  /**
   * 新增或更新活动
   * @param {Object} activity
   * @returns {boolean}
   */
  static upsertActivity(activity) {
    const activities = this.getAllActivities();
    const index = activities.findIndex(item => item.id === activity.id);

    if (index >= 0) {
      activities[index] = activity;
    } else {
      activities.push(activity);
    }

    if (!this.set(STORAGE_KEYS.ACTIVITIES, activities)) {
      return false;
    }

    if (!this.get(STORAGE_KEYS.CURRENT_ACTIVITY)) {
      return this.set(STORAGE_KEYS.CURRENT_ACTIVITY, activity.id);
    }

    return true;
  }

  /**
   * 删除活动
   * @param {string} id
   */
  static deleteActivity(id) {
    const activities = this.getAllActivities().filter(a => a.id !== id);
    if (!this.set(STORAGE_KEYS.ACTIVITIES, activities)) {
      return false;
    }

    if (this.get(STORAGE_KEYS.CURRENT_ACTIVITY) === id) {
      return this.set(STORAGE_KEYS.CURRENT_ACTIVITY, activities[0]?.id || null);
    }

    return true;
  }

  /**
   * 归档活动
   * @param {string} id
   */
  static archiveActivity(id) {
    const activities = this.getAllActivities().map(a =>
      a.id === id ? { ...a, archived: true } : a
    );
    return this.set(STORAGE_KEYS.ACTIVITIES, activities);
  }

  // === 全局设置 ===

  /**
   * 获取全局设置
   */
  static getSettings() {
    return this.get(STORAGE_KEYS.SETTINGS, {
      soundEnabled: true,
      particlesEnabled: true,
      danmakuEnabled: false,
      allowRepeatedWinning: false,
    });
  }

  /**
   * 保存全局设置
   */
  static setSettings(settings) {
    return this.set(STORAGE_KEYS.SETTINGS, settings);
  }

  // === 工具方法 ===

  /**
   * 生成唯一 ID
   * @returns {string}
   */
  static generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 初始化 — 确保至少有一个默认活动
   */
  static init() {
    const activities = this.getAllActivities();
    if (activities.length === 0) {
      return Boolean(this.createActivity('2026 年会抽奖'));
    }

    return true;
  }
}

export { StorageManager, STORAGE_KEYS };
