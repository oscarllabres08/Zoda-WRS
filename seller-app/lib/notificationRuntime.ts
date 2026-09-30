/** In-memory prefs for foreground push / handler (updated by NotificationsProvider). */
export type NotificationRuntimePrefs = {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
};

let runtimePrefs: NotificationRuntimePrefs = {
  notificationsEnabled: true,
  soundEnabled: true,
};

export function setNotificationRuntimePrefs(next: NotificationRuntimePrefs) {
  runtimePrefs = next;
}

export function getNotificationRuntimePrefs(): NotificationRuntimePrefs {
  return runtimePrefs;
}
