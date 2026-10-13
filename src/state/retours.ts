/**
 * Retours (0.21) : les fichiers de retours déposés dans « Retours » du dossier de diffusion (ou
 * choisis à la main) sont lus, puis rangés avec le projet ; chaque retour devient une note datée,
 * ou est repris dans le tableau par la saisie habituelle (toujours validée à la main).
 */
import { create } from 'zustand';
import { useApp } from './appStore';
import { selectDoc } from './store';
import { getBackend } from '../platform/backend';
import { addFeedback, createPlanFromItem, FEEDBACK_LABEL, fieldValue, itemOwner, itemToNote, readRetours, setItemState } from '../model/feedback';
import { visibleColumns } from './lines';
import { locatePlan } from '../model/ops';
import type { Feedback, FeedbackField, Id, ProjectDoc } from '../model/types';
import { publishFolderOf } from './publish';

/** Fichiers trouvés dans « Retours » et pas encore rangés avec le projet ; fichiers illisibles. */
export const useRetours = create<{ waiting: Feedback[]; errors: { name: string; error: string }[]; scannedFor: string | null }>()(() => ({ waiting: [], errors: [], scannedFor: null }));

/** Regarde le dossier « Retours » du dossier de diffusion (sans rien changer au projet). */
export async function scanRetours(): Promise<void> {
  const doc = selectDoc(useApp.getState());
  const folder = publishFolderOf(doc);
  if (!folder) {
    useRetours.setState({ waiting: [], errors: [], scannedFor: doc.id });
    return;
  }
  try {
    const files = await (await getBackend()).listRetours(folder);
    const now = Date.now();
    const waiting: Feedback[] = [];
    const errors: { name: string; error: string }[] = [];
    for (const f of files) {
      const r = readRetours(f.text, doc, now);
      if (!r.ok) {
        // Un fichier d'un autre projet peut se trouver là : ce n'est pas une erreur à signaler ici.
        if (r.error !== 'Ces retours concernent un autre projet.') errors.push({ name: f.name, error: r.error });
        continue;
      }
      if (!doc.feedback.some((x) => x.id === r.feedback.id) && !waiting.some((x) => x.id === r.feedback.id)) waiting.push(r.feedback);
    }
    useRetours.setState({ waiting, errors, scannedFor: doc.id });
  } catch (e) {
    useRetours.setState({ waiting: [], errors: [{ name: folder, error: e instanceof Error ? e.message : String(e) }], scannedFor: doc.id });
  }
}

function who(f: Feedback): string {
  return f.role ? `${f.author} (${f.role.toLowerCase()})` : f.author;
}

/** Range les retours trouvés avec le projet (une étape, annulable). */
export function importWaiting(): void {
  const st = useApp.getState();
  let doc = selectDoc(st);
  const { waiting } = useRetours.getState();
  const added: Feedback[] = [];
  for (const f of waiting) {
    const r = addFeedback(doc, f);
    if (r.added) added.push(f);
    doc = r.doc;
  }
  useRetours.setState({ waiting: [] });
  if (!added.length) return;
  const n = added.reduce((k, f) => k + f.items.length, 0);
  st.applyDoc(doc, `Retours reçus : ${added.map(who).join(', ')} (${n} retour${n > 1 ? 's' : ''})`);
}

/** Importer un fichier de retours choisi à la main (reçu par mail, par exemple). */
/** Vrai si des retours ont été rangés avec le projet. */
export async function importRetoursFile(): Promise<boolean> {
  const st = useApp.getState();
  const file = await (await getBackend()).pickRetours();
  if (!file) return false;
  const doc = selectDoc(st);
  const r = readRetours(file.text, doc, Date.now());
  if (!r.ok) {
    st.setMessage(`${file.name} : ${r.error}`, 'warn');
    return false;
  }
  const a = addFeedback(doc, r.feedback);
  if (!a.added) {
    st.setMessage(`Ces retours de ${who(r.feedback)} sont déjà là`);
    return false;
  }
  st.applyDoc(a.doc, `Retours reçus : ${who(r.feedback)} (${r.feedback.items.length})`);
  useRetours.setState((s) => ({ waiting: s.waiting.filter((x) => x.id !== r.feedback.id) }));
  return true;
}

export function noteItem(fbId: Id, itemId: Id): void {
  const st = useApp.getState();
  const next = itemToNote(selectDoc(st), fbId, itemId);
  if (!next) {
    st.setMessage('Plan et séquence retirés depuis : le retour ne peut pas devenir une note', 'warn');
    return;
  }
  st.applyDoc(next, 'Retour rangé en note');
}

export function ignoreItem(fbId: Id, itemId: Id): void {
  const st = useApp.getState();
  st.applyDoc(setItemState(selectDoc(st), fbId, itemId, 'ignored'), 'Retour laissé de côté');
}

/** Tous les retours encore nouveaux deviennent des notes (une étape, annulable). */
export function noteAll(): void {
  const st = useApp.getState();
  let doc = selectDoc(st);
  let n = 0;
  for (const f of doc.feedback)
    for (const i of f.items) {
      if (i.state !== 'new') continue;
      const next = itemToNote(doc, f.id, i.id);
      if (next) {
        doc = next;
        n++;
      }
    }
  if (n) st.applyDoc(doc, `${n} retour${n > 1 ? 's' : ''} rangé${n > 1 ? 's' : ''} en note`);
}

/** Saisie en cours pour reprendre une proposition : marquée « reprise » si la case a changé. */
const pending: { current: { fbId: Id; itemId: Id; planId: Id; setupId: Id; field: FeedbackField; before: string | null } | null } = { current: null };

const cellValue = (doc: ProjectDoc, planId: Id, setupId: Id, field: FeedbackField) => fieldValue(doc, planId, setupId, field);

useApp.subscribe((s, prev) => {
  const p = pending.current;
  if (!p || !prev.editing || s.editing) return;
  pending.current = null;
  // Saisie validée sur la case (sa valeur a changé) : le retour est repris. Annulée : rien.
  // La saisie se ferme avant que le projet change : on regarde une fois la validation finie.
  queueMicrotask(() => {
    const st = useApp.getState();
    const now = cellValue(selectDoc(st), p.planId, p.setupId, p.field);
    if (now !== null && now !== p.before) st.applyDoc(setItemState(selectDoc(st), p.fbId, p.itemId, 'applied'), 'Proposition reprise');
  });
});

/**
 * Reprendre une proposition : la case du plan s'ouvre avec la valeur proposée, comme si on l'avait
 * tapée ; on la valide (↩) ou on l'annule (esc), avec les suggestions habituelles.
 */
export function takeProposal(fbId: Id, itemId: Id): void {
  const st = useApp.getState();
  const doc = selectDoc(st);
  const item = doc.feedback.find((f) => f.id === fbId)?.items.find((i) => i.id === itemId);
  if (!item?.proposal || !item.planId) return;
  const loc = locatePlan(doc, item.planId);
  if (!loc || !itemOwner(doc, item)) {
    st.setMessage(isToCreate(doc, item.planId) ? 'Créez d’abord ce plan (retour « nouveau plan »)' : 'Ce plan a été retiré depuis', 'warn');
    return;
  }
  const field = item.proposal.field;
  if (field === 'duration' && loc.plan.repriseOf) {
    st.setMessage('Une reprise a la durée de son plan', 'warn');
    return;
  }
  if (field !== 'action' && !visibleColumns(doc.settings).includes(field)) {
    st.setMessage(`Affichez la colonne ${FEEDBACK_LABEL[field]} (Colonnes ▾) pour reprendre cette proposition`, 'warn');
    return;
  }
  // La durée est celle du plan : sur la ligne de sa première caméra.
  const setup = (field === 'duration' ? null : loc.plan.cameras.find((c) => c.id === item.proposal!.setupId)) ?? loc.plan.cameras[0]!;
  if (st.view !== 'table') st.setView('table');
  st.goToPlan(item.planId);
  st.setCursor({ planId: item.planId, setupId: setup.id, col: field });
  pending.current = { fbId, itemId, planId: item.planId, setupId: setup.id, field, before: cellValue(doc, item.planId, setup.id, field) };
  useApp.getState().startEdit(item.proposal.text);
}

/** Le plan est-il un plan proposé à la création, pas encore créé ? */
export function isToCreate(doc: ProjectDoc, planId: Id): boolean {
  return !locatePlan(doc, planId) && doc.feedback.some((f) => f.items.some((i) => i.create && i.planId === planId && i.state === 'new'));
}

/** Créer le plan proposé (une étape, annulable) ; le curseur y va. */
export function createPlanItem(fbId: Id, itemId: Id): void {
  const st = useApp.getState();
  const doc = selectDoc(st);
  const next = createPlanFromItem(doc, fbId, itemId);
  if (!next) {
    st.setMessage('La séquence de ce plan a été retirée depuis', 'warn');
    return;
  }
  const item = doc.feedback.find((f) => f.id === fbId)?.items.find((i) => i.id === itemId);
  st.applyDoc(next, `Plan ${item?.code ?? ''} créé`.replace('  ', ' '));
  if (item?.planId) {
    if (st.view !== 'table' && st.view !== 'cards') st.setView('table');
    useApp.getState().goToPlan(item.planId);
  }
}
