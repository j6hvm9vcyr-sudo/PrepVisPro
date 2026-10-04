/**
 * Plans types : les réglages caméra qu'on emploie souvent (« Poitrine · 3/4 · 50 mm · Fixe ·
 * Branches »), enregistrés depuis un plan et appliqués en un clic à un autre. Le plan type n'a pas
 * de nom à inventer : son nom est le résumé de ses réglages.
 */
import { produce } from 'immer';
import { newId } from './defaults';
import { displayText } from './entry';
import type { CameraSetup, Id, ProjectDoc, ShotPreset } from './types';

const FIELDS = ['size', 'axis', 'angle', 'focal', 'movement', 'grip'] as const;

function asSetup(p: ShotPreset): CameraSetup {
  return { id: '', cameraId: '', start: p.start, end: p.end, movements: p.movements, grip: p.grip };
}

/** Résumé lisible (sert de nom). */
export function presetLabel(p: ShotPreset): string {
  return FIELDS.map((f) => displayText(f, asSetup(p))).filter(Boolean).join(' · ') || 'Réglages vides';
}

function key(p: Pick<ShotPreset, 'start' | 'end' | 'movements' | 'grip'>): string {
  return JSON.stringify([p.start, p.end, p.movements, p.grip]);
}

/** Le réglage est-il vide (rien à enregistrer) ? */
export function emptySetup(s: CameraSetup): boolean {
  return FIELDS.every((f) => !displayText(f, s));
}

/** Enregistre les réglages d'une caméra comme plan type (sans doublon). */
export function savePreset(doc: ProjectDoc, setup: CameraSetup): { doc: ProjectDoc; added: boolean } {
  const k = key(setup);
  if (emptySetup(setup) || doc.settings.shotPresets.some((p) => key(p) === k)) return { doc, added: false };
  const preset: ShotPreset = { id: newId('pt'), start: structuredClone(setup.start), end: setup.end ? structuredClone(setup.end) : null, movements: [...setup.movements], grip: [...setup.grip] };
  return { doc: produce(doc, (d) => void d.settings.shotPresets.push(preset)), added: true };
}

export function removePreset(doc: ProjectDoc, id: Id): ProjectDoc {
  return produce(doc, (d) => void (d.settings.shotPresets = d.settings.shotPresets.filter((p) => p.id !== id)));
}

/** Réglages d'une caméra remplacés par ceux du plan type (la caméra reste la même). */
export function applyPreset(setup: CameraSetup, p: ShotPreset): CameraSetup {
  return { ...setup, start: structuredClone(p.start), end: p.end ? structuredClone(p.end) : null, movements: [...p.movements], grip: [...p.grip] };
}

/** Ce réglage correspond-il déjà à un plan type ? */
export function matchingPreset(doc: ProjectDoc, setup: CameraSetup): ShotPreset | null {
  const k = key(setup);
  return doc.settings.shotPresets.find((p) => key(p) === k) ?? null;
}
