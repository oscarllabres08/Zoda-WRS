import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image, Platform } from 'react-native';

const MAX_EDGE = 1024;
const MIN_EDGE = 640;
const JPEG_QUALITY_START = 0.8;
const JPEG_QUALITY_MIN = 0.5;
const TARGET_MAX_BYTES = 450_000;

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

async function fileSizeBytes(uri: string): Promise<number> {
  if (Platform.OS === 'web') {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      return blob.size;
    } catch {
      return 0;
    }
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return 0;
  return typeof info.size === 'number' ? info.size : 0;
}

/**
 * Resize (max edge) + JPEG compress before uploading to Supabase Storage.
 * Retries with lower quality / smaller size until under TARGET_MAX_BYTES.
 */
export async function prepareImageForUpload(localUri: string): Promise<PreparedImage> {
  if (Platform.OS === 'web') {
    const bytes = await fileSizeBytes(localUri);
    if (bytes <= TARGET_MAX_BYTES || bytes === 0) {
      return { uri: localUri, contentType: 'image/jpeg' };
    }
    try {
      const result = await ImageManipulator.manipulateAsync(localUri, [{ resize: { width: MAX_EDGE } }], {
        compress: JPEG_QUALITY_START,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      return { uri: result.uri, contentType: 'image/jpeg' };
    } catch {
      return { uri: localUri, contentType: 'image/jpeg' };
    }
  }

  let edge = MAX_EDGE;
  let quality = JPEG_QUALITY_START;
  let sourceUri = localUri;
  let lastUri = localUri;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    let resizeAction: ImageManipulator.Action;
    try {
      const { width, height } = await getImageSize(sourceUri);
      const landscape = width >= height;
      resizeAction = landscape ? { resize: { width: edge } } : { resize: { height: edge } };
    } catch {
      resizeAction = { resize: { width: edge } };
    }

    const result = await ImageManipulator.manipulateAsync(sourceUri, [resizeAction], {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    lastUri = result.uri;
    const bytes = await fileSizeBytes(result.uri);
    if (bytes <= TARGET_MAX_BYTES || bytes === 0) {
      return { uri: result.uri, contentType: 'image/jpeg' };
    }

    if (quality > JPEG_QUALITY_MIN) {
      quality = Math.max(JPEG_QUALITY_MIN, quality - 0.1);
      sourceUri = result.uri;
      continue;
    }
    if (edge > MIN_EDGE) {
      edge = Math.max(MIN_EDGE, Math.round(edge * 0.85));
      quality = JPEG_QUALITY_START;
      sourceUri = result.uri;
      continue;
    }
    break;
  }

  return { uri: lastUri, contentType: 'image/jpeg' };
}
