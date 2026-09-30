type Html2CanvasFn = (
  element: HTMLElement,
  options?: { scale?: number; backgroundColor?: string; useCORS?: boolean }
) => Promise<HTMLCanvasElement>;

const HTML2CANVAS_CDN = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';

let loadPromise: Promise<Html2CanvasFn> | null = null;

function loadHtml2Canvas(): Promise<Html2CanvasFn> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const w = window as Window & { html2canvas?: Html2CanvasFn };
    if (w.html2canvas) {
      resolve(w.html2canvas);
      return;
    }
    const script = document.createElement('script');
    script.src = HTML2CANVAS_CDN;
    script.async = true;
    script.onload = () => (w.html2canvas ? resolve(w.html2canvas) : reject(new Error('html2canvas failed to load')));
    script.onerror = () => reject(new Error('html2canvas failed to load'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export async function saveElementAsPng(elementId: string, filename: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('Receipt not found');
  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  });
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  const safeName = filename.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
  link.download = safeName.endsWith('.png') ? safeName : `${safeName}.png`;
  link.href = dataUrl;
  link.click();
}
