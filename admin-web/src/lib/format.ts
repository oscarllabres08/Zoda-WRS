const BUCKET = 'wrs-assets';

export function money(n: number) {
  return `₱${n.toFixed(2)}`;
}

export function publicWrsAssetUrl(supabase: { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }, pathOrUrl?: string | null) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(pathOrUrl);
  return data.publicUrl;
}

export { BUCKET };
