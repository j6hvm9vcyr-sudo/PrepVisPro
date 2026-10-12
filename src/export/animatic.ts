/**
 * Animatique (0.22) : une image 1920×1080 par plan (son image au format du film, sinon un carton avec
 * son numéro et son action), puis la timeline (.otio ou .fcpxml) dans un dossier neuf.
 */
import type { ProjectDoc } from '../model/types';
import { imageStore } from '../platform/images';
import { getBackend } from '../platform/backend';
import { animaticEvents, FRAME, frameFileName, parseAspect, pictureRect, toFcpxml, toOtio, type AnimaticEvent, type AnimaticRate } from '../model/animatic';
import sansRegular from '../assets/fonts/IBMPlexSans-Regular.woff';
import sansSemiBold from '../assets/fonts/IBMPlexSans-SemiBold.woff';
import monoSemiBold from '../assets/fonts/IBMPlexMono-SemiBold.woff';

export type AnimaticTarget = 'otio' | 'fcpxml';

export interface AnimaticOptions {
  rate: AnimaticRate;
  target: AnimaticTarget;
  /** Durée provisoire des plans sans durée ; null : ils sont laissés de côté. */
  provisionalS: number | null;
}

export interface AnimaticResult {
  folder: string;
  timeline: string;
  plans: number;
  /** Images de plan illisibles (remplacées par un carton). */
  failedImages: string[];
}

let fontsReady: Promise<void> | null = null;
function loadFonts(): Promise<void> {
  if (!fontsReady)
    fontsReady = (async () => {
      if (typeof FontFace === 'undefined') return;
      for (const [weight, url, family] of [
        [400, sansRegular, 'Topshot Sans'],
        [600, sansSemiBold, 'Topshot Sans'],
        [600, monoSemiBold, 'Topshot Mono'],
      ] as const) {
        const f = new FontFace(family, `url(${url})`, { weight: String(weight) });
        document.fonts.add(await f.load());
      }
    })().catch(() => {});
  return fontsReady;
}

async function decode(bytes: Uint8Array): Promise<ImageBitmap | HTMLImageElement> {
  const blob = new Blob([bytes as BlobPart]);
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* repli sur un élément image */
    }
  }
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

/** Lignes d'un texte coupé à la largeur donnée (au plus `max` lignes, la dernière finit par « … »). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= width || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    let last = kept[max - 1]!;
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    kept[max - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: 'left' | 'right', bg: string, fg: string, font: string) {
  ctx.font = font;
  const w = ctx.measureText(text).width + 36;
  const h = 64;
  const left = align === 'left' ? x : x - w;
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(left, y, w, h, 12);
  else ctx.rect(left, y, w, h);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, left + 18, y + h / 2 + 2);
}

/** Image d'un plan : son image au format du film, sinon un carton ; numéro incrusté. */
async function renderFrame(ev: AnimaticEvent, aspect: number | null, img: ImageBitmap | HTMLImageElement | null): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME.width;
  canvas.height = FRAME.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, FRAME.width, FRAME.height);
  const r = pictureRect(aspect);
  // Cadre où sont posés les repères : l'image dessinée, sinon la zone du film.
  let box = r;
  if (img) {
    const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
    const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
    const s = Math.min(r.w / iw, r.h / ih);
    box = { w: Math.round(iw * s), h: Math.round(ih * s), x: 0, y: 0 };
    box.x = Math.round(r.x + (r.w - box.w) / 2);
    box.y = Math.round(r.y + (r.h - box.h) / 2);
    ctx.drawImage(img, box.x, box.y, box.w, box.h);
    tag(ctx, ev.code, box.x + 32, box.y + 32, 'left', 'rgba(0,0,0,0.62)', '#FFFFFF', '600 40px "Topshot Mono", "SF Mono", monospace');
  } else {
    ctx.fillStyle = '#1E232B';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 150px "Topshot Mono", "SF Mono", monospace';
    const cy = r.y + r.h / 2;
    ctx.fillText(ev.code, FRAME.width / 2, cy - 40);
    ctx.fillStyle = '#C9D1DB';
    ctx.font = '400 50px "Topshot Sans", "SF Pro Text", sans-serif';
    wrap(ctx, ev.action, Math.min(r.w - 240, 1400), 3).forEach((line, i) => ctx.fillText(line, FRAME.width / 2, cy + 60 + i * 66));
  }
  if (ev.provisional) tag(ctx, 'durée à fixer', box.x + box.w - 32, box.y + 32, 'right', '#E8A13A', '#1A1203', '600 36px "Topshot Sans", "SF Pro Text", sans-serif');
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Image impossible à créer'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Nom de base des fichiers : le titre du film, sans caractère interdit. */
export function animaticName(doc: ProjectDoc): string {
  return `${(doc.meta.title.trim() || 'Sans titre').replace(/[\\/:*?"<>|]+/g, '-')} — animatique`;
}

/**
 * Écrit l'animatique dans un dossier neuf, créé dans `parent` : les images dans « images », la
 * timeline à côté. Rien d'existant n'est remplacé.
 */
export async function writeAnimatic(doc: ProjectDoc, parent: string, o: AnimaticOptions, onProgress?: (done: number, total: number) => void): Promise<AnimaticResult> {
  const backend = await getBackend();
  const { events } = animaticEvents(doc, o.provisionalS);
  if (!events.length) throw new Error('Aucun plan minuté');
  await loadFonts();
  const name = animaticName(doc);
  const folder = await backend.animaticDir(parent, name);
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  const imagePath = (i: number, ev: AnimaticEvent) => `${folder}${sep}images${sep}${frameFileName(i, ev.code)}`;
  const aspect = parseAspect(doc.meta.aspectRatio);
  const failedImages: string[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    let img: ImageBitmap | HTMLImageElement | null = null;
    if (ev.imageFile) {
      try {
        img = await decode(await imageStore.readBytes(ev.imageFile));
      } catch {
        failedImages.push(ev.code);
      }
    }
    try {
      await backend.writeExport(imagePath(i, ev), await renderFrame(ev, aspect, img));
    } finally {
      if (img && 'close' in img) img.close();
      else if (img) URL.revokeObjectURL(img.src);
    }
    onProgress?.(i + 1, events.length);
  }
  const timeline = `${folder}${sep}${name}.${o.target}`;
  const text = o.target === 'otio' ? toOtio(events, { name, rate: o.rate, imagePath }) : toFcpxml(events, { name, rate: o.rate, imagePath });
  await backend.writeExport(timeline, new TextEncoder().encode(text));
  return { folder, timeline, plans: events.length, failedImages };
}
