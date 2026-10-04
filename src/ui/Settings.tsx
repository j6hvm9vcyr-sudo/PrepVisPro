import { useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { REQUIRED_LABEL } from '../model/completeness';
import { REQUIRED_FIELDS, TERM_CATEGORIES, type TermCategory } from '../model/types';
import { newId } from '../model/defaults';
import { norm } from '../model/text';
import { isComposing, focusGrid, useDialogFocus } from './focus';
import { CamerasTab } from './CamerasTab';
import { useTheme } from './theme';

const CAT_LABEL: Record<TermCategory, string> = { size: 'Valeurs', axis: 'Axes', angle: 'Angles', movement: 'Mouvements', grip: 'Machinerie' };

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const [tab, setTab] = useState<'projet' | 'cameras' | 'termes' | 'complet' | 'apparence'>('projet');
  const dlg = useDialogFocus<HTMLDivElement>();
  const [theme, setTheme] = useTheme();
  const close = () => {
    onClose();
    focusGrid();
  };

  return (
    <div
      ref={dlg}
      tabIndex={-1}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Réglages du projet"
      onClick={close}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
      }}
    >
      <div className="dialog" style={{ width: 800, maxWidth: 'calc(100vw - 32px)', height: 640, maxHeight: 'calc(100vh - 40px)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ whiteSpace: 'nowrap' }}>Réglages</h3>
          <div className="seg" role="tablist">
            {(
              [
                ['projet', 'Projet'],
                ['cameras', 'Caméras'],
                ['termes', 'Listes de termes'],
                ['complet', 'Plan complet'],
                ['apparence', 'Apparence'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={close}>
            Terminé
          </button>
        </div>

        {tab === 'projet' && (
          <>
            <div className="row">
              {(
                [
                  ['title', 'Titre'],
                  ['director', 'Réalisation'],
                ] as const
              ).map(([k, l]) => (
                <label className="field" key={k}>
                  {l}
                  <input value={doc.meta[k]} onChange={(e) => st().updateDoc((d) => void (d.meta[k] = e.target.value), `meta:${k}`)} />
                </label>
              ))}
            </div>
            <div className="row">
              <label className="field">
                Production
                <input value={doc.meta.production} onChange={(e) => st().updateDoc((d) => void (d.meta.production = e.target.value), 'meta:production')} />
              </label>
              <label className="field small">
                Ratio
                <input value={doc.meta.aspectRatio} placeholder="1,85:1" onChange={(e) => st().updateDoc((d) => void (d.meta.aspectRatio = e.target.value), 'meta:ratio')} />
              </label>
            </div>
            <div className="sec">
              <div className="sec-h">
                <span>Équipe (page de garde)</span>
                <button type="button" className="linkbtn" onClick={() => st().updateDoc((d) => void d.meta.crew.push({ id: newId('crew'), role: '', name: '' }))}>
                  + Ajouter
                </button>
              </div>
              {doc.meta.crew.map((m, i) => (
                <div className="row" key={m.id} style={{ alignItems: 'center' }}>
                  <label className="field">
                    <span className="sr-only">Poste</span>
                    <input placeholder="Poste" value={m.role} onChange={(e) => st().updateDoc((d) => void (d.meta.crew[i]!.role = e.target.value), `crew:${m.id}:r`)} />
                  </label>
                  <label className="field">
                    <span className="sr-only">Nom</span>
                    <input placeholder="Nom" value={m.name} onChange={(e) => st().updateDoc((d) => void (d.meta.crew[i]!.name = e.target.value), `crew:${m.id}:n`)} />
                  </label>
                  <button type="button" className="linkbtn danger" onClick={() => st().updateDoc((d) => void d.meta.crew.splice(i, 1))}>
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'cameras' && <CamerasTab />}

        {tab === 'termes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
            {TERM_CATEGORIES.map((cat) => (
              <TermEditor key={cat} cat={cat} />
            ))}
            <p className="note" style={{ margin: 0, fontSize: 12 }}>
              Retirer un terme ne modifie pas les plans qui l’utilisent déjà : il y reste, souligné en pointillé.
            </p>
          </div>
        )}

        {tab === 'apparence' && (
          <div className="sec">
            <p style={{ margin: 0, color: 'var(--text2)' }}>Réglage propre à cet ordinateur (il ne fait pas partie du projet).</p>
            {(
              [
                ['auto', 'Automatique (suit macOS)'],
                ['light', 'Clair'],
                ['dark', 'Sombre'],
              ] as const
            ).map(([k, l]) => (
              <label className="check" key={k}>
                <input type="radio" name="theme" checked={theme === k} onChange={() => setTheme(k)} />
                {l}
              </label>
            ))}
          </div>
        )}

        {tab === 'complet' && (
          <div className="sec">
            <p style={{ margin: 0, color: 'var(--text2)' }}>Un plan est « complet » quand ces champs sont renseignés (pour chaque caméra) :</p>
            {REQUIRED_FIELDS.map((f) => (
              <label className="check" key={f}>
                <input type="checkbox" checked={doc.settings.required[f]} onChange={(e) => st().updateDoc((d) => void (d.settings.required[f] = e.target.checked))} />
                {REQUIRED_LABEL[f].charAt(0).toUpperCase() + REQUIRED_LABEL[f].slice(1)}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function TermEditor({ cat }: { cat: TermCategory }) {
  const terms = useApp((s) => s.hist.present.doc.settings.terms[cat]);
  const st = useApp.getState;
  const [draft, setDraft] = useState('');
  const exists = draft.trim() !== '' && terms.some((t) => norm(t) === norm(draft));
  const add = (raw: string) => {
    const t = raw.trim();
    const current = st().hist.present.doc.settings.terms[cat];
    if (!t || current.some((x) => norm(x) === norm(t))) return;
    st().updateDoc((d) => void d.settings.terms[cat].push(t));
    setDraft('');
  };
  return (
    <div className="sec">
      <div className="sec-h">{CAT_LABEL[cat]}</div>
      <div className="terms-list">
        {terms.map((t, i) => (
          <span className="term-chip" key={t}>
            {t}
            <button type="button" aria-label={`Retirer ${t}`} onClick={() => st().updateDoc((d) => void d.settings.terms[cat].splice(i, 1))}>
              ×
            </button>
          </span>
        ))}
        <input
          className="term-chip"
          style={{ width: 120, padding: '3px 8px' }}
          placeholder="+ ajouter"
          value={draft}
          aria-invalid={exists}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const input = e.currentTarget;
            // Pendant une composition (accent…), la valeur finale arrive juste après.
            if (isComposing(e)) setTimeout(() => add(input.value), 60);
            else add(input.value);
          }}
          aria-label={`Ajouter à ${CAT_LABEL[cat]}`}
        />
        {exists && <span className="note">déjà dans la liste</span>}
      </div>
    </div>
  );
}
