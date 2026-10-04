// @vitest-environment node
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { BUILTIN_PRESETS, buildCsv, buildExportModel, exportFileName } from './model';
import { buildWorkbook, type PreparedImage } from './excel';
import { sampleProjectMultiCam as sampleProject } from '../model/sample';
import { produce } from 'immer';
import { PNG_160x90_B64 } from '../test/fixtures';

// PNG 16×9 bleu.
const PNG = Uint8Array.from(Buffer.from(PNG_160x90_B64, 'base64'));

function docWithImage() {
  return produce(sampleProject(), (d) => {
    d.sequences[0]!.plans[0]!.images.push({ id: 'i1', kind: 'scouting', file: 'images/a.png', originalName: 'a.png', caption: '' });
    d.sequences[0]!.comments = 'Lumière du matin, rasante.';
    d.sequences[0]!.breakdown.lighting = 'Soleil rasant, réflecteur';
    d.meta.director = 'V. N.';
    d.meta.crew.push({ id: 'c', role: 'Chef opérateur', name: 'A. R.' });
  });
}

describe('modèle d’export', () => {
  it('reprend numéros, valeurs affichées et images principales', () => {
    const m = buildExportModel(docWithImage(), { sequenceIds: [] });
    expect(m.totalPlans).toBe(8);
    const p = m.sequences[0]!.plans;
    expect(p.map((x) => x.code)).toEqual(['1/1', '1/2', '1/3', '1/2B']);
    expect(p[2]!.cameras[0]!.values.focal).toBe('75 → 300 mm');
    expect(p[0]!.imageFile).toBe('images/a.png');
    expect(m.multiCamera).toBe(true);
  });
  it('filtre les séquences', () => {
    const d = docWithImage();
    const m = buildExportModel(d, { sequenceIds: [d.sequences[1]!.id] });
    expect(m.sequences.map((s) => s.number)).toEqual(['2']);
  });
  it('nom de fichier sûr', () => {
    expect(exportFileName('A/B: "C"', 'Découpage', 'pdf')).toMatch(/^A-B- -C- — Découpage — \d{4}-\d\d-\d\d\.pdf$/);
  });
});

describe('CSV', () => {
  it('séparateur français, guillemets, BOM, une ligne par caméra', () => {
    const d = produce(docWithImage(), (x) => void (x.sequences[0]!.plans[0]!.action = 'Il dit "non"; puis part'));
    const csv = buildCsv(buildExportModel(d, { sequenceIds: [] }), BUILTIN_PRESETS[0]!.options.columns);
    expect(csv.startsWith('﻿Séquence;Caméra;N°;Plan;Action')).toBe(true);
    expect(csv).toContain('"Il dit ""non""; puis part"');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1 + 9);
  });
});

describe('Excel', () => {
  it('produit un classeur relisible, codes de plan en texte, images intégrées', async () => {
    const m = buildExportModel(docWithImage(), { sequenceIds: [] });
    const images = new Map<string, PreparedImage>([['images/a.png', { bytes: PNG, ext: 'png', width: 160, height: 90 }]]);
    const bytes = await buildWorkbook(m, BUILTIN_PRESETS[0]!.options, images);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Page de garde', 'Découpage', 'Dépouillement image']);
    const ws = wb.getWorksheet('Découpage')!;
    const values: unknown[] = [];
    ws.eachRow((row) => row.eachCell((c) => values.push(c.value)));
    expect(values).toContain('1/2');
    expect(values).toContain('1/2B');
    expect(values.some((v) => v instanceof Date)).toBe(false);
    expect(values).toContain('Commentaires : Lumière du matin, rasante.');
    expect(ws.getImages()).toHaveLength(1);
    const garde: unknown[] = [];
    wb.getWorksheet('Page de garde')!.eachRow((row) => row.eachCell((c) => garde.push(c.value)));
    expect(garde).toContain('Chef opérateur — A. R.');
    const bd: unknown[] = [];
    wb.getWorksheet('Dépouillement image')!.eachRow((row) => row.eachCell((c) => bd.push(c.value)));
    expect(bd).toContain('Soleil rasant, réflecteur');
    expect(bd).toContain('32, 75, 300 mm');
  });
});
