/** Long edge cap (px) — keeps uploads small for Supabase Storage. */
const MAX_EDGE = 1024;
const MIN_EDGE = 640;
const JPEG_QUALITY_START = 0.82;
const JPEG_QUALITY_MIN = 0.5;
const TARGET_MAX_BYTES = 450_000;
const SKIP_IF_JPEG_UNDER_BYTES = 180_000;

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name);
}

export async function compressImageForUpload(file: File): Promise<File> {
  if (!isImageFile(file)) {
    throw new Error('Please choose an image file.');
  }
  if (file.type === 'image/gif') {
    if (file.size > TARGET_MAX_BYTES) {
      throw new Error('GIF is too large. Save as JPG or PNG first.');
    }
    return file;
  }
  if (file.type === 'image/jpeg' && file.size <= SKIP_IF_JPEG_UNDER_BYTES) {
    return file;
  }

  let edge = MAX_EDGE;
  let quality = JPEG_QUALITY_START;
  let lastBlob: Blob | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const blob = await imageFileToJpegBlob(file, edge, quality);
    lastBlob = blob;
    if (blob.size <= TARGET_MAX_BYTES) break;
    if (quality > JPEG_QUALITY_MIN) {
      quality = Math.max(JPEG_QUALITY_MIN, quality - 0.1);
      continue;
    }
    if (edge > MIN_EDGE) {
      edge = Math.max(MIN_EDGE, Math.round(edge * 0.85));
      quality = JPEG_QUALITY_START;
      continue;
    }
    break;
  }

  if (!lastBlob) {
    throw new Error('Could not compress image.');
  }
  if (lastBlob.size > TARGET_MAX_BYTES * 2 && file.size > TARGET_MAX_BYTES) {
    throw new Error('Image is still too large after compression. Try a smaller photo.');
  }

  const base = file.name.replace(/\.[^.]+$/i, '').trim() || 'image';
  return new File([lastBlob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

async function imageFileToJpegBlob(file: File, maxEdge: number, quality: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(url);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not compress image');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Compression failed'))),
        'image/jpeg',
        quality
      );
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image. Use JPG or PNG.'));
    img.src = src;
  });
}
