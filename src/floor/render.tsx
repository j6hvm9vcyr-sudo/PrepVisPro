/**
 * Rendu d'un plan au sol en image (PNG, ou JPEG pour le PDF).
 *
 * Le dessin est celui de l'éditeur (FloorScene) : ce qui est exporté est ce qui est affiché.
 * Le fond est peint directement sur le canevas ; les éléments sont rendus en SVG par-dessus.
 */
import { floorPlanIconFiles } from '../model/floorIcons';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProjectDoc } from '../model/types';
import { fovLengthUnits, project, type FloorPlan, type Point } from '../model/floor';
import { cameraLabel } from '../model/floorOps';
import { locatePlan } from '../model/ops';
import { computeNumbers } from '../model/numbering';
import { formatNumber } from '../model/text';
import { powerTotals, reflectorName } from '../model/light';
import { gelLabel } from '../model/gels';
import { planSun } from '../model/sunPlan';
import { compassName, utcToLocal } from '../model/sun';
import { FloorMarkers, FloorScene, LIGHT_BEAM_RATIO, sunMarks } from './FloorScene';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largeur de référence (en pixels « écran ») : les symboles ont la taille qu'ils ont à l'écran sur cette largeur. */
export const REFERENCE_WIDTH = 1100;

/**
 * Cadre du plan exporté : le fond entier, et tous les éléments avec leurs étiquettes et leurs champs.
 * `k` = unités du plan par pixel symbole (les marges des étiquettes en dépendent).
 * null si le plan est vide.
 */
export function contentBounds(fp: FloorPlan, k: number, doc?: ProjectDoc): Bounds | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (p: Point, left: number, top: number, right: number, bottom: number) => {
    x0 = Math.min(x0, p.x - left);
    y0 = Math.min(y0, p.y - top);
    x1 = Math.max(x1, p.x + right);
    y1 = Math.max(y1, p.y + bottom);
  };
  if (fp.background) add({ x: 0, y: 0 }, 0, 0, fp.background.width, fp.background.height);
  const fov = fovLengthUnits(fp);
  for (const el of fp.elements) {
    if (el.kind === 'camera') {
      add(el.at, 30 * k, 30 * k, 150 * k, 55 * k);
      // Champ : bord gauche, axe et bord droit (jusqu'à 120° d'ouverture), sans réserver tout le cercle.
      if (el.showFov) for (const d of [-60, -30, 0, 30, 60]) add(project(el.at, el.rotation + d, fov), 4 * k, 4 * k, 4 * k, 4 * k);
    } else if (el.kind === 'actor') add(el.at, 70 * k, 25 * k, 70 * k, 40 * k);
    else if (el.kind === 'icon') add(el.at, (el.size / 2 + 40) * k, (el.size / 2) * k, (el.size / 2 + 40) * k, (el.size / 2 + 20) * k);
    else if (el.kind === 'light') {
      add(el.at, 60 * k, 30 * k, 120 * k, 50 * k);
      for (const d of [-30, 0, 30]) add(project(el.at, el.rotation + d, fov * LIGHT_BEAM_RATIO), 4 * k, 4 * k, 4 * k, 4 * k);
    } else if (el.kind === 'reflector') {
      const half = fp.scale ? el.widthM / 2 / fp.scale.metersPerUnit : 30 * k;
      add(el.at, half + 20 * k, half + 20 * k, half + 20 * k, half + 20 * k);
    } else add(el.at, Math.max(el.text.length, 4) * el.size * 0.35 * k, el.size * k, Math.max(el.text.length, 4) * el.size * 0.35 * k, el.size * k);
    if ('positions' in el) for (const p of el.positions) add(p.at, 40 * k, 40 * k, 40 * k, 40 * k);
  }
  // Nord et soleil (le soleil est dessiné hors du plan, dans sa direction).
  const marks = doc ? sunMarks(doc, fp, k) : null;
  if (marks) {
    add(marks.compass, 40 * k, 40 * k, 40 * k, 40 * k);
    if (marks.sun) add(marks.sun.at, 70 * k, 30 * k, 70 * k, 50 * k);
  }
  if (!Number.isFinite(x0)) return null;
  // Marge autour du contenu (sauf quand le fond suffit à cadrer).
  const pad = 16 * k;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

export interface Framing {
  bounds: Bounds;
  /** Pixels de sortie par unité du plan. */
  zoom: number;
  k: number;
  width: number;
  height: number;
}

/** Cadrage pour une image dont le grand côté fait `maxPx` pixels. */
export function frame(fp: FloorPlan, maxPx: number, doc?: ProjectDoc): Framing | null {
  // Les marges dépendent de k, qui dépend du cadrage : quelques itérations convergent.
  let b = contentBounds(fp, 0, doc);
  if (!b) return null;
  for (let i = 0; i < 4; i++) {
    const z: number = maxPx / Math.max(b.w, b.h, 1e-6);
    b = contentBounds(fp, maxPx / REFERENCE_WIDTH / z, doc)!;
  }
  const zoom = maxPx / Math.max(b.w, b.h);
  const k = maxPx / REFERENCE_WIDTH / zoom;
  return { bounds: b, zoom, k, width: Math.max(1, Math.round(b.w * zoom)), height: Math.max(1, Math.round(b.h * zoom)) };
}

/** Barre d'échelle : longueur ronde proche de `targetPx` pixels de sortie. */
export function exportScaleBar(metersPerUnit: number, zoom: number, targetPx: number): { px: number; meters: number; label: string } {
  const mPerPx = metersPerUnit / zoom;
  const target = targetPx * mPerPx;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const m = steps.find((s) => s >= target * 0.6) ?? 1000;
  return { px: m / mPerPx, meters: m, label: `${formatNumber(m)} m` };
}

/** SVG des éléments du plan (sans le fond), cadré, avec la barre d'échelle. */
export function sceneSvg(doc: ProjectDoc, fp: FloorPlan, f: Framing, opts: { fontCss?: string; iconUrl?: (file: string) => string | null } = {}): string {
  const numbers = computeNumbers(doc);
  const u = f.k * f.zoom; // pixels de sortie par pixel symbole
  const bar = fp.scale ? exportScaleBar(fp.scale.metersPerUnit, f.zoom, 160 * u) : null;
  const { x, y, w, h } = f.bounds;
  const body = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" width={f.width} height={f.height} viewBox={`${x} ${y} ${w} ${h}`} fontFamily="IBM Plex Sans, Helvetica, Arial, sans-serif">
      <defs>
        <FloorMarkers />
      </defs>
      <FloorScene doc={doc} fp={fp} k={f.k} numbers={numbers} urlFor={opts.iconUrl ?? (() => null)} />
      <g transform={`translate(${x} ${y + h}) scale(${f.k})`}>
        {bar ? (
          <g transform="translate(18 -18)">
            <rect x={-6} y={-30} width={bar.px / u + 12 + 60} height={40} rx={4} fill="#ffffff" opacity={0.85} />
            <rect x={0} y={-6} width={bar.px / u} height={6} fill="#13161B" />
            <rect x={0} y={-6} width={bar.px / u / 2} height={6} fill="#ffffff" stroke="#13161B" strokeWidth={1} />
            <text x={0} y={-12} fontSize={11} fill="#13161B">0</text>
            <text x={bar.px / u} y={-12} fontSize={11} fill="#13161B" textAnchor="middle">{bar.label}</text>
          </g>
        ) : (
          <text x={18} y={-18} fontSize={11} fill="#6A7383">Plan non mis à l’échelle</text>
        )}
      </g>
    </svg>,
  );
  if (!opts.fontCss) return body;
  return body.replace(/^<svg([^>]*)>/, `<svg$1><style>${opts.fontCss}</style>`);
}

export interface LegendRow {
  code: string;
  detail: string;
  action: string;
  missing: boolean;
}

/** Caméras placées, dans l'ordre du découpage (pour la légende du PDF). */
export function cameraLegend(doc: ProjectDoc, fp: FloorPlan): LegendRow[] {
  const numbers = computeNumbers(doc);
  const rows = fp.elements.flatMap((el) => {
    if (el.kind !== 'camera') return [];
    const lab = cameraLabel(doc, el.planId, el.setupId, numbers);
    const loc = el.planId ? locatePlan(doc, el.planId) : null;
    const g = el.planId ? (numbers.get(el.planId)?.global ?? Infinity) : Infinity;
    return [{ row: { ...lab, action: loc?.plan.action ?? '' }, g }];
  });
  return rows.sort((a, b) => a.g - b.g || a.row.code.localeCompare(b.row.code, 'fr', { numeric: true })).map((r) => r.row);
}

/** Soleil simulé sur le plan, en une ligne pour les exports ; null sans simulation. */
export function sunLegend(doc: ProjectDoc, fp: FloorPlan): string | null {
  const s = planSun(doc, fp);
  if (!s.ok) return null;
  const [y, mo, d] = fp.sunAt!.date.split('-').map(Number);
  const date = new Date(Date.UTC(y!, mo! - 1, d!)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const t = (ms: number | null) => (ms === null ? '—' : utcToLocal(Math.round(ms / 60000) * 60000, s.tz).time);
  const where =
    s.pos.elevation > -0.833 ? `direction ${Math.round(s.pos.azimuth)}° (${compassName(s.pos.azimuth)}), hauteur ${Math.round(s.pos.elevation)}°` : 'soleil couché';
  const day = s.day && !s.day.polar ? ` · lever ${t(s.day.sunrise)}, coucher ${t(s.day.sunset)}` : '';
  return `Soleil le ${date} à ${fp.sunAt!.time} (${s.tz.replace(/_/g, ' ')}) : ${where}${day}`;
}

/** Projecteurs du plan (pour la légende des exports) et puissance totale. */
export function lightLegend(doc: ProjectDoc, fp: FloorPlan): { lights: { name: string; detail: string }[]; power: string | null } {
  const lights = fp.elements.flatMap((el) => {
    if (el.kind !== 'light') return [];
    const f = doc.settings.fixtures.find((x) => x.id === el.fixtureId);
    const mode = f?.modes[el.mode];
    const detail = [!f ? 'modèle non défini' : f.watts !== null ? `${formatNumber(f.watts)} W` : 'puissance non renseignée', mode?.label, el.dimmer < 1 ? `gradateur ${Math.round(el.dimmer * 100)} %` : '', el.gels.length ? el.gels.map((g) => gelLabel(g)).filter(Boolean).join(' + ') : '', el.lossStops ? `−${formatNumber(el.lossStops)} diaph` : '', el.circuit ? `circuit ${el.circuit}` : '']
      .filter(Boolean)
      .join(' · ');
    return [{ name: el.label || f?.name || 'Projecteur', detail }];
  });
  const reflectors = fp.elements.flatMap((el) => {
    if (el.kind !== 'reflector') return [];
    const m = doc.settings.reflectors.find((x) => x.id === el.materialId);
    const detail = [m ? (m.type === 'mirror' ? 'miroir' : 'réflecteur diffus') : 'matière non définie', `${formatNumber(Math.round(el.widthM * 100) / 100)} × ${formatNumber(Math.round(el.heightM * 100) / 100)} m`, m && m.reflectance !== null ? `réflexion ${Math.round(m.reflectance * 100)} %` : '']
      .filter(Boolean)
      .join(' · ');
    return [{ name: reflectorName(doc, el), detail }];
  });
  if (!lights.length) return { lights: reflectors, power: null };
  lights.push(...reflectors);
  const p = powerTotals(doc, fp);
  const circuits = p.circuits.filter((c) => c.circuit !== '—').map((c) => `${c.circuit} : ${formatNumber(c.watts)} W`).join(' · ');
  return { lights, power: `Puissance totale ${formatNumber(p.total.watts)} W (${formatNumber(Math.round(p.total.amps * 10) / 10)} A à 230 V)${circuits ? ` — ${circuits}` : ''}${p.unknown ? (p.unknown > 1 ? ` — ${p.unknown} projecteurs sans puissance renseignée, non comptés` : ' — 1 projecteur sans puissance renseignée, non compté') : ''}` };
}

// ------------------------------------------------------------------ navigateur

export interface FloorImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  mime: 'image/png' | 'image/jpeg';
}

export interface FloorAssets {
  readBytes(file: string): Promise<Uint8Array>;
  fonts?: { family: string; weight: number; url: string }[];
}

function mimeOf(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  if (bytes[0] === 0x3c) return 'image/svg+xml';
  return 'application/octet-stream';
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
}

const fontCache = new Map<string, string>();
async function fontCss(fonts: FloorAssets['fonts']): Promise<string> {
  if (!fonts?.length) return '';
  const parts: string[] = [];
  for (const f of fonts) {
    let data = fontCache.get(f.url);
    if (!data) {
      try {
        const res = await fetch(f.url);
        data = `data:font/woff;base64,${toBase64(new Uint8Array(await res.arrayBuffer()))}`;
        fontCache.set(f.url, data);
      } catch {
        continue; // police système en repli : le plan reste juste
      }
    }
    parts.push(`@font-face{font-family:'${f.family}';font-weight:${f.weight};src:url(${data}) format('woff');}`);
  }
  return parts.join('');
}

/**
 * Image du plan au sol. Lève une erreur lisible si le plan est vide ou si le fond est illisible.
 * `maxPx` : grand côté de l'image produite.
 */
export async function renderFloorImage(doc: ProjectDoc, fp: FloorPlan, assets: FloorAssets, maxPx: number, mime: FloorImage['mime'] = 'image/png'): Promise<FloorImage> {
  const f = frame(fp, maxPx, doc);
  if (!f) throw new Error(`Le plan « ${fp.name} » est vide.`);
  const canvas = document.createElement('canvas');
  canvas.width = f.width;
  canvas.height = f.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Rendu du plan impossible (mémoire insuffisante ?)');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, f.width, f.height);

  if (fp.background) {
    let bytes: Uint8Array;
    try {
      bytes = await assets.readBytes(fp.background.file);
    } catch {
      throw new Error(`Fond du plan « ${fp.name} » introuvable dans le projet.`);
    }
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(bytes) }));
    try {
      const img = await loadImage(url);
      ctx.globalAlpha = fp.background.opacity;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (0 - f.bounds.x) * f.zoom, (0 - f.bounds.y) * f.zoom, fp.background.width * f.zoom, fp.background.height * f.zoom);
      ctx.globalAlpha = 1;
    } catch {
      throw new Error(`Fond du plan « ${fp.name} » illisible.`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Icônes intégrées en données : une image SVG ne peut pas charger de ressources externes.
  const icons = new Map<string, string>();
  for (const file of floorPlanIconFiles(doc, fp)) {
    try {
      const b = await assets.readBytes(file);
      icons.set(file, `data:${mimeOf(b)};base64,${toBase64(b)}`);
    } catch {
      /* icône manquante : le reste du plan est exporté */
    }
  }
  const svg = sceneSvg(doc, fp, f, { fontCss: await fontCss(assets.fonts), iconUrl: (file) => icons.get(file) ?? null });
  const svgImg = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  ctx.drawImage(svgImg, 0, 0, f.width, f.height);

  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Rendu du plan impossible'))), mime, 0.9));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: f.width, height: f.height, mime };
}
