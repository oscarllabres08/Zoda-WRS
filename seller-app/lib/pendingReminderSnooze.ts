import AsyncStorage from '@react-native-async-storage/async-storage';

import { PENDING_REMINDER_MS } from './pendingOrderReminder';

const snoozeKey = (scopeId: string) => `seller_pending_reminder_snooze_${scopeId}`;

export async function getBannerSnoozeUntil(scopeId: string): Promise<number> {
  const raw = await AsyncStorage.getItem(snoozeKey(scopeId));
  if (!raw) return 0;
  const until = Number(raw);
  return Number.isFinite(until) ? until : 0;
}

export async function isBannerSnoozed(scopeId: string): Promise<boolean> {
  return (await getBannerSnoozeUntil(scopeId)) > Date.now();
}

export async function snoozeBanner(scopeId: string, ms: number = PENDING_REMINDER_MS): Promise<number> {
  const until = Date.now() + ms;
  await AsyncStorage.setItem(snoozeKey(scopeId), String(until));
  return until;
}

export async function clearBannerSnooze(scopeId: string): Promise<void> {
  await AsyncStorage.removeItem(snoozeKey(scopeId));
}
