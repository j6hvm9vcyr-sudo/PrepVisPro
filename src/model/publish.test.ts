import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './defaults';
import { newFloorPlan } from './floorOps';
import { baseNameOf, cleanBaseName, filesToPublish, joinPath, publicationLabel, publishFileName } from './publish';
import { compareDocs } from './diff';

describe('Publier', () => {
  it('noms fixes : d’après le titre, puis ceux de la première publication même si le titre change', () => {
    const doc = newProject('Le Quai : v2 / final');
    expect(cleanBaseName(doc.meta.title)).toBe('Le Quai - v2 - final');
    expect(publishFileName(baseNameOf(doc), 'pdf')).toBe('Le Quai - v2 - final — découpage.pdf');
    const published = produce(doc, (d) => {
      d.settings.publish.baseName = 'Le Quai';
      d.meta.title = 'Le Grand Quai';
    });
    expect(publishFileName(baseNameOf(published), 'xlsx')).toBe('Le Quai — découpage.xlsx');
    expect(publishFileName('Le Quai', 'floors')).toBe('Le Quai — plans au sol.pdf');
    expect(publishFileName('Le Quai', 'csv')).toBe('Le Quai — liste des plans.csv');
    expect(cleanBaseName('   ')).toBe('Projet');
  });

  it('fichiers à écrire : ceux cochés, sans PDF des plans au sol s’il n’y en a pas', () => {
    const doc = newProject('X');
    expect(filesToPublish(doc)).toEqual(['pdf', 'xlsx', 'html']);
    const withFloor = produce(doc, (d) => {
      d.floorPlans.push(newFloorPlan('Séq. 1', [d.sequences[0]!.id]));
      d.settings.publish.files = ['csv', 'floors', 'pdf'];
    });
    expect(filesToPublish(withFloor)).toEqual(['pdf', 'floors', 'csv']);
  });

  it('libellé écrit dans les documents ; chemin dans le dossier', () => {
    expect(publicationLabel(3, Date.UTC(2026, 9, 12, 12))).toBe('Publication 3 · révision rose · 12 octobre 2026');
    expect(joinPath('/Users/a/Google Drive/Le Quai/', 'Le Quai — découpage.pdf')).toBe('/Users/a/Google Drive/Le Quai/Le Quai — découpage.pdf');
    expect(joinPath('C:\\Drive\\Quai', 'a.pdf')).toBe('C:\\Drive\\Quai\\a.pdf');
  });

  it('changer les réglages de Publier n’est pas un changement du contenu publié', () => {
    const doc = newProject('X');
    const after = produce(doc, (d) => {
      d.settings.publish.files = ['csv'];
      d.settings.publish.baseName = 'X';
    });
    const diff = compareDocs(doc, after);
    expect(diff.other).toEqual([]);
    expect(diff.sequences).toEqual([]);
  });
});

describe('publications comptées par les versions', () => {
  it('« Publication N » seulement', async () => {
    const { publicationNumber } = await import('./publish');
    expect(publicationNumber('Publication 12')).toBe(12);
    expect(publicationNumber('Publication 1 bis')).toBeNull();
    expect(publicationNumber('V1 réalisation')).toBeNull();
  });
});
