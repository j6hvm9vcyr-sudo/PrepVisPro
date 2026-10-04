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
  /** Position GPS du décor (pour le soleil) ; null si non renseignée. */
  gps: { lat: number; lon: number } | null;
  comments: string;
  /** Texte de la scène, importé du scénario (vide si saisi à la main). */
  scriptText: string;
  /** Dépouillement image : besoins particuliers de la séquence, par département. */
  breakdown: Breakdown;
  plans: Plan[];
  /** Ordre de tournage par installation ; null tant qu'il n'a pas été établi. */
  shooting: ShootingOrder | null;
}

/** Installation : une position de caméra et un sens de lumière, pour plusieurs plans tournés à la suite. */
export interface Installation {
  id: Id;
  name: string;
  /** Plans de l'installation, dans l'ordre de tournage. */
  planIds: Id[];
  note: string;
}

export interface ShootingOrder {
  installations: Installation[];
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
  /** Largeur active (horizontale) du capteur dans ce mode, en mm. null = inconnue (pas de calcul de champ). */
  sensorWidthMm: number | null;
  /** Hauteur active (verticale) du capteur dans ce mode, en mm. null = inconnue (pas d'angle vertical). */
  sensorHeightMm: number | null;
  /** Coefficient anamorphique (1 = sphérique). */
  squeeze: number;
}

interface CrewMember {
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
  /** Optiques du projet (séries fixes ou zooms). Vide : aucune contrainte. */
  lenses: LensSeries[];
  /** Projecteurs du projet, avec leurs données photométriques (fiches des fabricants). */
  fixtures: Fixture[];
  /** Réglages d'exposition pour le calcul des diaphs. */
  exposure: Exposure;
  /** Matières de réflecteurs du projet, avec leur taux de réflexion mesuré. */
  reflectors: ReflectorMaterial[];
  /** Fuseau horaire des heures du projet (nom IANA, ex. « Europe/Paris ») ; null = celui de cet ordinateur. */
  timeZone: string | null;
}

/**
 * Matière de réflecteur. Diffuse (toile, poly, muslin…) : renvoie la lumière dans toutes les
 * directions. Miroir : renvoie le faisceau comme un miroir plan.
 */
export interface ReflectorMaterial {
  id: Id;
  name: string;
  type: 'diffuse' | 'mirror';
  /** Taux de réflexion (0 à 1). null : pas encore renseigné (aucun calcul). */
  reflectance: number | null;
  /** Matière préréglée d'origine (valeur publiée, voir reflectorPresets.ts) ; null pour une valeur saisie. */
  presetId: string | null;
}

export interface FixtureMode {
  /** « Spot », « Flood », « 30° »… */
  label: string;
  /** Éclairement au centre du faisceau (lux) à la distance de référence. null : pas encore renseigné. */
  lux: number | null;
  /** Distance de référence de la mesure du fabricant (m). null : pas encore renseignée. */
  distanceM: number | null;
  /** Angle du faisceau (degrés, angle total). null : pas encore renseigné. */
  beamDeg: number | null;
}

export interface Fixture {
  id: Id;
  name: string;
  /** Puissance consommée (W). null : pas encore renseignée. */
  watts: number | null;
  kind: 'led' | 'tungsten' | 'hmi' | 'other';
  modes: FixtureMode[];
}

export interface Exposure {
  iso: number;
  fps: number;
  /** Angle d'obturation (degrés). */
  shutterDeg: number;
}

/** Série d'optiques du projet : fixes (liste de focales) ou zoom (plage). */
export interface LensSeries {
  id: Id;
  name: string;
  kind: 'primes' | 'zoom';
  /** Focales des fixes, en mm (triées). */
  focals: number[];
  /** Plage du zoom, en mm. */
  min: number | null;
  max: number | null;
}

interface ProjectMeta {
  title: string;
  director: string;
  production: string;
  aspectRatio: string;
  crew: CrewMember[];
}

export const SCHEMA_VERSION = 15 as const;

export interface ProjectDoc {
  schemaVersion: typeof SCHEMA_VERSION;
  id: Id;
  meta: ProjectMeta;
  settings: ProjectSettings;
  sequences: Sequence[];
  /** Tampons entre les séquences (TITRE, GÉNÉRIQUE DE FIN…), voir stamps.ts. */
  stamps: Stamp[];
  /**
   * Bibliothèque d'images du projet : chaque image n'est importée qu'une fois, puis réutilisée
   * dans les plans (repérage, références) et comme fond de plan au sol (voir library.ts).
   */
  library: LibraryImage[];
  /** Plans au sol (voir floor.ts). */
  floorPlans: import('./floor').FloorPlan[];
  /** Jours de tournage, dans l'ordre (J1, J2… : numéros calculés, jamais stockés). */
  shootingDays: ShootingDay[];
}

/** Tampon : mention placée entre deux séquences, sans plan ni numéro. */
export interface Stamp {
  id: Id;
  /** « TITRE », « GÉNÉRIQUE DE FIN »… */
  text: string;
  /** Précision facultative (« sur noir, 10 s », « carton : trois ans plus tard »). */
  note: string;
  /** Séquence qui suit le tampon ; null = en fin de film. */
  beforeSequenceId: Id | null;
}

/** Image de la bibliothèque du projet. */
export interface LibraryImage {
  id: Id;
  /** Chemin relatif dans le dossier projet (« images/ab12.jpg »), unique dans la bibliothèque. */
  file: string;
  originalName: string;
  /** Légende libre (« Lumière de Roger Deakins, Skyfall »). */
  caption: string;
  /** Empreinte SHA-256 du contenu, pour ne jamais importer deux fois la même image ; null si inconnue. */
  hash: string | null;
}

/** Jour de tournage : ses séquences, dans l'ordre de la journée. */
export interface ShootingDay {
  id: Id;
  /** « AAAA-MM-JJ » ; null tant que la date n'est pas fixée. */
  date: string | null;
  sequenceIds: Id[];
  note: string;
}
