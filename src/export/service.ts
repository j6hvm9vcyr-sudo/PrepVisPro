/**
 * Exports depuis l'application : préparation des images, génération, écriture du fichier.
 * Les bibliothèques PDF et Excel sont chargées à la demande (démarrage plus rapide).
 */
import type { ProjectDoc } from '../model/types';
import { imageStore } from '../platform/images';
import { getBackend } from '../platform/backend';
import { buildCsv, buildExportModel, exportFileName, type ExportModel, type ExportOptions } from './model';
import type { PreparedImage } from './excel';
import type { PdfFloorPage, PdfImage } from './pdf';
import type { FloorPlan } from '../model/floor';
import sansRegular from '../assets/fonts/IBMPlexSans-Regular.woff';
import sansSemiBold from '../assets/fonts/IBMPlexSans-SemiBold.woff';
import sansBold from '../assets/fonts/IBMPlexSans-Bold.woff';
import monoRegular from '../assets/fonts/IBMPlexMono-Regular.woff';
import monoSemiBold from '../assets/fonts/IBMPlexMono-SemiBold.woff';

export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

interface Resized {
  bytes: Uint8Array;
  width: number;
  height: number;
}

const MAX_WIDTH = { small: 420, medium: 640, large: 960 } as const;

async function decode(blob: Blob): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      return { draw: (c, w, h) => c.drawImage(bmp, 0, 0, w, h), width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* repli sur un élément image */
    }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { draw: (c, w, h) => c.drawImage(img, 0, 0, w, h), width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

/** Réduit une image (JPEG qualité 0,85) pour des exports légers. */
async function resize(bytes: Uint8Array, maxWidth: number): Promise<Resized> {
  const src = await decode(new Blob([bytes as BlobPart]));
  try {
    const scale = Math.min(1, maxWidth / src.width);
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    src.draw(ctx, w, h);
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Conversion impossible'))), 'image/jpeg', 0.85));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
  } finally {
    src.close();
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

/** Prépare les images principales des plans exportés. Une image illisible est signalée, pas bloquante. */
async function prepareImages(m: ExportModel, maxWidth: number, onProgress?: (done: number, total: number) => void): Promise<{ images: Map<string, Resized>; failed: string[] }> {
  const files = [...new Set(m.sequences.flatMap((s) => s.plans.map((p) => p.imageFile).filter((f): f is string => !!f)))];
  const images = new Map<string, Resized>();
  const failed: string[] = [];
  let done = 0;
  for (const f of files) {
    try {
      images.set(f, await resize(await imageStore.readBytes(f), maxWidth));
    } catch {
      failed.push(f);
    }
    onProgress?.(++done, files.length);
  }
  return { images, failed };
}

export interface BuiltExport {
  bytes: Uint8Array;
  failedImages: number;
  /** Plans au sol qui n'ont pas pu être rendus (nom et raison). */
  failedFloors?: string[];
}

// ------------------------------------------------------------------ plans au sol

const FLOOR_FONTS = [
  { family: 'IBM Plex Sans', weight: 400, url: sansRegular },
  { family: 'IBM Plex Sans', weight: 600, url: sansSemiBold },
  { family: 'IBM Plex Mono', weight: 400, url: monoRegular },
  { family: 'IBM Plex Mono', weight: 600, url: monoSemiBold },
];

/** Grand côté des images de plan dans le PDF (≈ 250 dpi sur une page A4). */
const FLOOR_PDF_PX = 2800;

/** Plans au sol des séquences exportées (tous si toutes les séquences sont exportées). */
export function floorPlansFor(doc: ProjectDoc, sequenceIds: string[]): FloorPlan[] {
  if (!sequenceIds.length) return doc.floorPlans;
  const pick = new Set(sequenceIds);
  return doc.floorPlans.filter((fp) => fp.sequenceIds.some((id) => pick.has(id)));
}

function sequencesLabel(doc: ProjectDoc, fp: FloorPlan): string {
  const nums = doc.sequences.filter((s) => fp.sequenceIds.includes(s.id)).map((s) => s.number || '?');
  return nums.length ? `Séq. ${nums.join(', ')}` : '';
}

/** Image du plan pour un PNG autonome. */
export async function floorPng(doc: ProjectDoc, fp: FloorPlan, maxPx = 4000) {
  const { renderFloorImage } = await import('../floor/render');
  return renderFloorImage(doc, fp, { readBytes: (f) => imageStore.readBytes(f), fonts: FLOOR_FONTS }, maxPx, 'image/png');
}

async function prepareFloorPages(doc: ProjectDoc, plans: FloorPlan[], onProgress?: (done: number, total: number) => void): Promise<PdfFloorPage[]> {
  const { renderFloorImage, cameraLegend, lightLegend, sunLegend } = await import('../floor/render');
  const out: PdfFloorPage[] = [];
  let done = 0;
  for (const fp of plans) {
    let image: PdfImage | null = null;
    let error: string | null = null;
    try {
      const r = await renderFloorImage(doc, fp, { readBytes: (f) => imageStore.readBytes(f), fonts: FLOOR_FONTS }, FLOOR_PDF_PX, 'image/jpeg');
      image = { dataUrl: `data:image/jpeg;base64,${toBase64(r.bytes)}`, width: r.width, height: r.height };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    out.push({ id: fp.id, name: fp.name, sequences: sequencesLabel(doc, fp), image, error, scaled: !!fp.scale, legend: cameraLegend(doc, fp), ...lightLegend(doc, fp), sun: sunLegend(doc, fp) });
    onProgress?.(++done, plans.length);
  }
  return out;
}

async function pdfModule() {
  const mod = await import('./pdf');
  mod.registerPdfFonts({ sansRegular, sansSemiBold, sansBold, monoRegular, monoSemiBold });
  return mod;
}

/** PDF des plans au sol seuls. */
export async function buildFloorPdf(doc: ProjectDoc, plans: FloorPlan[], onProgress?: (done: number, total: number) => void): Promise<BuiltExport> {
  const floors = await prepareFloorPages(doc, plans, onProgress);
  const { renderFloorPdf } = await pdfModule();
  return { bytes: await renderFloorPdf(doc.meta.title, doc.meta.director, floors), failedImages: 0, failedFloors: floors.filter((f) => f.error).map((f) => f.error!) };
}

/** Demande l'emplacement puis écrit un export de plan au sol (PNG ou PDF). */
export async function saveFloorExport(doc: ProjectDoc, ext: 'png' | 'pdf', bytes: Uint8Array, suffix: string): Promise<string | null> {
  const backend = await getBackend();
  const path = await backend.pickExportPath(exportFileName(doc.meta.title, suffix, ext), ext);
  if (!path) return null;
  await backend.writeExport(path, bytes);
  return path;
}

/**
 * Nom de la version exportée : la dernière version enregistrée, signalée « + modifications »
 * si le projet a changé depuis. null s'il n'y a pas de version (ou si elles sont illisibles).
 */
async function exportVersionLabel(doc: ProjectDoc): Promise<string | null> {
  try {
    const { listVersions, readVersion } = await import('../state/project');
    const { compareDocs } = await import('../model/diff');
    const v = (await listVersions()).find((x) => !x.name.startsWith('Avant le retour'));
    if (!v) return null;
    const d = compareDocs(await readVersion(v.file), doc);
    const date = new Date(v.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    return d.sequences.length || d.other.length ? `${v.name} (du ${date}) + modifications` : `${v.name} (du ${date})`;
  } catch {
    return null;
  }
}

export async function buildExport(doc: ProjectDoc, format: ExportFormat, opts: ExportOptions, onProgress?: (done: number, total: number) => void): Promise<BuiltExport> {
  const m = buildExportModel(doc, opts);
  m.version = await exportVersionLabel(doc);
  if (format === 'csv') return { bytes: new TextEncoder().encode(buildCsv(m, opts.columns, opts.showCamera)), failedImages: 0 };
  const withImages = opts.columns.includes('image');
  const { images, failed } = withImages ? await prepareImages(m, format === 'xlsx' ? 480 : MAX_WIDTH[opts.imageSize], onProgress) : { images: new Map<string, Resized>(), failed: [] };
  const plans = opts.floorPlans ? floorPlansFor(doc, opts.sequenceIds) : [];
  const floors = plans.length ? await prepareFloorPages(doc, plans, (d, t) => onProgress?.(d, t)) : [];
  if (format === 'xlsx') {
    const { buildWorkbook } = await import('./excel');
    const prepared = new Map<string, PreparedImage>([...images].map(([k, v]) => [k, { bytes: v.bytes, ext: 'jpeg', width: v.width, height: v.height }]));
    return { bytes: await buildWorkbook(m, opts, prepared, floors), failedImages: failed.length, failedFloors: floors.filter((f) => f.error).map((f) => f.error!) };
  }
  const { renderPdf } = await pdfModule();
  const pdfImages = new Map<string, PdfImage>([...images].map(([k, v]) => [k, { dataUrl: `data:image/jpeg;base64,${toBase64(v.bytes)}`, width: v.width, height: v.height }]));
  return { bytes: await renderPdf(m, opts, pdfImages, floors), failedImages: failed.length, failedFloors: floors.filter((f) => f.error).map((f) => f.error!) };
}

const SUFFIX: Record<ExportFormat, string> = { pdf: 'Découpage', xlsx: 'Découpage', csv: 'Liste des plans' };

/** Demande l'emplacement puis écrit le fichier. Renvoie le chemin, ou null si annulé. */
export async function saveExport(doc: ProjectDoc, format: ExportFormat, bytes: Uint8Array, presetName: string): Promise<string | null> {
  const backend = await getBackend();
  const name = exportFileName(doc.meta.title, format === 'csv' ? SUFFIX.csv : `${SUFFIX[format]} (${presetName})`, format);
  const path = await backend.pickExportPath(name, format);
  if (!path) return null;
  await backend.writeExport(path, bytes);
  return path;
}
