#!/usr/bin/env node
/**
 * Trim repo-root notification.wav to a max duration (default 2s).
 * Android notification raw sounds should stay short.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const wavPath = path.join(root, 'notification.wav');
const maxSec = Number(process.argv[2] ?? '2');

const b = fs.readFileSync(wavPath);
if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
  console.error('Not a RIFF WAVE file:', wavPath);
  process.exit(1);
}

const sr = b.readUInt32LE(24);
const ch = b.readUInt16LE(22);
const ba = b.readUInt16LE(34) / 8;
const bytesPerSec = sr * ch * ba;
const maxData = Math.floor(bytesPerSec * maxSec);

let i = 12;
let fmtEnd = 12;
let dataStart = -1;
let dataSize = 0;
while (i + 8 <= b.length) {
  const id = b.toString('ascii', i, i + 4);
  const sz = b.readUInt32LE(i + 4);
  if (id === 'fmt ') fmtEnd = i + 8 + sz;
  if (id === 'data') {
    dataStart = i + 8;
    dataSize = sz;
    break;
  }
  i += 8 + sz + (sz % 2);
}

if (dataStart < 0) {
  console.error('No data chunk');
  process.exit(1);
}

const newDataSize = Math.min(dataSize, maxData);
const beforeSec = (dataSize / bytesPerSec).toFixed(2);
const afterSec = (newDataSize / bytesPerSec).toFixed(2);

if (newDataSize >= dataSize) {
  console.log(`OK: already ${beforeSec}s (max ${maxSec}s), no change.`);
  process.exit(0);
}

const head = b.subarray(0, dataStart);
const body = b.subarray(dataStart, dataStart + newDataSize);
const out = Buffer.alloc(head.length + body.length);
head.copy(out, 0);
body.copy(out, head.length);
out.writeUInt32LE(36 + newDataSize, 4);
out.writeUInt32LE(newDataSize, dataStart - 4);

fs.writeFileSync(wavPath, out);
console.log(`Trimmed notification.wav: ${beforeSec}s → ${afterSec}s (${out.length} bytes)`);
