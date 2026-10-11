import { describe, expect, it } from 'vitest';
import { addPlanForPassage, linkScene, sceneSegments, uncoveredCount } from './scriptLink';
import { newProject } from './defaults';
import { produce } from 'immer';
import { validateProject } from './schema';

const SCENE = `Le quai est désert. Une horloge marque 7 h.

LÉA (30) attend, seule sur le quai.
Le train entre en gare.

LÉA
Enfin.

Elle scrute les fenêtres du train.`;

const plan = (id: string, scriptExcerpt: string, repriseOf: string | null = null) => ({ id, scriptExcerpt, repriseOf });

describe('scénario + tableau : extraits reliés à la scène', () => {
  it('retrouve chaque extrait (les retours à la ligne comptent comme des espaces) ; un extrait absent est signalé', () => {
    const r = linkScene({
      scriptText: SCENE,
      plans: [plan('a', 'LÉA (30) attend,   seule\nsur le quai.'), plan('b', 'Le train entre en gare.'), plan('c', 'Elle saute du train.'), plan('d', '')] as never,
    });
    expect(r.links.map((l) => [l.planId, SCENE.slice(l.start, l.end)])).toEqual([
      ['a', 'LÉA (30) attend, seule sur le quai.'],
      ['b', 'Le train entre en gare.'],
    ]);
    expect(r.notFound).toEqual(['c']);
    expect(r.empty).toEqual(['d']);
  });

  it('un même passage pour un plan et sa reprise ; occurrence suivant le plan précédent', () => {
    const t = 'Il entre. Elle sourit. Il entre.';
    const r = linkScene({ scriptText: t, plans: [plan('a', 'Elle sourit.'), plan('b', 'Il entre.'), plan('c', 'Elle sourit.', 'a')] as never });
    expect(r.links).toEqual([
      { planId: 'a', start: 10, end: 22 },
      { planId: 'b', start: 23, end: 32 },
      { planId: 'c', start: 10, end: 22 },
    ]);
    const segs = sceneSegments(t, r.links);
    expect(segs.find((s) => s.start === 10)!.planIds).toEqual(['a', 'c']);
  });

  it('passages non couverts : le texte qu’aucun extrait ne reprend, sans les blancs ni les noms de personnage seuls', () => {
    const r = linkScene({ scriptText: SCENE, plans: [plan('a', 'LÉA (30) attend, seule sur le quai. Le train entre en gare.'), plan('b', 'Enfin.')] as never });
    const segs = sceneSegments(SCENE, r.links);
    // Le texte entier est rendu, morceau par morceau, sans rien perdre.
    expect(segs.map((s) => SCENE.slice(s.start, s.end)).join('')).toBe(SCENE);
    const unc = segs.filter((s) => s.uncovered).map((s) => SCENE.slice(s.start, s.end).trim());
    expect(unc).toEqual(['Le quai est désert. Une horloge marque 7 h.', 'Elle scrute les fenêtres du train.']);
    expect(uncoveredCount({ scriptText: SCENE, plans: [plan('a', 'LÉA (30) attend, seule sur le quai. Le train entre en gare.'), plan('b', 'Enfin.')] as never })).toBe(2);
    expect(uncoveredCount({ scriptText: '', plans: [] })).toBe(0);
  });

  it('nouveau plan pour un passage : à sa place dans l’ordre du texte, après les reprises', () => {
    let doc = newProject('X');
    doc = produce(doc, (d) => {
      const s = d.sequences[0]!;
      s.scriptText = SCENE;
      s.plans[0]!.scriptExcerpt = 'Le train entre en gare.';
    });
    const start = SCENE.indexOf('Le quai');
    const r = addPlanForPassage(doc, doc.sequences[0]!.id, start, start + 19);
    expect(r).not.toBeNull();
    const plans = r!.doc.sequences[0]!.plans;
    expect(plans).toHaveLength(2);
    expect(plans[0]!.id).toBe(r!.planId);
    expect(plans[0]!.scriptExcerpt).toBe('Le quai est désert.');
    expect(validateProject(JSON.parse(JSON.stringify(r!.doc))).ok).toBe(true);
    const end = SCENE.length;
    const r2 = addPlanForPassage(r!.doc, doc.sequences[0]!.id, SCENE.indexOf('Elle scrute'), end);
    expect(r2!.doc.sequences[0]!.plans.at(-1)!.scriptExcerpt).toBe('Elle scrute les fenêtres du train.');
    expect(addPlanForPassage(doc, doc.sequences[0]!.id, 5, 5)).toBeNull();
  });
});
