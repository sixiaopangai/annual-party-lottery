function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function normalizeActivity(activity) {
  return {
    id: activity.id,
    name: activity.name || activity.settings?.title || '未命名活动',
    createdAt: activity.createdAt || Date.now(),
    archived: Boolean(activity.archived),
    participants: Array.isArray(activity.participants)
      ? activity.participants.map(participant => normalizeParticipant(participant))
      : [],
    prizes: Array.isArray(activity.prizes) ? clone(activity.prizes) : [],
    winners: Array.isArray(activity.winners) ? clone(activity.winners) : [],
    settings: activity.settings ? clone(activity.settings) : {},
  };
}

function normalizeParticipant(participant = {}) {
  const authId = String(participant.authId || '').trim();
  const id = String(participant.id || '').trim() || authId || generateId();

  return {
    id,
    authId,
    name: String(participant.name || participant.nickname || '').trim(),
    avatar: participant.avatar || '',
    signedAt: participant.signedAt || Date.now(),
    source: participant.source || (authId ? 'h5_sign' : 'manual'),
  };
}

function matchesPerson(candidate, filters) {
  const candidateId = String(candidate?.id || '').trim();
  const candidateName = String(candidate?.name || '').trim();
  const filterId = String(filters?.id || '').trim();
  const filterName = String(filters?.name || '').trim();

  if (filterId) {
    return candidateId === filterId;
  }

  if (filterName) {
    return candidateName === filterName;
  }

  return false;
}

export function createStateStore(initialState = {}) {
  const activities = new Map();
  const clients = new Map();

  const initialActivities = Array.isArray(initialState.activities)
    ? initialState.activities
    : Object.values(initialState.activities || {});

  initialActivities.forEach(activity => {
    if (activity?.id) {
      activities.set(activity.id, normalizeActivity(activity));
    }
  });

  function upsertActivity(activity) {
    const normalized = normalizeActivity(activity);
    activities.set(normalized.id, normalized);
    return clone(normalized);
  }

  function getActivity(activityId) {
    const activity = activities.get(activityId);
    return activity ? clone(activity) : null;
  }

  function addParticipant(activityId, participant) {
    const activity = activities.get(activityId);
    if (!activity) {
      return { ok: false, reason: 'activity_not_found' };
    }

    const savedParticipant = normalizeParticipant(participant);
    if (!savedParticipant.name) {
      return { ok: false, reason: 'missing_name' };
    }

    if (activity.participants.some(item =>
      (savedParticipant.authId && item.authId && item.authId === savedParticipant.authId) ||
      item.id === savedParticipant.id
    )) {
      return { ok: false, reason: 'duplicate' };
    }

    activity.participants.push(savedParticipant);
    return {
      ok: true,
      participant: clone(savedParticipant),
      activity: clone(activity),
    };
  }

  function queryWinner(activityId, filters = {}) {
    const activity = activities.get(activityId);
    if (!activity) {
      return {
        ok: false,
        foundActivity: false,
        won: false,
        records: [],
        participant: null,
      };
    }

    const participant = activity.participants.find(item => matchesPerson(item, filters)) || null;
    const records = activity.winners.flatMap(record =>
      record.winners
        .filter(winner => matchesPerson(winner, filters))
        .map(winner => ({
          participant: clone(winner),
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
      participant: participant ? clone(participant) : null,
      records,
    };
  }

  function connectClient(clientId, activityId, role = 'viewer') {
    clients.set(clientId, { activityId, role });
    return getPresence(activityId);
  }

  function disconnectClient(clientId) {
    const client = clients.get(clientId) || null;
    clients.delete(clientId);
    return client?.activityId || null;
  }

  function getPresence(activityId) {
    const presence = {
      total: 0,
      viewers: 0,
      hosts: 0,
      admins: 0,
      signs: 0,
      others: 0,
    };

    clients.forEach(client => {
      if (client.activityId !== activityId) {
        return;
      }

      presence.total += 1;

      switch (client.role) {
        case 'viewer':
          presence.viewers += 1;
          break;
        case 'host':
          presence.hosts += 1;
          break;
        case 'admin':
          presence.admins += 1;
          break;
        case 'sign':
          presence.signs += 1;
          break;
        default:
          presence.others += 1;
          break;
      }
    });

    return presence;
  }

  function exportState() {
    return {
      activities: Array.from(activities.values()).map(activity => clone(activity)),
    };
  }

  return {
    upsertActivity,
    getActivity,
    addParticipant,
    queryWinner,
    connectClient,
    disconnectClient,
    getPresence,
    exportState,
  };
}
