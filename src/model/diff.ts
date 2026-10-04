/**
 * Comparaison de deux états du projet (une version et l'état actuel, ou deux versions) :
 * ce qui a été ajouté, retiré ou modifié, séquence par séquence et plan par plan.
 * Les plans sont suivis par leur identifiant : un plan renuméroté reste « le même plan ».
 */
import type { CameraSetup, Plan, ProjectDoc, Sequence } from './types';
import { computeNumbers } from './numbering';
import { displayText } from './entry';
import { sequenceTitle } from '../ui/strip';

interface FieldChange {
  label: string;
  from: string;
  to: string;
}

interface PlanDiff {
  id: string;
  /** Numéro dans l'état le plus récent (ou dans l'ancien pour un plan retiré). */
  code: string;
  /** Ancien numéro, s'il a changé. */
  oldCode: string | null;
  status: 'added' | 'removed' | 'changed';
  changes: FieldChange[];
}

interface SequenceDiff {
  id: string;
  number: string;
  title: string;
  status: 'added' | 'removed' | 'changed';
  changes: FieldChange[];
  plans: PlanDiff[];
}

export interface DocDiff {
  sequences: SequenceDiff[];
  counts: { added: number; removed: number; changed: number };
  /** Autres changements (titre, réglages, plans au sol). */
  other: string[];
}

const TECH = ['size', 'axis', 'angle', 'focal', 'movement', 'grip'] as const;
const TECH_LABEL: Record<(typeof TECH)[number], string> = { size: 'Valeur', axis: 'Axe', angle: 'Angle', focal: 'Focale', movement: 'Mouvement', grip: 'Machinerie' };

function setupText(doc: ProjectDoc, s: CameraSetup, multi: boolean): Record<string, string> {
  const cam = doc.settings.cameras.find((c) => c.id === s.cameraId)?.label ?? '?';
  const out: Record<string, string> = {};
  for (const f of TECH) out[`${multi ? `Cam ${cam} · ` : ''}${TECH_LABEL[f]}`] = displayText(f, s);
  return out;
}

function planFields(doc: ProjectDoc, p: Plan): Record<string, string> {
  const multi = p.cameras.length > 1;
  const out: Record<string, string> = { Action: p.action, Scénario: p.scriptExcerpt, Divers: p.notes, Caméras: p.cameras.map((c) => doc.settings.cameras.find((k) => k.id === c.cameraId)?.label ?? '?').join(' + ') };
  for (const s of p.cameras) Object.assign(out, setupText(doc, s, multi));
  out.Images = String(p.images.length);
  return out;
}

function seqFields(s: Sequence): Record<string, string> {
  return { Numéro: s.number, 'INT/EXT': s.intExt, Effet: s.dayNight, Décor: s.location, Adresse: s.address, 'Position GPS': s.gps ? `${s.gps.lat.toFixed(5)}, ${s.gps.lon.toFixed(5)}` : '', Commentaires: s.comments };
}

function changesOf(a: Record<string, string>, b: Record<string, string>): FieldChange[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.filter((k) => (a[k] ?? '') !== (b[k] ?? '')).map((k) => ({ label: k, from: a[k] ?? '', to: b[k] ?? '' }));
}

/** Ce qui change pour passer de `before` à `after`. */
export function compareDocs(before: ProjectDoc, after: ProjectDoc): DocDiff {
  const nb = computeNumbers(before);
  const na = computeNumbers(after);
  const bSeq = new Map(before.sequences.map((s) => [s.id, s]));
  const aSeq = new Map(after.sequences.map((s) => [s.id, s]));
  const bPlan = new Map(before.sequences.flatMap((s) => s.plans.map((p) => [p.id, p] as const)));
  const counts = { added: 0, removed: 0, changed: 0 };
  const sequences: SequenceDiff[] = [];

  for (const s of after.sequences) {
    const old = bSeq.get(s.id);
    const plans: PlanDiff[] = [];
    for (const p of s.plans) {
      const op = bPlan.get(p.id);
      const code = na.get(p.id)?.code ?? '?';
      if (!op) {
        plans.push({ id: p.id, code, oldCode: null, status: 'added', changes: [] });
        counts.added++;
        continue;
      }
      const ch = changesOf(planFields(before, op), planFields(after, p));
      const oldCode = nb.get(p.id)?.code ?? null;
      if (ch.length || (oldCode && oldCode !== code)) {
        plans.push({ id: p.id, code, oldCode: oldCode !== code ? oldCode : null, status: 'changed', changes: ch });
        if (ch.length) counts.changed++;
      }
    }
    // Plans retirés de cette séquence (ou déplacés ailleurs : ils apparaissent alors comme modifiés là-bas).
    const afterIds = new Set(after.sequences.flatMap((x) => x.plans.map((p) => p.id)));
    if (old)
      for (const p of old.plans)
        if (!afterIds.has(p.id)) {
          plans.push({ id: p.id, code: nb.get(p.id)?.code ?? '?', oldCode: null, status: 'removed', changes: [] });
          counts.removed++;
        }
    const sch = old ? changesOf(seqFields(old), seqFields(s)) : [];
    if (!old || sch.length || plans.length) sequences.push({ id: s.id, number: s.number, title: sequenceTitle(s), status: old ? 'changed' : 'added', changes: sch, plans });
  }
  for (const s of before.sequences)
    if (!aSeq.has(s.id)) {
      sequences.push({ id: s.id, number: s.number, title: sequenceTitle(s), status: 'removed', changes: [], plans: s.plans.map((p) => ({ id: p.id, code: nb.get(p.id)?.code ?? '?', oldCode: null, status: 'removed' as const, changes: [] })) });
      counts.removed += s.plans.length;
    }

  const other: string[] = [];
  if (before.meta.title !== after.meta.title) other.push(`Titre : « ${before.meta.title} » → « ${after.meta.title} »`);
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) other.push('Réglages du projet modifiés (caméras, listes de termes ou champs obligatoires)');
  if (JSON.stringify(before.floorPlans) !== JSON.stringify(after.floorPlans)) other.push('Plans au sol modifiés');
  if (JSON.stringify(before.stamps ?? []) !== JSON.stringify(after.stamps ?? [])) {
    const list = (d: ProjectDoc) => (d.stamps ?? []).map((t) => t.text.trim() || 'sans texte').join(', ') || 'aucun';
    other.push(`Tampons modifiés (avant : ${list(before)} ; après : ${list(after)})`);
  }
  if (JSON.stringify(before.shootingDays) !== JSON.stringify(after.shootingDays)) other.push('Jours de tournage modifiés');
  if (JSON.stringify(before.meta.crew) !== JSON.stringify(after.meta.crew) || before.meta.director !== after.meta.director || before.meta.production !== after.meta.production || before.meta.aspectRatio !== after.meta.aspectRatio)
    other.push('Informations du projet modifiées (équipe, réalisation, production ou ratio)');
  return { sequences, counts, other };
}
