/**
 * 数据导出模块
 */

class ExportManager {
  /**
   * 导出为 JSON 文件
   * @param {*} data
   * @param {string} filename
   */
  static toJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    this.download(blob, filename + '.json');
  }

  /**
   * 导出中奖结果为 CSV
   * @param {Array} winners - 中奖记录数组
   * @param {string} filename
   */
  static toCSV(winners, filename) {
    const BOM = '\uFEFF'; // UTF-8 BOM 确保中文不乱码
    let csv = BOM + '奖项等级,奖品名称,中奖者姓名,中奖者工号,中奖者部门,抽奖时间\n';

    winners.forEach(record => {
      record.winners.forEach(w => {
        csv += [
          record.prizeLevel,
          record.prizeName,
          w.name,
          w.id,
          w.department || '',
          new Date(record.timestamp).toLocaleString('zh-CN'),
        ].map(v => `"${v}"`).join(',') + '\n';
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    this.download(blob, filename + '.csv');
  }

  /**
   * 触发文件下载
   */
  static download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 解析 CSV 文件为人员数组
   * @param {string} csvText
   * @returns {Array}
   */
  static parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const people = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length < 2) continue;

      const person = {};
      headers.forEach((h, idx) => {
        const key = this.mapHeaderToKey(h);
        if (key) person[key] = values[idx] || '';
      });

      if (!person.id) person.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      if (person.name) people.push(person);
    }

    return people;
  }

  /**
   * 映射 CSV 表头到字段名
   */
  static mapHeaderToKey(header) {
    const map = {
      '姓名': 'name', 'name': 'name',
      '工号': 'id', 'id': 'id', '编号': 'id',
      '部门': 'department', 'department': 'department', 'dept': 'department',
      '头像': 'avatar', 'avatar': 'avatar',
    };
    return map[header.toLowerCase()] || map[header] || null;
  }
}

export { ExportManager };
