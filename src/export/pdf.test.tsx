// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToBuffer } from '@react-pdf/renderer';
import { produce } from 'immer';
import { DecoupagePdf, registerPdfFonts, type PdfImage } from './pdf';
import { BUILTIN_PRESETS, buildExportModel } from './model';
import { sampleProjectMultiCam as sampleProject } from '../model/sample';
import { PNG_160x90_B64 } from '../test/fixtures';

const F = (n: string) => resolve('src/assets/fonts', n);
registerPdfFonts({ sansRegular: F('IBMPlexSans-Regular.woff'), sansSemiBold: F('IBMPlexSans-SemiBold.woff'), sansBold: F('IBMPlexSans-Bold.woff'), monoRegular: F('IBMPlexMono-Regular.woff'), monoSemiBold: F('IBMPlexMono-SemiBold.woff') });

const PNG = `data:image/png;base64,${PNG_160x90_B64}`;

describe('PDF', () => {
  it('produit un PDF valide pour chaque modèle, y compris un long projet', async () => {
    const d = produce(sampleProject(), (x) => {
      x.sequences[0]!.plans[0]!.images.push({ id: 'i', kind: 'scouting', file: 'images/a.png', originalName: '', caption: '' });
      x.sequences[0]!.comments = 'Commentaire de séquence — « guillemets », œ, →.';
      x.sequences[0]!.address = "93 Rue Villiers de l'Isle Adam 75020";
      x.sequences[0]!.shooting = { installations: [{ id: 'i1', name: 'Champ 1', note: 'Contre-jour, réflecteur', planIds: x.sequences[0]!.plans.slice(0, 2).map((p) => p.id) }] };
      x.meta.crew.push({ id: 'c', role: 'Chef opérateur', name: 'A. R.' });
      x.sequences[0]!.gps = { lat: 48.8566, lon: 2.3522 };
      x.settings.timeZone = 'Europe/Paris';
      x.shootingDays.push({ id: 'j1', date: '2026-11-03', sequenceIds: [x.sequences[0]!.id, x.sequences[1]!.id], note: 'Départ 7 h, gare de Lyon.' }, { id: 'j2', date: null, sequenceIds: [], note: '' });
      // Projet long : 120 plans de plus.
      for (let i = 0; i < 120; i++) x.sequences[1]!.plans.push({ ...JSON.parse(JSON.stringify(x.sequences[1]!.plans[0]!)), id: `x${i}`, cameras: x.sequences[1]!.plans[0]!.cameras.map((c, k) => ({ ...c, id: `x${i}c${k}` })) });
    });
    const images = new Map<string, PdfImage>([['images/a.png', { dataUrl: PNG, width: 160, height: 90 }]]);
    mkdirSync('test-results', { recursive: true });
    for (const preset of BUILTIN_PRESETS) {
      const m = buildExportModel(d, preset.options);
      const buf = await renderToBuffer(<DecoupagePdf m={m} opts={{ ...preset.options, markIncomplete: true }} images={images} />);
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buf.length).toBeGreaterThan(5000);
      writeFileSync(`test-results/export-${preset.id}.pdf`, buf);
    }
  }, 60_000);
});
