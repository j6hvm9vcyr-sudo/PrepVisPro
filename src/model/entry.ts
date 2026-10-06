/**
 * Saisie dans les cellules du découpage : suggestions, lecture du texte tapé,
 * application au plan, et texte affiché.
 *
 * Règle de fiabilité : on ne devine jamais en silence.
 * - Une partie qui n'est pas la dernière doit correspondre à UN seul terme.
 * - La dernière partie prend la suggestion surlignée, que l'utilisateur voit avant de valider.
 * - En mode strict (validation implicite, ex. clic ailleurs), la dernière partie
 *   doit elle aussi être sans ambiguïté, et aucun terme n'est créé.
 */
import type { CameraSetup, Framing, ProjectDoc, TermCategory } from './types';
import { TERM_ALIASES } from './defaults';
import { capitalize, formatNumber, norm, parseDecimal } from './text';

export type EditableField = 'action' | 'size' | 'axis' | 'angle' | 'focal' | 'movement' | 'grip';
export type TermField = Exclude<EditableField, 'action' | 'focal'>;

export const FIELD_LABEL: Record<EditableField, string> = {
  action: 'Action',
  size: 'Valeur',
  axis: 'Axe',
  angle: 'Angle',
  focal: 'Focale',
  movement: 'Mouvement',
  grip: 'Machinerie',
};

const FIELD_CATEGORY: Record<TermField, TermCategory> = {
  size: 'size',
  axis: 'axis',
  angle: 'angle',
  movement: 'movement',
  grip: 'grip',
};

export function categoryOf(field: TermField): TermCategory {
  return FIELD_CATEGORY[field];
}

const TILT_MIN = -90;
const TILT_MAX = 90;
const FOCAL_MAX = 2000;

// ---------------------------------------------------------------- découpage

function separatorFor(field: EditableField): RegExp {
  if (field === 'movement') return />|→|,/;
  if (field === 'grip') return /,|\+/;
  return />|→/;
}

/** Découpe le texte en parties (début > fin, ou liste). */
function splitParts(field: EditableField, text: string): string[] {
  return text.split(separatorFor(field)).map((p) => p.trim());
}

const TILT_RE = /(^|\s)([+-]?\d+(?:[.,]\d+)?)\s*(?:°|deg)?(?=\s|$)/g;

/** Sépare, dans une partie d'angle, le terme et l'inclinaison. */
export function splitAnglePart(part: string): { word: string; tilt: number | null; error: string | null } {
  const matches = [...part.matchAll(TILT_RE)];
  if (matches.length > 1) return { word: '', tilt: null, error: 'Une seule inclinaison par réglage.' };
  let tilt: number | null = null;
  let word = part;
  if (matches.length === 1) {
    tilt = parseDecimal(matches[0]![2]!);
    word = part.replace(TILT_RE, ' ');
  }
  word = word.replace(/°/g, ' ').replace(/\s+/g, ' ').trim();
  if (tilt !== null && (tilt < TILT_MIN || tilt > TILT_MAX)) {
    return { word, tilt: null, error: `Inclinaison entre ${TILT_MIN}° et ${TILT_MAX}°.` };
  }
  return { word, tilt, error: null };
}

// ---------------------------------------------------------------- termes

/** Contexte de la saisie des termes : abréviations (préférences de l'app), et nombre d'emplois de chaque terme dans le projet. */
export interface TermCtx {
  /** Abréviations reconnues, par terme (Préférences › Saisie). Par défaut : celles livrées avec l'app. */
  aliases?: Readonly<Record<string, readonly string[]>>;
  /** Emplois dans le projet : départage les termes qui commencent pareil (le plus employé d'abord). */
  usage?: ReadonlyMap<string, number>;
}

function keysOf(term: string, aliases: TermCtx['aliases'] = TERM_ALIASES): string[] {
  return [norm(term), ...(aliases[term] ?? []).map(norm)];
}

type Resolve = { term: string } | { error: string };

/** Trouve LE terme correspondant à un fragment (exact ou préfixe unique). */
function resolveTerm(terms: readonly string[], fragment: string, label: string, aliases?: TermCtx['aliases']): Resolve {
  const n = norm(fragment);
  if (!n) return { error: 'Partie vide.' };
  const exact = terms.filter((t) => keysOf(t, aliases).includes(n));
  if (exact.length === 1) return { term: exact[0]! };
  const prefix = terms.filter((t) => keysOf(t, aliases).some((k) => k.startsWith(n)));
  if (prefix.length === 1) return { term: prefix[0]! };
  if (prefix.length > 1) return { error: `« ${fragment.trim()} » est ambigu : ${prefix.join(', ')}.` };
  return { error: `« ${fragment.trim()} » n’existe pas en ${label.toLowerCase()}.` };
}

export interface Suggestion {
  term: string;
  /** true : proposition de créer ce nouveau terme. */
  create: boolean;
}

/** Suggestions pour la dernière partie tapée. */
export function suggest(field: EditableField, text: string, terms: readonly string[], ctx: TermCtx = {}): Suggestion[] {
  if (field === 'action') return [];
  if (field === 'focal') {
    // Focales des optiques du projet (« terms » = focales en texte) : celles qui commencent par ce qui est tapé.
    const last = (splitParts(field, text).pop() ?? '').replace(/\s*mm$/i, '').trim().replace('.', ',');
    return terms.filter((t) => !last || t.startsWith(last)).map((term) => ({ term, create: false }));
  }
  const parts = splitParts(field, text);
  const last = parts[parts.length - 1] ?? '';
  let fragment = last;
  if (field === 'angle') {
    const a = splitAnglePart(last);
    fragment = a.word;
    if (!fragment && a.tilt !== null) return [];
  }
  const n = norm(fragment);
  const exact = n ? terms.filter((t) => keysOf(t, ctx.aliases).includes(n)) : [];
  const prefix = terms.filter((t) => !exact.includes(t) && (!n || keysOf(t, ctx.aliases).some((k) => k.startsWith(n))));
  // Liste complète (rien de tapé) : l'ordre des Réglages, stable. Début tapé : le plus employé d'abord.
  const use = ctx.usage;
  if (n && use) prefix.sort((a, b) => (use.get(b) ?? 0) - (use.get(a) ?? 0));
  const list: Suggestion[] = [...exact, ...prefix].map((term) => ({ term, create: false }));
  if (n && exact.length === 0) list.push({ term: capitalize(fragment), create: true });
  return list;
}

// ---------------------------------------------------------------- lecture

export type FieldValue =
  | { field: 'action'; text: string }
  | { field: 'size' | 'axis'; start: string; end: string | null }
  | { field: 'angle'; start: { angle: string; tilt: number | null }; end: { angle: string; tilt: number | null } | null }
  | { field: 'focal'; start: number | null; end: number | null }
  | { field: 'movement' | 'grip'; list: string[] };

export type ParseResult = { ok: true; value: FieldValue; newTerms: string[] } | { ok: false; error: string };

export interface ParseOptions {
  /** Index de la suggestion surlignée pour la dernière partie. */
  pick?: number;
  /** Validation implicite : pas de création, pas de choix par défaut ambigu. */
  strict?: boolean;
  ctx?: TermCtx;
}

export function parseEntry(field: EditableField, text: string, terms: readonly string[], opts: ParseOptions = {}): ParseResult {
  const label = FIELD_LABEL[field];
  if (field === 'action') return { ok: true, value: { field, text: text.trim() }, newTerms: [] };

  const parts = splitParts(field, text);
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();

  // Tout vide : on efface le champ.
  if (parts.every((p) => p === '')) {
    if (field === 'movement' || field === 'grip') return { ok: true, value: { field, list: [] }, newTerms: [] };
    if (field === 'focal') return { ok: true, value: { field, start: null, end: null }, newTerms: [] };
    if (field === 'angle') return { ok: true, value: { field, start: { angle: '', tilt: null }, end: null }, newTerms: [] };
    return { ok: true, value: { field, start: '', end: null }, newTerms: [] };
  }
  if (parts.some((p) => p === '')) return { ok: false, error: 'Une partie est vide entre deux séparateurs.' };

  const isList = field === 'movement' || field === 'grip';
  if (!isList && parts.length > 2) return { ok: false, error: 'Un seul « > » : début > fin.' };

  if (field === 'focal') {
    const nums: number[] = [];
    for (const p of parts) {
      const v = parseDecimal(p.replace(/\s*mm$/i, ''));
      if (v === null || v <= 0 || v > FOCAL_MAX) return { ok: false, error: `Focale : un nombre en mm entre 0 et ${FOCAL_MAX} (ex. 40, ou 75 > 300).` };
      nums.push(v);
    }
    return { ok: true, value: { field, start: nums[0]!, end: nums[1] ?? null }, newTerms: [] };
  }

  const newTerms: string[] = [];
  const pickLast = (fragment: string): Resolve => {
    if (opts.strict) {
      const r = resolveTerm(terms, fragment, label, opts.ctx?.aliases);
      return r;
    }
    const sugs = suggest(field, fragment, terms, opts.ctx);
    const s = sugs[Math.min(Math.max(0, opts.pick ?? 0), sugs.length - 1)];
    if (!s) return { error: `« ${fragment} » : aucune proposition.` };
    if (s.create) newTerms.push(s.term);
    return { term: s.term };
  };

  const words: string[] = [];
  const tilts: (number | null)[] = [];
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    let fragment = parts[i]!;
    let tilt: number | null = null;
    if (field === 'angle') {
      const a = splitAnglePart(fragment);
      if (a.error) return { ok: false, error: a.error };
      fragment = a.word;
      tilt = a.tilt;
    }
    let word = '';
    if (fragment) {
      const r = isLast ? pickLast(fragment) : resolveTerm(terms, fragment, label, opts.ctx?.aliases);
      if ('error' in r) return { ok: false, error: r.error };
      word = r.term;
    }
    words.push(word);
    tilts.push(tilt);
  }

  if (field === 'movement') return { ok: true, value: { field, list: words }, newTerms };
  if (field === 'grip') return { ok: true, value: { field, list: [...new Set(words)] }, newTerms };
  if (field === 'angle') {
    return {
      ok: true,
      value: {
        field,
        start: { angle: words[0]!, tilt: tilts[0] ?? null },
        end: parts.length > 1 ? { angle: words[1]!, tilt: tilts[1] ?? null } : null,
      },
      newTerms,
    };
  }
  return { ok: true, value: { field, start: words[0]!, end: parts.length > 1 ? words[1]! : null }, newTerms };
}

// ---------------------------------------------------------------- application

function sameFraming(a: Framing, b: Framing): boolean {
  return a.size === b.size && a.axis === b.axis && a.angle === b.angle && a.tiltDeg === b.tiltDeg && a.focalMm === b.focalMm;
}

/** Supprime le réglage de fin s'il est identique au début. */
function tidyEnd(setup: CameraSetup): CameraSetup {
  if (setup.end && sameFraming(setup.start, setup.end)) return { ...setup, end: null };
  return setup;
}

/**
 * Applique une valeur lue à une caméra (fonction pure).
 * Une valeur sans « fin » sur un plan évolutif rend CE champ non évolutif.
 */
export function applyValue(setup: CameraSetup, value: Exclude<FieldValue, { field: 'action' }>): CameraSetup {
  const start = { ...setup.start };
  let end: Framing | null = setup.end ? { ...setup.end } : null;
  const ensureEnd = (): Framing => {
    if (!end) end = { ...setup.start };
    return end;
  };
  switch (value.field) {
    case 'size':
    case 'axis': {
      start[value.field] = value.start;
      if (value.end !== null) ensureEnd()[value.field] = value.end;
      else if (end) end[value.field] = value.start;
      break;
    }
    case 'angle': {
      start.angle = value.start.angle;
      start.tiltDeg = value.start.tilt;
      if (value.end) {
        const e = ensureEnd();
        e.angle = value.end.angle;
        e.tiltDeg = value.end.tilt;
      } else if (end) {
        end.angle = value.start.angle;
        end.tiltDeg = value.start.tilt;
      }
      break;
    }
    case 'focal': {
      start.focalMm = value.start;
      if (value.end !== null) ensureEnd().focalMm = value.end;
      else if (end) end.focalMm = value.start;
      break;
    }
    case 'movement':
      return { ...setup, movements: value.list };
    case 'grip':
      return { ...setup, grip: value.list };
  }
  // Si on vient de créer « end » par copie du début, il doit refléter les autres champs du début.
  return tidyEnd({ ...setup, start, end });
}

// ---------------------------------------------------------------- affichage

function angleText(f: Framing): string {
  const tilt = f.tiltDeg !== null ? `${f.tiltDeg > 0 ? '+' : ''}${formatNumber(f.tiltDeg)}°` : '';
  return [f.angle, tilt].filter(Boolean).join(' ');
}

function pair(a: string, b: string | null): string {
  if (b === null || b === a) return a;
  return `${a || '—'} → ${b || '—'}`;
}

/** Texte affiché dans la cellule (chaîne vide = non renseigné). */
export function displayText(field: Exclude<EditableField, 'action'>, s: CameraSetup): string {
  const e = s.end;
  switch (field) {
    case 'size':
    case 'axis':
      return pair(s.start[field], e ? e[field] : null);
    case 'angle':
      return pair(angleText(s.start), e ? angleText(e) : null);
    case 'focal': {
      const a = s.start.focalMm !== null ? formatNumber(s.start.focalMm) : '';
      const b = e && e.focalMm !== null ? formatNumber(e.focalMm) : null;
      if (!a && !b) return '';
      return pair(a, b) + ' mm';
    }
    case 'movement':
      return s.movements.join(' → ');
    case 'grip':
      return s.grip.join(', ');
  }
}

/** Le champ change-t-il entre début et fin ? */
export function isEvolving(field: Exclude<EditableField, 'action'>, s: CameraSetup): boolean {
  if (field === 'movement') return s.movements.length > 1;
  if (!s.end) return false;
  switch (field) {
    case 'size':
    case 'axis':
      return s.start[field] !== s.end[field];
    case 'angle':
      return s.start.angle !== s.end.angle || s.start.tiltDeg !== s.end.tiltDeg;
    case 'focal':
      return s.start.focalMm !== s.end.focalMm;
    case 'grip':
      return false;
  }
}

/** Texte proposé quand on ouvre la cellule en modification. */
export function editText(field: Exclude<EditableField, 'action'>, s: CameraSetup): string {
  const e = s.end;
  const two = (a: string, b: string | null) => (b !== null && b !== a ? `${a} > ${b}` : a);
  switch (field) {
    case 'size':
    case 'axis':
      return two(s.start[field], e ? e[field] : null);
    case 'angle':
      return two(angleText(s.start).replace('°', ''), e ? angleText(e).replace('°', '') : null);
    case 'focal': {
      const a = s.start.focalMm !== null ? formatNumber(s.start.focalMm) : '';
      const b = e && e.focalMm !== null ? formatNumber(e.focalMm) : null;
      return two(a, b);
    }
    case 'movement':
      return s.movements.join(' > ');
    case 'grip':
      return s.grip.join(', ');
  }
}

/**
 * Suggestion choisie aux flèches alors que la partie en cours est vide (case vide, ou après
 * « > » / « , ») : le terme choisi complète le texte. null s'il n'y a rien à compléter.
 */
export function completeWithPick(field: EditableField, text: string, terms: readonly string[], pick: number, ctx: TermCtx = {}): string | null {
  if (field === 'action' || field === 'focal') return null;
  const parts = splitParts(field, text);
  const last = parts[parts.length - 1] ?? '';
  const fragment = field === 'angle' ? splitAnglePart(last) : null;
  const empty = fragment ? !fragment.word && fragment.tilt === null : last.trim() === '';
  if (!empty) return null;
  const s = suggest(field, text, terms, ctx)[pick];
  if (!s || s.create) return null;
  const head = text.replace(/\s+$/, '');
  return head ? `${head} ${s.term}` : s.term;
}

/**
 * Focale choisie aux flèches dans les optiques du projet : elle remplace la partie en cours
 * (« 3 » → « 35 », « 75 > 1 » → « 75 > 100 »). null si rien n'est choisi.
 */
export function focalWithPick(text: string, kit: readonly string[], pick: number): string | null {
  const s = suggest('focal', text, kit)[pick];
  if (!s) return null;
  const i = text.lastIndexOf('>');
  return i < 0 ? s.term : `${text.slice(0, i + 1).trimEnd()} ${s.term}`;
}

/** Emplois de chaque terme d'une catégorie dans le projet (début et fin des plans évolutifs compris). */
export function termUsage(doc: ProjectDoc, cat: TermCategory): Map<string, number> {
  const m = new Map<string, number>();
  const add = (t: string) => void (t && m.set(t, (m.get(t) ?? 0) + 1));
  for (const s of doc.sequences)
    for (const p of s.plans)
      for (const c of p.cameras) {
        if (cat === 'movement') c.movements.forEach(add);
        else if (cat === 'grip') c.grip.forEach(add);
        else {
          add(c.start[cat]);
          if (c.end) add(c.end[cat]);
        }
      }
  return m;
}

/**
 * Pourquoi cette abréviation ne peut pas être ajoutée à ce terme : vide, ou déjà prise par un
 * autre terme de la liste (elle rendrait la saisie ambiguë). null si elle convient.
 */
export function aliasConflict(terms: readonly string[], aliases: Readonly<Record<string, readonly string[]>>, term: string, alias: string): string | null {
  const n = norm(alias);
  if (!n) return 'Abréviation vide';
  if (keysOf(term, aliases).includes(n)) return 'Déjà reconnue pour ce terme';
  const other = terms.find((t) => t !== term && keysOf(t, aliases).includes(n));
  return other ? `Déjà prise par « ${other} »` : null;
}

/** Contexte de saisie d'un champ du projet. */
export function termCtx(doc: ProjectDoc, field: EditableField, aliases: TermCtx['aliases']): TermCtx {
  if (field === 'action' || field === 'focal') return {};
  return { aliases, usage: termUsage(doc, categoryOf(field)) };
}
