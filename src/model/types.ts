/**
 * Modèle de données de PrepVisPro.
 *
 * Principe : une seule source de vérité. Tout ce qui peut être calculé
 * (numéros de plan, complétude, angle de champ…) n'est PAS stocké.
 */

export type Id = string;

/** Catégories de termes proposées à la saisie. */
export type TermCategory = 'size' | 'axis' | 'angle' | 'movement' | 'grip';

export const TERM_CATEGORIES: readonly TermCategory[] = ['size', 'axis', 'angle', 'movement', 'grip'];

export type IntExt = 'INT' | 'EXT' | 'INT/EXT';
export type DayNight = 'JOUR' | 'NUIT';

/** Cadrage à un instant du plan (début, ou fin d'un plan évolutif). */
export interface Framing {
  /** Valeur de plan (ex. « Poitrine »). Chaîne vide = non renseigné. */
  size: string;
  /** Axe (ex. « 3/4 »). */
  axis: string;
  /** Angle (ex. « Plongée »). */
  angle: string;
  /** Inclinaison en degrés, négatif vers le bas. null = non renseigné. */
  tiltDeg: number | null;
  /** Focale en mm. null = non renseignée. */
  focalMm: number | null;
}

/** Réglages d'une caméra sur un plan. */
export interface CameraSetup {
  id: Id;
  /** Caméra du projet utilisée (porte le format capteur). */
  cameraId: Id;
  start: Framing;
  /** Réglage de fin d'un plan évolutif ; null = plan non évolutif. */
  end: Framing | null;
  /** Mouvements, dans l'ordre (« Trav latéral » puis « Fixe »). */
  movements: string[];
  /** Machinerie (plusieurs possibles, sans ordre imposé). */
  grip: string[];
}

export type ImageKind = 'reference' | 'scouting';

export interface ImageAsset {
  id: Id;
  kind: ImageKind;
  /** Chemin relatif dans le dossier projet (ex. « images/ab12.jpg »). */
  file: string;
  /** Nom d'origine, pour l'affichage. */
  originalName: string;
  caption: string;
}

export interface Plan {
  id: Id;
  /** Plan dont celui-ci est la reprise (4/2B est une reprise de 4/2). */
  repriseOf: Id | null;
  action: string;
  scriptExcerpt: string;
  notes: string;
  /** Au moins une caméra. */
  cameras: CameraSetup[];
  images: ImageAsset[];
  /** Image principale choisie à la main ; null = choix automatique. */
  coverImageId: Id | null;
}

export interface Sequence {
  id: Id;
  /** Numéro tel qu'au scénario : « 1 », « 3A », « 10B ». */
  number: string;
  intExt: IntExt;
  dayNight: DayNight;
  /** Décor (ex. « Salle de bain d'Axel »). */
  location: string;
  address: string;
  comments: string;
  /** Texte de la scène, importé du scénario (vide si saisi à la main). */
  scriptText: string;
  /** Dépouillement image : besoins particuliers de la séquence, par département. */
  breakdown: Breakdown;
  plans: Plan[];
}

export interface Breakdown {
  camera: string;
  grip: string;
  lighting: string;
  other: string;
}

/** Caméra du projet : son format capteur sert au calcul du champ. */
export interface ProjectCamera {
  id: Id;
  /** Lettre ou nom court affiché : « A », « B ». */
  label: string;
  /** Boîtier (ex. « Sony Venice 2 »). */
  body: string;
  /** Mode d'enregistrement (ex. « 6K 3:2 »). */
  mode: string;
  /** Largeur active du capteur dans ce mode, en mm. null = inconnue (pas de calcul de champ). */
  sensorWidthMm: number | null;
  /** Coefficient anamorphique (1 = sphérique). */
  squeeze: number;
}

export interface CrewMember {
  id: Id;
  role: string;
  name: string;
}

/** Champs dont l'absence rend un plan « à compléter ». */
export type RequiredField = 'action' | 'size' | 'axis' | 'angle' | 'focal' | 'movement' | 'grip';
export const REQUIRED_FIELDS: readonly RequiredField[] = ['action', 'size', 'axis', 'angle', 'focal', 'movement', 'grip'];

export interface ProjectSettings {
  terms: Record<TermCategory, string[]>;
  required: Record<RequiredField, boolean>;
  cameras: ProjectCamera[];
}

export interface ProjectMeta {
  title: string;
  director: string;
  production: string;
  aspectRatio: string;
  crew: CrewMember[];
}

export const SCHEMA_VERSION = 3 as const;

export interface ProjectDoc {
  schemaVersion: typeof SCHEMA_VERSION;
  id: Id;
  meta: ProjectMeta;
  settings: ProjectSettings;
  sequences: Sequence[];
}
