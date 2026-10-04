import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { ALL_COLUMNS, BUILTIN_PRESETS, COLUMN_DEFS, type ColumnId, type ExportOptions } from '../export/model';
import { allPresets, deleteUserPreset, lastUsed, rememberLast, sameOptions, saveUserPreset } from '../export/presets';
import { buildExport, floorPlansFor, saveExport, type ExportFormat } from '../export/service';
import { getBackend } from '../platform/backend';
import { focusGrid, useDialogFocus } from './focus';

type Busy = { format: ExportFormat; progress: string } | null;
type Done = { path: string; format: ExportFormat; failedImages: number; failedFloors: string[] } | null;

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const doc = useApp(selectDoc);
  const [initial] = useState(lastUsed);
  const [presetId, setPresetId] = useState(initial.presetId);
  const [opts, setOpts] = useState<ExportOptions>(initial.options);
  const [presets, setPresets] = useState(allPresets);
  const [busy, setBusy] = useState<Busy>(null);
  const [done, setDone] = useState<Done>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const dlg = useDialogFocus<HTMLDivElement>();
  const preset = presets.find((p) => p.id === presetId);
  const modified = !preset || !sameOptions(preset.options, opts);
  const presetName = modified ? 'personnalisé' : preset!.name;

  const close = () => {
    onClose();
    focusGrid();
  };

  const choosePreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setOpts({ ...structuredClone(p.options), sequenceIds: opts.sequenceIds });
    setDone(null);
  };

  const set = (patch: Partial<ExportOptions>) => {
    setOpts((o) => ({ ...o, ...patch }));
    setDone(null);
  };

  const toggleCol = (c: ColumnId) => {
    const on = opts.columns.includes(c);
    if (on && opts.columns.length === 1) return;
    set({ columns: on ? opts.columns.filter((x) => x !== c) : insertInOrder(opts.columns, c) });
  };

  const moveCol = (c: ColumnId, d: -1 | 1) => {
    const i = opts.columns.indexOf(c);
    const j = i + d;
    if (i < 0 || j < 0 || j >= opts.columns.length) return;
    const next = [...opts.columns];
    [next[i], next[j]] = [next[j]!, next[i]!];
    set({ columns: next });
  };

  const run = async (format: ExportFormat) => {
    setError(null);
    setDone(null);
    setBusy({ format, progress: 'Préparation…' });
    try {
      const built = await buildExport(doc, format, opts, (d, t) => setBusy({ format, progress: `${d} / ${t}` }));
      setBusy({ format, progress: 'Enregistrement…' });
      const path = await saveExport(doc, format, built.bytes, presetName);
      rememberLast(presetId, opts);
      if (path) setDone({ path, format, failedImages: built.failedImages, failedFloors: built.failedFloors ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const seqAll = opts.sequenceIds.length === 0;

  return (
    <div
      ref={dlg}
      tabIndex={-1}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Exporter"
      onClick={close}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' && !busy) close();
      }}
    >
      <div className="dialog export" onClick={(e) => e.stopPropagation()}>
        <div className="export-head">
          <h3>Exporter le découpage</h3>
          <span className="spacer" />
          <button type="button" className="btn" onClick={close} disabled={!!busy}>
            Fermer
          </button>
        </div>
        <div className="export-body">
          <div className="export-col">
            <section className="sec">
              <div className="sec-h">Modèle</div>
              <div className="preset-list" role="radiogroup" aria-label="Modèle d’export">
                {presets.map((p) => {
                  const on = p.id === presetId && !modified;
                  const builtin = BUILTIN_PRESETS.some((b) => b.id === p.id);
                  return (
                    <div key={p.id} className="preset-row">
                      <button type="button" role="radio" aria-checked={on} className={`preset ${on ? 'on' : ''}`} onClick={() => choosePreset(p.id)}>
                        {p.name}
                      </button>
                      {!builtin && (
                        <button
                          type="button"
                          className="linkbtn danger"
                          aria-label={`Supprimer le modèle ${p.name}`}
                          onClick={() => {
                            deleteUserPreset(p.id);
                            setPresets(allPresets());
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
                {modified && <div className="preset on custom">Personnalisé (non enregistré)</div>}
              </div>
              {modified &&
                (naming === null ? (
                  <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => setNaming('')}>
                    Enregistrer comme modèle…
                  </button>
                ) : (
                  <form
                    className="row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const p = saveUserPreset(naming, opts);
                      setPresets(allPresets());
                      setPresetId(p.id);
                      setNaming(null);
                    }}
                  >
                    <input autoFocus className="field-input" placeholder="Nom du modèle" value={naming} onChange={(e) => setNaming(e.target.value)} aria-label="Nom du modèle" />
                    <button type="submit" className="btn" disabled={!naming.trim()}>
                      Enregistrer
                    </button>
                  </form>
                ))}
            </section>

            <section className="sec">
              <div className="sec-h">Colonnes et ordre</div>
              <div className="col-list">
                {[...opts.columns, ...ALL_COLUMNS.filter((c) => !opts.columns.includes(c))].map((c) => {
                  const on = opts.columns.includes(c);
                  const i = opts.columns.indexOf(c);
                  return (
                    <div key={c} className={`col-row ${on ? '' : 'off'}`}>
                      <label className="check">
                        <input type="checkbox" checked={on} onChange={() => toggleCol(c)} />
                        {COLUMN_DEFS[c].label}
                        {opts.layout === 'dt' && COLUMN_DEFS[c].perCamera && on && <span className="note"> → Description</span>}
                      </label>
                      {on && (
                        <span className="col-move">
                          <button type="button" aria-label={`Monter ${COLUMN_DEFS[c].label}`} disabled={i === 0} onClick={() => moveCol(c, -1)}>
                            ↑
                          </button>
                          <button type="button" aria-label={`Descendre ${COLUMN_DEFS[c].label}`} disabled={i === opts.columns.length - 1} onClick={() => moveCol(c, 1)}>
                            ↓
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="export-col">
            <section className="sec">
              <div className="sec-h">Présentation (PDF et Excel)</div>
              <div className="seg" role="group" aria-label="Présentation">
                <button type="button" aria-pressed={opts.layout === 'dt'} onClick={() => set({ layout: 'dt' })}>
                  Découpage technique
                </button>
                <button type="button" aria-pressed={opts.layout === 'columns'} onClick={() => set({ layout: 'columns' })}>
                  Une colonne par réglage
                </button>
              </div>
              <p className="note" style={{ margin: 0 }}>
                {opts.layout === 'dt'
                  ? 'Valeur, axe, angle, focale, mouvement et machinerie regroupés dans une case Description ; lignes aux couleurs de l’effet de chaque séquence.'
                  : 'Chaque réglage dans sa propre colonne : pratique pour trier ou filtrer dans Excel.'}
              </p>
              <label className="check">
                <input type="checkbox" checked={opts.showCamera} onChange={(e) => set({ showCamera: e.target.checked })} />
                Caméra (A, B…) des plans à plusieurs caméras
              </label>
              {doc.floorPlans.length > 0 && (
                <label className="check">
                  <input type="checkbox" checked={opts.floorPlans} onChange={(e) => set({ floorPlans: e.target.checked })} />
                  Plans au sol des séquences exportées, en PDF et Excel ({floorPlansFor(doc, opts.sequenceIds).length})
                </label>
              )}
            </section>

            <section className="sec">
              <div className="sec-h">Mise en page (PDF)</div>
              <div className="row">
                <div className="seg" role="group" aria-label="Orientation">
                  <button type="button" aria-pressed={opts.orientation === 'landscape'} onClick={() => set({ orientation: 'landscape' })}>
                    Paysage
                  </button>
                  <button type="button" aria-pressed={opts.orientation === 'portrait'} onClick={() => set({ orientation: 'portrait' })}>
                    Portrait
                  </button>
                </div>
                <div className="seg" role="group" aria-label="Taille des images">
                  {(['small', 'medium', 'large'] as const).map((k) => (
                    <button key={k} type="button" aria-pressed={opts.imageSize === k} onClick={() => set({ imageSize: k })} disabled={!opts.columns.includes('image')}>
                      {{ small: 'Petites', medium: 'Moyennes', large: 'Grandes' }[k]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="check">
                <input type="checkbox" checked={opts.coverPage} onChange={(e) => set({ coverPage: e.target.checked })} />
                Page de garde (titre, équipe)
              </label>
              <label className="check">
                <input type="checkbox" checked={opts.sequenceComments} onChange={(e) => set({ sequenceComments: e.target.checked })} />
                Commentaires de séquence
              </label>
              <label className="check">
                <input type="checkbox" checked={opts.markIncomplete} onChange={(e) => set({ markIncomplete: e.target.checked })} />
                Signaler les plans à compléter
              </label>
              <label className="check">
                <input type="checkbox" checked={opts.breakdown} onChange={(e) => set({ breakdown: e.target.checked })} />
                Dépouillement image (caméra, machinerie, lumière, autre)
              </label>

            </section>

            <section className="sec">
              <div className="sec-h">
                Séquences
                <label className="check" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
                  <input type="checkbox" checked={seqAll} onChange={(e) => set({ sequenceIds: e.target.checked ? [] : doc.sequences.map((s) => s.id) })} />
                  Toutes
                </label>
              </div>
              {!seqAll && (
                <div className="seq-pick">
                  {doc.sequences.map((s) => {
                    const on = opts.sequenceIds.includes(s.id);
                    return (
                      <label className="check" key={s.id}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            const ids = on ? opts.sequenceIds.filter((x) => x !== s.id) : doc.sequences.filter((x) => x.id === s.id || opts.sequenceIds.includes(x.id)).map((x) => x.id);
                            set({ sequenceIds: ids.length ? ids : [] });
                          }}
                        />
                        <span className="mono">{s.number || '?'}</span> {s.location || 'Décor à préciser'}
                      </label>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="sec export-actions">
              <div className="sec-h">Exporter en</div>
              <div className="row">
                <button type="button" className="btn primary big" disabled={!!busy} onClick={() => void run('pdf')}>
                  {busy?.format === 'pdf' ? busy.progress : 'PDF'}
                </button>
                <button type="button" className="btn big" disabled={!!busy} onClick={() => void run('xlsx')}>
                  {busy?.format === 'xlsx' ? busy.progress : 'Excel'}
                </button>
                <button type="button" className="btn big" disabled={!!busy} onClick={() => void run('csv')}>
                  {busy?.format === 'csv' ? busy.progress : 'CSV'}
                </button>
              </div>
              <p className="note" style={{ margin: 0 }}>
                Excel reprend les colonnes choisies et reste modifiable. Le CSV ne contient pas d’images.
              </p>
              {error && (
                <div className="welcome-error" role="alert">
                  Export impossible : {error}
                </div>
              )}
              {done && <DoneBox done={done} />}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function DoneBox({ done }: { done: NonNullable<Done> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: 'nearest' }), []);
  const name = done.path.split('/').pop();
  return (
    <div className="export-done" role="status" ref={ref}>
      <div>
        <b>Exporté :</b> {name}
      </div>
      {done.failedImages > 0 && (
        <div className="note" style={{ color: 'var(--warn-text)' }}>
          {done.failedImages} image{done.failedImages > 1 ? 's n’ont' : ' n’a'} pas pu être lue{done.failedImages > 1 ? 's' : ''} et manque{done.failedImages > 1 ? 'nt' : ''} dans l’export.
        </div>
      )}
      {done.failedFloors.map((f, i) => (
        <div key={i} className="note" style={{ color: 'var(--warn-text)' }}>
          {f}
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn" onClick={() => void getBackend().then((b) => b.openFile(done.path))}>
          Ouvrir
        </button>
        <button type="button" className="btn" onClick={() => void getBackend().then((b) => b.reveal(done.path))}>
          Afficher dans le Finder
        </button>
      </div>
    </div>
  );
}

/** Réinsère une colonne à sa place naturelle par rapport aux colonnes déjà choisies. */
function insertInOrder(cols: ColumnId[], c: ColumnId): ColumnId[] {
  const rank = (x: ColumnId) => ALL_COLUMNS.indexOf(x);
  const next = [...cols];
  const at = next.findIndex((x) => rank(x) > rank(c));
  next.splice(at < 0 ? next.length : at, 0, c);
  return next;
}
