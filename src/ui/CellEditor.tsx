import { useEffect, useMemo, useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { useApp } from '../state/appStore';
import { categoryOf, suggest, termCtx, type EditableField, type TermField } from '../model/entry';
import { kitFocals } from '../model/lenses';
import { formatNumber } from '../model/text';
import { focusGrid } from './focus';

const HINTS: Record<EditableField, string> = {
  action: '↩ valider · ⇥ suivant · esc annuler',
  size: '↑↓ choisir · ↩ valider · « > » plan évolutif',
  axis: '↑↓ choisir · ↩ valider · « > » plan évolutif',
  angle: 'terme et/ou degrés (pl -20) · « > » plan évolutif',
  focal: 'mm, ou ↑↓ dans les optiques · « > » zoom (75 > 300)',
  movement: '↑↓ choisir · « > » ou « , » enchaîne',
  grip: '↑↓ choisir · « , » ajoute',
};

export function CellEditor({ field }: { field: EditableField }) {
  const editing = useApp((s) => s.editing);
  const lenses = useApp((s) => s.hist.present.doc.settings.lenses);
  const termList = useApp((s) => (field === 'action' || field === 'focal' ? null : s.hist.present.doc.settings.terms[categoryOf(field as TermField)]));
  // Focale : les focales des optiques du projet servent de propositions.
  const terms = useMemo(() => (field === 'focal' ? (lenses.length ? kitFocals(lenses).map(formatNumber) : null) : termList), [field, lenses, termList]);
  const doc = useApp((s) => s.hist.present.doc);
  // Abréviations du projet, et ordre d'emploi : le même contexte que la validation (store.commitEdit).
  const ctx = useMemo(() => termCtx(doc, field), [doc, field]);
  const text = editing?.text ?? '';
  const browse = editing?.browse;
  const sugs = useMemo(() => (browse ? browse.map((term) => ({ term, create: false })) : terms ? suggest(field, text, terms, ctx) : []), [browse, field, text, terms, ctx]);
  // Touche de validation reçue pendant une composition (accent, texte prédictif de macOS) :
  // exécutée dès que la composition se termine, sur le texte final.
  const input = useRef<HTMLInputElement>(null);
  // Choix aux flèches dans la liste complète : la nouvelle valeur reste sélectionnée.
  useEffect(() => {
    if (browse && input.current && document.activeElement === input.current) input.current.select();
  }, [browse, text]);
  const pending = useRef<{ key: 'Enter' | 'Tab'; shift: boolean; meta: boolean } | null>(null);
  if (!editing) return null;
  const pick = Math.min(editing.pick, Math.max(0, sugs.length - 1));
  const st = useApp.getState;

  const done = (ok: boolean) => {
    if (ok) focusGrid();
  };

  const validate = (key: 'Enter' | 'Tab', shift: boolean, meta: boolean, at?: number) => {
    if (!st().editing) return;
    if (key === 'Enter' && meta) {
      // ⌘↩ : valider puis enchaîner sur un nouveau plan (⇧ pour une reprise).
      if (st().commitEdit('stay', at)) st().newPlan(shift);
    } else if (key === 'Enter') done(st().commitEdit('down', at));
    else done(st().commitEdit(shift ? 'left' : 'right', at));
  };

  const runPending = () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    // La valeur finale arrive par l'événement « input » qui suit la fin de composition.
    setTimeout(() => validate(p.key, p.shift, p.meta), 0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        pending.current = { key: e.key, shift: e.shiftKey, meta: e.metaKey || e.ctrlKey };
        // Filet de sécurité si la fin de composition n'est jamais signalée.
        setTimeout(runPending, 120);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        if (sugs.length) {
          e.preventDefault();
          if (browse) st().browseTo(Math.min(sugs.length - 1, pick + 1));
          else st().setPick(Math.min(sugs.length - 1, pick + 1));
        }
        break;
      case 'ArrowUp':
        if (sugs.length) {
          e.preventDefault();
          if (browse) st().browseTo(Math.max(0, pick - 1));
          else st().setPick(Math.max(0, pick - 1));
        }
        break;
      case 'Enter':
        e.preventDefault();
        validate('Enter', e.shiftKey, e.metaKey || e.ctrlKey, pick);
        break;
      case 'Tab':
        e.preventDefault();
        validate('Tab', e.shiftKey, false, pick);
        break;
      case 'Escape':
        e.preventDefault();
        st().cancelEdit();
        focusGrid();
        break;
    }
  };

  const onBlur = (e: FocusEvent<HTMLInputElement>) => {
    // Validation implicite (clic ailleurs) : stricte, rien n'est créé ni deviné.
    const s = st();
    if (!s.editing) return;
    if (s.commitEdit('stay', undefined, true)) return;
    const err = st().editing?.error ?? '';
    const to = e.relatedTarget;
    if (!to || to === document.body) {
      // Clic sur un bouton ou dans le vide (Safari ne donne pas le focus aux boutons) :
      // la saisie n'est pas perdue, elle reste ouverte avec son explication.
      const input = e.currentTarget;
      setTimeout(() => {
        if (st().editing && input.isConnected) input.focus({ preventScroll: true });
      }, 0);
      st().setMessage(`Saisie à terminer : ${err} (↩ pour choisir la suggestion, esc pour annuler)`, 'warn');
      return;
    }
    st().cancelEdit();
    st().setMessage(`Saisie non appliquée : ${err}`, 'warn');
  };

  return (
    <div className={`editor ${field === 'action' ? 'action' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={input}
        autoFocus
        aria-label="Saisie"
        value={text}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        // Texte prédictif en ligne de macOS : il intercepte ↩ et ⇥ ; inutile pour des termes techniques.
        {...{ writingsuggestions: 'false' }}
        onChange={(e) => st().setEditText(e.target.value)}
        onKeyDown={onKeyDown}
        onCompositionEnd={runPending}
        onBlur={onBlur}
        onFocus={(e) => {
          const v = e.target.value;
          // Liste complète (case remplie) : la valeur est sélectionnée, taper la remplace.
          if (st().editing?.browse) e.target.select();
          else e.target.setSelectionRange(v.length, v.length);
        }}
      />
      {field !== 'action' && (field !== 'focal' || terms || editing.error) && (
        <div className="pop" role="listbox" aria-label="Suggestions">
          {sugs.slice(0, 9).map((sg, i) => (
            <button
              key={`${sg.term}-${sg.create}`}
              type="button"
              role="option"
              aria-selected={i === pick}
              className={`sug ${i === pick ? 'on' : ''} ${sg.create ? 'create' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                st().setPick(i);
                done(st().commitEdit('right', i));
              }}
            >
              <span>{sg.create ? `Créer « ${sg.term} »` : sg.term}</span>
              {sg.create && <small>nouveau terme</small>}
            </button>
          ))}
          {editing.batch && <div className="hint batch">↩ remplit les {editing.batch.length + 1} cellules sélectionnées</div>}
          <div className="hint">{HINTS[field]}</div>
          {editing.error && <div className="err">{editing.error}</div>}
        </div>
      )}
      {field === 'action' && (editing.error || editing.batch) && (
        <div className="pop">
          {editing.batch && <div className="hint batch">↩ remplit les {editing.batch.length + 1} cellules sélectionnées</div>}
          {editing.error && <div className="err">{editing.error}</div>}
        </div>
      )}
    </div>
  );
}
