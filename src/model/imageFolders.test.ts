import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './defaults';
import { addFolder, childFolders, deleteFolder, folderLabel, imageCount, moveFolder, moveImages, renameFolder } from './imageFolders';
import { addToLibrary } from './library';
import { validateProject } from './schema';
import type { ProjectDoc } from './types';

const valid = (d: ProjectDoc) => validateProject(JSON.parse(JSON.stringify(d))).ok;

function setup() {
  let doc = addToLibrary(newProject('X'), [
    { file: 'images/a.jpg', originalName: 'a.jpg', hash: null },
    { file: 'images/b.jpg', originalName: 'b.jpg', hash: null },
    { file: 'images/c.jpg', originalName: 'c.jpg', hash: null },
  ]).doc;
  const rep = addFolder(doc, ' Repérages ', null);
  if (!rep.ok) throw new Error(rep.error);
  doc = rep.doc;
  const gare = addFolder(doc, 'Gare', rep.id!);
  if (!gare.ok) throw new Error(gare.error);
  doc = gare.doc;
  return { doc, rep: rep.id!, gare: gare.id! };
}

describe('dossiers de la bibliothèque', () => {
  it('crée des dossiers dans des dossiers ; nom unique dans un même dossier', () => {
    const { doc, rep, gare } = setup();
    expect(childFolders(doc, null).map((f) => f.name)).toEqual(['Repérages']);
    expect(childFolders(doc, rep).map((f) => f.id)).toEqual([gare]);
    expect(folderLabel(doc, gare)).toBe('Repérages › Gare');
    expect(addFolder(doc, 'repérages', null)).toMatchObject({ ok: false, error: expect.stringMatching(/existe déjà/) });
    expect(addFolder(doc, '   ', null).ok).toBe(false);
    // Même nom ailleurs : permis.
    expect(addFolder(doc, 'Gare', null).ok).toBe(true);
    expect(valid(doc)).toBe(true);
  });

  it('range des images (une image, un dossier) ; les nouvelles images vont dans le dossier ouvert', () => {
    const { doc: d0, rep, gare } = setup();
    const [a, b] = d0.library;
    const r = moveImages(d0, [a!.id, b!.id], gare);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.library.map((l) => l.folderId)).toEqual([gare, gare, null]);
    expect(imageCount(r.doc, rep)).toBe(2);
    expect(imageCount(r.doc, gare)).toBe(2);
    expect(imageCount(r.doc, null)).toBe(3);
    const added = addToLibrary(r.doc, [{ file: 'images/d.jpg', originalName: 'd.jpg', hash: null }], rep).doc;
    expect(added.library.at(-1)!.folderId).toBe(rep);
    expect(moveImages(r.doc, [a!.id], 'inconnu').ok).toBe(false);
    expect(valid(r.doc)).toBe(true);
  });

  it('déplace et renomme ; jamais un dossier dans lui-même', () => {
    const { doc, rep, gare } = setup();
    expect(moveFolder(doc, rep, gare)).toMatchObject({ ok: false, error: expect.stringMatching(/lui-même/) });
    expect(moveFolder(doc, rep, rep).ok).toBe(false);
    const m = moveFolder(doc, gare, null);
    expect(m.ok && childFolders(m.doc, null).map((f) => f.name)).toEqual(['Gare', 'Repérages']);
    const n = renameFolder(doc, gare, 'Quai');
    expect(n.ok && folderLabel(n.doc, gare)).toBe('Repérages › Quai');
    expect(renameFolder(doc, gare, '').ok).toBe(false);
  });

  it('supprimer un dossier ne supprime aucune image : tout remonte d’un cran', () => {
    const { doc: d0, rep, gare } = setup();
    const r = moveImages(d0, [d0.library[0]!.id], gare);
    if (!r.ok) throw new Error();
    const del = deleteFolder(r.doc, rep);
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    expect(del.doc.library).toHaveLength(3);
    expect(del.doc.imageFolders).toEqual([{ id: gare, name: 'Gare', parentId: null }]);
    expect(del.doc.library[0]!.folderId).toBe(gare);
    const del2 = deleteFolder(del.doc, gare);
    expect(del2.ok && del2.doc.library.every((l) => l.folderId === null)).toBe(true);
    expect(valid(del.doc)).toBe(true);
    // Sous-dossier qui remonterait sur un nom déjà pris : refusé, rien n'est changé.
    const clash = addFolder(r.doc, 'Gare', null);
    if (!clash.ok) throw new Error();
    expect(deleteFolder(clash.doc, rep)).toMatchObject({ ok: false });
  });

  it('fichier incohérent : dossier absent, boucle', () => {
    const { doc, rep, gare } = setup();
    expect(valid(produce(doc, (d) => void (d.library[0]!.folderId = 'absent')))).toBe(false);
    expect(valid(produce(doc, (d) => void (d.imageFolders.find((f) => f.id === rep)!.parentId = gare)))).toBe(false);
    expect(valid(produce(doc, (d) => void (d.imageFolders.find((f) => f.id === gare)!.parentId = 'absent')))).toBe(false);
  });
});
