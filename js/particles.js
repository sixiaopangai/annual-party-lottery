/**
 * Canvas 粒子动画系统
 * 背景微光粒子 + 中奖庆祝粒子爆炸
 */

class ParticleSystem {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.burstParticles = [];
    this.animationId = null;
    this.enabled = true;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * 初始化背景微光粒子
   * @param {number} count - 粒子数量
   */
  initBackground(count = 30) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push(this.createBackgroundParticle());
    }
  }

  createBackgroundParticle() {
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      size: Math.random() * 2 + 0.5,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.5 + 0.1,
      opacityDir: Math.random() > 0.5 ? 1 : -1,
      color: this.getGoldColor(),
    };
  }

  getGoldColor() {
    const colors = [
      'rgba(201, 168, 76,',  // 琥珀金
      'rgba(212, 175, 97,',  // 香槟金
      'rgba(245, 215, 122,', // 暖光金
      'rgba(232, 204, 115,', // 金属渐变
      'rgba(255, 255, 255,', // 白色微光
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * 触发庆祝粒子爆炸
   * @param {number} x - 爆炸中心 X
   * @param {number} y - 爆炸中心 Y
   * @param {number} count - 粒子数量
   */
  burst(x, y, count = 60) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = Math.random() * 6 + 2;
      const size = Math.random() * 4 + 1;

      this.burstParticles.push({
        x,
        y,
        size,
        speedX: Math.cos(angle) * speed,
        speedY: Math.sin(angle) * speed,
        opacity: 1,
        decay: Math.random() * 0.02 + 0.01,
        gravity: 0.05,
        color: this.getGoldColor(),
      });
    }
  }

  /**
   * 多点爆炸（中奖时全屏庆祝）
   */
  celebrate() {
    const points = [
      { x: this.canvas.width * 0.3, y: this.canvas.height * 0.4 },
      { x: this.canvas.width * 0.5, y: this.canvas.height * 0.3 },
      { x: this.canvas.width * 0.7, y: this.canvas.height * 0.4 },
      { x: this.canvas.width * 0.2, y: this.canvas.height * 0.6 },
      { x: this.canvas.width * 0.8, y: this.canvas.height * 0.6 },
    ];

    points.forEach((p, i) => {
      setTimeout(() => this.burst(p.x, p.y, 40), i * 100);
    });
  }

  /**
   * 动画循环
   */
  animate() {
    if (!this.enabled || !this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 绘制背景粒子
    this.particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.opacity += p.opacityDir * 0.003;

      if (p.opacity <= 0.05 || p.opacity >= 0.6) {
        p.opacityDir *= -1;
      }

      // 边界循环
      if (p.x < 0) p.x = this.canvas.width;
      if (p.x > this.canvas.width) p.x = 0;
      if (p.y < 0) p.y = this.canvas.height;
      if (p.y > this.canvas.height) p.y = 0;

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `${p.color} ${p.opacity})`;
      this.ctx.fill();
    });

    // 绘制爆炸粒子
    this.burstParticles = this.burstParticles.filter(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.speedY += p.gravity;
      p.speedX *= 0.99;
      p.opacity -= p.decay;

      if (p.opacity <= 0) return false;

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `${p.color} ${p.opacity})`;
      this.ctx.fill();

      return true;
    });

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  start() {
    this.enabled = true;
    if (!this.animationId) {
      this.initBackground();
      this.animate();
    }
  }

  stop() {
    this.enabled = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  toggle(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }
}

export { ParticleSystem };
