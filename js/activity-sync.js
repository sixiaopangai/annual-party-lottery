import { StorageManager } from './storage.js';
import { fetchActivityFromServer, pushActivityToServer } from './server-api.js';

export async function pushCurrentActivityToServer() {
  const activity = StorageManager.getCurrentActivity();
  if (!activity?.id) {
    return null;
  }

  return pushActivityToServer(activity);
}

export async function pullActivityFromServer(activityId) {
  if (!activityId) {
    return null;
  }

  const activity = await fetchActivityFromServer(activityId);
  StorageManager.upsertActivity(activity);
  StorageManager.switchActivity(activity.id);
  return activity;
}
