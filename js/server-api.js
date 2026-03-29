function buildApiUrl(pathname) {
  return new URL(`/api${pathname}`, window.location.origin).toString();
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(buildApiUrl(pathname), {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.message || `请求失败: ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function getActivityIdFromUrl(fallbackId = '') {
  return new URLSearchParams(window.location.search).get('activityId') || fallbackId;
}

export async function fetchActivityFromServer(activityId) {
  const data = await requestJson(`/activities/${encodeURIComponent(activityId)}`);
  return data.activity;
}

export async function pushActivityToServer(activity) {
  const data = await requestJson(`/activities/${encodeURIComponent(activity.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ activity }),
  });

  return data.activity;
}

export async function signParticipantToServer(activityId, participant) {
  return requestJson(`/activities/${encodeURIComponent(activityId)}/participants`, {
    method: 'POST',
    body: JSON.stringify({ participant }),
  });
}

export async function queryWinnerFromServer(activityId, filters) {
  const params = new URLSearchParams();

  if (filters.id) {
    params.set('employeeId', filters.id);
  }

  if (filters.name) {
    params.set('name', filters.name);
  }

  return requestJson(`/activities/${encodeURIComponent(activityId)}/query?${params.toString()}`);
}

export async function fetchPresenceFromServer(activityId) {
  const data = await requestJson(`/activities/${encodeURIComponent(activityId)}/presence`);
  return data.presence;
}
