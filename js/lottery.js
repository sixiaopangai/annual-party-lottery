/**
 * 抽奖核心算法模块
 * 使用 crypto.getRandomValues() 确保安全随机
 */

class LotteryEngine {
  /**
   * 安全随机数生成（0 到 max-1）
   * @param {number} max
   * @returns {number}
   */
  static secureRandom(max) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] % max;
  }

  /**
   * 从候选人中随机抽取指定数量
   * @param {Array} candidates - 候选人列表
   * @param {number} count - 抽取人数
   * @returns {{ winners: Array, seed: string }}
   */
  static draw(candidates, count) {
    if (candidates.length === 0) {
      return { winners: [], seed: '' };
    }

    count = Math.min(count, candidates.length);
    const pool = [...candidates];
    const winners = [];

    // 生成随机种子用于审计
    const seedArray = new Uint8Array(16);
    crypto.getRandomValues(seedArray);
    const seed = Array.from(seedArray, b => b.toString(16).padStart(2, '0')).join('');

    // Fisher-Yates 洗牌抽取
    for (let i = 0; i < count; i++) {
      const randomIndex = this.secureRandom(pool.length);
      winners.push(pool[randomIndex]);
      pool.splice(randomIndex, 1);
    }

    return { winners, seed };
  }

  /**
   * 获取用于滚动动画的随机候选人序列
   * @param {Array} candidates - 候选人列表
   * @param {number} length - 生成序列长度
   * @returns {Array}
   */
  static generateScrollSequence(candidates, length = 50) {
    if (candidates.length === 0) return [];

    const sequence = [];
    for (let i = 0; i < length; i++) {
      const idx = this.secureRandom(candidates.length);
      sequence.push(candidates[idx]);
    }
    return sequence;
  }
}

export { LotteryEngine };
