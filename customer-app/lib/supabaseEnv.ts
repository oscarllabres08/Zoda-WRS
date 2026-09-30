import Constants from 'expo-constants';

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export function getSupabaseUrlAndKey(): { url: string; anonKey: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey;

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase config. Copy customer-app/.env.example to customer-app/.env, then restart: npx expo start -c'
    );
  }

  return { url, anonKey };
}
