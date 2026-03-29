import { StorageManager } from './storage.js';
import { getActivityIdFromUrl, fetchActivityFromServer, queryWinnerFromServer } from './server-api.js';
import { buildWinnerPosterModel, createWinnerPosterDataUrl, downloadPoster, sharePoster } from './poster.js';

class QueryApp {
  constructor() {
    StorageManager.init();
    this.activityId = getActivityIdFromUrl(StorageManager.getCurrentActivity()?.id || '');
    this.activity = null;
    this.latestQueryResult = null;
    this.latestPosterDataUrl = '';
    this.init();
  }

  async init() {
    await this.loadActivity();
    this.bindEvents();
    this.prefillFromUrl();
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
      document.getElementById('query-activity-title').textContent = `${this.activity.settings?.title || this.activity.name} 中奖查询`;
    }
  }

  bindEvents() {
    document.getElementById('query-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleQuery();
    });

    document.getElementById('btn-download-poster').addEventListener('click', () => {
      if (!this.latestPosterDataUrl) return;
      downloadPoster(this.latestPosterDataUrl, this.buildPosterFilename());
    });

    document.getElementById('btn-share-poster').addEventListener('click', async () => {
      if (!this.latestPosterDataUrl) return;
      try {
        await sharePoster(this.latestPosterDataUrl, this.buildPosterFilename(), `${this.activity?.settings?.title || this.activity?.name || '年会抽奖'}中奖海报`);
      } catch (error) {
        alert(error.message || '分享失败，请重试。');
      }
    });
  }

  prefillFromUrl() {
    const searchParams = new URLSearchParams(window.location.search);
    document.getElementById('query-id').value = searchParams.get('employeeId') || searchParams.get('id') || '';
    document.getElementById('query-name').value = searchParams.get('name') || '';
  }

  async handleQuery() {
    const id = document.getElementById('query-id').value.trim();
    const name = document.getElementById('query-name').value.trim();

    if (!id) {
      return;
    }

    try {
      try {
        this.latestQueryResult = await queryWinnerFromServer(this.activityId, { id, name });
      } catch (error) {
        this.latestQueryResult = this.queryWinnerFromLocal(id, name);
      }

      this.renderResult();
    } catch (error) {
      alert(error.message || '查询失败，请稍后重试。');
    }
  }

  queryWinnerFromLocal(id, name) {
    const activity = this.activity || StorageManager.getCurrentActivity();
    if (!activity) {
      throw new Error('活动数据不存在');
    }

    const participant = (activity.participants || []).find(item => item.id === id && (!name || item.name === name)) || null;
    const records = (activity.winners || []).flatMap(record =>
      (record.winners || [])
        .filter(winner => winner.id === id && (!name || winner.name === name))
        .map(winner => ({
          participant: winner,
          prizeId: record.prizeId,
          prizeLevel: record.prizeLevel,
          prizeName: record.prizeName,
          timestamp: record.timestamp,
        }))
    );

    return {
      ok: true,
      foundActivity: true,
      won: records.length > 0,
      participant,
      records,
    };
  }

  renderResult() {
    const resultEl = document.getElementById('query-result');
    const posterCard = document.getElementById('poster-preview-card');
    resultEl.classList.add('active');
    posterCard.style.display = 'none';
    this.latestPosterDataUrl = '';

    if (!this.latestQueryResult?.won) {
      resultEl.innerHTML = `
        <div class="result-card">
          <h3>查询结果</h3>
          <p>当前未查询到中奖记录。</p>
          <p>如果刚完成抽奖，请稍后再次查询。</p>
        </div>
      `;
      return;
    }

    resultEl.innerHTML = this.latestQueryResult.records.map(record => `
      <div class="result-card">
        <h3>${record.prizeLevel} · ${record.prizeName}</h3>
        <p>中奖人：${record.participant.name}</p>
        <p>部门：${record.participant.department || '未填写'}</p>
        <p>开奖时间：${new Date(record.timestamp).toLocaleString('zh-CN')}</p>
      </div>
    `).join('');

    const posterModel = buildWinnerPosterModel(this.activity, this.latestQueryResult);
    this.latestPosterDataUrl = createWinnerPosterDataUrl(posterModel);
    document.getElementById('poster-preview-image').src = this.latestPosterDataUrl;
    posterCard.style.display = 'block';
  }

  buildPosterFilename() {
    const winnerName = this.latestQueryResult?.participant?.name || 'winner';
    return `${winnerName}_中奖海报.png`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new QueryApp();
});
