/** « D'après le plan » : valeur et axe déduits du plan au sol, à reporter au découpage d'un clic. */
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { FloorCamera, FloorPlan } from '../model/floor';
import { idealFocalFor, suggestFraming, type FramingGuess } from '../model/floorSuggest';
import { nearestLens } from '../model/lenses';
import { locatePlan, replaceCameraSetup } from '../model/ops';
import { formatNumber } from '../model/text';
import type { CameraSetup, LensSeries } from '../model/types';

const m = (v: number) => `${formatNumber(Math.round(v * 10) / 10)} m`;

export function FramingSuggestion({ fp, cam }: { fp: FloorPlan; cam: FloorCamera }) {
  const doc = useApp(selectDoc);
  const r = suggestFraming(doc, fp, cam);
  const loc = cam.planId ? locatePlan(doc, cam.planId) : null;
  const setup = loc?.plan.cameras.find((c) => c.id === cam.setupId) ?? null;

  if (!r.ok || !setup || !loc) {
    return (
      <section className="sec suggest" aria-label="D’après le plan">
        <div className="sec-h">D’après le plan</div>
        <p className="note" style={{ margin: 0 }}>{r.ok ? 'Reliez cette caméra à un plan du découpage.' : r.reason}</p>
      </section>
    );
  }

  const apply = (fn: (s: CameraSetup) => void, what: string) => {
    const next = structuredClone(setup);
    fn(next);
    const st = useApp.getState();
    st.applyDoc(replaceCameraSetup(selectDoc(st), loc.plan.id, next), `${what} reporté${what.endsWith('s') ? 's' : ''} au découpage`);
  };

  const rows: { label: string; field: 'size' | 'axis'; start: string | null; end: string | null; current: string; currentEnd: string }[] = [
    { label: 'Valeur', field: 'size', start: r.start.size, end: r.end?.size ?? null, current: setup.start.size, currentEnd: setup.end?.size ?? '' },
    { label: 'Axe', field: 'axis', start: r.start.axis, end: r.end?.axis ?? null, current: setup.start.axis, currentEnd: setup.end?.axis ?? '' },
  ];
  const differs = (row: (typeof rows)[number]) => (row.start !== null && row.start !== row.current) || (row.end !== null && row.end !== row.start && row.end !== row.currentEnd);
  const setRow = (s: CameraSetup, row: (typeof rows)[number]) => {
    if (row.start !== null) s.start[row.field] = row.start;
    if (row.end !== null && row.end !== row.start) {
      s.end ??= structuredClone(s.start);
      s.end[row.field] = row.end;
    }
  };
  const any = rows.some(differs);

  return (
    <section className="sec suggest" aria-label="D’après le plan">
      <div className="sec-h">D’après le plan</div>
      <Measure g={r.start} label={r.end ? 'Début' : null} />
      {r.end && <Measure g={r.end} label="Fin" />}
      {rows.map((row) => (
        <div key={row.field} className="suggest-row">
          <span className="suggest-k">{row.label}</span>
          <span className="suggest-v">
            {row.start ?? '—'}
            {row.end && row.end !== row.start ? ` → ${row.end}` : ''}
            {row.current && (row.start !== row.current || (row.end && row.end !== row.currentEnd)) ? <small> (découpage : {row.current}{row.currentEnd && row.currentEnd !== row.current ? ` → ${row.currentEnd}` : ''})</small> : null}
          </span>
          {differs(row) ? (
            <button type="button" className="linkbtn" onClick={() => apply((s) => setRow(s, row), row.label)}>
              Reporter
            </button>
          ) : row.start !== null ? (
            <span className="suggest-ok" title="Le découpage correspond">✓</span>
          ) : null}
        </div>
      ))}
      {any && rows.filter(differs).length > 1 && (
        <button type="button" className="btn" onClick={() => apply((s) => rows.filter(differs).forEach((row) => setRow(s, row)), 'Valeur et axe')}>
          Tout reporter au découpage
        </button>
      )}
      <IdealFocal setup={setup} guess={r.start} lenses={doc.settings.lenses} onSet={(f) => apply((s) => void (s.start.focalMm = f), 'Focale')} />
      <p className="note" style={{ margin: 0, fontSize: 11, lineHeight: '15px' }}>
        Estimation pour un personnage debout cadré en hauteur : hauteur de champ = distance × hauteur de l’image ÷ focale. Axe : orientation du personnage par rapport à la caméra.
      </p>
    </section>
  );
}

function Measure({ g, label }: { g: FramingGuess; label: string | null }) {
  return (
    <p className="note" style={{ margin: 0 }}>
      {label ? <b>{label} : </b> : null}
      {g.actor.name} à {m(g.distanceM)}
      {g.frameHeightM !== null ? ` · champ ≈ ${m(g.frameHeightM)} de haut` : ' · hauteur de champ inconnue (hauteur capteur ou ratio du projet à renseigner)'}
    </p>
  );
}

/** Calcul inverse : pour la valeur écrite au découpage, quelle focale à cette distance (et quelle optique du projet). */
function IdealFocal({ setup, guess, lenses, onSet }: { setup: CameraSetup; guess: FramingGuess; lenses: LensSeries[]; onSet: (f: number) => void }) {
  const want = setup.start.size;
  if (!want || guess.frameMm === null) return null;
  const ideal = idealFocalFor(want, guess.distanceM, guess.frameMm);
  if (ideal === null) return null;
  const pick = lenses.length ? nearestLens(lenses, ideal) : { focal: Math.round(ideal), series: '' };
  if (!pick) return null;
  const same = setup.start.focalMm !== null && Math.abs(setup.start.focalMm - pick.focal) < 0.01;
  return (
    <div className="suggest-row ideal">
      <span className="suggest-k">Focale</span>
      <span className="suggest-v">
        {formatNumber(Math.round(ideal))} mm pour un {want} à {m(guess.distanceM)}
        {lenses.length ? <small> → {pick.series} {formatNumber(pick.focal)} mm</small> : null}
      </span>
      {same ? (
        <span className="suggest-ok" title="Le découpage utilise déjà cette focale">✓</span>
      ) : (
        <button type="button" className="linkbtn" onClick={() => onSet(pick.focal)}>
          Mettre {formatNumber(pick.focal)} mm
        </button>
      )}
    </div>
  );
}
