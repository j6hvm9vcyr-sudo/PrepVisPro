import { describe, expect, it } from 'vitest';
import { DEFAULT_TERMS } from './defaults';
import { applyValue, completeWithPick, displayText, editText, isEvolving, parseEntry, splitAnglePart, suggest } from './entry';
import type { FieldValue } from './entry';
import { fr, setup } from './testkit';

const T = DEFAULT_TERMS;
function ok(r: ReturnType<typeof parseEntry>) {
  if (!r.ok) throw new Error(r.error);
  return r;
}
type V = Exclude<FieldValue, { field: 'action' }>;

describe('suggestions', () => {
  it('propose les termes qui commencent par le fragment, sans accents', () => {
    expect(suggest('size', 'po', T.size).map((s) => s.term)).toEqual(['Poitrine', 'Po']);
    expect(suggest('size', 'am', T.size)[0]).toEqual({ term: 'Américain', create: false });
    expect(suggest('angle', 'zen', T.angle)[0]!.term).toBe('Zénithal');
  });
  it('met la correspondance exacte en premier et ne propose pas de créer un terme existant', () => {
    const s = suggest('size', 'gp', T.size);
    expect(s[0]).toEqual({ term: 'GP', create: false });
    expect(s.some((x) => x.create)).toBe(false);
  });
  it('propose de créer un terme inconnu, première lettre en majuscule', () => {
    expect(suggest('size', 'pied', T.size)).toEqual([{ term: 'Pied', create: true }]);
  });
  it('travaille sur la dernière partie', () => {
    expect(suggest('size', 'ens > poi', T.size)[0]!.term).toBe('Poitrine');
    expect(suggest('movement', 'trav lat, fi', T.movement)[0]!.term).toBe('Fixe');
  });
  it('reconnaît les synonymes', () => {
    expect(suggest('grip', 'stead', T.grip)[0]!.term).toBe('Steadicam');
    expect(suggest('angle', 'contre', T.angle)[0]!.term).toBe('CP');
  });
  it('liste tout quand le fragment est vide', () => {
    expect(suggest('axis', '', T.axis).map((s) => s.term)).toEqual(T.axis);
  });
});

describe('lecture de la saisie', () => {
  it('valeur simple et évolutive', () => {
    expect(ok(parseEntry('size', 'poi', T.size)).value).toEqual({ field: 'size', start: 'Poitrine', end: null });
    expect(ok(parseEntry('size', 'ens > poi', T.size)).value).toEqual({ field: 'size', start: 'Ensemble', end: 'Poitrine' });
    expect(ok(parseEntry('size', 'ens → gp', T.size)).value).toEqual({ field: 'size', start: 'Ensemble', end: 'GP' });
  });
  it('refuse une partie ambiguë qui n’est pas la dernière', () => {
    const r = parseEntry('size', 't > gp', T.size);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ambigu/);
  });
  it('refuse un terme inconnu qui n’est pas la dernière partie', () => {
    expect(parseEntry('axis', 'xyz > face', T.axis).ok).toBe(false);
  });
  it('dernière partie : prend la suggestion choisie', () => {
    expect(ok(parseEntry('size', 't', T.size, { pick: 0 })).value).toMatchObject({ start: 'TGP' });
    expect(ok(parseEntry('size', 't', T.size, { pick: 1 })).value).toMatchObject({ start: 'Taille' });
  });
  it('crée un terme seulement s’il est choisi explicitement', () => {
    const r = ok(parseEntry('size', 'pied', T.size));
    expect(r.value).toMatchObject({ start: 'Pied' });
    expect(r.newTerms).toEqual(['Pied']);
  });
  it('mode strict : pas de création, pas de choix par défaut ambigu', () => {
    expect(parseEntry('size', 'pied', T.size, { strict: true }).ok).toBe(false);
    expect(parseEntry('size', 't', T.size, { strict: true }).ok).toBe(false);
    expect(ok(parseEntry('size', 'poi', T.size, { strict: true })).value).toMatchObject({ start: 'Poitrine' });
  });
  it('plus d’un « > » est refusé', () => {
    expect(parseEntry('size', 'ens > poi > gp', T.size).ok).toBe(false);
  });
  it('partie vide au milieu refusée, séparateur final toléré', () => {
    expect(parseEntry('size', 'ens > > gp', T.size).ok).toBe(false);
    expect(ok(parseEntry('size', 'ens >', T.size)).value).toEqual({ field: 'size', start: 'Ensemble', end: null });
  });
  it('vide = effacer', () => {
    expect(ok(parseEntry('size', '   ', T.size)).value).toEqual({ field: 'size', start: '', end: null });
    expect(ok(parseEntry('grip', '', T.grip)).value).toEqual({ field: 'grip', list: [] });
    expect(ok(parseEntry('focal', '', [])).value).toEqual({ field: 'focal', start: null, end: null });
  });
  it('focale : nombres, mm, virgule, évolution, bornes', () => {
    expect(ok(parseEntry('focal', '40', [])).value).toEqual({ field: 'focal', start: 40, end: null });
    expect(ok(parseEntry('focal', '40mm', [])).value).toMatchObject({ start: 40 });
    expect(ok(parseEntry('focal', '32,5 mm', [])).value).toMatchObject({ start: 32.5 });
    expect(ok(parseEntry('focal', '75 > 300', [])).value).toEqual({ field: 'focal', start: 75, end: 300 });
    expect(parseEntry('focal', 'longue', []).ok).toBe(false);
    expect(parseEntry('focal', '0', []).ok).toBe(false);
    expect(parseEntry('focal', '-20', []).ok).toBe(false);
    expect(parseEntry('focal', '5000', []).ok).toBe(false);
    expect(parseEntry('focal', '75-300', []).ok).toBe(false);
  });
  it('angle : terme, inclinaison, ou les deux', () => {
    expect(ok(parseEntry('angle', 'pl -20', T.angle)).value).toEqual({ field: 'angle', start: { angle: 'Plongée', tilt: -20 }, end: null });
    expect(ok(parseEntry('angle', 'cp 15°', T.angle)).value).toMatchObject({ start: { angle: 'CP', tilt: 15 } });
    expect(ok(parseEntry('angle', '-10', T.angle)).value).toMatchObject({ start: { angle: '', tilt: -10 } });
    expect(ok(parseEntry('angle', 'niv > pl -45', T.angle)).value).toEqual({
      field: 'angle',
      start: { angle: 'À niveau', tilt: null },
      end: { angle: 'Plongée', tilt: -45 },
    });
    expect(parseEntry('angle', 'pl -120', T.angle).ok).toBe(false);
    expect(parseEntry('angle', 'pl -20 30', T.angle).ok).toBe(false);
  });
  it('mouvements : suite ordonnée, répétition permise', () => {
    expect(ok(parseEntry('movement', 'trav lat > fixe', T.movement)).value).toEqual({ field: 'movement', list: ['Trav latéral', 'Fixe'] });
    expect(ok(parseEntry('movement', 'fixe, pan, fixe', T.movement)).value).toEqual({ field: 'movement', list: ['Fixe', 'Pan', 'Fixe'] });
  });
  it('machinerie : liste sans doublon', () => {
    expect(ok(parseEntry('grip', 'stead, dolly + stead', T.grip)).value).toEqual({ field: 'grip', list: ['Steadicam', 'Dolly'] });
  });
  it('angle : inclinaison seule séparée correctement', () => {
    expect(splitAnglePart('plongée -20°')).toEqual({ word: 'plongée', tilt: -20, error: null });
    expect(splitAnglePart('3/4')).toEqual({ word: '3/4', tilt: null, error: null });
  });
});

describe('application au plan', () => {
  const base = () => setup('cam', { start: fr({ size: 'Ensemble', axis: 'Face', angle: 'À niveau', focalMm: 50 }) });
  const apply = (s: ReturnType<typeof setup>, field: Parameters<typeof parseEntry>[0], text: string, terms: string[] = []) =>
    applyValue(s, ok(parseEntry(field, text, terms)).value as V);

  it('rend un plan évolutif et garde les autres champs identiques au début', () => {
    const s = apply(base(), 'size', 'ens > poi', T.size);
    expect(s.end).toEqual({ ...s.start, size: 'Poitrine' });
    expect(displayText('size', s)).toBe('Ensemble → Poitrine');
    expect(isEvolving('size', s)).toBe(true);
    expect(isEvolving('axis', s)).toBe(false);
  });
  it('une valeur simple supprime l’évolution de ce champ, et la fin disparaît si plus rien n’évolue', () => {
    const s1 = apply(base(), 'size', 'ens > poi', T.size);
    const s2 = apply(s1, 'size', 'gp', T.size);
    expect(s2.end).toBeNull();
    expect(s2.start.size).toBe('GP');
  });
  it('garde l’évolution des autres champs', () => {
    let s = apply(base(), 'focal', '75 > 300');
    s = apply(s, 'size', 'ens > poi', T.size);
    s = apply(s, 'size', 'gp', T.size);
    expect(s.end).not.toBeNull();
    expect(s.end!.focalMm).toBe(300);
    expect(s.end!.size).toBe('GP');
    expect(displayText('focal', s)).toBe('75 → 300 mm');
  });
  it('affichage et texte d’édition aller-retour', () => {
    let s = apply(base(), 'angle', 'pl -15 > cp 10', T.angle);
    expect(displayText('angle', s)).toBe('Plongée -15° → CP +10°');
    expect(editText('angle', s)).toBe('Plongée -15 > CP +10');
    s = apply(s, 'angle', editText('angle', s), T.angle);
    expect(displayText('angle', s)).toBe('Plongée -15° → CP +10°');
    s = apply(s, 'movement', 'trav lat > fixe', T.movement);
    expect(displayText('movement', s)).toBe('Trav latéral → Fixe');
    expect(editText('movement', s)).toBe('Trav latéral > Fixe');
  });
  it('ne modifie jamais l’objet d’origine', () => {
    const s = base();
    const copy = structuredClone(s);
    apply(s, 'size', 'ens > poi', T.size);
    expect(s).toEqual(copy);
  });
  it('affichage des champs vides', () => {
    const s = setup('cam');
    expect(displayText('size', s)).toBe('');
    expect(displayText('focal', s)).toBe('');
    expect(displayText('angle', s)).toBe('');
  });
});

describe('choix aux flèches sur une partie vide', () => {
  const terms = ['TGP', 'GP', 'Poitrine', 'Ensemble'];
  it('case vide : le terme choisi devient la valeur', () => {
    expect(completeWithPick('size', '', terms, 2)).toBe('Poitrine');
  });
  it('après « > » ou « , » : complète la partie suivante', () => {
    expect(completeWithPick('size', 'Ensemble >', terms, 1)).toBe('Ensemble > GP');
    expect(completeWithPick('movement', 'Fixe,', ['Fixe', 'Pan'], 1)).toBe('Fixe, Pan');
  });
  it('partie déjà commencée : rien à compléter (la suggestion surlignée s’applique déjà)', () => {
    expect(completeWithPick('size', 'po', terms, 0)).toBeNull();
    expect(completeWithPick('focal', '', terms, 0)).toBeNull();
  });
});
