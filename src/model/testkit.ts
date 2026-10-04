/** Aides pour construire des documents de test lisibles. */
import type { CameraSetup, Framing, Plan, ProjectDoc, Sequence } from './types';
import { defaultSettings, emptyFraming } from './defaults';
import { SCHEMA_VERSION } from './types';

let n = 0;
const uid = (p: string) => `${p}${++n}`;

export function fr(partial: Partial<Framing> = {}): Framing {
  return { ...emptyFraming(), ...partial };
}

export function setup(camId: string, partial: Partial<CameraSetup> = {}): CameraSetup {
  return { id: uid('cs'), cameraId: camId, start: fr(), end: null, movements: [], grip: [], ...partial };
}

export function plan(camId: string, partial: Partial<Plan> = {}): Plan {
  return {
    id: uid('p'),
    repriseOf: null,
    action: '',
    scriptExcerpt: '',
    notes: '',
    cameras: [setup(camId)],
    images: [],
    coverImageId: null,
    ...partial,
  };
}

export function seq(number: string, plans: Plan[], partial: Partial<Sequence> = {}): Sequence {
  return { id: uid('s'), number, intExt: 'INT', dayNight: 'JOUR', location: '', address: '', comments: '', scriptText: '', breakdown: { camera: '', grip: '', lighting: '', other: '' }, plans, ...partial };
}

export function doc(build: (camId: string) => Sequence[]): ProjectDoc {
  const settings = defaultSettings();
  const camId = settings.cameras[0]!.id;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'prj',
    meta: { title: 'Test', director: '', production: '', aspectRatio: '', crew: [] },
    settings,
    sequences: build(camId),
    floorPlans: [],
  };
}
