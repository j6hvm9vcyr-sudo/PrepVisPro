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

describe('jours de tournage', () => {
  it('modèle : une page par jour, ordre, soleil, matériel ; feuilles Excel', async () => {
    const d = produce(docWithImage(), (x) => {
      x.settings.timeZone = 'Europe/Paris';
      x.sequences[0]!.gps = { lat: 48.8566, lon: 2.3522 };
      x.sequences[0]!.shooting = { installations: [{ id: 'i1', name: 'Champ', note: 'Contre-jour', planIds: [x.sequences[0]!.plans[0]!.id] }] };
      x.shootingDays.push({ id: 'j1', date: '2026-06-21', sequenceIds: [x.sequences[0]!.id, x.sequences[1]!.id], note: 'Départ 7 h' });
    });
    const m = buildExportModel(d, { sequenceIds: [] });
    expect(m.days).toHaveLength(1);
    const j = m.days[0]!;
    expect(j.label).toBe('J1');
    expect(j.date).toBe('dimanche 21 juin 2026');
    expect(j.sequences[0]!.installations).toEqual(['1. Champ : 1/1 — Contre-jour', 'À ranger : 1/2, 1/3, 1/2B']);
    expect(j.sequences[1]!.installations[0]).toMatch(/^Ordre de tournage à établir/);
    // Référence NREL SPA : lever 05:46:56, coucher 21:57:51.
    expect(j.sun[0]!.line).toMatch(/^Lever 05:47 · coucher 21:58/);
    expect(j.equipment.map((x) => x.section)).toEqual(['Caméra', 'Optiques', 'Machinerie', 'Dépouillement']);
    const bytes = await buildWorkbook(m, BUILTIN_PRESETS[0]!.options, new Map());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toContain('Jours de tournage');
    const vals: unknown[] = [];
    wb.getWorksheet('Matériel')!.eachRow((r) => r.eachCell((c) => vals.push(c.value)));
    expect(vals).toContain('Optiques');
    expect(vals.some((v) => typeof v === 'string' && v.startsWith('300 mm'))).toBe(true);
    // Option décochée : pas de feuilles.
    const off = await buildWorkbook(m, { ...BUILTIN_PRESETS[0]!.options, days: false }, new Map());
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(off.buffer as ArrayBuffer);
    expect(wb2.worksheets.map((w) => w.name)).not.toContain('Jours de tournage');
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
    expect(values).toContain('COMMENTAIRES : Lumière du matin, rasante.');
    expect(values).toContain('SÉQUENCE 1 - EXT. QUAI DE GARE - JOUR.');
    // En-têtes du découpage technique et case Description regroupée.
    expect(values.slice(0, 7)).toEqual(['N°', 'PLAN', 'CAM', 'ACTION', 'SCÉNARIO', 'DESCRIPTION', 'RÉFÉRENCE']);
    expect(values).toContain('VALEUR: Ensemble\n\nAXE: Face\n\nANGLE: À niveau\n\nFOCALE: 32 mm\n\nMV: Fixe\n\nMACH: Branches');
    // Plan multicaméra : un bloc par caméra.
    expect(values.some((v) => typeof v === 'string' && v.startsWith('CAM A\n\nVALEUR: Taille') && v.includes('CAM B'))).toBe(true);
    // Couleur de la séquence selon l'effet (EXT jour : jaune pâle) et lignes assez hautes pour le texte.
    const band = ws.getRow(2).getCell(1);
    expect((band.fill as { fgColor: { argb: string } }).fgColor.argb).toBe('FFFFF2CC');
    expect(ws.getRow(3).height).toBeGreaterThan(80);
    expect(ws.getImages()).toHaveLength(1);
    const garde: unknown[] = [];
    wb.getWorksheet('Page de garde')!.eachRow((row) => row.eachCell((c) => garde.push(c.value)));
    expect(garde).toContain('Chef opérateur - A. R.');
    const bd: unknown[] = [];
    wb.getWorksheet('Dépouillement image')!.eachRow((row) => row.eachCell((c) => bd.push(c.value)));
    expect(bd).toContain('Soleil rasant, réflecteur');
    expect(bd).toContain('32, 75, 300 mm');
  });
});

describe('Excel sans colonne caméra, et mise en page « une colonne par réglage »', () => {
  it('colonne CAM désactivable', async () => {
    const m = buildExportModel(docWithImage(), { sequenceIds: [] });
    const bytes = await buildWorkbook(m, { ...BUILTIN_PRESETS[0]!.options, showCamera: false }, new Map());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const head: unknown[] = [];
    wb.getWorksheet('Découpage')!.getRow(1).eachCell((c) => head.push(c.value));
    expect(head).not.toContain('CAM');
  });
  it('liste : une colonne par réglage, lignes ajustées au texte', async () => {
    const d = produce(docWithImage(), (x) => void (x.sequences[0]!.plans[0]!.action = 'Une très longue action '.repeat(12)));
    const m = buildExportModel(d, { sequenceIds: [] });
    const opts = BUILTIN_PRESETS.find((p) => p.id === 'liste')!.options;
    const bytes = await buildWorkbook(m, opts, new Map());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const ws = wb.getWorksheet('Découpage')!;
    const head: unknown[] = [];
    ws.getRow(1).eachCell((c) => head.push(c.value));
    expect(head).toContain('VALEUR');
    expect(ws.getRow(3).height).toBeGreaterThan(60);
  });
});
