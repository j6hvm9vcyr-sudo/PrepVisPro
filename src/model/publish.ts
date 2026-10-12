/**
 * Publier (0.20) : les mêmes fichiers, réécrits à chaque publication dans le dossier de diffusion
 * (un dossier du drive de l'équipe : Google Drive, Dropbox, iCloud). Les noms ne changent jamais,
 * pour que les liens partagés restent bons ; « Publication N · date » est écrit dans chaque document.
 * Chaque publication est gardée dans les versions du projet, sous le nom « Publication N » : c'est
 * elle qui compte les publications (rien de plus dans le projet, et ⌘Z ne « dépublie » rien).
 */
import type { ProjectDoc, PublishFile, PublishSettings } from './types';

export function defaultPublish(): PublishSettings {
  return { files: ['pdf', 'xlsx', 'floors'], presetId: 'tableau', baseName: null };
}

export const PUBLISH_FILE_LABEL: Record<PublishFile, string> = { pdf: 'Découpage PDF', xlsx: 'Découpage Excel', floors: 'Plans au sol PDF', csv: 'Liste des plans CSV' };

const SUFFIX: Record<PublishFile, string> = { pdf: 'découpage.pdf', xlsx: 'découpage.xlsx', floors: 'plans au sol.pdf', csv: 'liste des plans.csv' };

/** Début des noms de fichiers d'après le titre (caractères refusés par les systèmes de fichiers remplacés). */
export function cleanBaseName(title: string): string {
  return (title || 'Projet').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Projet';
}

/** Début des noms : celui de la première publication, sinon d'après le titre actuel. */
export function baseNameOf(doc: ProjectDoc): string {
  return doc.settings.publish.baseName ?? cleanBaseName(doc.meta.title);
}

export function publishFileName(base: string, f: PublishFile): string {
  return `${base} — ${SUFFIX[f]}`;
}

/** « Publication 3 · 12 octobre 2026 », écrit dans les documents. */
export function publicationLabel(n: number, at: number): string {
  return `Publication ${n} · ${new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/** Nom de la version qui garde le projet tel qu'il a été publié. */
export function publicationVersionName(n: number): string {
  return `Publication ${n}`;
}

/** Fichiers à écrire, dans l'ordre (sans plan au sol, pas de PDF des plans au sol). */
export function filesToPublish(doc: ProjectDoc): PublishFile[] {
  const order: PublishFile[] = ['pdf', 'xlsx', 'floors', 'csv'];
  return order.filter((f) => doc.settings.publish.files.includes(f) && (f !== 'floors' || doc.floorPlans.length > 0));
}

/** Chemin d'un fichier dans le dossier (séparateur du dossier choisi). */
export function joinPath(folder: string, name: string): string {
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return folder.replace(/[\\/]+$/, '') + sep + name;
}

/** Numéro d'une version « Publication N », sinon null. */
export function publicationNumber(versionName: string): number | null {
  const m = /^Publication (\d+)$/.exec(versionName);
  return m ? Number(m[1]) : null;
}
