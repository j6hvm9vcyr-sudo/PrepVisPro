import { systemTimeZone } from '../model/sun';
import { useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { REQUIRED_LABEL } from '../model/completeness';
import { CARRY_FIELDS, REQUIRED_FIELDS, TERM_CATEGORIES, type CarryField, type TermCategory } from '../model/types';
import { newId } from '../model/defaults';
import { norm } from '../model/text';
import { isComposing, focusGrid, useDialogFocus } from './focus';
import { CamerasTab } from './CamerasTab';
import { LensesTab } from './LensesTab';
import { KitTab } from './KitTab';
import { newProjectFromCurrent } from '../state/project';
import { useTheme } from './theme';

const CARRY_LABEL: Record<CarryField, string> = { size: 'Valeur', axis: 'Axe', angle: 'Angle (et inclinaison)', focal: 'Focale', movement: 'Mouvement', grip: 'Machinerie' };

const CAT_LABEL: Record<TermCategory, string> = { size: 'Valeurs', axis: 'Axes', angle: 'Angles', movement: 'Mouvements', grip: 'Machinerie' };

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const [tab, setTab] = useState<'projet' | 'cameras' | 'optiques' | 'termes' | 'complet' | 'materiel' | 'apparence'>('projet');
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
      <div className="dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3>Réglages du projet</h3>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={close}>
            Terminé
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav" role="tablist" aria-orientation="vertical">
            {(
              [
                ['projet', 'Projet'],
                ['cameras', 'Caméras'],
                ['optiques', 'Optiques'],
                ['termes', 'Listes de termes'],
                ['complet', 'Saisie des plans'],
                ['materiel', 'Mon matériel'],
                ['apparence', 'Apparence'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </nav>
          <div className="settings-content">
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
              <label className="field">
                Fuseau horaire (heures du soleil)
                <TimeZoneSelect />
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
            <div className="sec">
              <div className="sec-h">
                <span>Projet suivant</span>
              </div>
              <p className="note" style={{ margin: 0 }}>
                Un nouveau projet qui reprend la préparation de celui-ci : caméras, optiques, projecteurs, réflecteurs, exposition, listes de termes, champs obligatoires,
                production, ratio et équipe. Les séquences, plans au sol, jours et images ne sont pas repris.
              </p>
              <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void newProjectFromCurrent().then((ok) => ok && onClose())}>
                Nouveau projet avec ces réglages…
              </button>
            </div>
          </>
        )}

        {tab === 'cameras' && <CamerasTab />}
        {tab === 'optiques' && <LensesTab />}
        {tab === 'materiel' && <KitTab />}

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
          <>
            <div className="sec" aria-label="Plan suivant" role="group">
              <div className="sec-h">
                <span>Plan suivant (⌘↩, ↩ en fin de ligne)</span>
              </div>
              <p style={{ margin: 0, color: 'var(--text2)' }}>Le nouveau plan reprend du plan précédent, pour chaque caméra :</p>
              {CARRY_FIELDS.map((f) => (
                <label className="check" key={f}>
                  <input type="checkbox" checked={doc.settings.carryOver[f]} onChange={(e) => st().updateDoc((d) => void (d.settings.carryOver[f] = e.target.checked))} />
                  {CARRY_LABEL[f]}
                </label>
              ))}
              <p className="note" style={{ margin: 0 }}>
                Le reste part vide, à saisir. Une reprise (4/2B) reprend toujours tout ; ⌘D duplique le plan à l’identique.
              </p>
            </div>
            <div className="sec" aria-label="Plan complet" role="group">
              <div className="sec-h">
                <span>Plan complet</span>
              </div>
              <p style={{ margin: 0, color: 'var(--text2)' }}>Un plan est « complet » quand ces champs sont renseignés (pour chaque caméra) :</p>
              {REQUIRED_FIELDS.map((f) => (
                <label className="check" key={f}>
                  <input type="checkbox" checked={doc.settings.required[f]} onChange={(e) => st().updateDoc((d) => void (d.settings.required[f] = e.target.checked))} />
                  {REQUIRED_LABEL[f].charAt(0).toUpperCase() + REQUIRED_LABEL[f].slice(1)}
                </label>
              ))}
            </div>
          </>
        )}
          </div>
        </div>
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

/** Fuseaux connus du système (heure d'été comprise). */
const TIME_ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['Europe/Paris', 'UTC'];
  } catch {
    return ['Europe/Paris', 'UTC'];
  }
})();

/** Fuseau horaire du projet (heures du soleil, des jours de tournage). */
export function TimeZoneSelect() {
  const doc = useApp(selectDoc);
  return (
    <select aria-label="Fuseau horaire" value={doc.settings.timeZone ?? ''} onChange={(e) => useApp.getState().updateDoc((d) => void (d.settings.timeZone = e.target.value || null))}>
      <option value="">Celui de cet ordinateur ({systemTimeZone()})</option>
      {[...new Set([...TIME_ZONES, ...(doc.settings.timeZone ? [doc.settings.timeZone] : [])])].map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}
