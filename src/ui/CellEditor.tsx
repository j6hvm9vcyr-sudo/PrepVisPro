import { useMemo, type KeyboardEvent } from 'react';
import { useApp } from '../state/appStore';
import { categoryOf, suggest, type EditableField, type TermField } from '../model/entry';
import { focusGrid } from './focus';

const HINTS: Record<EditableField, string> = {
  action: '↩ valider · ⇥ suivant · esc annuler',
  size: '« > » début → fin · ↑↓ choisir · ↩ valider · ⇥ suivant · esc annuler',
  axis: '« > » début → fin · ↑↓ choisir · ↩ valider · ⇥ suivant · esc annuler',
  angle: 'terme et/ou degrés (pl -20) · « > » début → fin · ↩ valider · esc annuler',
  focal: 'nombre en mm · « > » pour la fin (75 > 300) · ↩ valider · ⇥ suivant · esc annuler',
  movement: '« > » ou « , » enchaîne les mouvements · ↑↓ choisir · ↩ valider · esc annuler',
  grip: '« , » ajoute une machinerie · ↑↓ choisir · ↩ valider · esc annuler',
};

export function CellEditor({ field }: { field: EditableField }) {
  const editing = useApp((s) => s.editing);
  const terms = useApp((s) => (field === 'action' || field === 'focal' ? null : s.hist.present.doc.settings.terms[categoryOf(field as TermField)]));
  const text = editing?.text ?? '';
  const sugs = useMemo(() => (terms ? suggest(field, text, terms) : []), [field, text, terms]);
  if (!editing) return null;
  const pick = Math.min(editing.pick, Math.max(0, sugs.length - 1));
  const st = useApp.getState;

  const done = (ok: boolean) => {
    if (ok) focusGrid();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case 'ArrowDown':
        if (sugs.length) {
          e.preventDefault();
          st().setPick(Math.min(sugs.length - 1, pick + 1));
        }
        break;
      case 'ArrowUp':
        if (sugs.length) {
          e.preventDefault();
          st().setPick(Math.max(0, pick - 1));
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          // ⌘↩ : valider puis enchaîner sur un nouveau plan (⇧ pour une reprise).
          if (st().commitEdit('stay', pick)) st().newPlan(e.shiftKey);
          break;
        }
        done(st().commitEdit('down', pick));
        break;
      case 'Tab':
        e.preventDefault();
        done(st().commitEdit(e.shiftKey ? 'left' : 'right', pick));
        break;
      case 'Escape':
        e.preventDefault();
        st().cancelEdit();
        focusGrid();
        break;
    }
  };

  const onBlur = () => {
    // Validation implicite (clic ailleurs) : stricte, rien n'est créé ni deviné.
    const s = st();
    if (!s.editing) return;
    if (!s.commitEdit('stay', undefined, true)) {
      const err = st().editing?.error ?? '';
      st().cancelEdit();
      st().setMessage(`Saisie non appliquée : ${err}`, 'warn');
    }
  };

  return (
    <div className={`editor ${field === 'action' ? 'action' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
      <input
        autoFocus
        aria-label="Saisie"
        value={text}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        onChange={(e) => st().setEditText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onFocus={(e) => {
          const v = e.target.value;
          e.target.setSelectionRange(v.length, v.length);
        }}
      />
      {field !== 'action' && (
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
                done(st().commitEdit('right', i));
              }}
            >
              <span>{sg.create ? `Créer « ${sg.term} »` : sg.term}</span>
              {sg.create && <small>nouveau terme</small>}
            </button>
          ))}
          <div className="hint">{HINTS[field]}</div>
          {editing.error && <div className="err">{editing.error}</div>}
        </div>
      )}
      {field === 'action' && editing.error && (
        <div className="pop">
          <div className="err">{editing.error}</div>
        </div>
      )}
    </div>
  );
}
