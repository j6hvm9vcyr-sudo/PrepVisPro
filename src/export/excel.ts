/**
 * Export Excel (.xlsx) : facile à retoucher, sur le modèle du découpage habituel.
 * Toutes les cellules de texte sont écrites comme du TEXTE : « 4/2 » ne devient jamais une date.
 */
import ExcelJS from 'exceljs';
import type { PdfFloorPage } from './pdf';
import { COLUMN_DEFS, descriptionFields, descriptionText, dtColumns, planValue, type ColumnId, type ExportModel, type ExportOptions } from './model';

export interface PreparedImage {
  bytes: Uint8Array;
  /** Format pour Excel. */
  ext: 'jpeg' | 'png';
  width: number;
  height: number;
}

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD6DAE1' } },
  bottom: { style: 'thin', color: { argb: 'FFD6DAE1' } },
  left: { style: 'thin', color: { argb: 'FFD6DAE1' } },
  right: { style: 'thin', color: { argb: 'FFD6DAE1' } },
};
const FONT = 'Helvetica Neue';
const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();

/** Pixels approximatifs d'une colonne Excel de largeur `w` caractères. */
const colPx = (w: number) => Math.round(w * 7 + 5);

export async function buildWorkbook(m: ExportModel, opts: ExportOptions, images: Map<string, PreparedImage>, floors: PdfFloorPage[] = []): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PrepVisPro';
  wb.created = new Date();

  // ---------------------------------------------------------- page de garde
  if (opts.coverPage) {
    // Mise en page du découpage d'origine : titre centré, ratio et production à gauche, équipe à droite.
    const ws = wb.addWorksheet('Page de garde', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
    ws.columns = [{ width: 3 }, { width: 28 }, { width: 52 }, { width: 52 }];
    const put = (ref: string, text: string, size: number, opt: { bold?: boolean; align?: 'left' | 'center' | 'right' } = {}) => {
      const c = ws.getCell(ref);
      c.value = text;
      c.font = { name: DT_FONT, size, bold: !!opt.bold, color: { argb: 'FF000000' } };
      c.alignment = { horizontal: opt.align ?? 'left', vertical: 'middle' };
    };
    put('C3', 'DÉCOUPAGE TECHNIQUE', 14, { align: 'center' });
    put('C4', m.title || 'Sans titre', 20, { bold: true, align: 'center' });
    ws.getRow(4).height = 28;
    if (m.director) put('C6', `de ${m.director}`, 12, { align: 'center' });
    if (m.version) put('C7', m.version, 11, { bold: true, align: 'center' });
    let r = 9;
    if (m.aspectRatio) put(`B${r++}`, `RATIO : ${m.aspectRatio}`, 11);
    if (m.production) put(`B${r++}`, `PRODUCTION : ${m.production}`, 11);
    put(`B${r}`, `${m.sequences.length} SÉQUENCE${m.sequences.length > 1 ? 'S' : ''} · ${m.totalPlans} PLAN${m.totalPlans > 1 ? 'S' : ''}`, 11);
    if (m.crew.length) {
      let k = 9;
      put(`D${k++}`, 'INFORMATIONS :', 11, { align: 'right' });
      k++;
      for (const c of m.crew) put(`D${k++}`, `${c.role}${c.role && c.name ? ' - ' : ''}${c.name}`, 11, { align: 'right' });
    }
  }

  // ---------------------------------------------------------- découpage
  if (opts.layout === 'dt') buildDtSheet(wb, m, opts, images);
  else buildColumnsSheet(wb, m, opts, images);

  // ---------------------------------------------------------- dépouillement image
  if (opts.shootingOrder && m.sequences.some((x) => x.shooting)) buildShootingSheet(wb, m);

  if (opts.breakdown) {
    const bd = wb.addWorksheet('Dépouillement image', {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const heads = ['Séquence', 'Caméra', 'Machinerie', 'Lumière', 'Autre', 'Focales des plans', 'Machinerie des plans'];
    bd.columns = [{ width: 44 }, { width: 28 }, { width: 28 }, { width: 28 }, { width: 28 }, { width: 22 }, { width: 26 }];
    const h = bd.getRow(1);
    heads.forEach((t, i) => {
      const c = h.getCell(i + 1);
      c.value = t.toUpperCase();
      c.font = { name: FONT, size: 9, bold: true, color: { argb: 'FF465061' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } };
      c.border = BORDER;
    });
    m.sequences.forEach((s, i) => {
      const row = bd.getRow(i + 2);
      const vals = [`SÉQ. ${s.number || '?'} — ${s.title}`, s.breakdown.camera, s.breakdown.grip, s.breakdown.lighting, s.breakdown.other, s.summary.focals, s.summary.grip];
      vals.forEach((v, k) => {
        const c = row.getCell(k + 1);
        c.value = v;
        c.font = { name: FONT, size: 10, bold: k === 0 };
        c.alignment = { vertical: 'top', wrapText: true };
        c.border = BORDER;
        if (k === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.strip.fill === '#ffffff' ? 'FFFFFFFF' : argb(s.strip.fill) + '' } };
        if (k === 0 && (s.strip.fill === '#3e6fd8' || s.strip.fill === '#3a9a5b')) c.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      });
    });
  }

  if (floors.length) buildFloorSheet(wb, m, floors);

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

function buildColumnsSheet(wb: ExcelJS.Workbook, m: ExportModel, opts: ExportOptions, images: Map<string, PreparedImage>) {
  const ws = wb.addWorksheet('Découpage', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: {
      paperSize: 9,
      orientation: opts.orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: { oddFooter: `&L${(m.title || '').replace(/&/g, '&&')} — Découpage technique${m.version ? ` · ${m.version.replace(/&/g, '&&')}` : ''}&RPage &P / &N` },
  });

  const cols: (ColumnId | 'camera')[] = [];
  for (const c of opts.columns) {
    cols.push(c);
    if (c === 'code' && m.multiCamera && opts.showCamera) cols.push('camera');
  }
  if (m.multiCamera && opts.showCamera && !cols.includes('camera')) cols.unshift('camera');

  ws.columns = cols.map((c) => ({ width: c === 'camera' ? 6 : COLUMN_DEFS[c].xlsWidth }));
  ws.pageSetup.printTitlesRow = '1:1';

  const header = ws.getRow(1);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c === 'camera' ? 'Cam' : COLUMN_DEFS[c].label.toUpperCase();
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: 'FF465061' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } };
    cell.border = BORDER;
    cell.alignment = { vertical: 'middle' };
  });
  header.height = 20;

  const imgCol = cols.indexOf('image');
  const imgW = imgCol >= 0 ? colPx(COLUMN_DEFS.image.xlsWidth) - 8 : 0;
  const imgH = Math.round((imgW * 9) / 16);

  let r = 2;
  for (const s of m.sequences) {
    // Bandeau de séquence, aux couleurs du plan de travail.
    const band = ws.getRow(r);
    ws.mergeCells(r, 1, r, cols.length);
    const bc = band.getCell(1);
    bc.value = `SÉQ. ${s.number || '?'} — ${s.title}${s.address ? `    (${s.address})` : ''}`;
    const dark = s.strip.fill === '#3e6fd8' || s.strip.fill === '#3a9a5b';
    bc.font = { name: FONT, size: 11, bold: true, color: { argb: dark ? 'FFFFFFFF' : 'FF13161B' } };
    bc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.strip.fill === '#ffffff' ? 'FFF1F3F6' : argb(s.strip.fill) } };
    bc.alignment = { vertical: 'middle' };
    bc.border = BORDER;
    band.height = 22;
    r++;

    for (const p of s.plans) {
      p.cameras.forEach((cam, ci) => {
        const row = ws.getRow(r);
        cols.forEach((c, i) => {
          const cell = row.getCell(i + 1);
          let v = '';
          if (c === 'camera') v = cam.label;
          else if (COLUMN_DEFS[c].perCamera) v = cam.values[c] ?? '';
          else if (ci === 0 && c !== 'image') v = planValue(p, c);
          if (c === 'global' && ci === 0) cell.value = p.global;
          else cell.value = v; // texte : jamais converti en date
          cell.font = { name: c === 'code' || c === 'focal' ? 'Menlo' : FONT, size: 10, bold: c === 'code' };
          cell.alignment = { vertical: 'top', wrapText: true };
          cell.border = BORDER;
        });
        const img = ci === 0 && p.imageFile ? images.get(p.imageFile) : undefined;
        if (img && imgCol >= 0) {
          const id = wb.addImage({ buffer: img.bytes.buffer.slice(img.bytes.byteOffset, img.bytes.byteOffset + img.bytes.byteLength) as ArrayBuffer, extension: img.ext });
          const ratio = img.width / img.height;
          const w = ratio >= 16 / 9 ? imgW : Math.round(imgH * ratio);
          const h = ratio >= 16 / 9 ? Math.round(imgW / ratio) : imgH;
          ws.addImage(id, { tl: { col: imgCol + 0.08, row: r - 1 + 0.1 }, ext: { width: w, height: h }, editAs: 'oneCell' });
          row.height = Math.max(row.height ?? 15, Math.round(h * 0.75) + 8);
        } else {
          row.height = Math.max(row.height ?? 15, rowHeight(cols.map((c, i) => ({ text: String(row.getCell(i + 1).value ?? ''), width: (ws.getColumn(i + 1).width ?? 10) })), 10));
        }
        r++;
      });
    }

    if (opts.sequenceComments && s.comments.trim()) {
      const row = ws.getRow(r);
      ws.mergeCells(r, 1, r, cols.length);
      const c = row.getCell(1);
      c.value = `Commentaires : ${s.comments.trim()}`;
      c.font = { name: FONT, size: 10, italic: true, color: { argb: 'FF465061' } };
      c.alignment = { vertical: 'top', wrapText: true };
      row.height = Math.min(120, 16 * Math.ceil(s.comments.length / 120) + 6);
      r++;
    }
  }

}

// ------------------------------------------------------------------ hauteur des lignes

/**
 * Hauteur (points) qu'il faut à une ligne pour que tout le texte soit visible.
 * Excel n'ajuste pas seul la hauteur des lignes d'un fichier généré : sans cela, le texte
 * long serait coupé dans les cases.
 */
export function rowHeight(cells: { text: string; width: number }[], fontSize: number): number {
  const charPx = fontSize * 0.62; // largeur moyenne d'un caractère
  const linePt = fontSize * 1.35;
  let lines = 1;
  for (const c of cells) {
    if (!c.text) continue;
    const usable = Math.max(20, c.width * 7 + 5 - 10);
    const perLine = Math.max(4, Math.floor(usable / charPx));
    const n = c.text.split('\n').reduce((acc, para) => acc + Math.max(1, Math.ceil(para.length / perLine)), 0);
    lines = Math.max(lines, n);
  }
  return Math.min(409, Math.ceil(lines * linePt + 8));
}

// ------------------------------------------------------------------ style « découpage technique »

const DT_FONT = 'Lexend';
const BLACK_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};
function buildDtSheet(wb: ExcelJS.Workbook, m: ExportModel, opts: ExportOptions, images: Map<string, PreparedImage>) {
  const ws = wb.addWorksheet('Découpage', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: opts.orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: { oddFooter: `&L${(m.title || '').replace(/&/g, '&&')} — Découpage technique${m.version ? ` · ${m.version.replace(/&/g, '&&')}` : ''}&RPage &P / &N` },
  });
  const cols = dtColumns(opts, m.multiCamera);
  const fields = descriptionFields(opts.columns);
  const n = cols.length;
  ws.columns = cols.map((c) => ({ width: c.width }));
  ws.pageSetup.printTitlesRow = '1:1';

  const header = ws.getRow(1);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: DT_FONT, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF464646' } };
    cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
    cell.border = BLACK_THIN;
  });
  header.height = 16;

  const imgCol = cols.findIndex((c) => c.id === 'image');
  const imgW = imgCol >= 0 ? colPx(cols[imgCol]!.width) - 10 : 0;
  const imgMaxH = Math.round(imgW * 0.62);

  let r = 2;
  for (const s of m.sequences) {
    const tint = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: argb(s.tint) } };
    // Bandeau : titre de la séquence, adresse à droite.
    const band = ws.getRow(r);
    const withAddress = !!s.address && n > 1;
    ws.mergeCells(r, 1, r, withAddress ? n - 1 : n);
    const bc = band.getCell(1);
    bc.value = s.heading;
    bc.font = { name: DT_FONT, size: 14, bold: true, color: { argb: 'FF000000' } };
    bc.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    for (let i = 1; i <= n; i++) {
      const c = band.getCell(i);
      c.fill = tint;
      c.border = { ...BLACK_THIN, top: { style: 'medium', color: { argb: 'FF000000' } }, bottom: { style: 'medium', color: { argb: 'FF000000' } } };
    }
    if (withAddress) {
      const ac = band.getCell(n);
      ac.value = s.address;
      ac.font = { name: DT_FONT, size: 8, color: { argb: 'FF000000' } };
      ac.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
    }
    band.height = 24;
    r++;

    for (const p of s.plans) {
      const row = ws.getRow(r);
      const texts: { text: string; width: number }[] = [];
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        let v: string | number = '';
        if (c.id === 'global') v = p.global;
        else if (c.id === 'code') v = p.code;
        else if (c.id === 'camera') v = p.cameras.length > 1 ? p.cameras.map((k) => k.label).join('/') : '';
        else if (c.id === 'action') v = p.action;
        else if (c.id === 'script') v = p.script;
        // Description aérée comme dans un découpage manuel : une ligne vide entre les réglages.
        else if (c.id === 'description') v = descriptionText(p, fields, opts.showCamera, '\n\n');
        else if (c.id === 'notes') v = p.notes;
        cell.value = v; // texte : « 4/2 » n'est jamais converti en date
        cell.font = { name: DT_FONT, size: 9, bold: c.id === 'code', color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
        cell.fill = tint;
        cell.border = BLACK_THIN;
        if (typeof v === 'string') texts.push({ text: v, width: c.width });
      });
      let h = rowHeight(texts, 9);
      const img = p.imageFile ? images.get(p.imageFile) : undefined;
      if (img && imgCol >= 0) {
        const id = wb.addImage({ buffer: img.bytes.buffer.slice(img.bytes.byteOffset, img.bytes.byteOffset + img.bytes.byteLength) as ArrayBuffer, extension: img.ext });
        const ratio = img.width / img.height;
        let w = imgW;
        let ih = Math.round(w / ratio);
        if (ih > imgMaxH) {
          ih = imgMaxH;
          w = Math.round(ih * ratio);
        }
        ws.addImage(id, { tl: { col: imgCol + 0.05, row: r - 1 + 0.06 }, ext: { width: w, height: ih }, editAs: 'oneCell' });
        h = Math.max(h, Math.round(ih * 0.75) + 8);
      }
      row.height = h;
      r++;
    }

    // Commentaires de la séquence (ligne toujours présente, comme dans le découpage d'origine).
    if (opts.sequenceComments) {
      const row = ws.getRow(r);
      ws.mergeCells(r, 1, r, n);
      const c = row.getCell(1);
      c.value = `COMMENTAIRES :${s.comments.trim() ? ` ${s.comments.trim()}` : ''}`;
      c.font = { name: DT_FONT, size: 9, color: { argb: 'FF000000' } };
      c.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
      for (let i = 1; i <= n; i++) {
        row.getCell(i).fill = tint;
        row.getCell(i).border = BLACK_THIN;
      }
      const total = cols.reduce((a, k) => a + k.width, 0);
      row.height = rowHeight([{ text: c.value as string, width: total }], 9);
      r++;
    }
  }
}

// ------------------------------------------------------------------ plans au sol

/** Une feuille « Plans au sol » : chaque plan en image (même dessin que l'éditeur), puis sa légende. */
function buildFloorSheet(wb: ExcelJS.Workbook, m: ExportModel, floors: PdfFloorPage[]) {
  const ws = wb.addWorksheet('Plans au sol', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: `&L${(m.title || '').replace(/&/g, '&&')} — Plans au sol&RPage &P / &N` },
  });
  ws.columns = [{ width: 12 }, { width: 14 }, { width: 70 }, { width: 30 }];
  const IMG_W = 900; // px
  const ROW_PX = 20; // ligne de 15 pt
  let r = 1;
  for (const f of floors) {
    const head = ws.getRow(r);
    ws.mergeCells(r, 1, r, 4);
    const hc = head.getCell(1);
    hc.value = `PLAN AU SOL — ${f.name}${f.sequences ? ` — ${f.sequences}` : ''}${f.scaled ? '' : ' (non mis à l’échelle)'}`;
    hc.font = { name: DT_FONT, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF464646' } };
    hc.alignment = { vertical: 'middle' };
    head.height = 24;
    r++;
    if (f.image) {
      const base64 = f.image.dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const id = wb.addImage({ base64, extension: 'jpeg' });
      const scale = Math.min(1, IMG_W / f.image.width);
      const w = Math.round(f.image.width * scale);
      const h = Math.round(f.image.height * scale);
      ws.addImage(id, { tl: { col: 0, row: r - 1 + 0.2 }, ext: { width: w, height: h }, editAs: 'oneCell' });
      const rows = Math.ceil(h / ROW_PX) + 1;
      for (let i = 0; i < rows; i++) ws.getRow(r + i).height = 15;
      r += rows;
    } else {
      ws.getCell(r, 1).value = f.error ?? 'Plan vide';
      ws.getCell(r, 1).font = { name: DT_FONT, size: 10, color: { argb: 'FF9A4F00' } };
      r++;
    }
    if (f.legend.length) {
      const lh = ws.getRow(r);
      ['PLAN', 'FOCALE', 'ACTION'].forEach((t, i) => {
        const c = lh.getCell(i + 1);
        c.value = t;
        c.font = { name: DT_FONT, size: 9, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF464646' } };
        c.border = BLACK_THIN;
      });
      r++;
      for (const l of f.legend) {
        const row = ws.getRow(r);
        [l.code, l.detail, l.action].forEach((v, i) => {
          const c = row.getCell(i + 1);
          c.value = v;
          c.font = { name: DT_FONT, size: 9, bold: i === 0, color: { argb: l.missing ? 'FF6A7383' : 'FF000000' } };
          c.alignment = { vertical: 'top', wrapText: true };
          c.border = BLACK_THIN;
        });
        row.height = rowHeight([{ text: l.action, width: 70 }], 9);
        r++;
      }
    }
    if (f.lights?.length) {
      r++;
      const lh = ws.getRow(r);
      ['PROJECTEUR / RÉFLECTEUR', '', 'DÉTAIL'].forEach((t, i) => {
        const c = lh.getCell(i + 1);
        c.value = t;
        c.font = { name: DT_FONT, size: 9, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A5A10' } };
      });
      ws.mergeCells(r, 1, r, 2);
      r++;
      for (const l of f.lights) {
        ws.mergeCells(r, 1, r, 2);
        ws.getCell(r, 1).value = l.name;
        ws.getCell(r, 1).font = { name: DT_FONT, size: 9, bold: true };
        ws.getCell(r, 3).value = l.detail;
        ws.getCell(r, 3).font = { name: DT_FONT, size: 9 };
        r++;
      }
      if (f.power) {
        ws.getCell(r, 1).value = f.power;
        ws.getCell(r, 1).font = { name: DT_FONT, size: 9, bold: true };
        r++;
      }
    }
    r += 2;
  }
}

// ------------------------------------------------------------------ ordre de tournage

function buildShootingSheet(wb: ExcelJS.Workbook, m: ExportModel) {
  const ws = wb.addWorksheet('Ordre de tournage', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: `&L${(m.title || '').replace(/&/g, '&&')} — Ordre de tournage${m.version ? ` · ${m.version.replace(/&/g, '&&')}` : ''}&RPage &P / &N` },
  });
  const cols: [string, string, number][] = [
    ['order', 'ORDRE', 7],
    ['code', 'PLAN', 8],
    ['size', 'VALEUR', 16],
    ['axis', 'AXE', 10],
    ['focal', 'FOCALE', 12],
    ['movement', 'MOUVEMENT', 18],
    ['grip', 'MACHINERIE', 16],
    ['action', 'ACTION', 50],
  ];
  ws.columns = cols.map(([, , w]) => ({ width: w }));
  const head = ws.getRow(1);
  cols.forEach(([, l], i) => {
    const c = head.getCell(i + 1);
    c.value = l;
    c.font = { name: DT_FONT, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF464646' } };
    c.alignment = { horizontal: 'center' };
    c.border = BLACK_THIN;
  });
  ws.pageSetup.printTitlesRow = '1:1';
  const value = (p: ExportModel['sequences'][number]['plans'][number], k: string) =>
    k === 'code' ? p.code : k === 'action' ? p.action : p.cameras.map((c) => (p.cameras.length > 1 ? `${c.label} : ` : '') + (c.values[k as ColumnId] ?? '')).join('\n');
  let r = 2;
  const line = (order: number | null, p: ExportModel['sequences'][number]['plans'][number], tint: string) => {
    const row = ws.getRow(r++);
    cols.forEach(([k], i) => {
      const c = row.getCell(i + 1);
      c.value = k === 'order' ? (order ?? '') : value(p, k);
      c.font = { name: DT_FONT, size: 9, bold: k === 'code' };
      c.alignment = { vertical: 'top', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(tint) } };
      c.border = BLACK_THIN;
    });
    row.height = rowHeight(cols.map(([k, , w]) => ({ text: k === 'order' ? '' : value(p, k), width: w })), 9);
  };
  for (const s of m.sequences) {
    if (!s.shooting) continue;
    ws.mergeCells(r, 1, r, cols.length);
    const b = ws.getRow(r).getCell(1);
    b.value = s.heading;
    b.font = { name: DT_FONT, size: 13, bold: true };
    b.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(s.tint) } };
    b.border = { ...BLACK_THIN, top: { style: 'medium', color: { argb: 'FF000000' } }, bottom: { style: 'medium', color: { argb: 'FF000000' } } };
    ws.getRow(r).height = 22;
    r++;
    s.shooting.installations.forEach((ins, i) => {
      ws.mergeCells(r, 1, r, cols.length);
      const c = ws.getRow(r).getCell(1);
      c.value = `Installation ${i + 1} · ${ins.name}${ins.note ? ` — ${ins.note}` : ''}`;
      c.font = { name: DT_FONT, size: 10, bold: true };
      r++;
      for (const x of ins.plans) line(x.order, x.plan, s.tint);
    });
    if (s.shooting.loose.length) {
      ws.mergeCells(r, 1, r, cols.length);
      const c = ws.getRow(r).getCell(1);
      c.value = 'À ranger';
      c.font = { name: DT_FONT, size: 10, bold: true, color: { argb: 'FF9A4F00' } };
      r++;
      for (const p of s.shooting.loose) line(null, p, '#FFFFFF');
    }
    r++;
  }
}
