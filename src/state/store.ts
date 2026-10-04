import { create } from 'zustand';
import type { Id, ImageKind, ProjectDoc, Sequence } from '../model/types';
import { computeNumbers } from '../model/numbering';
import { kitFocals } from '../model/lenses';
import { formatNumber, norm } from '../model/text';
import { applyValue, categoryOf, completeWithPick, focalWithPick, editText as fieldEditText, FIELD_LABEL, parseEntry, type EditableField, type TermField } from '../model/entry';
import * as ops from '../model/ops';
import { cleanupFloorRefs } from '../model/floorOps';
import { cleanupShooting } from '../model/shooting';
import { cleanupDays } from '../model/days';
import * as stamps from '../model/stamps';
import * as library from '../model/library';
import { createHistory, pushHistory, redoHistory, undoHistory, type History } from './history';
import { allLines, COLUMNS, moveCursor, visibleLines, type Column, type Cursor, type Line } from './lines';
import { imageStore } from '../platform/images';
import { produce, type Draft } from 'immer';

/** Une version du document, et l'endroit où la modification a eu lieu (pour y revenir à l'annulation). */
interface Snapshot {
  doc: ProjectDoc;
  at: Cursor | null;
}

interface EditState {
  text: string;
  pick: number;
  error: string | null;
  /** Une suggestion a été choisie aux flèches (ou à la souris). */
  navigated?: boolean;
  /** Saisie groupée : autres lignes de la sélection qui recevront la même valeur (même colonne). */
  batch?: Line[];
  /**
   * ↩ sur une case déjà remplie d'un seul terme : toute la liste est proposée, la valeur actuelle
   * surlignée ; les flèches la remplacent directement. Taper du texte revient à la saisie normale.
   */
  browse?: string[];
}

type MessageKind = 'info' | 'warn';

export interface AppState {
  hist: History<Snapshot>;
  cursor: Cursor | null;
  /** Début d'une sélection de plusieurs cellules (⇧ + flèches, ⇧ + clic). */
  anchor: Cursor | null;
  editing: EditState | null;
  view: 'table' | 'cards' | 'floor' | 'shooting' | 'days' | 'library';
  inspector: boolean;
  collapsed: Record<Id, boolean>;
  onlyIncomplete: boolean;
  message: { text: string; kind: MessageKind } | null;
  preview: { planId: Id; index: number } | null;
  showShortcuts: boolean;
  pendingDrop: { planId: Id; files: File[] } | null;
  editingSequenceId: Id | null;
  /** Tampon ouvert en modification (TITRE, GÉNÉRIQUE…). */
  editingStampId: Id | null;
  /** Choix dans la bibliothèque d'images : pour un plan (repérage / référence) ou un fond de plan au sol. */
  libraryPick: { mode: 'plan'; planId: Id; kind: ImageKind } | { mode: 'background'; floorPlanId: Id } | null;
  showSettings: boolean;
  showExport: boolean;
  showVersions: boolean;
  importing: { name: string; scenes: import('../import/fdx').ScriptScene[] } | null;
  contextMenu: { x: number; y: number; planId: Id; setupId: Id } | null;
}

const MESSAGE_CLEAR = null;

function initialState(doc: ProjectDoc): AppState {
  const first = allLines(doc)[0];
  return {
    hist: createHistory<Snapshot>({ doc, at: null }),
    cursor: first ? { planId: first.planId, setupId: first.setupId, col: 'size' } : null,
    anchor: null,
    editing: null,
    view: 'table',
    inspector: true,
    collapsed: {},
    onlyIncomplete: false,
    message: null,
    preview: null,
    showShortcuts: false,
    pendingDrop: null,
    editingSequenceId: null,
    editingStampId: null,
    libraryPick: null,
    showSettings: false,
    showExport: false,
    showVersions: false,
    importing: null,
    contextMenu: null,
  };
}

// ------------------------------------------------------------------ sélecteurs

export const selectDoc = (s: AppState) => s.hist.present.doc;
export const selectCursor = (s: AppState) => s.cursor;

export function linesOf(s: AppState): Line[] {
  return visibleLines(s.hist.present.doc, { collapsed: s.collapsed, onlyIncomplete: s.onlyIncomplete });
}

function fieldOf(col: Column): EditableField | null {
  return col === 'image' ? null : col;
}

export interface Range {
  lines: Line[];
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

/**
 * Numéro proposé pour une nouvelle séquence insérée après `afterSeqId` :
 * le suivant s'il est libre (« 4 » → « 5 »), sinon une variante (« 4A », « 4B »…).
 */
export function suggestSequenceNumber(doc: ProjectDoc, afterSeqId: Id | null): string {
  const used = new Set(doc.sequences.map((s) => s.number.trim().toUpperCase()));
  const prev = afterSeqId ? doc.sequences.find((s) => s.id === afterSeqId) : doc.sequences[doc.sequences.length - 1];
  const base = prev?.number.trim().toUpperCase() ?? '';
  const m = base.match(/^(\d+)([A-Z]*)$/);
  if (!m) return used.has('1') ? '' : '1';
  const n = Number(m[1]);
  const idx = prev ? doc.sequences.indexOf(prev) : -1;
  const nextSeq = doc.sequences[idx + 1];
  const candidate = String(n + 1);
  // Insérée entre deux séquences : variante lettrée pour ne pas casser la numérotation.
  if (!used.has(candidate) && (!nextSeq || nextSeq.number.trim().toUpperCase() !== candidate)) return candidate;
  for (let i = 0; i < 26; i++) {
    const v = `${n}${String.fromCharCode(65 + i)}`;
    if (!used.has(v) && v !== base) return v;
  }
  return '';
}

/** Une fenêtre superposée a la main sur le clavier (le tableau ne doit pas réagir). */
export function anyOverlay(s: AppState): boolean {
  return !!(s.preview || s.showShortcuts || s.pendingDrop || s.editingSequenceId || s.editingStampId || s.libraryPick || s.showSettings || s.showExport || s.showVersions || s.importing || s.contextMenu);
}

/** Rectangle sélectionné (une seule cellule s'il n'y a pas de sélection étendue). */
export function rangeOf(s: AppState): Range | null {
  const c = s.cursor;
  if (!c) return null;
  const lines = linesOf(s);
  const i = lines.findIndex((l) => l.planId === c.planId && l.setupId === c.setupId);
  if (i < 0) return null;
  const a = s.anchor;
  const j = a ? lines.findIndex((l) => l.planId === a.planId && l.setupId === a.setupId) : -1;
  const ci = COLUMNS.indexOf(c.col);
  const cj = a && j >= 0 ? COLUMNS.indexOf(a.col) : ci;
  const jj = j >= 0 ? j : i;
  return { lines, r0: Math.min(i, jj), r1: Math.max(i, jj), c0: Math.min(ci, cj), c1: Math.max(ci, cj) };
}

/** Texte d'une cellule, tel qu'on le retaperait. null : cellule sans texte (image, action d'une 2e caméra). */
function cellText(doc: ProjectDoc, line: Line, col: Column): string | null {
  if (col === 'image') return null;
  const loc = ops.locatePlan(doc, line.planId);
  const setup = loc?.plan.cameras.find((x) => x.id === line.setupId);
  if (!loc || !setup) return null;
  if (col === 'action') return line.setupIndex === 0 ? loc.plan.action : null;
  return fieldEditText(col, setup);
}

/**
 * Écrit plusieurs cellules, en lecture stricte (rien de deviné ni créé).
 * Tout ou rien : à la moindre erreur, aucune cellule n'est modifiée.
 */
function writeCells(doc: ProjectDoc, targets: { line: Line; col: Column; value: string }[], firstRow: number): { ok: true; doc: ProjectDoc; count: number } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let count = 0;
  let next = doc;
  const rowOf = new Map<string, number>();
  targets.forEach((t) => {
    const key = `${t.line.planId}|${t.line.setupId}`;
    if (!rowOf.has(key)) rowOf.set(key, rowOf.size + firstRow);
  });
  for (const t of targets) {
    const where = `ligne ${(rowOf.get(`${t.line.planId}|${t.line.setupId}`) ?? 0) - firstRow + 1}, ${t.col === 'image' ? 'image' : FIELD_LABEL[t.col].toLowerCase()}`;
    if (t.col === 'image') {
      if (t.value.trim()) errors.push(`${where} : une image ne se colle pas comme du texte`);
      continue;
    }
    const loc = ops.locatePlan(next, t.line.planId);
    const setup = loc?.plan.cameras.find((x) => x.id === t.line.setupId);
    if (!loc || !setup) continue;
    if (t.col === 'action') {
      if (t.line.setupIndex > 0) {
        if (t.value.trim()) errors.push(`${where} : l’action se colle sur la ligne de la première caméra`);
        continue;
      }
      if (loc.plan.action !== t.value.trim()) {
        next = ops.updatePlan(next, t.line.planId, (p) => {
          p.action = t.value.trim();
        });
      }
      count++;
      continue;
    }
    const terms = t.col === 'focal' ? [] : next.settings.terms[categoryOf(t.col as TermField)];
    const res = parseEntry(t.col, t.value, terms, { strict: true });
    if (!res.ok) {
      errors.push(`${where} : ${res.error}`);
      continue;
    }
    if (res.value.field === 'action') continue;
    next = ops.replaceCameraSetup(next, t.line.planId, applyValue(setup, res.value));
    count++;
  }
  return errors.length ? { ok: false, errors } : { ok: true, doc: next, count };
}

// ------------------------------------------------------------------ store

interface Actions {
  load(doc: ProjectDoc): void;
  setCursor(c: Cursor): void;
  move(dRow: number, dCol: number, wrap?: boolean, extend?: boolean): void;
  /** Saut : début/fin de ligne, premier/dernier plan. */
  jump(to: 'home' | 'end' | 'top' | 'bottom', extend?: boolean): void;
  /** Étend la sélection jusqu'à cette cellule. */
  extendTo(c: Cursor): void;
  /** Recopie vers le bas (⌘D) : la première ligne de la sélection, ou la ligne du dessus. */
  fillDown(): void;
  startEdit(initial?: string): void;
  setEditText(text: string): void;
  setPick(i: number): void;
  /** Choix aux flèches dans la liste complète (case déjà remplie). */
  browseTo(i: number): void;
  commitEdit(then?: 'down' | 'right' | 'left' | 'stay', pick?: number, strict?: boolean): boolean;
  cancelEdit(): void;
  clearCell(): void;
  /** Texte de la cellule courante, pour ⌘C. */
  copyCell(): string | null;
  /** Colle un texte (une valeur, ou un bloc copié depuis Excel : lignes et tabulations). */
  pasteText(text: string): boolean;
  newPlan(reprise: boolean): void;
  deletePlan(): void;
  movePlan(delta: -1 | 1): void;
  addCamera(planId: Id): void;
  removeCamera(planId: Id, setupId: Id): void;
  setPlanText(planId: Id, field: 'scriptExcerpt' | 'notes' | 'action', value: string): void;
  addImages(planId: Id, kind: ImageKind, files: File[]): Promise<void>;
  removeImage(planId: Id, imageId: Id): void;
  setImageKind(planId: Id, imageId: Id, kind: ImageKind): void;
  setCover(planId: Id, imageId: Id | null): void;
  addSequence(afterSeqId: Id | null): void;
  updateSequence(seqId: Id, fn: (s: Draft<Sequence>) => void, mergeKey?: string): void;
  deleteSequence(seqId: Id): void;
  moveSequence(seqId: Id, delta: -1 | 1): void;
  /** Ajoute un tampon (avant / après une séquence, ou en fin de film) et l'ouvre. */
  addStamp(text: string, where: { before: Id } | { after: Id } | null): void;
  updateStamp(id: Id, patch: { text?: string; note?: string }): void;
  removeStamp(id: Id): void;
  moveStamp(id: Id, delta: -1 | 1): void;
  setEditingStamp(id: Id | null): void;
  /** Importe des images dans la bibliothèque du projet (sans les placer). */
  importToLibrary(files: File[]): Promise<void>;
  /** Ajoute au plan des images de la bibliothèque. */
  addFromLibrary(planId: Id, ids: Id[], kind: ImageKind): void;
  removeLibraryImage(id: Id): void;
  setLibraryCaption(id: Id, caption: string): void;
  setLibraryPick(v: AppState['libraryPick']): void;
  undo(): void;
  redo(): void;
  toggleCollapsed(seqId: Id): void;
  expandAndGo(seqId: Id): void;
  toggleOnlyIncomplete(): void;
  setView(v: 'table' | 'cards' | 'floor' | 'shooting' | 'days' | 'library'): void;
  /** Enregistre une nouvelle version du document (plan au sol…), annulable. */
  applyDoc(next: ProjectDoc, message?: string, mergeKey?: string): void;
  toggleInspector(): void;
  setMessage(text: string, kind?: MessageKind): void;
  openPreview(planId?: Id, index?: number): void;
  closePreview(): void;
  previewStep(dImage: number, dPlan: number): void;
  setShowShortcuts(v: boolean): void;
  requestDrop(planId: Id, files: File[]): void;
  resolveDrop(kind: ImageKind | null): void;
  setEditingSequence(id: Id | null): void;
  setShowSettings(v: boolean): void;
  setShowExport(v: boolean): void;
  setShowVersions(v: boolean): void;
  setImporting(v: AppState['importing']): void;
  setContextMenu(v: AppState['contextMenu']): void;
  /** Change la caméra du projet utilisée par une caméra du plan. */
  setSetupCamera(planId: Id, setupId: Id, cameraId: Id): void;
  /** Remplace le document (import), en une étape annulable. */
  replaceDoc(doc: ProjectDoc, message: string): void;
  setShowSettings(v: boolean): void;
  /** Modification libre du document (réglages, infos projet). */
  updateDoc(fn: (d: Draft<ProjectDoc>) => void, mergeKey?: string, message?: string): void;
}

export type Store = AppState & Actions;

export function createAppStore(doc: ProjectDoc) {
  return create<Store>()((set, get) => {
    /** Enregistre une nouvelle version du document (annulable). */
    /**
     * `at` : endroit de la modification (on y revient à l'annulation).
     * `after` : où placer le curseur ensuite, si différent.
     */
    const commit = (raw: ProjectDoc, at: Cursor | null, message?: string | null, mergeKey: string | null = null, after?: Cursor) => {
      // Plans au sol : une caméra dont le plan a disparu est déliée (jamais effacée).
      // Ordre de tournage : un plan supprimé en sort ; un plan ajouté y apparaît « à ranger ».
      const doc = library.syncLibrary(stamps.cleanupStamps(cleanupDays(cleanupShooting(cleanupFloorRefs(raw)))));
      set((s) => ({
        hist: pushHistory(s.hist, { doc, at }, mergeKey),
        cursor: after ?? at ?? s.cursor,
        anchor: null,
        message: message ? { text: message, kind: 'info' } : message === null ? MESSAGE_CLEAR : s.message,
      }));
    };
    const warn = (text: string) => set({ message: { text, kind: 'warn' } });
    const cur = () => get().cursor;
    const docNow = () => get().hist.present.doc;
    /** Remplace le curseur sans créer d'étape d'annulation. */
    const setCursorOnly = (c: Cursor | null) => set({ cursor: c });
    /** Déplacement sans effacer le message (après une action qui vient d'en afficher un). */
    const moveQuiet = (dRow: number, dCol: number, wrap = false) => setCursorOnly(moveCursor(linesOf(get()), cur(), dRow, dCol, wrap));

    return {
      ...initialState(doc),

      load(doc) {
        set(initialState(doc));
      },

      setCursor(c) {
        if (get().editing) return;
        set({ cursor: c, anchor: null });
      },

      extendTo(c) {
        if (get().editing) return;
        set((s) => ({ anchor: s.anchor ?? s.cursor, cursor: c }));
      },

      move(dRow, dCol, wrap = false, extend = false) {
        const s = get();
        const anchor = extend ? (s.anchor ?? s.cursor) : null;
        set({ cursor: moveCursor(linesOf(s), cur(), dRow, dCol, wrap && !extend), anchor, message: null });
      },

      jump(to, extend = false) {
        const s = get();
        const c = cur();
        const lines = linesOf(s);
        if (!c || !lines.length) return;
        const anchor = extend ? (s.anchor ?? c) : null;
        let next: Cursor = c;
        if (to === 'home') next = { ...c, col: 'image' };
        if (to === 'end') next = { ...c, col: 'grip' };
        if (to === 'top') next = { planId: lines[0]!.planId, setupId: lines[0]!.setupId, col: c.col };
        if (to === 'bottom') next = { planId: lines[lines.length - 1]!.planId, setupId: lines[lines.length - 1]!.setupId, col: c.col };
        set({ cursor: next, anchor, message: null });
      },

      startEdit(initial) {
        const c = cur();
        if (!c) return;
        if (c.col === 'image') {
          get().openPreview();
          return;
        }
        const loc = ops.locatePlan(docNow(), c.planId);
        if (!loc) return;
        const setupIndex = loc.plan.cameras.findIndex((x) => x.id === c.setupId);
        if (c.col === 'action' && setupIndex > 0) {
          warn('L’action se saisit sur la ligne de la première caméra.');
          return;
        }
        const setup = loc.plan.cameras[setupIndex];
        if (!setup) return;
        const text = initial ?? (c.col === 'action' ? loc.plan.action : fieldEditText(c.col, setup));
        // Plusieurs lignes sélectionnées dans une même colonne : la valeur saisie ira à toutes.
        const r = rangeOf(get());
        let batch: Line[] | undefined;
        // (Sélection sur plusieurs colonnes : c'est la colonne de la cellule active qui est remplie.)
        if (r && r.r1 > r.r0) {
          batch = r.lines.slice(r.r0, r.r1 + 1).filter((l) => !(l.planId === c.planId && l.setupId === c.setupId) && !(c.col === 'action' && l.setupIndex > 0));
          if (!batch.length) batch = undefined;
        }
        let browse: string[] | undefined;
        let pick = 0;
        if (initial === undefined && c.col !== 'action' && text.trim() && !/[>,]/.test(text)) {
          const settings = docNow().settings;
          const list = c.col === 'focal' ? kitFocals(settings.lenses).map(formatNumber) : c.col === 'angle' && /\d/.test(text) ? [] : settings.terms[categoryOf(c.col as TermField)];
          const value = c.col === 'focal' ? text.replace(/\s*mm$/i, '').trim().replace('.', ',') : text.trim();
          const i = list.findIndex((t) => norm(t) === norm(value));
          if (i >= 0 && list.length > 1) {
            browse = [...list];
            pick = i;
          }
        }
        set({ editing: { text, pick, error: null, batch, browse }, anchor: batch ? get().anchor : null });
      },

      browseTo(i) {
        set((s) => (s.editing?.browse?.[i] !== undefined ? { editing: { ...s.editing, text: s.editing.browse[i]!, pick: i, error: null, navigated: false } } : {}));
      },

      setEditText(text) {
        set((s) => (s.editing ? { editing: { text, pick: 0, error: null, batch: s.editing.batch } } : {}));
      },

      setPick(i) {
        set((s) => (s.editing ? { editing: { ...s.editing, pick: i, navigated: true } } : {}));
      },

      commitEdit(then = 'stay', pick, strict = false) {
        const s = get();
        const c = cur();
        if (!s.editing || !c) return false;
        const field = fieldOf(c.col);
        if (!field) return false;
        const doc = docNow();
        const terms = field === 'action' ? [] : field === 'focal' ? kitFocals(doc.settings.lenses).map(formatNumber) : doc.settings.terms[categoryOf(field as TermField)];
        const at = pick ?? s.editing.pick;
        // Case vide (ou partie vide) + suggestion choisie aux flèches : c'est elle qu'on valide.
        const text =
          (!strict && s.editing.navigated && (field === 'focal' ? focalWithPick(s.editing.text, terms, at) : completeWithPick(field, s.editing.text, terms, at))) || s.editing.text;
        const r = parseEntry(field, text, terms, { pick: at, strict });
        if (!r.ok) {
          set({ editing: { ...s.editing, error: r.error } });
          return false;
        }
        let next: ProjectDoc;
        if (r.value.field === 'action') {
          const text = r.value.text;
          next = ops.updatePlan(doc, c.planId, (p) => {
            p.action = text;
          });
        } else {
          const loc = ops.locatePlan(doc, c.planId);
          const setup = loc?.plan.cameras.find((x) => x.id === c.setupId);
          if (!loc || !setup) return false;
          next = ops.replaceCameraSetup(doc, c.planId, applyValue(setup, r.value));
          if (r.newTerms.length) next = ops.addTerms(next, categoryOf(field as TermField), r.newTerms);
        }
        let msg = r.newTerms.length ? `Terme ajouté à la liste du projet : ${r.newTerms.join(', ')}` : null;
        const batch = s.editing.batch;
        if (batch?.length) {
          // Même valeur, telle que retenue pour la cellule active, sur toutes les lignes sélectionnées.
          const line = linesOf(s).find((l) => l.planId === c.planId && l.setupId === c.setupId);
          const value = line ? cellText(next, line, c.col) : null;
          if (value !== null) {
            const res = writeCells(next, batch.map((l) => ({ line: l, col: c.col, value })), 0);
            if (!res.ok) {
              set({ editing: { ...s.editing, error: res.errors[0] ?? 'Saisie groupée impossible' } });
              return false;
            }
            next = res.doc;
            msg = `${batch.length + 1} cellules remplies · ⌘Z pour annuler${msg ? ` · ${msg}` : ''}`;
          }
          set({ editing: null, anchor: null });
          if (JSON.stringify(next) !== JSON.stringify(doc)) commit(next, c, msg);
          return true;
        }
        set({ editing: null });
        // Valeur inchangée : pas d'étape d'annulation vide ni d'enregistrement inutile.
        if (JSON.stringify(next) !== JSON.stringify(doc)) commit(next, c, msg);
        if (then === 'down') moveQuiet(1, 0);
        if (then === 'right') moveQuiet(0, 1, true);
        if (then === 'left') moveQuiet(0, -1, true);
        return true;
      },

      cancelEdit() {
        set({ editing: null });
      },

      copyCell() {
        const s = get();
        const r = rangeOf(s);
        if (!r) return null;
        const doc = docNow();
        const rows: string[] = [];
        for (let i = r.r0; i <= r.r1; i++) {
          const line = r.lines[i]!;
          const vals: string[] = [];
          for (let k = r.c0; k <= r.c1; k++) vals.push(cellText(doc, line, COLUMNS[k]!) ?? '');
          rows.push(vals.join('\t'));
        }
        const out = rows.join('\n');
        return r.r0 === r.r1 && r.c0 === r.c1 && COLUMNS[r.c0] === 'image' ? null : out;
      },

      pasteText(text) {
        const s = get();
        const c = cur();
        const r = rangeOf(s);
        if (!c || !r) return false;
        const rows = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map((x) => x.split('\t'));
        const single = rows.length === 1 && rows[0]!.length === 1;
        // Une seule valeur et plusieurs cellules sélectionnées : la valeur remplit toute la sélection.
        const targets: { line: Line; col: Column; value: string }[] = [];
        if (single && (r.r1 > r.r0 || r.c1 > r.c0)) {
          for (let i = r.r0; i <= r.r1; i++) for (let k = r.c0; k <= r.c1; k++) targets.push({ line: r.lines[i]!, col: COLUMNS[k]!, value: rows[0]![0]! });
        } else {
          const width = Math.max(...rows.map((x) => x.length));
          if (r.r0 + rows.length > r.lines.length) {
            warn(`Collage impossible : ${rows.length} lignes à coller, mais seulement ${r.lines.length - r.r0} plans à partir d’ici. Créez d’abord les plans manquants (⌘↩).`);
            return false;
          }
          if (r.c0 + width > COLUMNS.length) {
            warn(`Collage impossible : ${width} colonnes à coller, le tableau n’en a que ${COLUMNS.length - r.c0} à partir d’ici.`);
            return false;
          }
          rows.forEach((row, i) => row.forEach((value, k) => targets.push({ line: r.lines[r.r0 + i]!, col: COLUMNS[r.c0 + k]!, value })));
        }
        const res = writeCells(docNow(), targets, r.r0);
        if (!res.ok) {
          warn(`Rien n’a été collé. ${res.errors.slice(0, 3).join(' · ')}${res.errors.length > 3 ? ` · et ${res.errors.length - 3} autre(s)` : ''}`);
          return false;
        }
        if (res.doc === docNow()) return true;
        const keep = s.anchor;
        commit(res.doc, c, `${res.count} cellule${res.count > 1 ? 's' : ''} collée${res.count > 1 ? 's' : ''} · ⌘Z pour annuler`);
        set({ anchor: keep });
        return true;
      },

      fillDown() {
        const s = get();
        const c = cur();
        const r = rangeOf(s);
        if (!c || !r) return;
        const doc = docNow();
        const targets: { line: Line; col: Column; value: string }[] = [];
        let src = r.r0;
        let from = r.r0 + 1;
        if (r.r0 === r.r1) {
          // Sans sélection verticale : on recopie la ligne du dessus.
          if (r.r0 === 0) return;
          src = r.r0 - 1;
          from = r.r0;
        }
        for (let k = r.c0; k <= r.c1; k++) {
          const col = COLUMNS[k]!;
          if (col === 'image') continue;
          const v = cellText(doc, r.lines[src]!, col);
          if (v === null) continue;
          for (let i = from; i <= r.r1; i++) targets.push({ line: r.lines[i]!, col, value: v });
        }
        if (!targets.length) return;
        const res = writeCells(doc, targets, from);
        if (!res.ok) {
          warn(`Recopie impossible. ${res.errors.slice(0, 2).join(' · ')}`);
          return;
        }
        if (res.doc !== doc) {
          const keep = s.anchor;
          commit(res.doc, c, `Recopié vers le bas (${res.count} cellule${res.count > 1 ? 's' : ''}) · ⌘Z pour annuler`);
          set({ anchor: keep });
        }
      },

      clearCell() {
        const s = get();
        const c = cur();
        const r = rangeOf(s);
        if (!c || !r) return;
        const targets: { line: Line; col: Column; value: string }[] = [];
        for (let i = r.r0; i <= r.r1; i++)
          for (let k = r.c0; k <= r.c1; k++) {
            const col = COLUMNS[k]!;
            if (col === 'image' || (col === 'action' && r.lines[i]!.setupIndex > 0)) continue;
            targets.push({ line: r.lines[i]!, col, value: '' });
          }
        if (!targets.length) return;
        const res = writeCells(docNow(), targets, r.r0);
        if (!res.ok || res.doc === docNow()) return;
        const one = targets.length === 1;
        commit(res.doc, c, one ? `${FIELD_LABEL[targets[0]!.col as EditableField]} effacé · ⌘Z pour annuler` : `${targets.length} cellules effacées · ⌘Z pour annuler`);
      },

      newPlan(reprise) {
        const c = cur();
        if (!c) return;
        const doc = docNow();
        const before = computeNumbers(doc);
        const r = ops.insertPlanAfter(doc, c.planId, { reprise });
        const after = computeNumbers(r.doc);
        let changed = 0;
        before.forEach((v, k) => {
          if (after.get(k)?.code !== v.code) changed++;
        });
        const plan = ops.locatePlan(r.doc, r.planId)!.plan;
        const cursor: Cursor = { planId: r.planId, setupId: plan.cameras[0]!.id, col: reprise ? 'size' : 'action' };
        set({ collapsed: { ...get().collapsed, [ops.locatePlan(r.doc, r.planId)!.seq.id]: false } });
        commit(
          r.doc,
          c,
          `${reprise ? 'Reprise' : 'Plan'} ${after.get(r.planId)!.code} créé avec les réglages de ${before.get(c.planId)!.code}` +
            (changed ? ` · ${changed} plan${changed > 1 ? 's' : ''} renuméroté${changed > 1 ? 's' : ''}` : ''),
          null,
          cursor,
        );
        if (!reprise) get().startEdit('');
      },

      deletePlan() {
        const c = cur();
        if (!c) return;
        const doc = docNow();
        const code = computeNumbers(doc).get(c.planId)?.code ?? '';
        const r = ops.deletePlan(doc, c.planId);
        if (!r.ok) {
          warn(r.error);
          return;
        }
        const p = ops.locatePlan(r.doc, r.focusPlanId)!.plan;
        commit(r.doc, c, `Plan ${code} supprimé · ⌘Z pour annuler`, null, { planId: p.id, setupId: p.cameras[0]!.id, col: c.col });
      },

      movePlan(delta) {
        const c = cur();
        if (!c) return;
        const doc = docNow();
        const next = ops.movePlan(doc, c.planId, delta);
        if (next === doc) return;
        commit(next, c, `Plan déplacé : désormais ${computeNumbers(next).get(c.planId)!.code}`);
      },

      addCamera(planId) {
        const r = ops.addCameraToPlan(docNow(), planId);
        const label = (() => {
          const p = ops.locatePlan(r.doc, planId)!.plan;
          const setup = p.cameras.find((x) => x.id === r.setupId)!;
          return r.doc.settings.cameras.find((k) => k.id === setup.cameraId)?.label ?? '';
        })();
        commit(r.doc, { planId, setupId: r.setupId, col: 'size' }, `Caméra ${label} ajoutée (réglages copiés)`);
      },

      removeCamera(planId, setupId) {
        const doc = docNow();
        const next = ops.removeCameraFromPlan(doc, planId, setupId);
        if (next === doc) return;
        const p = ops.locatePlan(next, planId)!.plan;
        commit(next, { planId, setupId: p.cameras[0]!.id, col: cur()?.col ?? 'size' }, 'Caméra retirée du plan');
      },

      setPlanText(planId, field, value) {
        const next = ops.updatePlan(docNow(), planId, (p) => {
          p[field] = value;
        });
        commit(next, cur(), undefined, `${field}:${planId}`);
      },

      async addImages(planId, kind, files) {
        const stored = await imageStore.importFiles(files, library.knownHashes(docNow()));
        if (!stored.length) {
          warn('Aucune image reconnue (JPEG, PNG, HEIC, TIFF, WebP).');
          return;
        }
        // Toute image importée entre dans la bibliothèque du projet ; une image déjà connue n'est pas dupliquée.
        const lib = library.addToLibrary(docNow(), stored);
        const r = library.addLibraryImagesToPlan(lib.doc, planId, lib.entries.map((e) => e.id), kind);
        const where = kind === 'scouting' ? 'repérage' : 'référence';
        if (!r.added) {
          commit(lib.doc, cur(), 'Déjà dans ce plan : aucune image ajoutée');
          return;
        }
        commit(r.doc, cur(), `${r.added} image${r.added > 1 ? 's' : ''} ajoutée${r.added > 1 ? 's' : ''} en ${where}${lib.reused ? ` (${lib.reused} déjà dans la bibliothèque, réutilisée${lib.reused > 1 ? 's' : ''})` : ''}`);
      },

      async importToLibrary(files) {
        const stored = await imageStore.importFiles(files, library.knownHashes(docNow()));
        if (!stored.length) {
          warn('Aucune image reconnue (JPEG, PNG, HEIC, TIFF, WebP).');
          return;
        }
        const before = docNow().library.length;
        const lib = library.addToLibrary(docNow(), stored);
        const added = lib.doc.library.length - before;
        if (!added) {
          get().setMessage(stored.length > 1 ? 'Ces images sont déjà dans la bibliothèque' : 'Cette image est déjà dans la bibliothèque');
          return;
        }
        commit(lib.doc, cur(), `${added} image${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} à la bibliothèque${lib.reused ? ` · ${lib.reused} déjà présente${lib.reused > 1 ? 's' : ''}` : ''}`);
      },

      addFromLibrary(planId, ids, kind) {
        const r = library.addLibraryImagesToPlan(docNow(), planId, ids, kind);
        if (!r.added) {
          get().setMessage('Déjà dans ce plan : aucune image ajoutée');
          return;
        }
        const code = computeNumbers(r.doc).get(planId)?.code ?? '';
        commit(r.doc, cur(), `${r.added} image${r.added > 1 ? 's' : ''} ajoutée${r.added > 1 ? 's' : ''} au plan ${code} en ${kind === 'scouting' ? 'repérage' : 'référence'}`);
      },

      removeLibraryImage(id) {
        const r = library.removeFromLibrary(docNow(), id);
        if (!r.ok) {
          warn(r.error);
          return;
        }
        commit(r.doc, cur(), 'Image retirée de la bibliothèque · ⌘Z pour annuler');
      },

      setLibraryCaption(id, caption) {
        commit(library.setLibraryCaption(docNow(), id, caption), cur(), undefined, `lib:${id}:caption`);
      },

      setLibraryPick(v) {
        set({ libraryPick: v });
      },

      removeImage(planId, imageId) {
        commit(ops.removeImage(docNow(), planId, imageId), cur(), 'Image retirée · ⌘Z pour annuler');
      },

      setImageKind(planId, imageId, kind) {
        commit(ops.setImageKind(docNow(), planId, imageId, kind), cur(), kind === 'scouting' ? 'Image classée en repérage' : 'Image classée en référence');
      },

      setCover(planId, imageId) {
        commit(ops.setCover(docNow(), planId, imageId), cur(), 'Image principale choisie');
      },

      addSequence(afterSeqId) {
        const doc = docNow();
        const r = ops.insertSequenceAfter(doc, afterSeqId, suggestSequenceNumber(doc, afterSeqId));
        const p = ops.locatePlan(r.doc, r.planId)!.plan;
        commit(r.doc, { planId: p.id, setupId: p.cameras[0]!.id, col: 'action' }, 'Séquence ajoutée');
        set({ editingSequenceId: r.seqId });
      },

      updateSequence(seqId, fn, mergeKey) {
        commit(ops.updateSequence(docNow(), seqId, fn), cur(), undefined, mergeKey ?? null);
      },

      deleteSequence(seqId) {
        const doc = docNow();
        if (doc.sequences.length <= 1) {
          warn('Le projet garde au moins une séquence.');
          return;
        }
        const seq = doc.sequences.find((s) => s.id === seqId);
        const next = stamps.deleteSequenceInFlow(doc, seqId);
        const first = allLines(next)[0]!;
        const c = cur();
        const keep = c && ops.locatePlan(next, c.planId);
        commit(next, keep ? c : { planId: first.planId, setupId: first.setupId, col: 'size' }, `Séquence ${seq?.number ?? ''} supprimée · ⌘Z pour annuler`);
        set({ editingSequenceId: null });
      },

      moveSequence(seqId, delta) {
        const doc = docNow();
        const next = stamps.moveInFlow(doc, seqId, delta);
        if (next !== doc) commit(next, cur(), 'Séquence déplacée · numéros généraux mis à jour');
      },

      addStamp(text, where) {
        const r = stamps.addStamp(docNow(), text, where);
        commit(r.doc, cur(), 'Tampon ajouté');
        set({ editingStampId: r.id, editingSequenceId: null });
      },

      updateStamp(id, patch) {
        commit(stamps.updateStamp(docNow(), id, patch), cur(), undefined, `stamp:${id}:${Object.keys(patch).join()}`);
      },

      removeStamp(id) {
        const t = docNow().stamps.find((x) => x.id === id);
        commit(stamps.removeStamp(docNow(), id), cur(), `Tampon ${t?.text ? `« ${t.text} » ` : ''}supprimé · ⌘Z pour annuler`);
        set({ editingStampId: null });
      },

      moveStamp(id, delta) {
        const doc = docNow();
        const next = stamps.moveInFlow(doc, id, delta);
        if (next !== doc) commit(next, cur(), 'Tampon déplacé');
      },

      setEditingStamp(id) {
        set({ editingStampId: id });
      },

      undo() {
        const s = get();
        if (!s.hist.past.length) return;
        const at = s.hist.present.at;
        set({ hist: undoHistory(s.hist), editing: null, message: { text: 'Annulé', kind: 'info' } });
        revealCursor(at);
      },

      redo() {
        const s = get();
        if (!s.hist.future.length) return;
        const h = redoHistory(s.hist);
        set({ hist: h, editing: null, message: { text: 'Rétabli', kind: 'info' } });
        revealCursor(h.present.at);
      },

      toggleCollapsed(seqId) {
        const collapsed = { ...get().collapsed, [seqId]: !get().collapsed[seqId] };
        set({ collapsed });
        ensureCursorVisible();
      },

      expandAndGo(seqId) {
        const doc = docNow();
        const seq = doc.sequences.find((x) => x.id === seqId);
        if (!seq) return;
        set({ collapsed: { ...get().collapsed, [seqId]: false }, view: get().view });
        const p = seq.plans[0]!;
        setCursorOnly({ planId: p.id, setupId: p.cameras[0]!.id, col: cur()?.col ?? 'size' });
        ensureCursorVisible();
      },

      toggleOnlyIncomplete() {
        set({ onlyIncomplete: !get().onlyIncomplete });
        ensureCursorVisible();
      },

      setView(v) {
        set({ view: v, editing: null });
      },

      toggleInspector() {
        set({ inspector: !get().inspector });
      },

      setMessage(text, kind = 'info') {
        set({ message: { text, kind } });
      },

      openPreview(planId, index) {
        const doc = docNow();
        const id = planId ?? cur()?.planId;
        if (!id) return;
        const loc = ops.locatePlan(doc, id);
        if (!loc || !loc.plan.images.length) {
          warn('Pas d’image pour ce plan : glissez-en une sur la vignette ou dans Détails.');
          return;
        }
        let i = index ?? -1;
        if (i < 0) {
          const coverId = loc.plan.coverImageId;
          const cov = (coverId && loc.plan.images.find((x) => x.id === coverId)) || loc.plan.images.find((x) => x.kind === 'scouting') || loc.plan.images[0]!;
          i = loc.plan.images.indexOf(cov);
        }
        set({ preview: { planId: id, index: Math.max(0, i) } });
      },

      closePreview() {
        set({ preview: null });
      },

      previewStep(dImage, dPlan) {
        const s = get();
        if (!s.preview) return;
        const doc = docNow();
        if (dImage) {
          const loc = ops.locatePlan(doc, s.preview.planId);
          if (!loc) return;
          const n = loc.plan.images.length;
          set({ preview: { planId: s.preview.planId, index: (s.preview.index + dImage + n) % n } });
          return;
        }
        const plans = linesOf(s).filter((l) => l.setupIndex === 0).map((l) => l.planId);
        let i = plans.indexOf(s.preview.planId);
        while (true) {
          i += dPlan;
          if (i < 0 || i >= plans.length) return;
          const loc = ops.locatePlan(doc, plans[i]!);
          if (loc && loc.plan.images.length) {
            setCursorOnly({ planId: loc.plan.id, setupId: loc.plan.cameras[0]!.id, col: cur()?.col ?? 'image' });
            get().openPreview(loc.plan.id);
            return;
          }
        }
      },

      setShowShortcuts(v) {
        set({ showShortcuts: v });
      },

      requestDrop(planId, files) {
        if (!files.length) return;
        set({ pendingDrop: { planId, files } });
      },

      resolveDrop(kind) {
        const p = get().pendingDrop;
        set({ pendingDrop: null });
        if (p && kind) void get().addImages(p.planId, kind, p.files);
      },

      setEditingSequence(id) {
        set({ editingSequenceId: id });
      },

      setShowSettings(v) {
        set({ showSettings: v, editing: null });
      },

      setShowExport(v) {
        set({ showExport: v, editing: null });
      },

      setShowVersions(v) {
        set({ showVersions: v, editing: null });
      },

      setImporting(v) {
        set({ importing: v, editing: null });
      },

      setContextMenu(v) {
        set({ contextMenu: v });
      },

      setSetupCamera(planId, setupId, cameraId) {
        const doc = docNow();
        const loc = ops.locatePlan(doc, planId);
        if (!loc) return;
        if (loc.plan.cameras.some((c) => c.id !== setupId && c.cameraId === cameraId)) {
          warn('Cette caméra est déjà utilisée sur ce plan.');
          return;
        }
        const next = ops.updatePlan(doc, planId, (p) => {
          const c = p.cameras.find((x) => x.id === setupId);
          if (c) c.cameraId = cameraId;
        });
        commit(next, cur(), 'Caméra du plan changée');
      },

      replaceDoc(doc, message) {
        const c = cur();
        const keep = c && ops.locatePlan(doc, c.planId);
        const first = allLines(doc)[0];
        commit(doc, keep ? c : first ? { planId: first.planId, setupId: first.setupId, col: 'size' } : null, message);
      },

      applyDoc(next, message, mergeKey) {
        if (next === docNow()) return;
        commit(next, cur(), message ?? undefined, mergeKey ?? null);
      },

      updateDoc(fn, mergeKey, message) {
        commit(produce(docNow(), fn), cur(), message, mergeKey ?? null);
      },
    };

    /** Après un filtre ou un repli : si le curseur est masqué, le placer sur une ligne visible. */
    function ensureCursorVisible() {
      const s = get();
      const lines = linesOf(s);
      const c = cur();
      if (c && lines.some((l) => l.planId === c.planId && l.setupId === c.setupId)) return;
      if (lines.length) setCursorOnly(moveCursor(lines, null, 0, 0));
    }

    /** Après annulation : revenir à l'endroit de la modification, s'il existe encore. */
    function revealCursor(at: Cursor | null) {
      const doc = docNow();
      const target = at ?? cur();
      const loc = target ? ops.locatePlan(doc, target.planId) : null;
      if (target && loc) {
        const setup = loc.plan.cameras.find((x) => x.id === target.setupId) ?? loc.plan.cameras[0]!;
        if (get().collapsed[loc.seq.id]) set({ collapsed: { ...get().collapsed, [loc.seq.id]: false } });
        setCursorOnly({ planId: loc.plan.id, setupId: setup.id, col: target.col });
      } else {
        // Le plan n'existe plus (annulation d'une création) : on se place sur le plan voisin.
        const c = cur();
        const still = c && ops.locatePlan(doc, c.planId);
        if (!still) {
          const first = allLines(doc)[0];
          if (first) setCursorOnly({ planId: first.planId, setupId: first.setupId, col: c?.col ?? 'size' });
        }
      }
      ensureCursorVisible();
    }
  });
}
