/**
 * Bibliothèque d'images du projet.
 *
 * Une image n'est importée qu'une fois (même contenu = même fichier, reconnu à son empreinte
 * SHA-256), puis réutilisée : repérage ou référence de plusieurs plans, fond de plan au sol.
 * Les plans gardent un lien vers le fichier : rien n'est copié, et une image utilisée ne peut
 * pas être retirée de la bibliothèque.
 */
import { produce } from 'immer';
import type { Id, ImageKind, LibraryImage, ProjectDoc } from './types';
import { newId } from './defaults';
import { computeNumbers } from './numbering';

/** Ajoute à la bibliothèque les images utilisées qui n'y figurent pas encore (filet de sécurité). */
export function syncLibrary(doc: ProjectDoc): ProjectDoc {
  const have = new Set(doc.library.map((l) => l.file));
  const missing: LibraryImage[] = [];
  const add = (file: string, originalName: string) => {
    if (have.has(file)) return;
    have.add(file);
    missing.push({ id: newId('lib'), file, originalName, caption: '', hash: null });
  };
  for (const s of doc.sequences) for (const p of s.plans) for (const i of p.images) add(i.file, i.originalName);
  for (const f of doc.floorPlans) if (f.background) add(f.background.file, f.background.originalName);
  if (!missing.length) return doc;
  return produce(doc, (d) => void d.library.push(...missing));
}

export interface StoredImageInfo {
  file: string;
  originalName: string;
  hash: string | null;
}

/**
 * Ajoute des images importées. Une image déjà présente (même empreinte ou même fichier) n'est pas
 * dupliquée : on renvoie l'entrée existante.
 */
export function addToLibrary(doc: ProjectDoc, images: StoredImageInfo[]): { doc: ProjectDoc; entries: LibraryImage[]; reused: number } {
  const entries: LibraryImage[] = [];
  const fresh: LibraryImage[] = [];
  let reused = 0;
  for (const im of images) {
    const known = [...doc.library, ...fresh].find((l) => l.file === im.file || (im.hash !== null && l.hash === im.hash));
    if (known) {
      if (!entries.includes(known)) entries.push(known);
      reused++;
      continue;
    }
    const e: LibraryImage = { id: newId('lib'), file: im.file, originalName: im.originalName, caption: '', hash: im.hash };
    fresh.push(e);
    entries.push(e);
  }
  const next = fresh.length ? produce(doc, (d) => void d.library.push(...fresh)) : doc;
  return { doc: next, entries, reused };
}

/** Empreintes connues → fichier (pour ne pas réécrire sur disque une image déjà importée). */
export function knownHashes(doc: ProjectDoc): Map<string, { file: string; originalName: string }> {
  return new Map(doc.library.filter((l) => l.hash).map((l) => [l.hash!, { file: l.file, originalName: l.originalName }]));
}

export interface ImageUsage {
  plans: { planId: Id; code: string; kind: ImageKind }[];
  floorPlans: { id: Id; name: string }[];
}

/** Où chaque fichier est utilisé (plans, fonds de plans au sol). */
export function libraryUsage(doc: ProjectDoc): Map<string, ImageUsage> {
  const numbers = computeNumbers(doc);
  const out = new Map<string, ImageUsage>();
  const get = (file: string) => {
    let u = out.get(file);
    if (!u) out.set(file, (u = { plans: [], floorPlans: [] }));
    return u;
  };
  for (const s of doc.sequences)
    for (const p of s.plans)
      for (const i of p.images) {
        const u = get(i.file);
        if (!u.plans.some((x) => x.planId === p.id && x.kind === i.kind)) u.plans.push({ planId: p.id, code: numbers.get(p.id)?.code ?? '?', kind: i.kind });
      }
  for (const f of doc.floorPlans) if (f.background) get(f.background.file).floorPlans.push({ id: f.id, name: f.name || 'Plan au sol' });
  return out;
}

export function isUsed(u: ImageUsage | undefined): boolean {
  return !!u && (u.plans.length > 0 || u.floorPlans.length > 0);
}

export type LibraryResult = { ok: true; doc: ProjectDoc } | { ok: false; error: string };

/** Retire une image de la bibliothèque — refusé tant qu'elle est utilisée. */
export function removeFromLibrary(doc: ProjectDoc, id: Id): LibraryResult {
  const l = doc.library.find((x) => x.id === id);
  if (!l) return { ok: false, error: 'Image introuvable dans la bibliothèque.' };
  const u = libraryUsage(doc).get(l.file);
  if (isUsed(u)) {
    const where = [...u!.plans.map((p) => `plan ${p.code}`), ...u!.floorPlans.map((f) => `plan au sol « ${f.name} »`)];
    return { ok: false, error: `Image utilisée (${where.slice(0, 4).join(', ')}${where.length > 4 ? '…' : ''}) : retirez-la d’abord de ces documents.` };
  }
  return { ok: true, doc: produce(doc, (d) => void (d.library = d.library.filter((x) => x.id !== id))) };
}

export function setLibraryCaption(doc: ProjectDoc, id: Id, caption: string): ProjectDoc {
  return produce(doc, (d) => {
    const l = d.library.find((x) => x.id === id);
    if (l) l.caption = caption;
  });
}

/**
 * Ajoute au plan des images de la bibliothèque (lien vers le même fichier, rien n'est copié).
 * Une image déjà présente dans le plan avec ce classement n'est pas ajoutée deux fois.
 */
export function addLibraryImagesToPlan(doc: ProjectDoc, planId: Id, ids: Id[], kind: ImageKind): { doc: ProjectDoc; added: number } {
  let added = 0;
  const next = produce(doc, (d) => {
    const plan = d.sequences.flatMap((s) => s.plans).find((p) => p.id === planId);
    if (!plan) return;
    for (const id of ids) {
      const l = d.library.find((x) => x.id === id);
      if (!l || plan.images.some((i) => i.file === l.file && i.kind === kind)) continue;
      plan.images.push({ id: newId('img'), kind, file: l.file, originalName: l.originalName, caption: '' });
      added++;
    }
  });
  return { doc: added ? next : doc, added };
}
