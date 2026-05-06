import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import type { PreparedImage } from './prepareImageForUpload';

function base64ToBytes(base64: string): Uint8Array {
  const bin = globalThis.atob ? globalThis.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Some Android paths are absolute without `file://`; expo-file-system expects a readable URI. */
function uriForFileRead(uri: string): string {
  if (
    uri.startsWith('file:') ||
    uri.startsWith('content:') ||
    uri.startsWith('ph:') ||
    uri.startsWith('assets-library:') ||
    uri.startsWith('asset:')
  ) {
    return uri;
  }
  if (uri.startsWith('/')) return `file://${uri}`;
  return uri;
}

/** Reads bytes from a prepared local image. On native, avoids `fetch(file://)` which often fails with "Network request failed". */
export async function readPreparedImageBytes(prepared: PreparedImage): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const buf = await (await fetch(prepared.uri)).arrayBuffer();
    return new Uint8Array(buf);
  }
  const readUri = uriForFileRead(prepared.uri);
  const b64 = await FileSystem.readAsStringAsync(readUri, { encoding: 'base64' });
  return base64ToBytes(b64);
}
