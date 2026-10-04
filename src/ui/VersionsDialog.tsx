/**
 * Versions du projet : figer un état sous un nom (« V2 envoyée à la réalisation »), voir ce qui a
 * changé depuis, y revenir. Revenir à une version garde d'abord l'état actuel comme version.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { createVersion, listVersions, readVersion, restoreVersion, useProject, VERSIONS_NEED_SAVE, type ProjectVersion } from '../state/project';
import { getBackend } from '../platform/backend';
import { compareDocs, type DocDiff } from '../model/diff';
import type { ProjectDoc } from '../model/types';
import { focusGrid, useDialogFocus } from './focus';

const when = (t: number) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function VersionsDialog() {
  const open = useApp((s) => s.showVersions);
  const dlg = useDialogFocus<HTMLDivElement>(open);
  if (!open) return null;
  return <VersionsBody dlg={dlg} />;
}

function VersionsBody({ dlg }: { dlg: React.RefObject<HTMLDivElement | null> }) {
  const doc = useApp(selectDoc);
  const mode = useProject((s) => s.mode);
  const [list, setList] = useState<ProjectVersion[] | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProjectVersion | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<ProjectDoc | null>(null);
  // Ce qui a changé entre la version choisie et l'état actuel.
  const diff = useMemo<DocDiff | null>(() => (selectedDoc ? compareDocs(selectedDoc, doc) : null), [selectedDoc, doc]);
  const [busy, setBusy] = useState(false);
  const [needSave, setNeedSave] = useState(false);

  const close = () => {
    useApp.getState().setShowVersions(false);
    focusGrid();
  };
  const refresh = async () => {
    try {
      setList(await listVersions());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void getBackend().then((b) => setNeedSave(b.kind === 'tauri' && mode !== 'file'));
    listVersions().then(setList, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [mode]);

  const choose = (v: ProjectVersion) => {
    if (selected?.file === v.file) {
      setSelected(null);
      setSelectedDoc(null);
      return;
    }
    setSelected(v);
    setSelectedDoc(null);
    readVersion(v.file).then(setSelectedDoc, (e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = await createVersion(name || `V${(list?.filter((x) => !x.name.startsWith('Avant le retour')).length ?? 0) + 1}`, note);
      setName('');
      setNote('');
      await refresh();
      useApp.getState().setMessage(`Version « ${v.name} » enregistrée`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (v: ProjectVersion) => {
    const b = await getBackend();
    if (!(await b.confirm('Revenir à cette version ?', `Le projet reviendra à « ${v.name} ». L’état actuel sera d’abord gardé comme version, et ⌘Z annule le retour.`, 'Revenir à cette version', 'Annuler'))) return;
    setBusy(true);
    try {
      await restoreVersion(v);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={dlg}
      tabIndex={-1}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Versions du projet"
      onClick={close}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' && !busy) close();
      }}
    >
      <div className="dialog versions" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Versions</h3>
          <span className="spacer" />
          <button type="button" className="btn" onClick={close}>
            Fermer
          </button>
        </div>
        {needSave ? (
          <p className="note">{VERSIONS_NEED_SAVE}</p>
        ) : (
          <form
            className="versions-new"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input className="field-input" aria-label="Nom de la version" placeholder={`Nom (ex. V${(list?.length ?? 0) + 1} envoyée à la réalisation)`} value={name} onChange={(e) => setName(e.target.value)} />
            <input className="field-input" aria-label="Note" placeholder="Note (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="submit" className="btn primary" disabled={busy}>
              Enregistrer cette version
            </button>
          </form>
        )}
        {error && (
          <div className="welcome-error" role="alert">
            {error}
          </div>
        )}
        <div className="versions-body">
          <div className="versions-list" aria-label="Versions enregistrées">
            {list === null ? (
              <p className="note">Chargement…</p>
            ) : list.length === 0 ? (
              <p className="note">Aucune version pour l’instant. Enregistrez-en une avant chaque envoi (réalisation, équipe…) pour pouvoir comparer ensuite.</p>
            ) : (
              list.map((v) => (
                <button key={v.file} type="button" className={`version-item ${selected?.file === v.file ? 'on' : ''}`} onClick={() => choose(v)} aria-pressed={selected?.file === v.file}>
                  <b>{v.name}</b>
                  <small>{when(v.createdAt)}</small>
                  {v.note && <small className="version-note">{v.note}</small>}
                </button>
              ))
            )}
          </div>
          <div className="versions-diff" aria-live="polite">
            {!selected ? (
              <p className="note">Choisissez une version pour voir ce qui a changé depuis.</p>
            ) : !diff ? (
              <p className="note">Comparaison…</p>
            ) : (
              <>
                <div className="row" style={{ alignItems: 'center' }}>
                  <b>Depuis « {selected.name} »</b>
                  <span className="spacer" />
                  <button type="button" className="btn" disabled={busy} onClick={() => void restore(selected)}>
                    Revenir à cette version…
                  </button>
                </div>
                <DiffView diff={diff} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffView({ diff }: { diff: DocDiff }) {
  const { added, removed, changed } = diff.counts;
  if (!diff.sequences.length && !diff.other.length) return <p className="note">Aucun changement : le projet est identique à cette version.</p>;
  return (
    <div className="diff">
      <p className="diff-sum">
        {added} plan{added > 1 ? 's' : ''} ajouté{added > 1 ? 's' : ''} · {removed} retiré{removed > 1 ? 's' : ''} · {changed} modifié{changed > 1 ? 's' : ''}
      </p>
      {diff.other.map((o) => (
        <p key={o} className="diff-other">
          {o}
        </p>
      ))}
      {diff.sequences.map((s) => (
        <div key={s.id} className={`diff-seq ${s.status}`}>
          <div className="diff-seq-h">
            <span className={`diff-tag ${s.status}`}>{s.status === 'added' ? 'Nouvelle' : s.status === 'removed' ? 'Retirée' : 'Modifiée'}</span>
            <b className="mono">SÉQ. {s.number || '?'}</b> {s.title}
          </div>
          {s.changes.map((c) => (
            <Change key={c.label} c={c} />
          ))}
          {s.plans.map((p) => (
            <div key={p.id} className="diff-plan">
              <span className={`diff-tag ${p.status}`}>{p.status === 'added' ? 'Ajouté' : p.status === 'removed' ? 'Retiré' : p.changes.length ? 'Modifié' : 'Renuméroté'}</span>
              <b className="mono">{p.code}</b>
              {p.oldCode && <span className="note"> (était {p.oldCode})</span>}
              {p.changes.map((c) => (
                <Change key={c.label} c={c} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Change({ c }: { c: { label: string; from: string; to: string } }) {
  return (
    <div className="diff-change">
      <span className="diff-k">{c.label}</span>
      <span className="diff-from">{c.from || '—'}</span>
      <span className="diff-arrow">→</span>
      <span className="diff-to">{c.to || '—'}</span>
    </div>
  );
}
