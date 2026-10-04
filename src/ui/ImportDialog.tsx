import { useMemo, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { applyImport, planImport, type SceneStatus } from '../import/merge';
import { stripColors } from './strip';
import { focusGrid, useDialogFocus } from './focus';

const STATUS_LABEL: Record<SceneStatus, string> = { new: 'Nouvelle', changed: 'Modifiée', same: 'Identique' };

export function ImportDialog() {
  const importing = useApp((s) => s.importing);
  const doc = useApp(selectDoc);
  const plan = useMemo(() => (importing ? planImport(doc, importing.scenes) : null), [doc, importing]);
  const [include, setInclude] = useState<Set<string> | null>(null);
  const [headings, setHeadings] = useState(false);
  const dlg = useDialogFocus<HTMLDivElement>(!!importing);
  if (!importing || !plan) return null;
  const actionable = plan.changes.filter((c) => c.status !== 'same');
  const selected = include ?? new Set(actionable.map((c) => c.scene.number));
  const close = () => {
    useApp.getState().setImporting(null);
    focusGrid();
  };
  const toggle = (n: string) => {
    const next = new Set(selected);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setInclude(next);
  };
  const count = actionable.filter((c) => selected.has(c.scene.number)).length;
  const blocked = plan.duplicates.length > 0;
  const run = () => {
    const r = applyImport(doc, plan, { include: selected, updateHeadings: headings });
    const parts = [r.added ? `${r.added} séquence${r.added > 1 ? 's' : ''} ajoutée${r.added > 1 ? 's' : ''}` : '', r.updated ? `${r.updated} mise${r.updated > 1 ? 's' : ''} à jour` : ''].filter(Boolean);
    useApp.getState().replaceDoc(r.doc, `Scénario importé : ${parts.join(', ') || 'rien à changer'} · ⌘Z pour annuler`);
    close();
  };

  return (
    <div
      ref={dlg}
      tabIndex={-1}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Importer un scénario"
      onClick={close}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
      }}
    >
      <div className="dialog" style={{ width: 860 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3>Importer « {importing.name} »</h3>
          <span className="note" style={{ fontSize: 12 }}>
            {importing.scenes.length} scène{importing.scenes.length > 1 ? 's' : ''} · {plan.changes.filter((c) => c.status === 'new').length} nouvelle(s) ·{' '}
            {plan.changes.filter((c) => c.status === 'changed').length} modifiée(s) · {plan.changes.filter((c) => c.status === 'same').length} identique(s)
          </span>
        </div>

        {blocked && (
          <div className="welcome-error" role="alert">
            Numéros de scène en double dans le scénario : {plan.duplicates.join(', ')}. Corrigez la numérotation dans Final Draft avant d’importer : sinon les séquences ne
            peuvent pas être rapprochées sans risque.
          </div>
        )}

        <div className="import-table" role="table" aria-label="Scènes">
          <div className="import-row head" role="row">
            <span />
            <span>N°</span>
            <span>En-tête lu</span>
            <span>État</span>
          </div>
          {plan.changes.map((c) => {
            const col = stripColors(c.scene.parsed);
            const can = c.status !== 'same';
            return (
              <label key={c.scene.number + c.scene.heading} className={`import-row ${can ? '' : 'same'}`} role="row">
                <input type="checkbox" disabled={!can || blocked} checked={can && selected.has(c.scene.number)} onChange={() => toggle(c.scene.number)} aria-label={`Scène ${c.scene.number}`} />
                <span className="mono" style={{ fontWeight: 600 }}>
                  {c.scene.number}
                  {!c.scene.numbered && (
                    <small className="note" title="Scène non numérotée dans Final Draft : numéro d’ordre">
                      {' '}
                      (ordre)
                    </small>
                  )}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className="strip" style={{ background: col.fill, borderColor: col.edge, height: 14, width: 8 }} />
                  <span style={{ minWidth: 0 }}>
                    <b>{c.scene.parsed.intExt}</b> {c.scene.location || <i className="note">décor ?</i>} — <b>{c.scene.parsed.dayNight}</b>
                    {c.scene.parsed.effect && <span className="note"> ({c.scene.parsed.effect})</span>}
                    {c.scene.parsed.doubts.length > 0 && <span className="doubt"> · à vérifier : {c.scene.parsed.doubts.join(', ')}</span>}
                    {c.details.length > 0 && <span className="note"> · {c.details.join(' · ')}</span>}
                  </span>
                </span>
                <span className={`status-pill ${c.status}`}>{STATUS_LABEL[c.status]}</span>
              </label>
            );
          })}
        </div>

        {plan.absent.length > 0 && (
          <p className="note" style={{ margin: 0, fontSize: 12 }}>
            Séquences du projet absentes de ce scénario (elles sont conservées, avec leurs plans) :{' '}
            {plan.absent.map((a) => `${a.number || '?'}${a.location ? ` ${a.location}` : ''}`).join(', ')}.
          </p>
        )}

        <label className="check">
          <input type="checkbox" checked={headings} onChange={(e) => setHeadings(e.target.checked)} />
          Mettre aussi à jour INT/EXT, décor et effet des séquences existantes (sinon, seul le texte des scènes est mis à jour)
        </label>

        <div className="row" style={{ alignItems: 'center' }}>
          <span className="note">Les plans déjà découpés ne sont jamais modifiés. L’import s’annule avec ⌘Z.</span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={close}>
            Annuler
          </button>
          <button type="button" className="btn primary" disabled={blocked || count === 0} onClick={run} autoFocus>
            Importer {count} scène{count > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
