/**
 * Export Excel (.xlsx) : facile à retoucher, sur le modèle du découpage habituel.
 * Toutes les cellules de texte sont écrites comme du TEXTE : « 4/2 » ne devient jamais une date.
 */
import ExcelJS from 'exceljs';
import { COLUMN_DEFS, planValue, type ColumnId, type ExportModel, type ExportOptions } from './model';

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

export async function buildWorkbook(m: ExportModel, opts: ExportOptions, images: Map<string, PreparedImage>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PrepVisPro';
  wb.created = new Date();

  // ---------------------------------------------------------- page de garde
  if (opts.coverPage) {
    const ws = wb.addWorksheet('Page de garde', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 4 }, { width: 70 }];
    let r = 3;
    const put = (text: string, size: number, bold = false, color = 'FF13161B') => {
      const c = ws.getCell(r, 2);
      c.value = text;
      c.font = { name: FONT, size, bold, color: { argb: color } };
      r++;
    };
    put('DÉCOUPAGE TECHNIQUE', 12, true, 'FF465061');
    put(m.title || 'Sans titre', 28, true);
    if (m.director) put(`de ${m.director}`, 14);
    r++;
    if (m.aspectRatio) put(`Ratio : ${m.aspectRatio}`, 11);
    if (m.production) put(`Production : ${m.production}`, 11);
    put(`${m.sequences.length} séquence${m.sequences.length > 1 ? 's' : ''} · ${m.totalPlans} plan${m.totalPlans > 1 ? 's' : ''}`, 11, false, 'FF465061');
    if (m.crew.length) {
      r++;
      put('ÉQUIPE', 11, true, 'FF465061');
      for (const c of m.crew) put(`${c.role}${c.role && c.name ? ' — ' : ''}${c.name}`, 11);
    }
  }

  // ---------------------------------------------------------- découpage
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
    headerFooter: { oddFooter: `&L${(m.title || '').replace(/&/g, '&&')} — Découpage technique&RPage &P / &N` },
  });

  const cols: (ColumnId | 'camera')[] = [];
  for (const c of opts.columns) {
    cols.push(c);
    if (c === 'code' && m.multiCamera) cols.push('camera');
  }
  if (m.multiCamera && !cols.includes('camera')) cols.unshift('camera');

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
        } else if (ci === 0) {
          row.height = 30;
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

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
