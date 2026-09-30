/** Long edge cap (px) — matches mobile apps to save Supabase Storage. */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;
const SKIP_IF_JPEG_UNDER_BYTES = 180_000;

export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  if (file.type === 'image/gif') {
    return file;
  }
  if (file.type === 'image/jpeg' && file.size <= SKIP_IF_JPEG_UNDER_BYTES) {
    return file;
  }

  try {
    const blob = await imageFileToJpegBlob(file);
    const base = file.name.replace(/\.[^.]+$/i, '').trim() || 'image';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function imageFileToJpegBlob(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(url);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight, 1));
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
        JPEG_QUALITY
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
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}
