import { supabase } from './supabase';

/** Public URL for paths in `wrs-assets` (or already-absolute URLs). */
export function publicWrsAssetUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  const { data } = supabase.storage.from('wrs-assets').getPublicUrl(pathOrUrl);
  return data.publicUrl;
}
