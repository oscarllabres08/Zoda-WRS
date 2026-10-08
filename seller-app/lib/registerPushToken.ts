import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** Saves FCM device token for background push when app is closed. */
export async function registerSellerPushToken(userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!Device.isDevice || Platform.OS === 'web') {
    return { ok: false, reason: 'not_a_device' };
  }

  try {
    const perm = await Notifications.getPermissionsAsync();
    const status = perm.status === 'granted' ? perm.status : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }

    const token = await Notifications.getDevicePushTokenAsync();
    const deviceToken = token?.data ? String(token.data) : '';
    if (!deviceToken) {
      return { ok: false, reason: 'no_token' };
    }

    // One phone = one seller token globally (prevents 3× push from stale multi-account rows).
    await supabase.from('push_tokens').delete().eq('token', deviceToken);
    await supabase.from('push_tokens').delete().eq('user_id', userId).eq('app', 'seller');

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        app: 'seller',
        platform: Platform.OS,
        token: deviceToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,app,platform' }
    );
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
