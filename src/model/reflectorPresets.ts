/**
 * Matières de réflecteur préréglées, avec leur taux de réflexion (part de la lumière renvoyée)
 * et la source de la valeur. Le taux retenu est le milieu de la plage publiée ; la plage
 * est affichée pour que l'incertitude reste visible.
 *
 * Sources :
 * - [IES] Table des facteurs de réflexion des matériaux (valeurs usuelles d'éclairagisme,
 *   reprises par The Engineering ToolBox, « Materials - Light Reflecting Factors »).
 * - [EO] Edmund Optics, « Metallic Mirror Coatings » : aluminium protégé Ravg > 85 % (400–700 nm).
 * - [PORWOLL] M. Porwoll, « The Ultimate Diffusion & Bounce Test » : toiles et panneaux mesurés
 *   dans la même géométrie (Joker 400, réflecteur à 1,2 m de la source et 1,8 m du sujet) —
 *   muslin blanchie 97 fc, Ultrabounce 97 fc, Griffolyn blanc 90 fc, bead board 90 fc,
 *   muslin écrue 80 fc. Ce sont des rapports entre matières, pas des taux absolus.
 * - [COTON] Coton blanchi : réflectance 85 à 90 % (textilelearner.net, contrôle du blanchiment).
 *   Ancre absolue de l'essai Porwoll : muslin blanchie = 85–90 %, les autres au prorata mesuré.
 */
import type { ReflectorMaterial } from './types';

export interface ReflectorPreset {
  id: string;
  name: string;
  group: 'Toiles et panneaux' | 'Papier et peinture' | 'Miroirs et métal' | 'Surfaces naturelles';
  type: ReflectorMaterial['type'];
  /** Plage publiée (0 à 1). */
  min: number;
  max: number;
  source: string;
}

/** Rapport mesuré par Porwoll entre une matière et la muslin blanchie (97 fc). */
const porwoll = (fc: number) => fc / 97;
const COTON: [number, number] = [0.85, 0.9];

export const REFLECTOR_PRESETS: ReflectorPreset[] = [
  { id: 'ultrabounce', name: 'Ultrabounce (blanc)', group: 'Toiles et panneaux', type: 'diffuse', min: COTON[0] * porwoll(97), max: COTON[1] * porwoll(97), source: 'Essai Porwoll (même rendement que la muslin blanchie), ancré sur le coton blanchi 85–90 %' },
  { id: 'muslin-blanchie', name: 'Muslin blanchie', group: 'Toiles et panneaux', type: 'diffuse', min: COTON[0], max: COTON[1], source: 'Coton blanchi : réflectance 85–90 %' },
  { id: 'griffolyn', name: 'Griffolyn blanc', group: 'Toiles et panneaux', type: 'diffuse', min: COTON[0] * porwoll(90), max: COTON[1] * porwoll(90), source: 'Essai Porwoll (90 fc contre 97 pour la muslin blanchie), ancré sur le coton blanchi' },
  { id: 'poly', name: 'Poly / bead board', group: 'Toiles et panneaux', type: 'diffuse', min: COTON[0] * porwoll(90), max: COTON[1] * porwoll(90), source: 'Essai Porwoll (90 fc contre 97 pour la muslin blanchie), ancré sur le coton blanchi' },
  { id: 'muslin-ecrue', name: 'Muslin écrue', group: 'Toiles et panneaux', type: 'diffuse', min: COTON[0] * porwoll(80), max: COTON[1] * porwoll(80), source: 'Essai Porwoll (80 fc contre 97 pour la muslin blanchie), ancré sur le coton blanchi' },
  { id: 'foamcore', name: 'Foamcore (papier blanc)', group: 'Papier et peinture', type: 'diffuse', min: 0.7, max: 0.8, source: 'Papier blanc 70–80 % (table de réflexion des matériaux, éclairagisme)' },
  { id: 'peinture-blanche', name: 'Mur / peinture blanche', group: 'Papier et peinture', type: 'diffuse', min: 0.75, max: 0.85, source: 'Peinture blanche 75–85 % (table de réflexion des matériaux, éclairagisme)' },
  { id: 'miroir-verre', name: 'Miroir (verre argenté)', group: 'Miroirs et métal', type: 'mirror', min: 0.8, max: 0.88, source: 'Miroir argenté derrière verre 80–88 % (table de réflexion des matériaux, éclairagisme)' },
  { id: 'miroir-alu', name: 'Miroir aluminium (face avant)', group: 'Miroirs et métal', type: 'mirror', min: 0.85, max: 0.87, source: 'Aluminium protégé > 85 % (Edmund Optics) ; aluminium pur très poli 80–87 % (table de réflexion)' },
  { id: 'neige', name: 'Neige fraîche', group: 'Surfaces naturelles', type: 'diffuse', min: 0.85, max: 0.85, source: 'Neige fraîche 85 % (table de réflexion des matériaux)' },
  { id: 'sable', name: 'Sable sec', group: 'Surfaces naturelles', type: 'diffuse', min: 0.38, max: 0.42, source: 'Sable sec 38–42 % (table de réflexion des matériaux)' },
  { id: 'beton', name: 'Béton brut', group: 'Surfaces naturelles', type: 'diffuse', min: 0.2, max: 0.3, source: 'Béton brut 20–30 % (table de réflexion des matériaux)' },
  { id: 'herbe', name: 'Herbe, cultures', group: 'Surfaces naturelles', type: 'diffuse', min: 0.15, max: 0.24, source: 'Cultures 15–24 % (table de réflexion des matériaux)' },
];

export const PRESET_GROUPS = [...new Set(REFLECTOR_PRESETS.map((p) => p.group))];

export function presetById(id: string | null | undefined): ReflectorPreset | undefined {
  return id ? REFLECTOR_PRESETS.find((p) => p.id === id) : undefined;
}

/** Taux retenu : milieu de la plage. */
export function presetValue(p: ReflectorPreset): number {
  return Math.round(((p.min + p.max) / 2) * 1000) / 1000;
}

export const pct = (v: number) => `${Math.round(v * 100)} %`;
export function presetRange(p: ReflectorPreset): string {
  return p.min === p.max ? pct(p.min) : `${Math.round(p.min * 100)}–${Math.round(p.max * 100)} %`;
}

/**
 * Matière du projet correspondant à un preset : réutilisée si elle existe déjà (même preset,
 * valeur inchangée), sinon créée. Renvoie le document et l'identifiant de la matière.
 */
export function materialForPreset(doc: import('./types').ProjectDoc, presetId: string, newId: () => string): { doc: import('./types').ProjectDoc; id: string } {
  const p = presetById(presetId);
  if (!p) throw new Error('Preset inconnu');
  const existing = doc.settings.reflectors.find((m) => m.presetId === p.id && m.reflectance === presetValue(p));
  if (existing) return { doc, id: existing.id };
  const id = newId();
  return {
    doc: { ...doc, settings: { ...doc.settings, reflectors: [...doc.settings.reflectors, { id, name: p.name, type: p.type, reflectance: presetValue(p), presetId: p.id }] } },
    id,
  };
}
