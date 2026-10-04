/** Opérations pures sur les plans au sol. */
import { produce, type Draft } from 'immer';
import type { Id, ProjectDoc } from './types';
import { DEFAULT_FOV_LENGTH_M, type FloorElement, type FloorPlan } from './floor';
import { newId } from './defaults';
import { computeNumbers } from './numbering';
import { displayText } from './entry';
import { locatePlan } from './ops';

export function newFloorPlan(name: string, sequenceIds: Id[]): FloorPlan {
  return { id: newId('fp'), name, sequenceIds, background: null, scale: null, elements: [], fovLengthM: DEFAULT_FOV_LENGTH_M, northDeg: null, sunAt: null };
}

export function addFloorPlan(doc: ProjectDoc, fp: FloorPlan): ProjectDoc {
  return produce(doc, (d) => {
    d.floorPlans.push(fp);
  });
}

export function updateFloorPlan(doc: ProjectDoc, fpId: Id, fn: (fp: Draft<FloorPlan>) => void): ProjectDoc {
  return produce(doc, (d) => {
    const fp = d.floorPlans.find((x) => x.id === fpId);
    if (!fp) throw new Error(`Plan au sol introuvable : ${fpId}`);
    fn(fp);
  });
}

export function deleteFloorPlan(doc: ProjectDoc, fpId: Id): ProjectDoc {
  return produce(doc, (d) => {
    d.floorPlans = d.floorPlans.filter((x) => x.id !== fpId);
  });
}

export function addElements(doc: ProjectDoc, fpId: Id, els: FloorElement[]): ProjectDoc {
  return updateFloorPlan(doc, fpId, (fp) => {
    fp.elements.push(...structuredClone(els));
  });
}

export function updateElement(doc: ProjectDoc, fpId: Id, elId: Id, fn: (e: Draft<FloorElement>) => void): ProjectDoc {
  return updateFloorPlan(doc, fpId, (fp) => {
    const e = fp.elements.find((x) => x.id === elId);
    if (e) fn(e);
  });
}

export function deleteElements(doc: ProjectDoc, fpId: Id, ids: Id[]): ProjectDoc {
  const set = new Set(ids);
  return updateFloorPlan(doc, fpId, (fp) => {
    fp.elements = fp.elements.filter((e) => !set.has(e.id));
  });
}

export function moveElements(doc: ProjectDoc, fpId: Id, ids: Id[], dx: number, dy: number): ProjectDoc {
  const set = new Set(ids);
  return updateFloorPlan(doc, fpId, (fp) => {
    for (const e of fp.elements)
      if (set.has(e.id)) {
        e.at.x += dx;
        e.at.y += dy;
        if ('path' in e) for (const p of e.path) {
          p.x += dx;
          p.y += dy;
        }
      }
  });
}

/** Ordre d'affichage : un élément passe au premier plan. */
export function bringToFront(doc: ProjectDoc, fpId: Id, elId: Id): ProjectDoc {
  return updateFloorPlan(doc, fpId, (fp) => {
    const i = fp.elements.findIndex((e) => e.id === elId);
    if (i >= 0 && i < fp.elements.length - 1) fp.elements.push(fp.elements.splice(i, 1)[0]!);
  });
}

/** Étiquette d'une caméra du plan au sol, toujours à jour avec le découpage : « 1/2 · 32 mm ». */
export function cameraLabel(doc: ProjectDoc, planId: Id | null, setupId: Id | null, numbers = computeNumbers(doc)): { code: string; detail: string; missing: boolean } {
  if (!planId) return { code: '?', detail: 'non reliée', missing: true };
  const loc = locatePlan(doc, planId);
  const setup = loc?.plan.cameras.find((c) => c.id === setupId) ?? loc?.plan.cameras[0];
  if (!loc || !setup) return { code: '?', detail: 'plan supprimé', missing: true };
  const multi = loc.plan.cameras.length > 1;
  const camLabel = doc.settings.cameras.find((k) => k.id === setup.cameraId)?.label ?? '';
  const code = (numbers.get(loc.plan.id)?.code ?? '?') + (multi ? ` ${camLabel}` : '');
  const focal = displayText('focal', setup);
  return { code, detail: focal || 'focale ?', missing: false };
}

/** Caméras du découpage (séquences du plan au sol) pas encore placées. */
export function unplacedSetups(doc: ProjectDoc, fp: FloorPlan): { planId: Id; setupId: Id }[] {
  const placed = new Set(fp.elements.filter((e) => e.kind === 'camera').map((e) => (e.kind === 'camera' ? `${e.planId}|${e.setupId}` : '')));
  const out: { planId: Id; setupId: Id }[] = [];
  for (const s of doc.sequences) {
    if (!fp.sequenceIds.includes(s.id)) continue;
    for (const p of s.plans) for (const c of p.cameras) if (!placed.has(`${p.id}|${c.id}`)) out.push({ planId: p.id, setupId: c.id });
  }
  return out;
}

/** Après suppression de plans, caméras ou séquences : on délie, sans rien effacer du plan au sol. */
export function cleanupFloorRefs(doc: ProjectDoc): ProjectDoc {
  const seqIds = new Set(doc.sequences.map((s) => s.id));
  const setups = new Set(doc.sequences.flatMap((s) => s.plans.flatMap((p) => p.cameras.map((c) => `${p.id}|${c.id}`))));
  const modes = new Map(doc.settings.fixtures.map((f) => [f.id, f.modes.length]));
  const badLight = (e: FloorElement) => e.kind === 'light' && e.fixtureId !== null && (!modes.has(e.fixtureId) || e.mode >= modes.get(e.fixtureId)!);
  const mats = new Set(doc.settings.reflectors.map((m) => m.id));
  const badRefl = (e: FloorElement) => e.kind === 'reflector' && e.materialId !== null && !mats.has(e.materialId);
  const needs = doc.floorPlans.some((fp) => fp.sequenceIds.some((id) => !seqIds.has(id)) || fp.elements.some((e) => (e.kind === 'camera' && e.planId && !setups.has(`${e.planId}|${e.setupId}`)) || badLight(e) || badRefl(e)));
  if (!needs) return doc;
  return produce(doc, (d) => {
    for (const fp of d.floorPlans) {
      fp.sequenceIds = fp.sequenceIds.filter((id) => seqIds.has(id));
      for (const e of fp.elements)
        if (e.kind === 'camera' && e.planId && !setups.has(`${e.planId}|${e.setupId}`)) {
          e.planId = null;
          e.setupId = null;
        }
      for (const e of fp.elements)
        if (e.kind === 'light' && e.fixtureId !== null) {
          // Modèle retiré du projet : le projecteur redevient « non défini » (aucun chiffre).
          if (!modes.has(e.fixtureId)) {
            e.fixtureId = null;
            e.mode = 0;
          } else if (e.mode >= modes.get(e.fixtureId)!) e.mode = 0;
        }
      // Matière retirée du projet : le réflecteur redevient « non défini ».
      for (const e of fp.elements) if (e.kind === 'reflector' && e.materialId !== null && !mats.has(e.materialId)) e.materialId = null;
    }
  });
}
