import { describe, expect, it } from 'vitest';
import { parseHeading } from './heading';
import { parseFdx } from './fdx';
import { applyImport, planImport } from './merge';
import { doc, plan, seq } from '../model/testkit';
import { validateProject } from '../model/schema';

export const FDX = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading" Number="1"><Text>INT. SALLE DE BAIN D’AXEL - NUIT</Text></Paragraph>
    <Paragraph Type="Action"><Text>AXEL (20+) se douche recroquevillé dans la baignoire.</Text></Paragraph>
    <Paragraph Type="Scene Heading" Number="2"><Text>INT. CHAMBRE D’AXEL - NUIT</Text></Paragraph>
    <Paragraph Type="Character"><Text>Zoé</Text></Paragraph>
    <Paragraph Type="Parenthetical"><Text>(off)</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Tu dors </Text><Text Style="Italic">encore</Text><Text> ?</Text></Paragraph>
    <Paragraph Type="Scene Heading" Number="3A"><Text>EXT. SENTIER FORESTIER - JOUR</Text></Paragraph>
    <Paragraph Type="Action"><Text>Une femme revêt un masque.</Text></Paragraph>
    <Paragraph Type="Transition"><Text>Cut to:</Text></Paragraph>
    <Paragraph Type="Scene Heading"><Text>INT./EXT. VOITURE - SOIR</Text></Paragraph>
  </Content>
</FinalDraft>`;

describe('en-têtes de scène', () => {
  it.each([
    ['INT. CHAMBRE D’AXEL - NUIT', 'INT', 'CHAMBRE D’AXEL', 'NUIT'],
    ['EXT. PARC URBAIN - JOUR.', 'EXT', 'PARC URBAIN', 'JOUR'],
    ['SÉQUENCE 6 - EXT. PARC URBAIN - JOUR.', 'EXT', 'PARC URBAIN', 'JOUR'],
    ['INT./EXT. VOITURE - SOIR', 'INT/EXT', 'VOITURE', 'NUIT'],
    ['EXT - RUE DE L’IMMEUBLE DE ZOÉ - NUIT', 'EXT', 'RUE DE L’IMMEUBLE DE ZOÉ', 'NUIT'],
    ['INT. GARE - QUAI 3 - MATIN', 'INT', 'GARE - QUAI 3', 'JOUR'],
  ])('%s', (raw, ie, loc, dn) => {
    const h = parseHeading(raw);
    expect(h).toMatchObject({ intExt: ie, location: loc, dayNight: dn });
  });
  it('signale ce qui est incertain', () => {
    expect(parseHeading('CHAMBRE').doubts).toEqual(['INT/EXT non précisé', 'jour/nuit non précisé']);
    expect(parseHeading('INT. GARE - QUAI 3').location).toBe('GARE - QUAI 3');
  });
});

describe('Final Draft', () => {
  it('lit les scènes, numéros et texte mis en forme', () => {
    const r = parseFdx(FDX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenes.map((s) => s.number)).toEqual(['1', '2', '3A', '4']);
    expect(r.scenes[3]!.numbered).toBe(false);
    expect(r.scenes[1]!.text).toBe('ZOÉ\n(off)\nTu dors encore ?');
    expect(r.scenes[2]!.location).toBe('SENTIER FORESTIER');
    expect(r.scenes[2]!.text).toBe('Une femme revêt un masque.\n\nCUT TO:');
  });
  it('refuse ce qui n’est pas un .fdx', () => {
    expect(parseFdx('<html></html>').ok).toBe(false);
    expect(parseFdx('pas du xml <').ok).toBe(false);
    expect(parseFdx('<FinalDraft><Content></Content></FinalDraft>').ok).toBe(false);
  });
});

describe('intégration dans un projet', () => {
  const scenes = () => {
    const r = parseFdx(FDX);
    if (!r.ok) throw new Error();
    return r.scenes;
  };

  it('projet existant : met à jour, ajoute dans l’ordre, ne supprime jamais', () => {
    const d = doc((c) => [
      seq('1', [plan(c, { action: 'plan existant' })], { location: 'Salle de bain d’Axel', intExt: 'INT', dayNight: 'NUIT' }),
      seq('2', [plan(c)], { location: 'Ancien décor', dayNight: 'JOUR' }),
      seq('9', [plan(c)], { location: 'Coupée au montage' }),
    ]);
    const p = planImport(d, scenes());
    expect(p.changes.map((c) => c.status)).toEqual(['changed', 'changed', 'new', 'new']);
    expect(p.absent.map((a) => a.number)).toEqual(['9']);
    const r = applyImport(d, p, { include: new Set(['1', '2', '3A', '4']), updateHeadings: false });
    expect(r.doc.sequences.map((s) => s.number)).toEqual(['1', '2', '3A', '4', '9']);
    expect(r.added).toBe(2);
    // En-têtes existants conservés (option non cochée), texte mis à jour, plans intacts.
    expect(r.doc.sequences[1]!.location).toBe('Ancien décor');
    expect(r.doc.sequences[1]!.scriptText).toContain('Tu dors encore');
    expect(r.doc.sequences[0]!.plans[0]!.action).toBe('plan existant');
    expect(validateProject(JSON.parse(JSON.stringify(r.doc))).ok).toBe(true);
  });

  it('avec mise à jour des en-têtes', () => {
    const d = doc((c) => [seq('2', [plan(c)], { location: 'Ancien décor', dayNight: 'JOUR' })]);
    const r = applyImport(d, planImport(d, scenes()), { include: new Set(['2']), updateHeadings: true });
    expect(r.doc.sequences.map((s) => s.number)).toEqual(['2']);
    expect(r.doc.sequences[0]).toMatchObject({ location: 'CHAMBRE D’AXEL', dayNight: 'NUIT' });
  });

  it('un deuxième import identique ne change rien', () => {
    const d = doc((c) => [seq('1', [plan(c)])]);
    const all = new Set(['1', '2', '3A', '4']);
    const once = applyImport(d, planImport(d, scenes()), { include: all, updateHeadings: true }).doc;
    const p2 = planImport(once, scenes());
    expect(p2.changes.every((c) => c.status === 'same')).toBe(true);
    expect(applyImport(once, p2, { include: all, updateHeadings: true }).doc).toBe(once);
  });

  it('signale les numéros de scène en double', () => {
    const s = scenes();
    s[1]!.number = '1';
    expect(planImport(doc(() => []), s).duplicates).toEqual(['1']);
  });
});
