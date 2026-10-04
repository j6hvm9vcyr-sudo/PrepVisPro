import { describe, expect, it } from 'vitest';
import { createAppStore, linesOf, selectCursor, selectDoc } from './store';
import { sampleProject } from '../model/sample';
import { computeNumbers } from '../model/numbering';
import { displayText } from '../model/entry';
import { validateProject } from '../model/schema';
import { locatePlan } from '../model/ops';

function setup() {
  const store = createAppStore(sampleProject());
  const st = () => store.getState();
  const code = () => computeNumbers(selectDoc(st())).get(selectCursor(st())!.planId)!.code;
  const curSetup = () => {
    const c = selectCursor(st())!;
    return locatePlan(selectDoc(st()), c.planId)!.plan.cameras.find((x) => x.id === c.setupId)!;
  };
  const type = (text: string, then: 'down' | 'right' | 'stay' = 'stay') => {
    st().startEdit('');
    st().setEditText(text);
    return st().commitEdit(then);
  };
  const goCol = (col: string) => {
    const c = selectCursor(st())!;
    st().setCursor({ ...c, col: col as never });
  };
  return { store, st, code, curSetup, type, goCol };
}

describe('flux de saisie au clavier', () => {
  it('le projet d’exemple est valide', () => {
    expect(validateProject(JSON.parse(JSON.stringify(sampleProject()))).ok).toBe(true);
  });

  it('saisit une valeur évolutive, descend à la ligne suivante', () => {
    const { st, code, curSetup, type } = setup();
    expect(code()).toBe('1/1');
    expect(type('ens > poi', 'down')).toBe(true);
    st().move(-1, 0);
    expect(displayText('size', curSetup())).toBe('Ensemble → Poitrine');
    st().move(1, 0);
    expect(code()).toBe('1/2');
  });

  it('une erreur garde l’édition ouverte avec un message', () => {
    const { st, goCol, type } = setup();
    goCol('focal');
    expect(type('longue')).toBe(false);
    expect(st().editing?.error).toMatch(/Focale/);
    st().cancelEdit();
    expect(st().editing).toBeNull();
  });

  it('⌘↩ crée un plan qui hérite et ouvre l’action ; ⌘Z annule et remet le curseur', () => {
    const { st, code, curSetup } = setup();
    const before = curSetup().start;
    st().newPlan(false);
    expect(code()).toBe('1/2');
    expect(st().editing).not.toBeNull();
    expect(selectCursor(st())!.col).toBe('action');
    st().setEditText('Nouveau plan');
    st().commitEdit('right');
    expect(curSetup().start).toEqual(before);
    expect(st().message?.text ?? '').toBe('');
    st().undo();
    st().undo();
    expect(code()).toBe('1/1');
    expect(selectDoc(st()).sequences[0]!.plans).toHaveLength(4);
    st().redo();
    expect(selectDoc(st()).sequences[0]!.plans).toHaveLength(5);
  });

  it('reprise insérée juste après 1/2 : elle devient 1/2B, l’ancienne 1/2B devient 1/2C', () => {
    const { st, code } = setup();
    st().move(1, 0);
    st().newPlan(true);
    expect(code()).toBe('1/2B');
    expect(st().message?.text).toMatch(/Reprise 1\/2B .* 1 plan renuméroté/);
    const n = computeNumbers(selectDoc(st()));
    expect(selectDoc(st()).sequences[0]!.plans.map((p) => n.get(p.id)!.code)).toEqual(['1/1', '1/2', '1/2B', '1/3', '1/2C']);
  });

  it('crée un terme personnalisé visible dans la liste du projet', () => {
    const { st, type } = setup();
    expect(type('pied')).toBe(true);
    expect(selectDoc(st()).settings.terms.size).toContain('Pied');
    expect(st().message?.text).toMatch(/Pied/);
  });

  it('Tab passe à la cellule suivante, et à la ligne suivante en fin de ligne', () => {
    const { st, goCol, code } = setup();
    goCol('grip');
    st().move(0, 1, true);
    expect(selectCursor(st())!.col).toBe('action');
    expect(code()).toBe('1/2');
  });

  it('supprimer puis annuler restaure le plan', () => {
    const { st } = setup();
    const n = selectDoc(st()).sequences[0]!.plans.length;
    st().deletePlan();
    expect(selectDoc(st()).sequences[0]!.plans).toHaveLength(n - 1);
    st().undo();
    expect(selectDoc(st()).sequences[0]!.plans).toHaveLength(n);
  });

  it('filtre « à compléter » et repli de séquence gardent un curseur visible', () => {
    const { st } = setup();
    st().toggleOnlyIncomplete();
    const lines = linesOf(st());
    const c = selectCursor(st())!;
    expect(lines.some((l) => l.planId === c.planId)).toBe(true);
    expect(lines.length).toBeLessThan(10);
    st().toggleOnlyIncomplete();
    const seq1 = selectDoc(st()).sequences[0]!.id;
    st().toggleCollapsed(seq1);
    const c2 = selectCursor(st())!;
    expect(locatePlan(selectDoc(st()), c2.planId)!.seq.id).not.toBe(seq1);
  });

  it('l’action ne se saisit pas sur la ligne de la 2e caméra', () => {
    const { st, goCol } = setup();
    const doc = selectDoc(st());
    const p = doc.sequences[1]!.plans[1]!;
    st().setCursor({ planId: p.id, setupId: p.cameras[1]!.id, col: 'size' });
    goCol('action');
    st().startEdit();
    expect(st().editing).toBeNull();
    expect(st().message?.kind).toBe('warn');
  });

  it('le texte libre tapé d’affilée ne crée qu’une étape d’annulation', () => {
    const { st } = setup();
    const pid = selectCursor(st())!.planId;
    st().setPlanText(pid, 'notes', 'a');
    st().setPlanText(pid, 'notes', 'ab');
    st().setPlanText(pid, 'notes', 'abc');
    st().undo();
    expect(locatePlan(selectDoc(st()), pid)!.plan.notes).toBe('');
  });
});

describe('copier-coller', () => {
  it('copie une cellule et la colle sur un autre plan', () => {
    const { st, curSetup } = setup();
    const t = st().copyCell();
    expect(t).toBe('Ensemble');
    st().move(1, 0);
    expect(st().pasteText(t!)).toBe(true);
    expect(curSetup().start.size).toBe('Ensemble');
  });

  it('colle un bloc copié depuis Excel (lignes × colonnes), en une seule étape d’annulation', () => {
    const { st } = setup();
    const before = selectDoc(st());
    expect(st().pasteText('GP\tProfil\nTaille\t3/4\r\n')).toBe(true);
    const plans = selectDoc(st()).sequences[0]!.plans;
    expect(plans[0]!.cameras[0]!.start).toMatchObject({ size: 'GP', axis: 'Profil' });
    expect(plans[1]!.cameras[0]!.start).toMatchObject({ size: 'Taille', axis: '3/4' });
    st().undo();
    expect(selectDoc(st())).toBe(before);
  });

  it('tout ou rien : une valeur inconnue annule tout le collage, avec un message', () => {
    const { st } = setup();
    const before = selectDoc(st());
    expect(st().pasteText('GP\nPied')).toBe(false);
    expect(selectDoc(st())).toBe(before);
    expect(st().message?.text).toMatch(/Pied/);
  });

  it('refuse un collage qui dépasse le tableau', () => {
    const { st } = setup();
    expect(st().pasteText(Array(50).fill('GP').join('\n'))).toBe(false);
    expect(st().message?.kind).toBe('warn');
  });
});
