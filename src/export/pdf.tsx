/**
 * Export PDF du découpage (mise en page dédiée, pensée pour l'impression et l'écran).
 * Rendu par @react-pdf/renderer : aucune dépendance au navigateur pour la mise en page.
 */
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { COLUMN_DEFS, describePlan, descriptionFields, dtColumns, planValue, type ColumnId, type DtCol, type ExportModel, type ExportOptions, type ExportPlan, type ExportSequence } from './model';

export interface PdfImage {
  /** URL de données (data:image/jpeg;base64,…). */
  dataUrl: string;
  width: number;
  height: number;
}

/** Page « plan au sol » : image déjà rendue (même dessin que l'éditeur) et légende des caméras. */
export interface PdfFloorPage {
  id: string;
  name: string;
  /** « Séq. 4, 5 » ; vide si le plan n'est rattaché à aucune séquence. */
  sequences: string;
  image: PdfImage | null;
  /** Message si l'image n'a pas pu être produite. */
  error: string | null;
  scaled: boolean;
  legend: { code: string; detail: string; action: string; missing: boolean }[];
}

export interface FontSources {
  sansRegular: string;
  sansSemiBold: string;
  sansBold: string;
  monoRegular: string;
  monoSemiBold: string;
}

let registered = false;
export function registerPdfFonts(src: FontSources) {
  if (registered) return;
  Font.register({
    family: 'Plex',
    fonts: [
      { src: src.sansRegular, fontWeight: 400 },
      { src: src.sansSemiBold, fontWeight: 600 },
      { src: src.sansBold, fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'PlexMono',
    fonts: [
      { src: src.monoRegular, fontWeight: 400 },
      { src: src.monoSemiBold, fontWeight: 600 },
    ],
  });
  // Pas de césure : les termes techniques et les valeurs (« -10° », « Demi-ensemble ») restent entiers.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

const INK = '#13161B';
const INK2 = '#465061';
const INK3 = '#6A7383';
const LINE = '#D6DAE1';
const HEAD_BG = '#F1F3F6';

const s = StyleSheet.create({
  page: { fontFamily: 'Plex', fontSize: 8.5, color: INK, paddingTop: 30, paddingBottom: 34, paddingHorizontal: 26 },
  head: { position: 'absolute', top: 12, left: 26, right: 26, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: INK3 },
  foot: { position: 'absolute', bottom: 14, left: 26, right: 26, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: INK3 },
  thead: { flexDirection: 'row', backgroundColor: HEAD_BG, borderTopWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE },
  th: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 6.8, fontWeight: 700, color: INK2, letterSpacing: 0.4 },
  band: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: 5, paddingHorizontal: 6, backgroundColor: '#EEF0F4', borderBottomWidth: 0.6, borderColor: LINE },
  strip: { width: 22, height: 10, borderRadius: 2, borderWidth: 0.6, marginRight: 7 },
  bandNum: { fontFamily: 'PlexMono', fontWeight: 600, fontSize: 9, marginRight: 8 },
  bandTitle: { fontWeight: 600, fontSize: 9 },
  bandMeta: { color: INK3, fontSize: 7.5, marginLeft: 'auto' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: LINE },
  camRow: { flexDirection: 'row' },
  td: { paddingVertical: 4, paddingHorizontal: 4 },
  // lineHeight en points : la forme sans unité est mal interprétée par le moteur PDF.
  tdText: { lineHeight: '11pt' },
  code: { fontFamily: 'PlexMono', fontWeight: 600, fontSize: 9 },
  mono: { fontFamily: 'PlexMono' },
  muted: { color: INK3 },
  script: { color: INK2, fontSize: 7.8, lineHeight: '10pt' },
  comments: { paddingVertical: 5, paddingHorizontal: 6, fontSize: 8, lineHeight: '10.5pt', color: INK2, borderBottomWidth: 0.5, borderColor: LINE },
  warn: { color: '#9A4F00', fontSize: 7, marginTop: 2 },
  cover: { flex: 1, justifyContent: 'center', paddingHorizontal: 40 },
  coverKicker: { fontSize: 11, fontWeight: 700, color: INK2, letterSpacing: 1.5 },
  coverTitle: { fontSize: 36, fontWeight: 700, marginTop: 8 },
  coverBy: { fontSize: 15, marginTop: 6 },
  coverInfo: { fontSize: 11, color: INK2, marginTop: 3 },
  coverCrew: { marginTop: 26, paddingTop: 12, borderTopWidth: 0.8, borderColor: LINE },
  coverCrewRow: { flexDirection: 'row', fontSize: 10.5, marginTop: 3 },
});

const IMAGE_WIDTH = { small: 74, medium: 112, large: 168 } as const;

const BD_COLS = [
  ['seq', 'SÉQUENCE', 2.4],
  ['camera', 'CAMÉRA', 1.6],
  ['grip', 'MACHINERIE', 1.6],
  ['lighting', 'LUMIÈRE', 1.6],
  ['other', 'AUTRE', 1.6],
  ['focals', 'FOCALES DES PLANS', 1.1],
  ['pgrip', 'MACHINERIE DES PLANS', 1.3],
] as const;
const BD_TOTAL = BD_COLS.reduce((n, c) => n + c[2], 0);

function today(): string {
  const d = new Date();
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Ordre d'affichage : colonnes de plan avant le bloc caméra, bloc caméra, colonnes de plan après. */
export function layoutColumns(columns: ColumnId[], multi: boolean) {
  const first = columns.findIndex((c) => COLUMN_DEFS[c].perCamera);
  if (first < 0) return { before: columns, cams: [] as (ColumnId | 'camera')[], after: [] as ColumnId[] };
  const before = columns.slice(0, first).filter((c) => !COLUMN_DEFS[c].perCamera);
  const cams: (ColumnId | 'camera')[] = columns.filter((c) => COLUMN_DEFS[c].perCamera);
  if (multi) cams.unshift('camera');
  const after = columns.slice(first).filter((c) => !COLUMN_DEFS[c].perCamera);
  return { before, cams, after };
}

function widths(opts: ExportOptions, pageWidth: number, multi: boolean): Map<ColumnId | 'camera', number> {
  const out = new Map<ColumnId | 'camera', number>();
  if (multi && opts.columns.some((c) => COLUMN_DEFS[c].perCamera)) {
    out.set('camera', 20);
    pageWidth -= 20;
  }
  const imgW = IMAGE_WIDTH[opts.imageSize] + 8;
  let fixed = 0;
  if (opts.columns.includes('image')) {
    out.set('image', imgW);
    fixed += imgW;
  }
  const flex = opts.columns.filter((c) => c !== 'image');
  const total = flex.reduce((n, c) => n + COLUMN_DEFS[c].weight, 0);
  const rest = pageWidth - fixed;
  for (const c of flex) out.set(c, (rest * COLUMN_DEFS[c].weight) / total);
  return out;
}

function PlanBlock({ p, opts, w, images, multi }: { p: ExportPlan; opts: ExportOptions; w: Map<ColumnId | 'camera', number>; images: Map<string, PdfImage>; multi: boolean }) {
  const img = p.imageFile ? images.get(p.imageFile) : undefined;
  const iw = IMAGE_WIDTH[opts.imageSize];
  const { before, cams, after } = layoutColumns(opts.columns, multi);
  const planCell = (c: ColumnId) => {
    const width = w.get(c)!;
    if (c === 'image')
      return (
        <View key={c} style={[s.td, { width }]}>
          {img ? <Image src={img.dataUrl} style={{ width: iw, height: Math.min((iw * img.height) / img.width, (iw * 3) / 4), objectFit: 'cover' }} /> : null}
        </View>
      );
    const v = planValue(p, c);
    return (
      <View key={c} style={[s.td, { width }]}>
        <Text style={[s.tdText, ...(c === 'code' ? [s.code] : c === 'global' ? [s.mono, s.muted] : c === 'script' ? [s.script] : [])]}>{v}</Text>
        {c === 'code' && opts.markIncomplete && p.missing.length > 0 ? <Text style={s.warn}>à compléter</Text> : null}
      </View>
    );
  };
  return (
    <View style={s.row} wrap={false}>
      {before.map(planCell)}
      {cams.length > 0 && (
        <View style={{ flexDirection: 'column' }}>
          {p.cameras.map((cam, i) => (
            <View key={i} style={[s.camRow, i > 0 ? { borderTopWidth: 0.4, borderColor: '#E7E9EE', borderStyle: 'dashed' } : {}]}>
              {cams.map((c) => (
                <View key={c} style={[s.td, { width: w.get(c)! }]}>
                  <Text style={[s.tdText, ...(c === 'focal' || c === 'camera' ? [s.mono] : []), ...(c === 'camera' ? [s.muted] : [])]}>
                    {c === 'camera' ? cam.label : cam.values[c] || ''}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
      {after.map(planCell)}
    </View>
  );
}

const A4 = { w: 595.28, h: 841.89 };

// ------------------------------------------------------------------ style « découpage technique »

const DT_HEAD = '#464646';
const DT_LINE = '#8A8F98';

function dtWidths(cols: DtCol[], opts: ExportOptions, pageW: number): number[] {
  const imgW = IMAGE_WIDTH[opts.imageSize] + 10;
  const flex = cols.filter((c) => c.id !== 'image');
  const fixed = cols.some((c) => c.id === 'image') ? imgW : 0;
  const total = flex.reduce((n, c) => n + c.width, 0);
  return cols.map((c) => (c.id === 'image' ? imgW : ((pageW - fixed) * c.width) / total));
}

const dt = StyleSheet.create({
  head: { flexDirection: 'row', backgroundColor: DT_HEAD },
  th: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 7, color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.3 },
  band: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 5, paddingHorizontal: 6, borderTopWidth: 1.2, borderBottomWidth: 1.2, borderColor: '#000000' },
  bandTitle: { fontSize: 10.5, fontWeight: 700, flex: 1 },
  bandAddr: { fontSize: 7, color: INK2, maxWidth: 200, textAlign: 'right' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: DT_LINE },
  td: { paddingVertical: 4, paddingHorizontal: 4, borderRightWidth: 0.5, borderColor: DT_LINE },
  text: { fontSize: 8, lineHeight: '10.5pt' },
  label: { fontSize: 6.3, fontWeight: 700, color: INK2, letterSpacing: 0.4 },
  value: { fontSize: 8, lineHeight: '10pt' },
  comments: { paddingVertical: 4, paddingHorizontal: 6, fontSize: 8, lineHeight: '10.5pt', borderBottomWidth: 0.8, borderColor: '#000000' },
});

function DtPlan({ p, cols, widths, opts, images, fields, tint }: { p: ExportPlan; cols: DtCol[]; widths: number[]; opts: ExportOptions; images: Map<string, PdfImage>; fields: ColumnId[]; tint: string }) {
  const img = p.imageFile ? images.get(p.imageFile) : undefined;
  const iw = IMAGE_WIDTH[opts.imageSize];
  return (
    <View style={[dt.row, { backgroundColor: tint }]} wrap={false}>
      {cols.map((c, i) => {
        const w = widths[i]!;
        const last = i === cols.length - 1;
        const cellStyle = [dt.td, { width: w }, last ? { borderRightWidth: 0 } : {}];
        if (c.id === 'image')
          return (
            <View key={c.id} style={cellStyle}>
              {img ? <Image src={img.dataUrl} style={{ width: iw, height: Math.min((iw * img.height) / img.width, (iw * 3) / 4), objectFit: 'cover' }} /> : null}
            </View>
          );
        if (c.id === 'description')
          return (
            <View key={c.id} style={cellStyle}>
              {describePlan(p, fields, { showCamera: opts.showCamera }).map((b, bi) => (
                <View key={bi} style={bi > 0 ? { marginTop: 5, paddingTop: 4, borderTopWidth: 0.4, borderColor: DT_LINE, borderStyle: 'dashed' } : {}}>
                  {b.camera ? <Text style={[dt.label, { color: INK, fontSize: 7 }]}>CAM {b.camera}</Text> : null}
                  {b.lines.map((l) => (
                    <Text key={l.label} style={dt.value}>
                      <Text style={dt.label}>{l.label}  </Text>
                      {l.value}
                    </Text>
                  ))}
                </View>
              ))}
              {opts.markIncomplete && p.missing.length > 0 ? <Text style={s.warn}>à compléter</Text> : null}
            </View>
          );
        const v =
          c.id === 'global' ? String(p.global) : c.id === 'code' ? p.code : c.id === 'camera' ? (p.cameras.length > 1 ? p.cameras.map((k) => k.label).join('/') : '') : c.id === 'action' ? p.action : c.id === 'script' ? p.script : p.notes;
        return (
          <View key={c.id} style={cellStyle}>
            <Text style={[dt.text, ...(c.id === 'code' ? [s.code] : c.id === 'global' || c.id === 'camera' ? [s.mono, s.muted] : c.id === 'script' ? [s.script] : [])]}>{v}</Text>
          </View>
        );
      })}
    </View>
  );
}

function DtSequence({ seq, cols, widths, opts, images, fields }: { seq: ExportSequence; cols: DtCol[]; widths: number[]; opts: ExportOptions; images: Map<string, PdfImage>; fields: ColumnId[] }) {
  return (
    <View>
      <View style={[dt.band, { backgroundColor: seq.tint }]} wrap={false} minPresenceAhead={70}>
        <Text style={dt.bandTitle}>{seq.heading}</Text>
        {seq.address ? <Text style={dt.bandAddr}>{seq.address}</Text> : null}
      </View>
      {seq.plans.map((p) => (
        <DtPlan key={p.id} p={p} cols={cols} widths={widths} opts={opts} images={images} fields={fields} tint={seq.tint} />
      ))}
      {opts.sequenceComments ? (
        <View style={[dt.comments, { backgroundColor: seq.tint }]} wrap={false}>
          <Text>
            <Text style={{ fontWeight: 700 }}>COMMENTAIRES :</Text>
            {seq.comments.trim() ? ` ${seq.comments.trim()}` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Une page par plan au sol, orientée selon la forme du plan. */
function FloorPages({ title, floors, date }: { title: string; floors: PdfFloorPage[]; date: string }) {
  return (
    <>
      {floors.map((f) => {
        const landscape = !f.image || f.image.width >= f.image.height;
        const pw = (landscape ? A4.h : A4.w) - 52;
        const ph = (landscape ? A4.w : A4.h) - 64;
        // Place réservée à la légende sous l'image (au-delà, elle continue sur la page suivante).
        const legendRows = Math.min(f.legend.length, landscape ? 6 : 10);
        const legendH = f.legend.length ? 22 + Math.ceil(legendRows / 2) * 13 : 0;
        const boxH = ph - 34 - legendH;
        const img = f.image;
        const scale = img ? Math.min(pw / img.width, boxH / img.height) : 1;
        return (
          <Page key={f.id} size="A4" orientation={landscape ? 'landscape' : 'portrait'} style={s.page}>
            <View style={s.head} fixed>
              <Text>{title} — Plan au sol</Text>
              <Text>{date}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: 700 }}>{f.name}</Text>
              {f.sequences ? <Text style={{ fontSize: 9, color: INK3, marginLeft: 10 }}>{f.sequences}</Text> : null}
              {!f.scaled ? <Text style={{ fontSize: 8, color: '#9A4F00', marginLeft: 'auto' }}>Plan non mis à l’échelle : distances et champs indicatifs</Text> : null}
            </View>
            {img ? (
              <View style={{ alignItems: 'center' }}>
                <Image src={img.dataUrl} style={{ width: img.width * scale, height: img.height * scale, borderWidth: 0.6, borderColor: LINE }} />
              </View>
            ) : (
              <Text style={{ color: '#9A4F00' }}>{f.error ?? 'Plan vide.'}</Text>
            )}
            {f.legend.length > 0 && (
              <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap' }}>
                {f.legend.map((r, i) => (
                  <View key={i} style={{ width: '50%', flexDirection: 'row', paddingVertical: 2, paddingRight: 10 }} wrap={false}>
                    <Text style={[s.code, { width: 62, fontSize: 8.5 }, r.missing ? s.muted : {}]}>{r.code}</Text>
                    <Text style={[s.mono, { width: 70, fontSize: 8 }, s.muted]}>{r.detail}</Text>
                    <Text style={{ flex: 1, fontSize: 8, color: INK2 }}>{r.action}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={s.foot} fixed>
              <Text>PrepVisPro</Text>
              <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
            </View>
          </Page>
        );
      })}
    </>
  );
}

export function FloorPlansPdf({ title, director, floors }: { title: string; director: string; floors: PdfFloorPage[] }): ReactElement {
  return (
    <Document title={`${title} — Plans au sol`} author={director} creator="PrepVisPro" producer="PrepVisPro" language="fr">
      <FloorPages title={title} floors={floors} date={today()} />
    </Document>
  );
}

export async function renderFloorPdf(title: string, director: string, floors: PdfFloorPage[]): Promise<Uint8Array> {
  const blob = await pdf(<FloorPlansPdf title={title} director={director} floors={floors} />).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

export function DecoupagePdf({ m, opts, images, floors = [] }: { m: ExportModel; opts: ExportOptions; images: Map<string, PdfImage>; floors?: PdfFloorPage[] }): ReactElement {
  const pageW = (opts.orientation === 'landscape' ? 841.89 : 595.28) - 52;
  const w = widths(opts, pageW, m.multiCamera && opts.showCamera);
  const lay = layoutColumns(opts.columns, m.multiCamera && opts.showCamera);
  const dtCols = dtColumns(opts, m.multiCamera);
  const dtW = dtWidths(dtCols, opts, pageW);
  const fields = descriptionFields(opts.columns);
  const ordered = [...lay.before, ...lay.cams, ...lay.after];
  const date = today();
  return (
    <Document title={`${m.title} — Découpage technique`} author={m.director} creator="PrepVisPro" producer="PrepVisPro" language="fr">
      {opts.coverPage && (
        <Page size="A4" orientation={opts.orientation} style={s.page}>
          <View style={s.cover}>
            <Text style={s.coverKicker}>DÉCOUPAGE TECHNIQUE</Text>
            <Text style={s.coverTitle}>{m.title || 'Sans titre'}</Text>
            {m.director ? <Text style={s.coverBy}>de {m.director}</Text> : null}
            <View style={{ marginTop: 18 }}>
              {m.version ? <Text style={[s.coverInfo, { fontWeight: 700, color: INK }]}>{m.version}</Text> : null}
              {m.aspectRatio ? <Text style={s.coverInfo}>Ratio : {m.aspectRatio}</Text> : null}
              {m.production ? <Text style={s.coverInfo}>Production : {m.production}</Text> : null}
              <Text style={s.coverInfo}>
                {m.sequences.length} séquence{m.sequences.length > 1 ? 's' : ''} · {m.totalPlans} plan{m.totalPlans > 1 ? 's' : ''} · version du {date}
              </Text>
            </View>
            {m.crew.length > 0 && (
              <View style={s.coverCrew}>
                {m.crew.map((c, i) => (
                  <View key={i} style={s.coverCrewRow}>
                    <Text style={{ width: 200, color: INK2 }}>{c.role}</Text>
                    <Text style={{ fontWeight: 600 }}>{c.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Page>
      )}
      {opts.layout === 'dt' ? (
        <Page size="A4" orientation={opts.orientation} style={s.page}>
          <View style={s.head} fixed>
            <Text>{m.title} — Découpage technique{m.version ? ` · ${m.version}` : ''}</Text>
            <Text>{date}</Text>
          </View>
          <View style={dt.head} fixed>
            {dtCols.map((c, i) => (
              <Text key={c.id} style={[dt.th, { width: dtW[i]! }]}>
                {c.label}
              </Text>
            ))}
          </View>
          {m.sequences.map((seq) => (
            <DtSequence key={seq.id} seq={seq} cols={dtCols} widths={dtW} opts={opts} images={images} fields={fields} />
          ))}
          <View style={s.foot} fixed>
            <Text>PrepVisPro</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      ) : (
      <Page size="A4" orientation={opts.orientation} style={s.page}>
          <View style={s.head} fixed>
            <Text>{m.title} — Découpage technique{m.version ? ` · ${m.version}` : ''}</Text>
            <Text>{date}</Text>
          </View>
          <View style={s.thead} fixed>
            {ordered.map((c) => (
              <Text key={c} style={[s.th, { width: w.get(c)! }]}>
                {c === 'camera' ? 'CAM' : COLUMN_DEFS[c].label.toUpperCase()}
              </Text>
            ))}
          </View>
          {m.sequences.map((seq) => (
            <View key={seq.id}>
              <View style={s.band} wrap={false} minPresenceAhead={60}>
                <View style={[s.strip, { backgroundColor: seq.strip.fill, borderColor: seq.strip.edge }]} />
                <Text style={s.bandNum}>SÉQ. {seq.number || '?'}</Text>
                <Text style={s.bandTitle}>{seq.title}</Text>
                <Text style={s.bandMeta}>
                  {seq.address ? `${seq.address} · ` : ''}
                  {seq.plans.length} plan{seq.plans.length > 1 ? 's' : ''}
                </Text>
              </View>
              {seq.plans.map((p) => (
                <PlanBlock key={p.id} p={p} opts={opts} w={w} images={images} multi={m.multiCamera && opts.showCamera} />
              ))}
              {opts.sequenceComments && seq.comments.trim() ? (
                <View style={s.comments} wrap={false}>
                  <Text>
                    <Text style={{ fontWeight: 600 }}>Commentaires : </Text>
                    {seq.comments.trim()}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
          <View style={s.foot} fixed>
            <Text>PrepVisPro</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
      {opts.breakdown && (
        <Page size="A4" orientation={opts.orientation} style={s.page}>
          <View style={s.head} fixed>
            <Text>{m.title} — Dépouillement image</Text>
            <Text>{date}</Text>
          </View>
          <View style={s.thead} fixed>
            {BD_COLS.map(([k, l, wgt]) => (
              <Text key={k} style={[s.th, { width: (pageW * wgt) / BD_TOTAL }]}>
                {l}
              </Text>
            ))}
          </View>
          {m.sequences.map((seq) => (
            <View key={seq.id} style={s.row} wrap={false}>
              {BD_COLS.map(([k, , wgt]) => {
                const width = (pageW * wgt) / BD_TOTAL;
                if (k === 'seq')
                  return (
                    <View key={k} style={[s.td, { width, flexDirection: 'row' }]}>
                      <View style={[s.strip, { width: 6, height: 18, backgroundColor: seq.strip.fill, borderColor: seq.strip.edge }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.code}>SÉQ. {seq.number || '?'}</Text>
                        <Text style={[s.tdText, s.muted]}>{seq.title}</Text>
                      </View>
                    </View>
                  );
                const v = k === 'focals' ? seq.summary.focals : k === 'pgrip' ? seq.summary.grip : seq.breakdown[k];
                return (
                  <View key={k} style={[s.td, { width }]}>
                    <Text style={[s.tdText, ...(k === 'focals' || k === 'pgrip' ? [s.muted] : [])]}>{v}</Text>
                  </View>
                );
              })}
            </View>
          ))}
          <View style={s.foot} fixed>
            <Text>PrepVisPro</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
      {floors.length > 0 && <FloorPages title={m.title} floors={floors} date={date} />}
    </Document>
  );
}

export async function renderPdf(m: ExportModel, opts: ExportOptions, images: Map<string, PdfImage>, floors: PdfFloorPage[] = []): Promise<Uint8Array> {
  const blob = await pdf(<DecoupagePdf m={m} opts={opts} images={images} floors={floors} />).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
