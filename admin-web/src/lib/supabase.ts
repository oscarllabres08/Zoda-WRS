import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in admin-web/.env.local');
}

/** Drop sessions saved before we switched to sessionStorage (survived browser restarts). */
function clearLegacySupabaseAuthLocalStorage() {
  if (typeof window === 'undefined') return;
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    const prefix = `sb-${ref}-`;
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix) && key.includes('auth')) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

clearLegacySupabaseAuthLocalStorage();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
  },
});
