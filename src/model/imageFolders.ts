/**
 * Dossiers de la bibliothèque d'images, comme dans le Finder : une image est rangée dans un seul
 * dossier (ou à la racine) ; un dossier peut en contenir d'autres. Supprimer un dossier ne supprime
 * jamais d'image : son contenu remonte dans le dossier parent.
 */
import { produce } from 'immer';
import type { Id, ImageFolder, ProjectDoc } from './types';
import { newId } from './defaults';
import { norm } from './text';

export type FolderResult = { ok: true; doc: ProjectDoc; id?: Id } | { ok: false; error: string };

export function childFolders(doc: ProjectDoc, parentId: Id | null): ImageFolder[] {
  return doc.imageFolders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
}

/** Chemin d'un dossier, de la racine vers lui. */
export function folderPath(doc: ProjectDoc, id: Id | null): ImageFolder[] {
  const byId = new Map(doc.imageFolders.map((f) => [f.id, f]));
  const out: ImageFolder[] = [];
  for (let at = id === null ? undefined : byId.get(id); at && out.length <= doc.imageFolders.length; at = at.parentId === null ? undefined : byId.get(at.parentId)) out.unshift(at);
  return out;
}

export function folderLabel(doc: ProjectDoc, id: Id | null): string {
  return id === null ? 'Bibliothèque' : folderPath(doc, id).map((f) => f.name).join(' › ');
}

/** `id` est-il `ancestor` ou rangé dedans (même de loin) ? */
export function isInside(doc: ProjectDoc, id: Id, ancestor: Id): boolean {
  return folderPath(doc, id).some((f) => f.id === ancestor);
}

/** Nombre d'images d'un dossier, sous-dossiers compris. */
export function imageCount(doc: ProjectDoc, id: Id | null): number {
  if (id === null) return doc.library.length;
  return doc.library.filter((l) => l.folderId !== null && isInside(doc, l.folderId, id)).length;
}

function checkName(doc: ProjectDoc, name: string, parentId: Id | null, self: Id | null): string | null {
  const n = name.trim();
  if (!n) return 'Donnez un nom au dossier.';
  if (n.length > 80) return 'Nom trop long (80 caractères au plus).';
  if (doc.imageFolders.some((f) => f.id !== self && f.parentId === parentId && norm(f.name) === norm(n))) return `Un dossier « ${n} » existe déjà ici.`;
  return null;
}

function exists(doc: ProjectDoc, id: Id | null): boolean {
  return id === null || doc.imageFolders.some((f) => f.id === id);
}

export function addFolder(doc: ProjectDoc, name: string, parentId: Id | null): FolderResult {
  if (!exists(doc, parentId)) return { ok: false, error: 'Dossier introuvable.' };
  const err = checkName(doc, name, parentId, null);
  if (err) return { ok: false, error: err };
  const id = newId('dir');
  return { ok: true, id, doc: produce(doc, (d) => void d.imageFolders.push({ id, name: name.trim(), parentId })) };
}

export function renameFolder(doc: ProjectDoc, id: Id, name: string): FolderResult {
  const f = doc.imageFolders.find((x) => x.id === id);
  if (!f) return { ok: false, error: 'Dossier introuvable.' };
  const err = checkName(doc, name, f.parentId, id);
  if (err) return { ok: false, error: err };
  if (f.name === name.trim()) return { ok: true, doc };
  return { ok: true, doc: produce(doc, (d) => void (d.imageFolders.find((x) => x.id === id)!.name = name.trim())) };
}

/** Range un dossier dans un autre (ou à la racine) ; refusé dans lui-même ou si le nom y est pris. */
export function moveFolder(doc: ProjectDoc, id: Id, parentId: Id | null): FolderResult {
  const f = doc.imageFolders.find((x) => x.id === id);
  if (!f || !exists(doc, parentId)) return { ok: false, error: 'Dossier introuvable.' };
  if (f.parentId === parentId) return { ok: true, doc };
  if (parentId !== null && isInside(doc, parentId, id)) return { ok: false, error: `Impossible de ranger « ${f.name} » dans lui-même.` };
  const err = checkName(doc, f.name, parentId, id);
  if (err) return { ok: false, error: err };
  return { ok: true, doc: produce(doc, (d) => void (d.imageFolders.find((x) => x.id === id)!.parentId = parentId)) };
}

/** Supprime un dossier : ses images et ses sous-dossiers remontent dans le dossier parent (aucune image supprimée). */
export function deleteFolder(doc: ProjectDoc, id: Id): FolderResult {
  const f = doc.imageFolders.find((x) => x.id === id);
  if (!f) return { ok: false, error: 'Dossier introuvable.' };
  const up = f.parentId;
  // Un sous-dossier qui remonte ne doit pas prendre le nom d'un dossier déjà là.
  for (const c of doc.imageFolders.filter((x) => x.parentId === id)) {
    const clash = doc.imageFolders.find((x) => x.id !== id && x.parentId === up && norm(x.name) === norm(c.name));
    if (clash) return { ok: false, error: `« ${c.name} » existe déjà dans le dossier parent : renommez l’un des deux d’abord.` };
  }
  return {
    ok: true,
    doc: produce(doc, (d) => {
      for (const l of d.library) if (l.folderId === id) l.folderId = up;
      for (const x of d.imageFolders) if (x.parentId === id) x.parentId = up;
      d.imageFolders = d.imageFolders.filter((x) => x.id !== id);
    }),
  };
}

/** Range des images de la bibliothèque dans un dossier (null = racine). */
export function moveImages(doc: ProjectDoc, ids: Id[], folderId: Id | null): FolderResult {
  if (!exists(doc, folderId)) return { ok: false, error: 'Dossier introuvable.' };
  const set = new Set(ids);
  if (!doc.library.some((l) => set.has(l.id) && l.folderId !== folderId)) return { ok: true, doc };
  return {
    ok: true,
    doc: produce(doc, (d) => {
      for (const l of d.library) if (set.has(l.id)) l.folderId = folderId;
    }),
  };
}
