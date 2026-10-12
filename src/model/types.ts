/**
 * Modèle de données de Topshot.
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

/** Colonnes facultatives du tableau, dans leur ordre. */
export const TABLE_COLUMN_IDS = ['image', 'size', 'axis', 'angle', 'focal', 'movement', 'grip', 'duration', 'notes'] as const;
export type TableColumnId = (typeof TABLE_COLUMN_IDS)[number];
/** Colonnes affichées par défaut (celles d'avant la 0.15). */
export const DEFAULT_TABLE_COLUMNS: TableColumnId[] = ['image', 'size', 'axis', 'angle', 'focal', 'movement', 'grip'];

/** Note datée, rattachée à une séquence ou à un plan ; cochée quand c'est fait. */
export interface Note {
  id: Id;
  text: string;
  /** Date de création (ms depuis 1970) ; null pour une note reprise d'avant la 0.13 (date inconnue). */
  createdAt: number | null;
  done: boolean;
}

export interface Plan {
  id: Id;
  /** Plan dont celui-ci est la reprise (4/2B est une reprise de 4/2). */
  repriseOf: Id | null;
  action: string;
  scriptExcerpt: string;
  /** Notes du plan, dans l'ordre où elles ont été prises (colonne « Divers » des exports). */
  notes: Note[];
  /**
   * Durée du plan à l'écran, en secondes ; null = pas encore minutée. Toujours null pour une
   * reprise : elle a la durée de son plan (duration.ts).
   */
  durationS: number | null;
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
  /** Notes de la séquence (« Commentaires » des exports). */
  notes: Note[];
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

/** Figures du plan au sol qui peuvent prendre une icône importée. */
export type FigureKind = 'camera' | 'actor' | 'light';

/** Icône d'une figure : image copiée dans le projet, et sens dans lequel l'image « regarde ». */
export interface FigureIcon {
  /** Image dans le projet (« images/… »). */
  file: string;
  /** Nom de l'icône dans la bibliothèque, pour l'affichage. */
  name: string;
  /** Rotation à appliquer pour que l'image regarde vers le haut (sens 0° du plan). */
  turn: 0 | 90 | 180 | 270;
}

/** Plan type : réglages d'une caméra, sans la caméra. Son nom est son résumé (« Poitrine · 3/4 · 50 mm »). */
export interface ShotPreset {
  id: Id;
  start: Framing;
  end: Framing | null;
  movements: string[];
  grip: string[];
}

/** Réglages qu'un nouveau plan peut reprendre du plan précédent (choix dans les préférences de l'app, voir prefs.ts). */
export type CarryField = 'size' | 'axis' | 'angle' | 'focal' | 'movement' | 'grip';
export const CARRY_FIELDS: readonly CarryField[] = ['size', 'axis', 'angle', 'focal', 'movement', 'grip'];

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
  /** Plans types : réglages caméra enregistrés, appliqués en un clic (Détails › Caméras). */
  shotPresets: ShotPreset[];
  /** Modèles d'export du projet (options relues et vérifiées par export/presets.ts). */
  exportPresets: { id: Id; name: string; options: unknown }[];
  /** Icônes des figures du plan au sol (sinon les symboles standard), voir floorIcons.ts. */
  floorIcons: Record<FigureKind, FigureIcon | null>;
  /**
   * Colonnes affichées dans le tableau, en plus du N°, de la caméra et de l'action (toujours là),
   * dans l'ordre du tableau. Le modèle d'export « Comme le tableau » les reprend.
   */
  tableColumns: TableColumnId[];
  /** Fuseau horaire des heures du projet (nom IANA, ex. « Europe/Paris ») ; null = celui de cet ordinateur. */
  timeZone: string | null;
  /** Publier (0.20) : fichiers tenus à jour dans le dossier de diffusion (dossier : préférences de ce Mac). */
  publish: PublishSettings;
}

/** Fichiers que Publier tient à jour (format 23). */
export const PUBLISH_FILES = ['pdf', 'xlsx', 'html', 'floors', 'csv'] as const;
export type PublishFile = (typeof PUBLISH_FILES)[number];

export interface PublishSettings {
  files: PublishFile[];
  /** Modèle d'export du découpage (PDF, Excel, CSV). */
  presetId: string;
  /** Début des noms de fichiers, fixé à la première publication : les liens partagés restent bons. null = pas encore publié. */
  baseName: string | null;
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
  /** Icône de ce modèle sur les plans au sol (pour tous ses projecteurs qui n'ont pas la leur). */
  icon: FigureIcon | null;
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

/** Retours reçus (0.21) : un fichier de retours renvoyé depuis le découpage interactif publié. */
export interface Feedback {
  /** Identifiant du fichier de retours (un fichier importé deux fois n'est gardé qu'une fois). */
  id: Id;
  author: string;
  /** Métier choisi dans le découpage interactif (« Réalisation »…). */
  role: string;
  /** Publication sur laquelle portent les retours. */
  publication: number;
  sentAt: number;
  receivedAt: number;
  items: FeedbackItem[];
}

export const FEEDBACK_FIELDS = ['action', 'size', 'axis', 'angle', 'focal', 'movement', 'grip'] as const;
export type FeedbackField = (typeof FEEDBACK_FIELDS)[number];

export interface FeedbackItem {
  id: Id;
  /** Plan visé (null : retour sur la séquence). Un plan retiré depuis garde son identifiant. */
  planId: Id | null;
  seqId: Id | null;
  /** Numéro du plan (ou de la séquence) au moment de la publication. */
  code: string;
  verdict: 'ok' | 'revoir' | null;
  text: string;
  /** Valeur proposée pour un réglage, et celle qui était publiée. */
  proposal: { setupId: Id | null; field: FeedbackField; text: string; before: string } | null;
  /** Nouveau, repris dans le découpage, rangé en note, ou laissé de côté. */
  state: 'new' | 'applied' | 'noted' | 'ignored';
}

export const SCHEMA_VERSION = 24 as const;

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
  /** Dossiers de la bibliothèque (dossiers dans des dossiers possibles), voir imageFolders.ts. */
  imageFolders: ImageFolder[];
  /** Plans au sol (voir floor.ts). */
  floorPlans: import('./floor').FloorPlan[];
  /** Jours de tournage, dans l'ordre (J1, J2… : numéros calculés, jamais stockés). */
  shootingDays: ShootingDay[];
  /** Retours reçus sur les publications (voir feedback.ts). */
  feedback: Feedback[];
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
  /** Dossier où l'image est rangée ; null = à la racine de la bibliothèque. Une image est dans un seul dossier. */
  folderId: Id | null;
}

/** Dossier de la bibliothèque d'images. */
export interface ImageFolder {
  id: Id;
  name: string;
  /** Dossier qui le contient ; null = à la racine. */
  parentId: Id | null;
}

/** Jour de tournage : ses séquences, dans l'ordre de la journée. */
export interface ShootingDay {
  id: Id;
  /** « AAAA-MM-JJ » ; null tant que la date n'est pas fixée. */
  date: string | null;
  sequenceIds: Id[];
  note: string;
}
