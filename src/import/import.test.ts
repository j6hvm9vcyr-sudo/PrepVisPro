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

// ------------------------------------------------------------------ formats texte, Word, PDF
import { matchHeading, parsePlainScript } from './plain';
import { parseScriptFile, decodeText } from './script';
import JSZip from 'jszip';

describe('en-têtes de scène dans un texte', () => {
  it('formats courants, français et anglais', () => {
    expect(matchHeading('12. INT. CUISINE - JOUR')).toEqual({ number: '12', heading: 'INT. CUISINE - JOUR' });
    expect(matchHeading('12A INT. CUISINE - JOUR 12A')).toEqual({ number: '12A', heading: 'INT. CUISINE - JOUR' });
    expect(matchHeading('SÉQ. 3 – EXT. RUE – NUIT')).toEqual({ number: '3', heading: 'EXT. RUE – NUIT' });
    expect(matchHeading('INT./EXT. VOITURE - NUIT #7#')).toEqual({ number: '7', heading: 'INT./EXT. VOITURE - NUIT' });
    expect(matchHeading('.CAVE DU CHÂTEAU')).toEqual({ number: null, heading: 'CAVE DU CHÂTEAU' });
    expect(matchHeading('EXTÉRIEUR JOUR - PLAGE')).toEqual({ number: null, heading: 'EXTÉRIEUR JOUR - PLAGE' });
  });
  it('jamais une phrase du récit', () => {
    expect(matchHeading('Intérieurement, elle sait qu’il ment.')).toBeNull();
    expect(matchHeading('Int. il fait nuit dans la cuisine')).toBeNull();
    expect(matchHeading('EXTRA : il sort.')).toBeNull();
    expect(matchHeading('')).toBeNull();
  });
  it('effet avant le décor, à la française', () => {
    expect(parseHeading('INT. JOUR - CUISINE')).toMatchObject({ intExt: 'INT', dayNight: 'JOUR', location: 'CUISINE', doubts: [] });
    expect(parseHeading('EXT NUIT PARKING')).toMatchObject({ intExt: 'EXT', dayNight: 'NUIT', location: 'PARKING', doubts: [] });
    expect(parseHeading('INT. CUISINE. NUIT')).toMatchObject({ dayNight: 'NUIT', location: 'CUISINE', doubts: [] });
    expect(parseHeading('EST. QUAI DE GARE - AUBE')).toMatchObject({ intExt: 'EXT', dayNight: 'JOUR', effect: 'AUBE', location: 'QUAI DE GARE' });
    expect(parseHeading('INT. CUISINE - SALLE')).toMatchObject({ location: 'CUISINE - SALLE', doubts: ['jour/nuit non précisé'] });
  });
});

const SCRIPT_TXT = `Title: Le Quai
Author: X

1. INT. CHAMBRE D'AXEL - NUIT

Axel ne dort pas.

AXEL
(bas)
Encore elle.

2. EXT. QUAI DE GARE - JOUR

Le train entre en gare.
`;

describe('scénario en texte (Fountain, texte brut)', () => {
  it('scènes, numéros, texte, titre', () => {
    const r = parsePlainScript(SCRIPT_TXT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.title).toBe('Le Quai');
    expect(r.scenes.map((s) => [s.number, s.parsed.intExt, s.location, s.parsed.dayNight])).toEqual([
      ['1', 'INT', "CHAMBRE D'AXEL", 'NUIT'],
      ['2', 'EXT', 'QUAI DE GARE', 'JOUR'],
    ]);
    expect(r.scenes[0]!.text).toBe('Axel ne dort pas.\n\nAXEL\n(bas)\nEncore elle.');
  });
  it('scènes non numérotées : numéro d’ordre ; texte sans en-tête : refusé', () => {
    const r = parsePlainScript('INT. A - JOUR\nx\nEXT. B - NUIT\ny');
    expect(r.ok && r.scenes.map((s) => [s.number, s.numbered])).toEqual([
      ['1', false],
      ['2', false],
    ]);
    expect(parsePlainScript('Une lettre, pas un scénario.').ok).toBe(false);
  });
  it('PDF : suites de page et numéros de page retirés', () => {
    const r = parsePlainScript('3 INT. SALON - SOIR 3\nIls dînent.\n(SUITE)\n12.\nElle se lève.', { pdf: true });
    expect(r.ok && r.scenes[0]).toMatchObject({ number: '3', location: 'SALON', text: 'Ils dînent.\nElle se lève.' });
  });
  it('encodage : UTF-8, sinon Windows-1252', () => {
    expect(decodeText(new TextEncoder().encode('Été'))).toBe('Été');
    expect(decodeText(Uint8Array.from([0x45, 0x74, 0xe9]))).toBe('Eté');
  });
});

describe('scénario Word et reconnaissance du format', () => {
  it('Word (.docx) : paragraphes lus, révisions supprimées ignorées', async () => {
    const zip = new JSZip();
    const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
    zip.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('1. INT. CUISINE - JOUR')}${p('Elle coupe du pain.')}<w:p><w:del><w:r><w:t>BIFFÉ</w:t></w:r></w:del></w:p>${p('2. EXT. JARDIN - NUIT')}${p('Il fume.')}</w:body></w:document>`,
    );
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const r = await parseScriptFile({ name: 'scenario.docx', bytes });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenes.map((s) => s.location)).toEqual(['CUISINE', 'JARDIN']);
    expect(r.scenes[0]!.text).toBe('Elle coupe du pain.');
  });
  it('Final Draft reconnu au contenu ; faux PDF et faux Word refusés', async () => {
    const enc = (t: string) => new TextEncoder().encode(t);
    expect((await parseScriptFile({ name: 'scenario.fdx', bytes: enc(FDX) })).ok).toBe(true);
    expect((await parseScriptFile({ name: 'scenario.pdf', bytes: enc('pas un pdf') })).ok).toBe(false);
    expect((await parseScriptFile({ name: 'scenario.docx', bytes: enc('pas un docx') })).ok).toBe(false);
    expect((await parseScriptFile({ name: 'scenario.txt', bytes: enc(SCRIPT_TXT) })).ok).toBe(true);
  });
});
