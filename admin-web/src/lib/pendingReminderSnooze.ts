import { PENDING_REMINDER_MS } from './pendingOrderReminder';

const snoozeKey = (scopeId: string) => `admin_pending_reminder_snooze_${scopeId}`;

export function getBannerSnoozeUntil(scopeId: string): number {
  try {
    const raw = localStorage.getItem(snoozeKey(scopeId));
    if (!raw) return 0;
    const until = Number(raw);
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}

export function isBannerSnoozed(scopeId: string): boolean {
  return getBannerSnoozeUntil(scopeId) > Date.now();
}

export function snoozeBanner(scopeId: string, ms: number = PENDING_REMINDER_MS): number {
  const until = Date.now() + ms;
  localStorage.setItem(snoozeKey(scopeId), String(until));
  return until;
}

export function clearBannerSnooze(scopeId: string): void {
  localStorage.removeItem(snoozeKey(scopeId));
}
