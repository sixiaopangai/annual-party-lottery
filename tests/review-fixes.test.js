import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { AuditLogger } from '../js/audit.js';
import { createQrSvgDataUrl, buildSignUrl } from '../js/qrcode.js';
import { StorageManager } from '../js/storage.js';

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await runTest('vite build config includes sign and viewer html entries', async () => {
  const configText = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

  assert.match(configText, /sign:\s*resolve\(__dirname,\s*'sign\.html'\)/);
  assert.match(configText, /viewer:\s*resolve\(__dirname,\s*'viewer\.html'\)/);
});

await runTest('vite build config includes gate html entry and does not include query html entry', async () => {
  const configText = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

  assert.match(configText, /gate:\s*resolve\(__dirname,\s*'gate\.html'\)/);
  assert.doesNotMatch(configText, /query:\s*resolve\(__dirname,\s*'query\.html'\)/);
});

await runTest('qr code generation creates an offline svg data url', async () => {
  const signUrl = buildSignUrl('https://lottery.example.com', 'activity-001');
  const qrDataUrl = await createQrSvgDataUrl(signUrl);

  assert.equal(signUrl, 'https://lottery.example.com/sign.html?activityId=activity-001');
  assert.match(qrDataUrl, /^data:image\/svg\+xml/);
  assert.doesNotMatch(qrDataUrl, /qrserver\.com/);
});

await runTest('detectAnomaliesFromLogs flags frequent draws', () => {
  const baseTime = Date.parse('2026-03-24T12:00:00Z');
  const logs = Array.from({ length: 11 }, (_, index) => ({
    action: 'DRAW',
    timestamp: baseTime + index * 5000,
  }));

  const anomalies = AuditLogger.detectAnomaliesFromLogs(logs);

  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].type, 'FREQUENT_DRAW');
});

await runTest('storage manager returns a user-visible error when saving fails', () => {
  const originalLocalStorage = globalThis.localStorage;

  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
  };

  const ok = StorageManager.set('lottery_test_key', { a: 1 });
  const error = StorageManager.consumeLastError();

  if (originalLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = originalLocalStorage;
  }

  assert.equal(ok, false);
  assert.match(error?.message || '', /保存失败|存储空间不足/);
});

await runTest('storage manager accepts name-only participant and fills defaults', () => {
  const originalLocalStorage = globalThis.localStorage;
  const memory = new Map();

  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
    },
    removeItem: (key) => {
      memory.delete(key);
    },
  };

  StorageManager.clearAll();
  const activity = StorageManager.createActivity('扫码签到活动');
  const ok = StorageManager.addParticipant({ name: '小王', avatar: '' });
  const saved = StorageManager.getParticipants()[0];

  if (originalLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = originalLocalStorage;
  }

  assert.equal(Boolean(activity), true);
  assert.equal(ok, true);
  assert.equal(saved.name, '小王');
  assert.equal(typeof saved.id, 'string');
  assert.equal(saved.id.length > 0, true);
  assert.equal(typeof saved.signedAt, 'number');
});

await runTest('server state store dedupes sign-in by authId and keeps signedAt', async () => {
  let stateStoreModule;
  try {
    stateStoreModule = await import('../server/state-store.js');
  } catch {
    assert.fail('server/state-store.js not implemented');
  }

  const { createStateStore } = stateStoreModule;
  const store = createStateStore();

  store.upsertActivity({
    id: 'act-001',
    name: '2026 年会盛典',
    participants: [{ id: 'A001', authId: 'wx-user-001', name: '张三', avatar: '', signedAt: 1 }],
    prizes: [{ id: 'p1', level: '一等奖', name: 'MacBook Pro', count: 1 }],
    winners: [{
      prizeId: 'p1',
      prizeLevel: '一等奖',
      prizeName: 'MacBook Pro',
      timestamp: Date.parse('2026-03-24T20:00:00Z'),
      winners: [{ id: 'A001', authId: 'wx-user-001', name: '张三', avatar: '', signedAt: 1 }],
    }],
    settings: { title: '2026 年会盛典' },
  });

  const duplicate = store.addParticipant('act-001', {
    authId: 'wx-user-001',
    name: '张三',
    avatar: '',
  });
  const added = store.addParticipant('act-001', {
    authId: 'wx-user-002',
    name: '李四',
    avatar: '',
  });

  assert.equal(duplicate.ok, false);
  assert.equal(added.ok, true);
  assert.equal(store.getActivity('act-001').participants.length, 2);
  assert.equal(typeof added.participant.signedAt, 'number');
  assert.equal(typeof added.participant.id, 'string');
});

await runTest('server state store tracks viewer presence per activity', async () => {
  let stateStoreModule;
  try {
    stateStoreModule = await import('../server/state-store.js');
  } catch {
    assert.fail('server/state-store.js not implemented');
  }

  const { createStateStore } = stateStoreModule;
  const store = createStateStore();

  store.connectClient('c1', 'act-001', 'viewer');
  store.connectClient('c2', 'act-001', 'viewer');
  store.connectClient('c3', 'act-001', 'host');
  store.disconnectClient('c2');

  const presence = store.getPresence('act-001');

  assert.equal(presence.total, 2);
  assert.equal(presence.viewers, 1);
  assert.equal(presence.hosts, 1);
});

await runTest('admin html removes import/query actions and simplifies manual add fields', async () => {
  const html = await readFile(new URL('../admin.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /id="btn-import-json"/);
  assert.doesNotMatch(html, /id="btn-import-csv"/);
  assert.doesNotMatch(html, /id="btn-load-sample"/);
  assert.doesNotMatch(html, /id="btn-open-query"/);
  assert.doesNotMatch(html, /id="input-person-id"/);
  assert.doesNotMatch(html, /id="input-person-dept"/);
  assert.match(html, /id="input-person-name"/);
  assert.match(html, /id="input-person-avatar"/);
});

await runTest('sign html focuses on nickname and avatar without query link', async () => {
  const html = await readFile(new URL('../sign.html', import.meta.url), 'utf8');

  assert.match(html, /input-name/);
  assert.match(html, /input-avatar/);
  assert.doesNotMatch(html, /input-id/);
  assert.doesNotMatch(html, /btn-open-query/);
});

await runTest('index html contains sign wall section', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /checkin-wall/);
  assert.match(html, /checkin-list/);
});
