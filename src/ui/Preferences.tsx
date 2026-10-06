import { Info } from './Info';
/**
 * Préférences de PrepVisPro (⌘,) : ce qui suit l'utilisateur d'un projet à l'autre, gardé sur ce
 * Mac. Les réglages propres au film sont dans « Réglages du projet » (⇧⌘,).
 */
import { useMemo, useState } from 'react';
import { useApp } from '../state/appStore';
import { useProject } from '../state/project';
import { resetPrefs, updatePrefs, usePrefs } from '../state/prefs';
import { CARRY_FIELDS, TERM_CATEGORIES, type CarryField, type TermCategory } from '../model/types';
import { DEFAULT_TERMS } from '../model/defaults';
import { aliasConflict } from '../model/entry';
import { norm } from '../model/text';
import { isComposing, focusGrid, useDialogFocus } from './focus';
import { CAT_LABEL } from './Settings';

const CARRY_LABEL: Record<CarryField, string> = { size: 'Valeur', axis: 'Axe', angle: 'Angle (et inclinaison)', focal: 'Focale', movement: 'Mouvement', grip: 'Machinerie' };

export function PrefsDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'saisie'>('saisie');
  const dlg = useDialogFocus<HTMLDivElement>();
  const { prefs, status, error } = usePrefs();
  const locked = status === 'broken';
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
      aria-label="Préférences de PrepVisPro"
      onClick={close}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
      }}
    >
      <div className="dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3>Préférences</h3>
          <span className="scope-badge">Ce Mac</span>
          <Info title="Préférences de l’app">
            <span>Valables pour tous vos projets, gardées sur ce Mac.</span>
            <span>Jamais dans un fichier projet.</span>
          </Info>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={close}>
            Terminé
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav" role="tablist" aria-orientation="vertical">
            {(
              [
                ['saisie', 'Saisie'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {locked && (
              <div className="sec prefs-broken" role="alert">
                <span>
                  Le fichier des préférences est illisible{error ? ` (${error})` : ''}. Valeurs par défaut en attendant ; le fichier n’est pas modifié.
                </span>
                <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => resetPrefs()}>
                  Repartir des préférences par défaut
                </button>
              </div>
            )}

            {tab === 'saisie' && (
              <>
                <div className="sec" aria-label="Plan suivant" role="group">
                  <div className="sec-h">
                    <span>Plan suivant</span>
                    <Info title="Plan suivant">
                      <span>Ce que le nouveau plan (⌘↩, ou ↩ en fin de ligne) reprend du précédent, pour chaque caméra. Le reste part vide.</span>
                      <span>Une reprise (⇧⌘↩, 4/2B) reprend toujours tout.</span>
                    </Info>
                  </div>
                  {CARRY_FIELDS.map((f) => (
                    <label className="check" key={f}>
                      <input type="checkbox" disabled={locked} checked={prefs.carryOver[f]} onChange={(e) => updatePrefs((p) => void (p.carryOver[f] = e.target.checked))} />
                      {CARRY_LABEL[f]}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="Abréviations" role="group">
                  <div className="sec-h">
                    <span>Abréviations reconnues à la saisie</span>
                  </div>
                  {TERM_CATEGORIES.map((cat) => (
                    <AliasEditor key={cat} cat={cat} locked={locked} />
                  ))}
                  <OtherAliases locked={locked} />
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

/** Termes d'une catégorie : ceux livrés avec l'app, et ceux du projet ouvert. */
function useCategoryTerms(cat: TermCategory): string[] {
  const open = useProject((s) => s.mode !== 'none');
  const projectTerms = useApp((s) => s.hist.present.doc.settings.terms[cat]);
  return useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of [...DEFAULT_TERMS[cat], ...(open ? projectTerms : [])]) {
      if (seen.has(norm(t))) continue;
      seen.add(norm(t));
      out.push(t);
    }
    return out;
  }, [cat, open, projectTerms]);
}

function AliasEditor({ cat, locked }: { cat: TermCategory; locked: boolean }) {
  const terms = useCategoryTerms(cat);
  const aliases = usePrefs((s) => s.prefs.aliases);
  const [sel, setSel] = useState<string | null>(null);
  const [alias, setAlias] = useState('');
  const term = sel && terms.includes(sel) ? sel : null;
  const conflict = term && alias.trim() ? aliasConflict(terms, aliases, term, alias) : null;
  const add = (raw: string) => {
    if (!term || !raw.trim() || aliasConflict(terms, usePrefs.getState().prefs.aliases, term, raw)) return;
    if (updatePrefs((p) => void (p.aliases[term] = [...(p.aliases[term] ?? []), raw.trim()]))) setAlias('');
  };
  return (
    <div className="sec">
      <div className="sec-h">{CAT_LABEL[cat]}</div>
      <div className="terms-list">
        {terms.map((t) => (
          <span className={`term-chip ${t === term ? 'on' : ''}`} key={t}>
            <button type="button" className="term-name" aria-pressed={t === term} title="Abréviations de ce terme" onClick={() => setSel(t === term ? null : t)}>
              {t}
              {(aliases[t]?.length ?? 0) > 0 && <small> · {aliases[t]!.join(', ')}</small>}
            </button>
          </span>
        ))}
      </div>
      {term && (
        <div className="alias-row" role="group" aria-label={`Abréviations de ${term}`}>
          <span className="note">Abréviations de « {term} » :</span>
          {(aliases[term] ?? []).map((a, i) => (
            <span className="term-chip" key={a}>
              {a}
              <button type="button" disabled={locked} aria-label={`Retirer l’abréviation ${a}`} onClick={() => updatePrefs((p) => void p.aliases[term]?.splice(i, 1))}>
                ×
              </button>
            </span>
          ))}
          <input
            className="term-chip"
            style={{ width: 120, padding: '3px 8px' }}
            placeholder="+ abréviation"
            aria-label={`Ajouter une abréviation à ${term}`}
            aria-invalid={!!conflict}
            disabled={locked}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const input = e.currentTarget;
              // Pendant une composition (accent…), la valeur finale arrive juste après.
              if (isComposing(e)) setTimeout(() => add(input.value), 60);
              else add(input.value);
            }}
          />
          {conflict && <span className="note" style={{ color: 'var(--warn-text)' }}>{conflict}</span>}
        </div>
      )}
    </div>
  );
}

/** Abréviations de termes absents des listes affichées (repris d'un autre projet) : visibles et retirables. */
function OtherAliases({ locked }: { locked: boolean }) {
  const aliases = usePrefs((s) => s.prefs.aliases);
  const open = useProject((s) => s.mode !== 'none');
  const projectTerms = useApp((s) => s.hist.present.doc.settings.terms);
  const known = useMemo(() => {
    const k = new Set<string>();
    for (const cat of TERM_CATEGORIES) for (const t of [...DEFAULT_TERMS[cat], ...(open ? projectTerms[cat] : [])]) k.add(norm(t));
    return k;
  }, [open, projectTerms]);
  const others = Object.entries(aliases).filter(([t, list]) => list.length > 0 && !known.has(norm(t)));
  if (!others.length) return null;
  return (
    <div className="sec">
      <div className="sec-h">Autres termes</div>
      {others.map(([t, list]) => (
        <div className="alias-row" key={t} role="group" aria-label={`Abréviations de ${t}`}>
          <span className="note">« {t} » :</span>
          {list.map((a, i) => (
            <span className="term-chip" key={a}>
              {a}
              <button type="button" disabled={locked} aria-label={`Retirer l’abréviation ${a}`} onClick={() => updatePrefs((p) => void p.aliases[t]?.splice(i, 1))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
