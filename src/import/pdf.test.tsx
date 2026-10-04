// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { parseScriptFile } from './script';

/** Mise en page de scénario : numéros de scène dans les deux marges, suites de page, numéros de page. */
function Script() {
  const scene = (n: string, h: string) => (
    <View style={{ flexDirection: 'row', marginTop: 14 }}>
      <Text style={{ width: 40 }}>{n}</Text>
      <Text style={{ flex: 1 }}>{h}</Text>
      <Text style={{ width: 40, textAlign: 'right' }}>{n}</Text>
    </View>
  );
  return (
    <Document>
      <Page size="A4" style={{ padding: 50, fontSize: 12, fontFamily: 'Courier' }}>
        <Text style={{ textAlign: 'right' }}>1.</Text>
        {scene('1', 'INT. CHAMBRE D’AXEL - NUIT')}
        <Text style={{ marginTop: 10 }}>Axel ne dort pas. Il regarde le plafond.</Text>
        <Text style={{ marginTop: 10, marginLeft: 150 }}>AXEL</Text>
        <Text style={{ marginLeft: 100 }}>Encore elle.</Text>
        {scene('2', 'EXT. QUAI DE GARE - JOUR')}
        <Text style={{ marginTop: 10 }}>Le train entre en gare.</Text>
        <Text style={{ marginTop: 10, marginLeft: 150 }}>(SUITE)</Text>
      </Page>
      <Page size="A4" style={{ padding: 50, fontSize: 12, fontFamily: 'Courier' }}>
        <Text style={{ textAlign: 'right' }}>2.</Text>
        <Text style={{ marginTop: 10 }}>Léa descend du wagon.</Text>
        {scene('3A', 'INT. JOUR - CUISINE')}
        <Text style={{ marginTop: 10 }}>Le café coule.</Text>
      </Page>
    </Document>
  );
}

describe('scénario PDF', () => {
  it('scènes, numéros des deux marges, texte sur deux pages, sans numéros de page ni (SUITE)', async () => {
    const bytes = new Uint8Array(await renderToBuffer(<Script />));
    // Fixture des tests de bout en bout (régénérée avec GEN_FIXTURE=1).
    if (process.env.GEN_FIXTURE) (await import('node:fs')).writeFileSync('e2e/scenario.pdf', bytes);
    const r = await parseScriptFile({ name: 'scenario.pdf', bytes });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenes.map((s) => [s.number, s.parsed.intExt, s.location, s.parsed.dayNight])).toEqual([
      ['1', 'INT', 'CHAMBRE D’AXEL', 'NUIT'],
      ['2', 'EXT', 'QUAI DE GARE', 'JOUR'],
      ['3A', 'INT', 'CUISINE', 'JOUR'],
    ]);
    expect(r.scenes[0]!.text).toMatch(/^Axel ne dort pas\. Il regarde le plafond\.\n\n\s*AXEL\n\s*Encore elle\.$/);
    expect(r.scenes[1]!.text).toMatch(/Le train entre en gare\.\n\n?Léa descend du wagon\./);
    expect(r.scenes[1]!.text).not.toMatch(/SUITE|^2\.$/m);
  }, 30_000);
});
