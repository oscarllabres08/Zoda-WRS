import { compressImageForUpload } from './compressImageForUpload';
import { BUCKET } from './format';
import { supabase } from './supabase';

export async function uploadProductImage(businessId: string, file: File): Promise<string> {
  const prepared = await compressImageForUpload(file);
  const isGif = prepared.type === 'image/gif';
  const ext = isGif ? 'gif' : 'jpg';
  const path = `${businessId}/product/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared, {
    upsert: true,
    contentType: isGif ? 'image/gif' : 'image/jpeg',
  });
  if (error) throw error;
  return path;
}
