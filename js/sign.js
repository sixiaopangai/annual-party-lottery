/**
 * 签到页面逻辑
 */

import { StorageManager } from './storage.js';
import { fetchActivityFromServer, getActivityIdFromUrl, signParticipantToServer } from './server-api.js';

class SignApp {
  constructor() {
    StorageManager.init();
    this.activityId = getActivityIdFromUrl(StorageManager.getCurrentActivity()?.id || '');
    this.activity = null;
    this.init();
  }

  async init() {
    await this.loadActivity();

    this.bindEvents();
  }

  async loadActivity() {
    if (!this.activityId) {
      return;
    }

    try {
      this.activity = await fetchActivityFromServer(this.activityId);
    } catch {
      this.activity = StorageManager.getActivityById(this.activityId) || StorageManager.getCurrentActivity();
    }

    if (this.activity) {
      document.getElementById('activity-name').textContent = `${this.activity.settings?.title || this.activity.name} - 签到`;
    }
  }

  bindEvents() {
    const form = document.getElementById('sign-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSign();
    });
  }

  async handleSign() {
    const name = document.getElementById('input-name').value.trim();
    let avatar = '';
    try {
      avatar = await this.readAvatarFile();
    } catch (error) {
      alert(error.message || '头像读取失败，请重新选择图片。');
      return;
    }
    const authId = this.getDeviceAuthId();

    if (!name) return;

    try {
      if (this.activityId) {
        await signParticipantToServer(this.activityId, {
          authId,
          name,
          avatar,
          source: 'h5_sign',
        });
        this.showSuccess();
        return;
      }
    } catch (error) {
      if (error.status === 409) {
        alert(error.payload?.message || '该工号已签到或已存在，请勿重复操作。');
        return;
      }

      console.warn('[Sign] 服务端签到失败，回退本地模式', error);
    }

    // 确保切换到正确的活动进行保存
    const originalActivityId = localStorage.getItem('lottery_current_activity');
    if (this.activityId) {
      StorageManager.switchActivity(this.activityId);
    }

    const success = StorageManager.addParticipant({
      authId,
      name,
      avatar,
      source: 'h5_sign',
    });

    // 恢复原来的活动 ID（防止在后台管理时干扰）
    if (originalActivityId) {
      StorageManager.switchActivity(originalActivityId.replace(/"/g, ''));
    }

    if (success) {
      // 广播消息通知其他页面（如果需要实时刷新）
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('lottery_sync_channel');
        bc.postMessage({ type: 'participant_joined', payload: { name, authId } });
        bc.close();
      }

      this.showSuccess();
    } else {
      const storageError = StorageManager.consumeLastError();
      alert(storageError?.message || '该工号已签到或已存在，请勿重复操作。');
    }
  }

  getDeviceAuthId() {
    const storageKey = `lottery_sign_auth_${this.activityId || 'default'}`;
    let authId = localStorage.getItem(storageKey);

    if (!authId) {
      authId = `device_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(storageKey, authId);
    }

    return authId;
  }

  async readAvatarFile() {
    const file = document.getElementById('input-avatar')?.files?.[0];
    if (!file) {
      return '';
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('头像读取失败'));
      reader.readAsDataURL(file);
    });
  }

  showSuccess() {
    document.getElementById('sign-form-container').style.display = 'none';
    document.getElementById('success-container').style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SignApp();
});
