/** Projet d'exemple (contenu fictif) pour découvrir l'application. */
import type { CameraSetup, Framing, Note, Plan, ProjectDoc, Sequence } from './types';
import { defaultSettings, newId } from './defaults';
import { addCameraToPlan } from './ops';
import { SCHEMA_VERSION } from './types';

function f(size: string, axis: string, angle: string, tiltDeg: number | null, focalMm: number | null): Framing {
  return { size, axis, angle, tiltDeg, focalMm };
}

/** Exemple avec une deuxième caméra (B) sur le plan 2/2 : pour les tests du multicaméra. */
export function sampleProjectMultiCam(): ProjectDoc {
  const d = sampleProject();
  return addCameraToPlan(d, d.sequences[1]!.plans[1]!.id).doc;
}

export function sampleProject(): ProjectDoc {
  const settings = defaultSettings();
  const A = settings.cameras[0]!;
  A.body = '';
  A.mode = '';
  A.sensorWidthMm = null;
  settings.terms.grip.push('Colonnettes');

  const cs = (start: Framing, movements: string[], grip: string[], end: Framing | null = null, cameraId = A.id): CameraSetup => ({
    id: newId('cs'),
    cameraId,
    start,
    end,
    movements,
    grip,
  });
  const now = Date.now();
  const n = (text: string, done = false, daysAgo = 0): Note => ({ id: newId('nt'), text, createdAt: now - daysAgo * 86_400_000, done });
  const p = (action: string, scriptExcerpt: string, cameras: CameraSetup[], repriseOf: string | null = null, notes: Note[] = [], durationS: number | null = null): Plan => ({
    id: newId('pl'),
    repriseOf,
    action,
    scriptExcerpt,
    notes,
    durationS,
    cameras,
    images: [],
    coverImageId: null,
  });
  const s = (number: string, intExt: Sequence['intExt'], dayNight: Sequence['dayNight'], location: string, plans: Plan[], notes: Note[] = [], scriptText = ''): Sequence => ({
    id: newId('sq'),
    number,
    intExt,
    dayNight,
    location,
    address: '',
    gps: null,
    notes,
    scriptText,
    breakdown: { camera: '', grip: '', lighting: '', other: '' },
    shooting: null,
    plans,
  });

  const quai = p('Elle attend sur le quai, le train arrive.', 'LÉA (30) attend, seule sur le quai.', [cs(f('Ensemble', 'Face', 'À niveau', null, 32), ['Fixe'], ['Branches'])], null, [n('Autorisation de tournage en gare reçue', true, 3)], 8);
  const regard = p('Elle cherche quelqu’un du regard.', 'Elle scrute les fenêtres du train.', [cs(f('Poitrine', '3/4', 'À niveau', null, 75), ['Fixe'], ['Branches'])], null, [], 4);

  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('prj'),
    meta: { title: 'Exemple — Le Quai', director: '', production: '', aspectRatio: '1,85:1', crew: [] },
    settings,
    sequences: [
      s('1', 'EXT', 'JOUR', 'Quai de gare', [
        quai,
        regard,
        p('Le train entre en gare, crash zoom sur la porte.', 'Le train s’immobilise.', [
          cs(f('Général', 'Profil', 'À niveau', null, 75), ['Pan', 'Fixe'], ['Branches'], f('Poitrine', 'Profil', 'À niveau', null, 300)),
        ], null, [n('Essayer la vitesse du zoom au moteur', false, 1)], 6),
        p('Elle cherche quelqu’un du regard.', 'Elle scrute les fenêtres du train.', [cs(f('Poitrine', '3/4', 'À niveau', null, 75), ['Fixe'], ['Branches'])], regard.id),
      ], [n('Demander à la gare les horaires des trains', false, 2)], QUAI_SCENE),
      s('2', 'INT', 'JOUR', 'Wagon', [
        p('Travelling latéral le long des sièges vides.', 'Le wagon est presque vide.', [cs(f('Demi-ensemble', 'Profil', 'À niveau', null, 25), ['Trav latéral', 'Fixe'], ['Steadicam'])]),
        p('Il lit, ne la voit pas arriver.', 'MARC (35) lit, absorbé.', [cs(f('Taille', '3/4', 'Plongée', -10, 50), ['Fixe'], ['Épaule'])]),
      ]),
      s('3', 'INT', 'NUIT', 'Appartement de Léa', [
        p('Elle allume la lampe, la pièce se révèle.', 'Le noir. Une lampe s’allume.', [cs(f('Ensemble', 'Face', '', null, null), ['Fixe'], [])]),
      ]),
      s('4', 'EXT', 'NUIT', 'Rue', [p('', 'Ils marchent sans parler.', [cs(f('', '', '', null, null), [], [])])]),
    ],
    stamps: [],
    library: [],
    imageFolders: [],
    floorPlans: [],
    shootingDays: [],
  };
}

/** Texte de la scène 1 de l'exemple (fictif) : trois passages ne sont couverts par aucun plan. */
const QUAI_SCENE = `Un quai de gare, au petit matin. Le panneau annonce un retard.

LÉA (30) attend, seule sur le quai.

Au loin, un sifflet. Le train s’immobilise.

Elle scrute les fenêtres du train.

LÉA
Il n’est pas là.`;

/** Grand projet fictif (performances) : `sequences` séquences de `perSeq` plans. */
export function largeSampleProject(sequences = 30, perSeq = 12): ProjectDoc {
  const base = sampleProject();
  const proto = base.sequences[0]!;
  const out: Sequence[] = [];
  for (let i = 0; i < sequences; i++) {
    const src = base.sequences[i % base.sequences.length]!;
    out.push({
      ...src,
      id: newId('sq'),
      number: String(i + 1),
      plans: Array.from({ length: perSeq }, (_, k) => {
        const p = proto.plans[k % proto.plans.length]!;
        return { ...p, id: newId('pl'), repriseOf: null, notes: p.notes.map((x) => ({ ...x, id: newId('nt') })), cameras: p.cameras.map((c) => ({ ...c, id: newId('cs') })) };
      }),
      notes: src.notes.map((x) => ({ ...x, id: newId('nt') })),
    });
  }
  return { ...base, meta: { ...base.meta, title: 'Exemple — grand projet' }, sequences: out };
}
