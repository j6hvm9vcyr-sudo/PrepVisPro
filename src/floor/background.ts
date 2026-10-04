/**
 * Fond de plan : image (vue satellite, photo) ou PDF (plan d'architecte, converti en image
 * haute définition à l'import pour un affichage fluide et un export fiable).
 */
import { imageStore, type StoredImage } from '../platform/images';
import type { FloorBackground } from '../model/floor';

/** Largeur maximale de l'image produite à partir d'un PDF. */
const PDF_MAX_PX = 4200;

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(blob);
      const s = { width: b.width, height: b.height };
      b.close();
      return s;
    } catch {
      /* repli */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pdfToPng(file: File): Promise<File> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(PDF_MAX_PX / base.width, PDF_MAX_PX / base.height, 6);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Conversion du PDF impossible'))), 'image/png'));
    return new File([blob], file.name.replace(/\.pdf$/i, '') + '.png', { type: 'image/png' });
  } finally {
    void doc.destroy();
  }
}

function isPdf(f: File): boolean {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
}

/**
 * Importe un fond de plan dans le projet (et sa bibliothèque d'images). Lève une erreur lisible
 * en cas d'échec.
 */
export async function importBackground(file: File, known?: Map<string, { file: string; originalName: string }>): Promise<{ bg: FloorBackground; stored: StoredImage }> {
  const img = isPdf(file) ? await pdfToPng(file) : file;
  const [stored] = await imageStore.importFiles([img], known);
  if (!stored) throw new Error('Format non reconnu (images JPEG, PNG, HEIC, TIFF ou PDF).');
  const { width, height } = await imageSize(img);
  return { bg: { file: stored.file, width, height, opacity: 0.85, originalName: file.name }, stored: { ...stored, originalName: file.name } };
}

/** Fond de plan à partir d'une image déjà dans la bibliothèque du projet. */
export async function backgroundFromLibrary(file: string, originalName: string): Promise<FloorBackground> {
  const bytes = await imageStore.readBytes(file);
  const { width, height } = await imageSize(new Blob([bytes as BlobPart]));
  return { file, width, height, opacity: 0.85, originalName };
}
