import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export async function downloadRemoteImage(
  url: string,
  filename = 'gcash-qr.jpg'
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  if (Platform.OS === 'web') {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Could not download image.');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      return { ok: true, message: 'QR code downloaded.' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Download failed.' };
    }
  }

  try {
    const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!cacheDir) throw new Error('Storage unavailable.');
    const localPath = `${cacheDir}${filename}`;
    const { uri } = await FileSystem.downloadAsync(url, localPath);

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await Share.share({
        url: uri,
        title: 'GCash QR code',
        message: Platform.OS === 'android' ? 'Save this GCash QR code' : undefined,
      });
      return { ok: true, message: 'Choose Save image or Photos to keep the QR code.' };
    }

    return { ok: true, message: 'QR code saved.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Download failed.' };
  }
}
