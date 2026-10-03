/** Projet d'exemple (contenu fictif) pour découvrir l'application. */
import type { CameraSetup, Framing, Plan, ProjectDoc, Sequence } from './types';
import { defaultSettings, newId, newProjectCamera } from './defaults';
import { SCHEMA_VERSION } from './types';

function f(size: string, axis: string, angle: string, tiltDeg: number | null, focalMm: number | null): Framing {
  return { size, axis, angle, tiltDeg, focalMm };
}

export function sampleProject(): ProjectDoc {
  const settings = defaultSettings();
  const A = settings.cameras[0]!;
  A.body = 'Caméra A';
  A.mode = 'Super 35 (exemple)';
  A.sensorWidthMm = null;
  const B = newProjectCamera('B');
  B.body = 'Caméra B';
  settings.cameras.push(B);
  settings.terms.grip.push('Colonnettes');

  const cs = (start: Framing, movements: string[], grip: string[], end: Framing | null = null, cameraId = A.id): CameraSetup => ({
    id: newId('cs'),
    cameraId,
    start,
    end,
    movements,
    grip,
  });
  const p = (action: string, scriptExcerpt: string, cameras: CameraSetup[], repriseOf: string | null = null): Plan => ({
    id: newId('pl'),
    repriseOf,
    action,
    scriptExcerpt,
    notes: '',
    cameras,
    images: [],
    coverImageId: null,
  });
  const s = (number: string, intExt: Sequence['intExt'], dayNight: Sequence['dayNight'], location: string, plans: Plan[]): Sequence => ({
    id: newId('sq'),
    number,
    intExt,
    dayNight,
    location,
    address: '',
    comments: '',
    plans,
  });

  const quai = p('Elle attend sur le quai, le train arrive.', 'LÉA (30) attend, seule sur le quai.', [cs(f('Ensemble', 'Face', 'À niveau', null, 32), ['Fixe'], ['Branches'])]);
  const regard = p('Elle cherche quelqu’un du regard.', 'Elle scrute les fenêtres du train.', [cs(f('Poitrine', '3/4', 'À niveau', null, 75), ['Fixe'], ['Branches'])]);

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
        ]),
        p('Elle cherche quelqu’un du regard.', 'Elle scrute les fenêtres du train.', [cs(f('Poitrine', '3/4', 'À niveau', null, 75), ['Fixe'], ['Branches'])], regard.id),
      ]),
      s('2', 'INT', 'JOUR', 'Wagon', [
        p('Travelling latéral le long des sièges vides.', 'Le wagon est presque vide.', [cs(f('Demi-ensemble', 'Profil', 'À niveau', null, 25), ['Trav latéral', 'Fixe'], ['Steadicam'])]),
        p('Il lit, ne la voit pas arriver.', 'MARC (35) lit, absorbé.', [
          cs(f('Taille', '3/4', 'Plongée', -10, 50), ['Fixe'], ['Épaule']),
          cs(f('GP', 'Face', 'À niveau', null, 85), ['Fixe'], ['Branches'], null, B.id),
        ]),
      ]),
      s('3', 'INT', 'NUIT', 'Appartement de Léa', [
        p('Elle allume la lampe, la pièce se révèle.', 'Le noir. Une lampe s’allume.', [cs(f('Ensemble', 'Face', '', null, null), ['Fixe'], [])]),
      ]),
      s('4', 'EXT', 'NUIT', 'Rue', [p('', 'Ils marchent sans parler.', [cs(f('', '', '', null, null), [], [])])]),
    ],
  };
}
