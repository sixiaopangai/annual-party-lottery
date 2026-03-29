/**
 * 音效管理模块
 * 使用 Web Audio API 生成音效（无需外部音频文件）
 */

class SoundManager {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
    this.rollingOscillator = null;
    this.rollingGain = null;
  }

  /**
   * 初始化 AudioContext（需用户交互后调用）
   */
  init() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * 开始滚动音效（持续的滴答声）
   */
  startRolling() {
    if (!this.enabled || !this.audioCtx) return;

    this.stopRolling();

    const now = this.audioCtx.currentTime;

    // 创建低频嗡鸣声
    this.rollingOscillator = this.audioCtx.createOscillator();
    this.rollingGain = this.audioCtx.createGain();

    this.rollingOscillator.type = 'sine';
    this.rollingOscillator.frequency.setValueAtTime(100, now);

    // LFO 调制产生紧张感
    const lfo = this.audioCtx.createOscillator();
    const lfoGain = this.audioCtx.createGain();
    lfo.frequency.setValueAtTime(8, now); // 快速脉冲
    lfoGain.gain.setValueAtTime(30, now);
    lfo.connect(lfoGain);
    lfoGain.connect(this.rollingOscillator.frequency);
    lfo.start(now);

    this.rollingGain.gain.setValueAtTime(0, now);
    this.rollingGain.gain.linearRampToValueAtTime(0.08, now + 0.3);

    this.rollingOscillator.connect(this.rollingGain);
    this.rollingGain.connect(this.audioCtx.destination);
    this.rollingOscillator.start(now);

    this._lfo = lfo;
    this._lfoGain = lfoGain;
  }

  /**
   * 停止滚动音效
   */
  stopRolling() {
    const now = this.audioCtx?.currentTime || 0;

    if (this.rollingGain) {
      this.rollingGain.gain.linearRampToValueAtTime(0, now + 0.3);
    }
    if (this.rollingOscillator) {
      this.rollingOscillator.stop(now + 0.4);
      this.rollingOscillator = null;
    }
    if (this._lfo) {
      this._lfo.stop(now + 0.4);
      this._lfo = null;
    }
  }

  /**
   * 播放中奖音效（上升和弦 + 闪烁音）
   */
  playWin() {
    if (!this.enabled || !this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    // 上升和弦
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);

      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.12 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.8);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 1);
    });

    // 闪烁音（高频泛音）
    setTimeout(() => {
      const shimmer = this.audioCtx.createOscillator();
      const shimmerGain = this.audioCtx.createGain();
      const t = this.audioCtx.currentTime;

      shimmer.type = 'triangle';
      shimmer.frequency.setValueAtTime(2093, t); // C7
      shimmer.frequency.exponentialRampToValueAtTime(4186, t + 0.5);

      shimmerGain.gain.setValueAtTime(0.06, t);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

      shimmer.connect(shimmerGain);
      shimmerGain.connect(this.audioCtx.destination);
      shimmer.start(t);
      shimmer.stop(t + 1);
    }, 400);
  }

  /**
   * 播放点击音效
   */
  playClick() {
    if (!this.enabled || !this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * 切换音效开关
   */
  toggle(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopRolling();
    }
  }
}

export { SoundManager };
