import Constants from 'expo-constants';

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export function getSupabaseUrlAndKey(): { url: string; anonKey: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

  // In release APK, `extra` from app.config.js (EAS env) is the reliable source.
  const url = (extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL)?.trim();
  const anonKey = (extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)?.trim();

  if (!url || !anonKey) {
    const msg =
      'Missing Supabase config. Use EAS profile preview/production (customer-app/eas.json) or customer-app/.env locally.';
    if (__DEV__) throw new Error(msg);
    console.error(msg);
    return { url: url || 'https://invalid.local', anonKey: anonKey || 'missing-anon-key' };
  }

  return { url, anonKey };
}
