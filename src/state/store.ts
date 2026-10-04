import { create } from 'zustand';
import type { Id, ImageKind, ProjectDoc, Sequence } from '../model/types';
import { computeNumbers } from '../model/numbering';
import { applyValue, categoryOf, editText as fieldEditText, FIELD_LABEL, parseEntry, suggest, type EditableField, type TermField } from '../model/entry';
import * as ops from '../model/ops';
import { newId } from '../model/defaults';
import { createHistory, pushHistory, redoHistory, undoHistory, type History } from './history';
import { allLines, moveCursor, visibleLines, type Column, type Cursor, type Line } from './lines';
import { imageStore } from '../platform/images';
import { produce, type Draft } from 'immer';

/** Une version du document, et l'endroit où la modification a eu lieu (pour y revenir à l'annulation). */
export interface Snapshot {
  doc: ProjectDoc;
  at: Cursor | null;
}

export interface EditState {
  text: string;
  pick: number;
  error: string | null;
}

export type MessageKind = 'info' | 'warn';

export interface AppState {
  hist: History<Snapshot>;
  cursor: Cursor | null;
  editing: EditState | null;
  view: 'table' | 'cards';
  inspector: boolean;
  collapsed: Record<Id, boolean>;
  onlyIncomplete: boolean;
  message: { text: string; kind: MessageKind } | null;
  preview: { planId: Id; index: number } | null;
  showShortcuts: boolean;
  pendingDrop: { planId: Id; files: File[] } | null;
  editingSequenceId: Id | null;
  showSettings: boolean;
}

const MESSAGE_CLEAR = null;

export function initialState(doc: ProjectDoc): AppState {
  const first = allLines(doc)[0];
  return {
    hist: createHistory<Snapshot>({ doc, at: null }),
    cursor: first ? { planId: first.planId, setupId: first.setupId, col: 'size' } : null,
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
    showSettings: false,
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

// ------------------------------------------------------------------ store

interface Actions {
  load(doc: ProjectDoc): void;
  setCursor(c: Cursor): void;
  move(dRow: number, dCol: number, wrap?: boolean): void;
  startEdit(initial?: string): void;
  setEditText(text: string): void;
  setPick(i: number): void;
  commitEdit(then?: 'down' | 'right' | 'left' | 'stay', pick?: number, strict?: boolean): boolean;
  cancelEdit(): void;
  clearCell(): void;
  newPlan(reprise: boolean): void;
  deletePlan(): void;
  movePlan(delta: -1 | 1): void;
  addCamera(planId: Id): void;
  removeCamera(planId: Id, setupId: Id): void;
  setPlanText(planId: Id, field: 'scriptExcerpt' | 'notes', value: string): void;
  addImages(planId: Id, kind: ImageKind, files: File[]): Promise<void>;
  removeImage(planId: Id, imageId: Id): void;
  setImageKind(planId: Id, imageId: Id, kind: ImageKind): void;
  setCover(planId: Id, imageId: Id | null): void;
  addSequence(afterSeqId: Id | null): void;
  updateSequence(seqId: Id, fn: (s: Draft<Sequence>) => void, mergeKey?: string): void;
  deleteSequence(seqId: Id): void;
  moveSequence(seqId: Id, delta: -1 | 1): void;
  undo(): void;
  redo(): void;
  toggleCollapsed(seqId: Id): void;
  expandAndGo(seqId: Id): void;
  toggleOnlyIncomplete(): void;
  setView(v: 'table' | 'cards'): void;
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
    const commit = (doc: ProjectDoc, at: Cursor | null, message?: string | null, mergeKey: string | null = null, after?: Cursor) => {
      set((s) => ({
        hist: pushHistory(s.hist, { doc, at }, mergeKey),
        cursor: after ?? at ?? s.cursor,
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
        setCursorOnly(c);
      },

      move(dRow, dCol, wrap = false) {
        const s = get();
        setCursorOnly(moveCursor(linesOf(s), cur(), dRow, dCol, wrap));
        if (s.message) set({ message: null });
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
        set({ editing: { text, pick: 0, error: null } });
      },

      setEditText(text) {
        set((s) => (s.editing ? { editing: { text, pick: 0, error: null } } : {}));
      },

      setPick(i) {
        set((s) => (s.editing ? { editing: { ...s.editing, pick: i } } : {}));
      },

      commitEdit(then = 'stay', pick, strict = false) {
        const s = get();
        const c = cur();
        if (!s.editing || !c) return false;
        const field = fieldOf(c.col);
        if (!field) return false;
        const doc = docNow();
        const terms = field === 'action' || field === 'focal' ? [] : doc.settings.terms[categoryOf(field as TermField)];
        const r = parseEntry(field, s.editing.text, terms, { pick: pick ?? s.editing.pick, strict });
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
        const msg = r.newTerms.length ? `Terme ajouté à la liste du projet : ${r.newTerms.join(', ')}` : null;
        set({ editing: null });
        commit(next, c, msg);
        if (then === 'down') moveQuiet(1, 0);
        if (then === 'right') moveQuiet(0, 1, true);
        if (then === 'left') moveQuiet(0, -1, true);
        return true;
      },

      cancelEdit() {
        set({ editing: null });
      },

      clearCell() {
        const c = cur();
        if (!c || c.col === 'image') return;
        const doc = docNow();
        const loc = ops.locatePlan(doc, c.planId);
        const setup = loc?.plan.cameras.find((x) => x.id === c.setupId);
        if (!loc || !setup) return;
        let next: ProjectDoc;
        if (c.col === 'action') {
          if (loc.plan.cameras[0]!.id !== setup.id) return;
          next = ops.updatePlan(doc, c.planId, (p) => {
            p.action = '';
          });
        } else {
          const r = parseEntry(c.col, '', []);
          if (!r.ok || r.value.field === 'action') return;
          next = ops.replaceCameraSetup(doc, c.planId, applyValue(setup, r.value));
        }
        commit(next, c, `${FIELD_LABEL[c.col]} effacé · ⌘Z pour annuler`);
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
        const stored = await imageStore.importFiles(files);
        if (!stored.length) {
          warn('Aucune image reconnue (JPEG, PNG, HEIC, TIFF, WebP).');
          return;
        }
        const next = ops.addImages(
          docNow(),
          planId,
          stored.map((x) => ({ id: newId('img'), kind, file: x.file, originalName: x.originalName, caption: '' })),
        );
        commit(next, cur(), `${stored.length} image${stored.length > 1 ? 's' : ''} ajoutée${stored.length > 1 ? 's' : ''} en ${kind === 'scouting' ? 'repérage' : 'référence'}`);
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
        const r = ops.insertSequenceAfter(doc, afterSeqId, '');
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
        const next = ops.deleteSequence(doc, seqId);
        const first = allLines(next)[0]!;
        const c = cur();
        const keep = c && ops.locatePlan(next, c.planId);
        commit(next, keep ? c : { planId: first.planId, setupId: first.setupId, col: 'size' }, `Séquence ${seq?.number ?? ''} supprimée · ⌘Z pour annuler`);
        set({ editingSequenceId: null });
      },

      moveSequence(seqId, delta) {
        const doc = docNow();
        const next = ops.moveSequence(doc, seqId, delta);
        if (next !== doc) commit(next, cur(), 'Séquence déplacée · numéros généraux mis à jour');
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

/** Suggestions à afficher pour l'édition en cours. */
export function currentSuggestions(s: AppState) {
  const c = s.cursor;
  if (!s.editing || !c) return [];
  const field = fieldOf(c.col);
  if (!field || field === 'action' || field === 'focal') return [];
  return suggest(field, s.editing.text, s.hist.present.doc.settings.terms[categoryOf(field)]);
}

export type AppStore = ReturnType<typeof createAppStore>;
