import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

/** Long edge cap (px); JPEG keeps avatars/products readable while saving storage. */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.8;

export type PreparedImage = {
  uri: string;
  contentType: 'image/jpeg';
};

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err)
    );
  });
}

/**
 * Resize (max edge) + JPEG compress before uploading to Supabase Storage.
 */
export async function prepareImageForUpload(localUri: string): Promise<PreparedImage> {
  let resizeAction: ImageManipulator.Action;
  try {
    const { width, height } = await getImageSize(localUri);
    const landscape = width >= height;
    resizeAction = landscape ? { resize: { width: MAX_EDGE } } : { resize: { height: MAX_EDGE } };
  } catch {
    resizeAction = { resize: { width: MAX_EDGE } };
  }

  const result = await ImageManipulator.manipulateAsync(localUri, [resizeAction], {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return { uri: result.uri, contentType: 'image/jpeg' };
}
