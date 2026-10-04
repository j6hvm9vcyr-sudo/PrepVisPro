/**
 * Gélatines et diffusions sur projecteur : transmissions publiées par LEE Filters
 * (fiche de chaque référence sur leefilters.com/colour/<n°>/, relevées le 4 octobre 2026).
 *
 * « Transmission Y » = part de la lumière transmise (pondérée par la sensibilité de l'œil),
 * mesurée par le fabricant sous deux illuminants : tungstène (source A) et lumière du jour
 * (source C). On prend la valeur tungstène sur un projecteur tungstène, celle du jour sinon.
 *
 * Une gélatine de couleur ou un ND ne dévie pas la lumière : la transmission s'applique
 * telle quelle. Une diffusion, elle, étale la lumière : la transmission du fabricant est
 * mesurée sur toute la lumière transmise, pas au centre du faisceau. Elle n'est juste que
 * pour un projecteur ouvert (flood) avec la diffusion près du projecteur ; un essai publié
 * (M. Porwoll, Joker 400 ouvert, cadre à 1,2 m) trouve 61 % au centre pour la 250 (fiche : 60 %)
 * et 44 % pour la 216 (fiche : 36 %). Sur un faisceau serré, le centre perd davantage :
 * le calcul le signale.
 */
export type GelGroup = 'diffusion' | 'ctb' | 'cto' | 'nd';

export interface Gel {
  id: string;
  /** Référence LEE. */
  ref: string;
  name: string;
  /** Nom court pour le plan (« 216 », « ½ CTB »). */
  short: string;
  group: GelGroup;
  /** Transmission sous lumière du jour (source C), de 0 à 1. */
  daylight: number;
  /** Transmission sous tungstène (source A), si publiée de façon cohérente. */
  tungsten: number | null;
  /** La fiche donne une borne (« > 85 % ») et non une mesure : la perte réelle est au plus celle-ci. */
  atLeast?: boolean;
  /** Diffusion forte : le faisceau s'élargit nettement. */
  strong?: boolean;
}

export const GEL_GROUPS: { id: GelGroup; label: string }[] = [
  { id: 'diffusion', label: 'Diffusion' },
  { id: 'ctb', label: 'CTB (vers lumière du jour)' },
  { id: 'cto', label: 'CTO (vers tungstène)' },
  { id: 'nd', label: 'ND (neutre)' },
];

export const GELS: Gel[] = [
  { id: 'lee-216', ref: '216', name: 'White Diffusion', short: '216', group: 'diffusion', daylight: 0.36, tungsten: null, strong: true },
  { id: 'lee-250', ref: '250', name: 'Half White Diffusion', short: '250', group: 'diffusion', daylight: 0.6, tungsten: null, strong: true },
  { id: 'lee-251', ref: '251', name: 'Quarter White Diffusion', short: '251', group: 'diffusion', daylight: 0.8, tungsten: null },
  { id: 'lee-252', ref: '252', name: 'Eighth White Diffusion', short: '252', group: 'diffusion', daylight: 0.85, tungsten: null, atLeast: true },
  { id: 'lee-201', ref: '201', name: 'Full C.T. Blue', short: 'CTB', group: 'ctb', daylight: 0.34, tungsten: 0.35 },
  { id: 'lee-202', ref: '202', name: 'Half C.T. Blue', short: '½ CTB', group: 'ctb', daylight: 0.549, tungsten: 0.532 },
  { id: 'lee-203', ref: '203', name: 'Quarter C.T. Blue', short: '¼ CTB', group: 'ctb', daylight: 0.693, tungsten: 0.705 },
  { id: 'lee-218', ref: '218', name: 'Eighth C.T. Blue', short: '⅛ CTB', group: 'ctb', daylight: 0.813, tungsten: 0.802 },
  { id: 'lee-204', ref: '204', name: 'Full C.T. Orange', short: 'CTO', group: 'cto', daylight: 0.554, tungsten: 0.628 },
  { id: 'lee-205', ref: '205', name: 'Half C.T. Orange', short: '½ CTO', group: 'cto', daylight: 0.708, tungsten: 0.745 },
  { id: 'lee-206', ref: '206', name: 'Quarter C.T. Orange', short: '¼ CTO', group: 'cto', daylight: 0.791, tungsten: 0.826 },
  { id: 'lee-223', ref: '223', name: 'Eighth C.T. Orange', short: '⅛ CTO', group: 'cto', daylight: 0.852, tungsten: 0.85 },
  { id: 'lee-298', ref: '298', name: '0.15 ND', short: 'ND .15', group: 'nd', daylight: 0.693, tungsten: 0.711 },
  { id: 'lee-209', ref: '209', name: '0.3 ND', short: 'ND .3', group: 'nd', daylight: 0.512, tungsten: 0.5 },
  { id: 'lee-210', ref: '210', name: '0.6 ND', short: 'ND .6', group: 'nd', daylight: 0.235, tungsten: 0.245 },
  // Fiche 211 : la valeur tungstène publiée (11,8 % / densité 0,41) est incohérente ; seule la valeur jour est retenue.
  { id: 'lee-211', ref: '211', name: '0.9 ND', short: 'ND .9', group: 'nd', daylight: 0.137, tungsten: null },
];

const BY_ID = new Map(GELS.map((g) => [g.id, g]));

export function gelById(id: string): Gel | undefined {
  return BY_ID.get(id);
}

/** « Lee 216 », « Lee 201 CTB ». Vide pour une référence inconnue. */
export function gelLabel(id: string): string {
  const g = BY_ID.get(id);
  return g ? `Lee ${g.ref}${g.short !== g.ref ? ` ${g.short}` : ''}` : '';
}

/** Transmission d'une gélatine pour un type de projecteur. */
export function gelTransmission(g: Gel, tungstenSource: boolean): number {
  return tungstenSource && g.tungsten !== null ? g.tungsten : g.daylight;
}

/** Perte en diaphs correspondant à une transmission. */
export function stopsLost(t: number): number {
  return -Math.log2(t);
}

export interface GelStack {
  /** Transmission totale des gélatines connues. */
  transmission: number;
  gels: Gel[];
  /** Une diffusion est posée (le faisceau n'est plus celui du fabricant). */
  diffused: boolean;
  /** Une diffusion forte (216, 250) est posée. */
  strong: boolean;
  /** Une des valeurs est une borne du fabricant (perte au plus). */
  atLeast: boolean;
}

export function gelStack(ids: readonly string[], tungstenSource: boolean): GelStack {
  const gels = ids.map(gelById).filter((g): g is Gel => !!g);
  return {
    transmission: gels.reduce((t, g) => t * gelTransmission(g, tungstenSource), 1),
    gels,
    diffused: gels.some((g) => g.group === 'diffusion'),
    strong: gels.some((g) => g.strong),
    atLeast: gels.some((g) => g.atLeast),
  };
}
