/**
 * Intégration d'un scénario dans un projet.
 *
 * - Les scènes sont rapprochées des séquences par leur numéro (« 3A » = « 3a »).
 * - Une séquence existante n'est JAMAIS supprimée ni vidée de ses plans : si une scène a
 *   disparu du nouveau scénario, elle est seulement signalée.
 * - Pour une séquence existante, on met à jour le texte de la scène, et l'en-tête
 *   (INT/EXT, décor, effet) seulement si l'utilisateur le demande.
 */
import { produce } from 'immer';
import type { ProjectDoc, Sequence } from '../model/types';
import { newSequence } from '../model/defaults';
import { norm } from '../model/text';
import type { ScriptScene } from './fdx';

export type SceneStatus = 'new' | 'changed' | 'same';

export interface SceneChange {
  scene: ScriptScene;
  status: SceneStatus;
  /** Séquence existante correspondante. */
  sequenceId: string | null;
  /** Ce qui change (pour l'aperçu). */
  details: string[];
}

export interface ImportPlan {
  changes: SceneChange[];
  /** Séquences du projet absentes du scénario (jamais supprimées). */
  absent: { id: string; number: string; location: string }[];
  /** Numéros de scène en double dans le scénario. */
  duplicates: string[];
}

const key = (n: string) => norm(n).replace(/\s+/g, '');

export function planImport(doc: ProjectDoc, scenes: ScriptScene[]): ImportPlan {
  const byNum = new Map(doc.sequences.map((s) => [key(s.number), s]));
  const seen = new Map<string, number>();
  for (const sc of scenes) seen.set(key(sc.number), (seen.get(key(sc.number)) ?? 0) + 1);
  const duplicates = [...seen].filter(([, n]) => n > 1).map(([k]) => scenes.find((s) => key(s.number) === k)!.number);

  const changes = scenes.map((scene): SceneChange => {
    const seq = byNum.get(key(scene.number));
    if (!seq) return { scene, status: 'new', sequenceId: null, details: [] };
    const details: string[] = [];
    if (seq.intExt !== scene.parsed.intExt) details.push(`${seq.intExt} → ${scene.parsed.intExt}`);
    if (seq.dayNight !== scene.parsed.dayNight) details.push(`${seq.dayNight} → ${scene.parsed.dayNight}`);
    if (norm(seq.location) !== norm(scene.location)) details.push(`décor : « ${seq.location || '—'} » → « ${scene.location} »`);
    if (seq.scriptText.trim() !== scene.text.trim()) details.push(seq.scriptText ? 'texte de la scène modifié' : 'texte de la scène ajouté');
    return { scene, status: details.length ? 'changed' : 'same', sequenceId: seq.id, details };
  });
  const inScript = new Set(scenes.map((s) => key(s.number)));
  const absent = doc.sequences.filter((s) => !inScript.has(key(s.number))).map((s) => ({ id: s.id, number: s.number, location: s.location }));
  return { changes, absent, duplicates };
}

export interface ApplyOptions {
  /** Numéros des scènes à intégrer (les autres sont ignorées). */
  include: Set<string>;
  /** Mettre aussi à jour INT/EXT, décor et effet des séquences existantes. */
  updateHeadings: boolean;
}

function fillFromScene(s: Sequence, sc: ScriptScene, headings: boolean) {
  if (headings) {
    s.intExt = sc.parsed.intExt;
    s.dayNight = sc.parsed.dayNight;
    s.location = sc.location;
  }
  s.scriptText = sc.text;
}

/** Applique l'import. Les nouvelles séquences sont placées dans l'ordre du scénario. */
export function applyImport(doc: ProjectDoc, plan: ImportPlan, opts: ApplyOptions): { doc: ProjectDoc; added: number; updated: number } {
  let added = 0;
  let updated = 0;
  const camId = doc.settings.cameras[0]!.id;
  const next = produce(doc, (d) => {
    let lastSeqId: string | null = null;
    for (const ch of plan.changes) {
      const included = opts.include.has(ch.scene.number);
      if (ch.sequenceId) {
        const s = d.sequences.find((x) => x.id === ch.sequenceId)!;
        if (included && ch.status === 'changed') {
          fillFromScene(s, ch.scene, opts.updateHeadings);
          updated++;
        }
        lastSeqId = s.id;
        continue;
      }
      if (!included) continue;
      const s = newSequence(ch.scene.number, camId);
      fillFromScene(s, ch.scene, true);
      const at = lastSeqId ? d.sequences.findIndex((x) => x.id === lastSeqId) + 1 : 0;
      d.sequences.splice(at, 0, s);
      lastSeqId = s.id;
      added++;
    }
  });
  return { doc: next, added, updated };
}
