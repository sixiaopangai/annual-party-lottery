/**
 * 弹幕系统模块
 */

class DanmakuManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.enabled = false;
    this.queue = [];
    this.processInterval = null;
    this.colors = [
      'var(--text-primary)',
      'var(--accent-primary)',
      'var(--accent-glow)',
      'var(--color-teal)',
      'var(--color-purple)',
    ];
    this.bannedWords = [];
  }

  /**
   * 开启弹幕
   */
  enable() {
    this.enabled = true;
    if (!this.processInterval) {
      this.processInterval = setInterval(() => this.processQueue(), 300);
    }
  }

  /**
   * 关闭弹幕
   */
  disable() {
    this.enabled = false;
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  /**
   * 发送弹幕
   * @param {string} text
   * @param {string} color - 可选颜色
   */
  send(text, color) {
    if (!this.enabled || !text.trim()) return;

    // 关键词过滤
    if (this.bannedWords.some(w => text.includes(w))) return;

    this.queue.push({
      text: text.trim().substring(0, 50),
      color: color || this.colors[Math.floor(Math.random() * this.colors.length)],
    });
  }

  /**
   * 处理弹幕队列
   */
  processQueue() {
    if (!this.container || this.queue.length === 0) return;

    const item = this.queue.shift();
    this.createDanmakuElement(item);
  }

  /**
   * 创建弹幕 DOM 元素
   */
  createDanmakuElement(item) {
    const el = document.createElement('div');
    el.className = 'danmaku-item';
    el.textContent = item.text;
    el.style.cssText = `
      position: absolute;
      white-space: nowrap;
      color: ${item.color};
      font-size: ${14 + Math.random() * 10}px;
      font-weight: 500;
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
      top: ${Math.random() * 80}%;
      right: -300px;
      opacity: 0.8;
      pointer-events: none;
      z-index: 50;
      animation: danmakuSlide ${6 + Math.random() * 4}s linear forwards;
    `;

    this.container.appendChild(el);

    // 动画结束后移除
    el.addEventListener('animationend', () => el.remove());
  }

  /**
   * 设置屏蔽词
   * @param {Array<string>} words
   */
  setBannedWords(words) {
    this.bannedWords = words;
  }

  /**
   * 清除所有弹幕
   */
  clear() {
    if (this.container) {
      this.container.querySelectorAll('.danmaku-item').forEach(el => el.remove());
    }
    this.queue = [];
  }

  toggle(enabled) {
    if (enabled) this.enable();
    else this.disable();
  }
}

export { DanmakuManager };
