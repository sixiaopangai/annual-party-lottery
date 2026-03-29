/**
 * 操作审计日志模块
 */

class AuditLogger {
  constructor() {
    this.STORAGE_KEY = 'lottery_audit_log';
  }

  /**
   * 获取所有日志
   * @returns {Array}
   */
  getLogs() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  /**
   * 记录操作日志
   * @param {string} action - 操作类型
   * @param {Object} details - 详情
   */
  log(action, details = {}) {
    const logs = this.getLogs();
    logs.push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      action,
      details,
      timestamp: Date.now(),
      time: new Date().toLocaleString('zh-CN'),
    });
    // 保留最近 1000 条
    if (logs.length > 1000) logs.splice(0, logs.length - 1000);

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs));
      return true;
    } catch (error) {
      console.error('[Audit] 日志保存失败', error);
      return false;
    }
  }

  /**
   * 记录抽奖操作
   */
  logDraw(prizeLevel, prizeName, winners, seed) {
    this.log('DRAW', {
      prizeLevel,
      prizeName,
      winners: winners.map(w => ({ id: w.id, name: w.name })),
      seed,
      winnerCount: winners.length,
    });
  }

  /**
   * 检测异常行为
   * @returns {Array} 异常记录
   */
  detectAnomalies() {
    return AuditLogger.detectAnomaliesFromLogs(this.getLogs());
  }

  static detectAnomaliesFromLogs(logs) {
    const drawLogs = logs.filter(l => l.action === 'DRAW');
    const anomalies = [];

    // 检测短时间内频繁抽奖（1分钟内超过10次）
    for (let i = 0; i < drawLogs.length; i++) {
      const windowEnd = drawLogs[i].timestamp + 60000;
      const inWindow = drawLogs.filter(l =>
        l.timestamp >= drawLogs[i].timestamp && l.timestamp <= windowEnd
      );
      if (inWindow.length > 10) {
        anomalies.push({
          type: 'FREQUENT_DRAW',
          message: `1分钟内抽奖 ${inWindow.length} 次`,
          timestamp: drawLogs[i].timestamp,
        });
        break;
      }
    }

    return anomalies;
  }

  /**
   * 导出日志为JSON
   */
  exportLogs() {
    const logs = this.getLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `抽奖操作日志_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 清空日志
   */
  clear() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      return true;
    } catch (error) {
      console.error('[Audit] 日志清理失败', error);
      return false;
    }
  }
}

export { AuditLogger };
