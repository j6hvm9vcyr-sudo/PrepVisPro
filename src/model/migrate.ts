/**
 * Mise à niveau des anciens fichiers projet vers le format courant.
 * Chaque évolution du format ajoute une étape ici (et un test), sans jamais
 * modifier le fichier d'origine sur disque avant validation complète.
 */
import { SCHEMA_VERSION } from './types';
import { TERM_ALIASES } from './defaults';

export type MigrateResult = { ok: true; raw: unknown } | { ok: false; error: string };

export function migrate(raw: unknown): MigrateResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Ce fichier n’est pas un projet PrepVisPro.' };
  const v = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof v !== 'number') return { ok: false, error: 'Ce fichier n’est pas un projet PrepVisPro (version de format absente).' };
  if (v > SCHEMA_VERSION) {
    return { ok: false, error: `Ce projet a été créé avec une version plus récente de PrepVisPro (format ${v}). Mettez l’application à jour.` };
  }
  let doc = raw as Record<string, unknown>;
  // Étapes successives, de version en version.
  if (v <= 1) doc = from1to2(doc);
  if (v <= 2) doc = from2to3(doc);
  if (v <= 3) doc = { ...doc, schemaVersion: 4, floorPlans: [] };
  if (v <= 4) doc = from4to5(doc);
  if (v <= 5) doc = from5to6(doc);
  if (v <= 6) doc = from6to7(doc);
  if (v <= 7) doc = from7to8(doc);
  if (v <= 8) doc = { ...doc, schemaVersion: 9 }; // 8 → 9 : données des projecteurs facultatives (rien à convertir)
  if (v <= 9) doc = from9to10(doc);
  if (v <= 10) doc = from10to11(doc);
  if (v <= 11) doc = { ...doc, schemaVersion: 12, shootingDays: [] }; // 11 → 12 : jours de tournage (aucun)
  if (v <= 12) doc = from12to13(doc);
  if (v <= 13) doc = from13to14(doc);
  if (v <= 14) doc = from14to15(doc);
  if (v <= 15) doc = from15to16(doc);
  if (v <= 16) doc = from16to17(doc);
  if (v <= 17) doc = from17to18(doc);
  return { ok: true, raw: doc };
}

/** Format 1 → 2 : chaque séquence reçoit le texte de sa scène (vide). */
function from1to2(doc: Record<string, unknown>): Record<string, unknown> {
  const seqs = Array.isArray(doc.sequences) ? doc.sequences : [];
  return {
    ...doc,
    schemaVersion: 2,
    sequences: seqs.map((s) => (s && typeof s === 'object' ? { scriptText: '', ...(s as object) } : s)),
  };
}

/** Format 2 → 3 : chaque séquence reçoit un dépouillement image (vide). */
function from2to3(doc: Record<string, unknown>): Record<string, unknown> {
  const seqs = Array.isArray(doc.sequences) ? doc.sequences : [];
  return {
    ...doc,
    schemaVersion: 3,
    sequences: seqs.map((s) => (s && typeof s === 'object' ? { breakdown: { camera: '', grip: '', lighting: '', other: '' }, ...(s as object) } : s)),
  };
}

/** Format 4 → 5 : chaque caméra du projet reçoit une hauteur capteur (inconnue). */
function from4to5(doc: Record<string, unknown>): Record<string, unknown> {
  const settings = doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : null;
  if (!settings) return { ...doc, schemaVersion: 5 };
  const cams = Array.isArray(settings.cameras) ? settings.cameras : [];
  return {
    ...doc,
    schemaVersion: 5,
    settings: { ...settings, cameras: cams.map((c) => (c && typeof c === 'object' ? { sensorHeightMm: null, ...(c as object) } : c)) },
  };
}

/** Format 5 → 6 : optiques du projet (aucune au départ). */
function from5to6(doc: Record<string, unknown>): Record<string, unknown> {
  const settings = doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : null;
  return { ...doc, schemaVersion: 6, ...(settings ? { settings: { lenses: [], ...settings } } : {}) };
}

/** Format 6 → 7 : ordre de tournage par séquence (pas encore établi). */
function from6to7(doc: Record<string, unknown>): Record<string, unknown> {
  const seqs = Array.isArray(doc.sequences) ? doc.sequences : [];
  return { ...doc, schemaVersion: 7, sequences: seqs.map((s) => (s && typeof s === 'object' ? { shooting: null, ...(s as object) } : s)) };
}

/** Format 7 → 8 : projecteurs et réglages d'exposition du projet. */
function from7to8(doc: Record<string, unknown>): Record<string, unknown> {
  const settings = doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : null;
  return { ...doc, schemaVersion: 8, ...(settings ? { settings: { fixtures: [], exposure: { iso: 800, fps: 24, shutterDeg: 180 }, ...settings } } : {}) };
}

/** Format 9 → 10 : gélatines sur les projecteurs (aucune), matières de réflecteurs (aucune). */
function from9to10(doc: Record<string, unknown>): Record<string, unknown> {
  const settings = doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : null;
  const plans = Array.isArray(doc.floorPlans) ? doc.floorPlans : [];
  return {
    ...doc,
    schemaVersion: 10,
    ...(settings ? { settings: { reflectors: [], ...settings } } : {}),
    floorPlans: plans.map((fp) => {
      if (!fp || typeof fp !== 'object' || !Array.isArray((fp as { elements?: unknown }).elements)) return fp;
      const f = fp as { elements: unknown[] };
      return { ...f, elements: f.elements.map((e) => (e && typeof e === 'object' && (e as { kind?: unknown }).kind === 'light' ? { gels: [], ...(e as object) } : e)) };
    }),
  };
}

/** Format 10 → 11 : soleil (position GPS des décors, fuseau du projet, nord et heure des plans au sol). */
function from10to11(doc: Record<string, unknown>): Record<string, unknown> {
  const settings = doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : null;
  const seqs = Array.isArray(doc.sequences) ? doc.sequences : [];
  const plans = Array.isArray(doc.floorPlans) ? doc.floorPlans : [];
  return {
    ...doc,
    schemaVersion: 11,
    ...(settings ? { settings: { timeZone: null, ...settings } } : {}),
    sequences: seqs.map((s) => (s && typeof s === 'object' ? { gps: null, ...(s as object) } : s)),
    floorPlans: plans.map((f) => (f && typeof f === 'object' ? { northDeg: null, sunAt: null, ...(f as object) } : f)),
  };
}

/** Format 12 → 13 : icône possible sur les personnages et les réflecteurs ; matières préréglées. */
function from12to13(doc: Record<string, unknown>): Record<string, unknown> {
  const settings = doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : null;
  const plans = Array.isArray(doc.floorPlans) ? doc.floorPlans : [];
  const mats = settings && Array.isArray(settings.reflectors) ? settings.reflectors : null;
  return {
    ...doc,
    schemaVersion: 13,
    ...(settings && mats ? { settings: { ...settings, reflectors: mats.map((m) => (m && typeof m === 'object' ? { ...(m as object), presetId: null } : m)) } } : {}),
    floorPlans: plans.map((fp) => {
      if (!fp || typeof fp !== 'object' || !Array.isArray((fp as { elements?: unknown }).elements)) return fp;
      const f = fp as { elements: unknown[] };
      return {
        ...f,
        elements: f.elements.map((e) => {
          const k = e && typeof e === 'object' ? (e as { kind?: unknown }).kind : null;
          return k === 'actor' || k === 'reflector' ? { ...(e as object), icon: null, size: 40 } : e;
        }),
      };
    }),
  };
}

/**
 * Format 13 → 14 : les trajets deviennent des positions numérotées avec orientation.
 * Caméra : même orientation tout le long (travelling) ; personnage : tourné dans le sens de la marche.
 */
function from13to14(doc: Record<string, unknown>): Record<string, unknown> {
  const plans = Array.isArray(doc.floorPlans) ? doc.floorPlans : [];
  const bearingOf = (a: { x: number; y: number }, b: { x: number; y: number }) => ((Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI + 360) % 360;
  return {
    ...doc,
    schemaVersion: 14,
    floorPlans: plans.map((fp) => {
      if (!fp || typeof fp !== 'object' || !Array.isArray((fp as { elements?: unknown }).elements)) return fp;
      const f = fp as { elements: unknown[] };
      return {
        ...f,
        elements: f.elements.map((e) => {
          if (!e || typeof e !== 'object') return e;
          const el = e as { kind?: unknown; at?: { x: number; y: number }; rotation?: number; path?: unknown };
          if (el.kind === 'light') return { ...el, positions: [] };
          if (el.kind !== 'camera' && el.kind !== 'actor') return e;
          const { path, ...rest } = el;
          const pts = Array.isArray(path) ? (path as { x: number; y: number }[]) : [];
          let prev = el.at ?? { x: 0, y: 0 };
          const positions = pts.map((p) => {
            const rotation = el.kind === 'actor' && (p.x !== prev.x || p.y !== prev.y) ? Math.round(bearingOf(prev, p)) : (el.rotation ?? 0);
            prev = p;
            return { at: { x: p.x, y: p.y }, rotation };
          });
          return { ...rest, positions };
        }),
      };
    }),
  };
}

/**
 * Format 14 → 15 : tampons entre séquences (aucun) ; bibliothèque d'images, constituée des
 * images déjà présentes dans les plans et des fonds de plans au sol (sans doublon de fichier).
 */
function from14to15(doc: Record<string, unknown>): Record<string, unknown> {
  const library: { id: string; file: string; originalName: string; caption: string; hash: null }[] = [];
  const seen = new Set<string>();
  const add = (file: unknown, name: unknown) => {
    if (typeof file !== 'string' || !file || seen.has(file)) return;
    seen.add(file);
    library.push({ id: `lib-${library.length + 1}`, file, originalName: typeof name === 'string' ? name : '', caption: '', hash: null });
  };
  for (const s of Array.isArray(doc.sequences) ? doc.sequences : [])
    for (const p of s && typeof s === 'object' && Array.isArray((s as { plans?: unknown }).plans) ? (s as { plans: unknown[] }).plans : [])
      for (const i of p && typeof p === 'object' && Array.isArray((p as { images?: unknown }).images) ? (p as { images: unknown[] }).images : [])
        if (i && typeof i === 'object') add((i as { file?: unknown }).file, (i as { originalName?: unknown }).originalName);
  for (const f of Array.isArray(doc.floorPlans) ? doc.floorPlans : []) {
    const bg = f && typeof f === 'object' ? (f as { background?: unknown }).background : null;
    if (bg && typeof bg === 'object') add((bg as { file?: unknown }).file, (bg as { originalName?: unknown }).originalName);
  }
  return { ...doc, schemaVersion: 15, stamps: [], library };
}

/**
 * Format 15 → 16 : réglages repris par le plan suivant (les projets existants gardent le
 * comportement d'avant : tout est repris) ; abréviations modifiables (celles qui étaient
 * fixées dans l'application) ; plans types (aucun).
 */
function from15to16(doc: Record<string, unknown>): Record<string, unknown> {
  const settings = doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : {};
  const all = { size: true, axis: true, angle: true, focal: true, movement: true, grip: true };
  // Même ordre de clés que defaults.ts (relecture à l'identique).
  const { timeZone, ...rest } = settings;
  return { ...doc, schemaVersion: 16, settings: { ...rest, carryOver: all, aliases: structuredClone(TERM_ALIASES), shotPresets: [], timeZone } };
}

/**
 * Format 16 → 17 : modèles d'export et icônes des figures du plan au sol, dans le projet
 * (aucun : les modèles gardés sur le Mac se reprennent dans Réglages › Matériel).
 */
function from16to17(doc: Record<string, unknown>): Record<string, unknown> {
  const settings = doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : {};
  const { timeZone, ...rest } = settings;
  return { ...doc, schemaVersion: 17, settings: { ...rest, exportPresets: [], floorIcons: { camera: null, actor: null, light: null }, timeZone } };
}

/**
 * Format 17 → 18 : chaque figure (caméra, personnage, projecteur, réflecteur) et chaque modèle de
 * projecteur peut avoir sa propre icône, avec son sens. Les icônes déjà posées regardaient vers le haut.
 */
function from17to18(doc: Record<string, unknown>): Record<string, unknown> {
  const fig = (file: unknown) => (typeof file === 'string' && file ? { file, name: '', turn: 0 } : null);
  const settings = doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : {};
  const fixtures = Array.isArray(settings.fixtures) ? settings.fixtures.map((f) => (f && typeof f === 'object' ? { ...(f as object), icon: null } : f)) : settings.fixtures;
  const floorPlans = Array.isArray(doc.floorPlans)
    ? doc.floorPlans.map((fp) =>
        fp && typeof fp === 'object' && Array.isArray((fp as { elements?: unknown }).elements)
          ? {
              ...(fp as object),
              elements: (fp as { elements: unknown[] }).elements.map((e) => {
                if (!e || typeof e !== 'object') return e;
                const k = (e as { kind?: unknown }).kind;
                if (k === 'camera') return { ...(e as object), icon: null };
                if (k === 'actor' || k === 'light' || k === 'reflector') return { ...(e as object), icon: fig((e as { icon?: unknown }).icon) };
                return e;
              }),
            }
          : fp,
      )
    : doc.floorPlans;
  return { ...doc, schemaVersion: 18, settings: { ...settings, fixtures }, floorPlans };
}
