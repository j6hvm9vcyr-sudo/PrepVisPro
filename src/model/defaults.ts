import type { Breakdown, CameraSetup, Framing, Id, Plan, ProjectCamera, ProjectDoc, ProjectSettings, Sequence, TermCategory } from './types';
import { SCHEMA_VERSION } from './types';

export const DEFAULT_TERMS: Record<TermCategory, string[]> = {
  size: ['TGP', 'GP', 'Poitrine', 'Taille', 'Américain', 'Italien', 'Moyen', 'Demi-ensemble', 'Ensemble', 'Général', 'Insert'],
  axis: ['Face', '3/4', 'Profil', '3/4 dos', 'Dos'],
  angle: ['Plongée', 'CP', 'Zénithal', 'À niveau'],
  movement: ['Fixe', 'Pan', 'Tilt', 'Trav avant', 'Trav arrière', 'Trav latéral'],
  grip: ['Branches', 'Épaule', 'Rail', 'Dolly', 'Steadicam'],
};

/** Synonymes reconnus à la saisie (comparés sans accents ni majuscules). */
export const TERM_ALIASES: Record<string, string[]> = {
  CP: ['contre-plongee', 'contre plongee', 'contreplongee'],
  'À niveau': ['niveau'],
  'Trav avant': ['trav av', 'travelling avant'],
  'Trav arrière': ['trav arr', 'travelling arriere'],
  'Trav latéral': ['trav lat', 'travelling lateral'],
  Steadicam: ['stead'],
  '3/4 dos': ['3/4dos'],
};

let counter = 0;
/** Identifiant unique, stable, sans dépendance. */
export function newId(prefix = 'id'): Id {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function emptyBreakdown(): Breakdown {
  return { camera: '', grip: '', lighting: '', other: '' };
}

export function emptyFraming(): Framing {
  return { size: '', axis: '', angle: '', tiltDeg: null, focalMm: null };
}

export function newCameraSetup(cameraId: Id): CameraSetup {
  return { id: newId('cs'), cameraId, start: emptyFraming(), end: null, movements: [], grip: [] };
}

export function newPlan(cameraId: Id): Plan {
  return {
    id: newId('pl'),
    repriseOf: null,
    action: '',
    scriptExcerpt: '',
    notes: '',
    cameras: [newCameraSetup(cameraId)],
    images: [],
    coverImageId: null,
  };
}

export function newSequence(number: string, cameraId: Id): Sequence {
  return {
    id: newId('sq'),
    number,
    intExt: 'INT',
    dayNight: 'JOUR',
    location: '',
    address: '',
    comments: '',
    scriptText: '',
    breakdown: emptyBreakdown(),
    plans: [newPlan(cameraId)],
    shooting: null,
  };
}

export function newProjectCamera(label: string): ProjectCamera {
  return { id: newId('cam'), label, body: '', mode: '', sensorWidthMm: null, sensorHeightMm: null, squeeze: 1 };
}

export function defaultSettings(): ProjectSettings {
  return {
    terms: structuredClone(DEFAULT_TERMS),
    required: { action: true, size: true, axis: true, angle: true, focal: true, movement: true, grip: true },
    cameras: [newProjectCamera('A')],
    lenses: [],
    fixtures: [],
    exposure: { iso: 800, fps: 24, shutterDeg: 180 },
    reflectors: [],
  };
}

export function newProject(title = 'Sans titre'): ProjectDoc {
  const settings = defaultSettings();
  const cam = settings.cameras[0]!;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('prj'),
    meta: { title, director: '', production: '', aspectRatio: '', crew: [] },
    settings,
    sequences: [newSequence('1', cam.id)],
    floorPlans: [],
  };
}
