/**
 * Publier (0.20) : écrit les fichiers choisis dans le dossier de diffusion, toujours sous les mêmes
 * noms, puis garde le projet publié dans les versions (« Publication N »). Le dossier est propre à ce
 * Mac (préférences), les fichiers et le modèle d'export au projet.
 */
import { create } from 'zustand';
import { useApp } from './appStore';
import { selectDoc } from './store';
import { getPrefs, updatePrefs, usePrefs } from './prefs';
import { canKeepVersions, createVersion, listVersions, readVersion, VERSIONS_NEED_SAVE, type ProjectVersion } from './project';
import { getBackend } from '../platform/backend';
import { baseNameOf, filesToPublish, joinPath, publicationLabel, publicationNumber, publicationVersionName, publishFileName } from '../model/publish';
import { BUILTIN_PRESETS, tablePreset, type ExportPreset } from '../export/model';
import { projectPresets } from '../export/presets';
import type { ProjectDoc, PublishFile } from '../model/types';

/** La dernière publication : son numéro, sa date, le projet tel qu'il a été publié (pour dire ce qui a changé depuis). */
export interface LastPublication {
  n: number;
  at: number;
  doc: ProjectDoc | null;
}

export const usePublish = create<{ busy: boolean; step: string; last: LastPublication | null; projectId: string | null }>()(() => ({ busy: false, step: '', last: null, projectId: null }));

export function publishFolderOf(doc: ProjectDoc): string | null {
  return getPrefs().publishFolders[doc.id] ?? null;
}

export function usePublishFolder(): string | null {
  const id = useApp((s) => selectDoc(s).id);
  return usePrefs((s) => s.prefs.publishFolders[id] ?? null);
}

/** Modèles proposés pour le découpage publié. */
export function publishPresets(doc: ProjectDoc): ExportPreset[] {
  return [tablePreset(doc), ...BUILTIN_PRESETS, ...projectPresets(doc.settings.exportPresets)];
}

export function presetOf(doc: ProjectDoc): ExportPreset | null {
  return publishPresets(doc).find((p) => p.id === doc.settings.publish.presetId) ?? null;
}

/** Choisit le dossier de diffusion de ce projet, sur ce Mac. */
export async function chooseFolder(): Promise<boolean> {
  const backend = await getBackend();
  const p = await backend.pickFolder('Dossier de diffusion');
  if (!p) return false;
  const id = selectDoc(useApp.getState()).id;
  if (!updatePrefs((d) => void (d.publishFolders[id] = p))) {
    useApp.getState().setMessage('Préférences illisibles : le dossier ne peut pas être gardé (Préférences de l’app)', 'warn');
    return false;
  }
  return true;
}

function lastOf(versions: ProjectVersion[]): { n: number; v: ProjectVersion } | null {
  let best: { n: number; v: ProjectVersion } | null = null;
  for (const v of versions) {
    const n = publicationNumber(v.name);
    if (n !== null && (!best || n > best.n)) best = { n, v };
  }
  return best;
}

/** Relit la dernière publication (à l'ouverture du projet, après une publication). */
export async function loadLastPublication(): Promise<void> {
  const id = selectDoc(useApp.getState()).id;
  try {
    const last = lastOf(await listVersions());
    if (!last) {
      usePublish.setState({ last: null, projectId: id });
      return;
    }
    let doc: ProjectDoc | null = null;
    try {
      doc = await readVersion(last.v.file);
    } catch {
      doc = null;
    }
    usePublish.setState({ last: { n: last.n, at: last.v.createdAt, doc }, projectId: id });
  } catch {
    usePublish.setState({ last: null, projectId: id });
  }
}

export type PublishResult = { ok: true; n: number; files: string[]; warnings: string[] } | { ok: false; error: string; written: string[] };

/**
 * Publie : fabrique chaque fichier, l'écrit sur place dans le dossier de diffusion, puis garde le
 * projet dans les versions. Rien n'est gardé comme « publié » si un fichier n'a pas pu être écrit
 * (ceux déjà écrits sont dits).
 */
export async function publish(): Promise<PublishResult> {
  const st = useApp.getState();
  if (st.editing && !st.commitEdit('stay')) return { ok: false, error: 'Saisie en cours non valide', written: [] };
  const fail = (error: string, written: string[] = []): PublishResult => ({ ok: false, error, written });
  const before = selectDoc(useApp.getState());
  const folder = publishFolderOf(before);
  if (!folder) return fail('Choisissez d’abord le dossier de diffusion.');
  const preset = presetOf(before);
  const files = filesToPublish(before);
  if (!files.length) return fail('Aucun fichier à publier : cochez au moins un fichier.');
  if (files.some((f) => f !== 'floors') && !preset) return fail('Le modèle d’export choisi n’existe plus : choisissez-en un autre.');
  if (!(await canKeepVersions())) return fail(VERSIONS_NEED_SAVE);
  usePublish.setState({ busy: true, step: 'Préparation…' });
  const written: string[] = [];
  const warnings: string[] = [];
  try {
    const last = lastOf(await listVersions());
    const n = (last?.n ?? 0) + 1;
    // Première publication : les noms sont fixés (le titre peut changer ensuite, pas les liens).
    if (!before.settings.publish.baseName) useApp.getState().updateDoc((d) => void (d.settings.publish.baseName = baseNameOf(before)), undefined, undefined);
    const doc = selectDoc(useApp.getState());
    const base = baseNameOf(doc);
    const label = publicationLabel(n, Date.now());
    const { buildExport, buildFloorPdf } = await import('../export/service');
    const backend = await getBackend();
    for (const f of files) {
      const name = publishFileName(base, f);
      usePublish.setState({ step: name });
      const built = await buildFile(f, doc, preset, label, buildExport, buildFloorPdf);
      if (built.failedImages) warnings.push(`${name} : ${built.failedImages} image${built.failedImages > 1 ? 's' : ''} illisible${built.failedImages > 1 ? 's' : ''}`);
      if (built.failedFloors?.length) warnings.push(`${name} : plan au sol non dessiné (${built.failedFloors.join(', ')})`);
      await backend.publishWrite(joinPath(folder, name), built.bytes);
      written.push(name);
    }
    usePublish.setState({ step: 'Version…' });
    const v = await createVersion(publicationVersionName(n), `${written.length} fichier${written.length > 1 ? 's' : ''} dans ${folder}`, doc);
    usePublish.setState({ last: { n, at: v.createdAt, doc }, projectId: doc.id });
    return { ok: true, n, files: written, warnings };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), written);
  } finally {
    usePublish.setState({ busy: false, step: '' });
  }
}

async function buildFile(
  f: PublishFile,
  doc: ProjectDoc,
  preset: ExportPreset | null,
  label: string,
  buildExport: typeof import('../export/service').buildExport,
  buildFloorPdf: typeof import('../export/service').buildFloorPdf,
): Promise<{ bytes: Uint8Array; failedImages: number; failedFloors?: string[] }> {
  if (f === 'floors') return buildFloorPdf(doc, doc.floorPlans, undefined, label);
  return buildExport(doc, f, { ...preset!.options, sequenceIds: [] }, undefined, label);
}
