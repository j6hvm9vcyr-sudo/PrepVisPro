/**
 * Notes datées d'une séquence ou d'un plan : une case à cocher (fait), le texte modifiable sur place,
 * la date, et un champ pour en prendre une nouvelle (↩ l'ajoute et garde le champ ouvert).
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../state/appStore';
import { noteDate, type NoteOwner } from '../model/notes';
import type { Note } from '../model/types';
import { IconClose } from './Icons';

/** Zone de texte qui suit la hauteur de son contenu. */
function AutoText({ value, label, done, onChange, onBlur }: { value: string; label: string; done: boolean; onChange(v: string): void; onBlur(): void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`note-text${done ? ' done' : ''}`}
      aria-label={label}
      value={value}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        e.stopPropagation();
        // ↩ quitte la note (⇧↩ pour aller à la ligne) ; esc aussi.
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function NoteRow({ owner, note }: { owner: NoteOwner; note: Note }) {
  const st = useApp.getState;
  const date = noteDate(note);
  const name = note.text.trim() || 'note vide';
  return (
    <li className={`note-row${note.done ? ' is-done' : ''}`}>
      <input type="checkbox" checked={note.done} aria-label={`Fait : ${name}`} onChange={(e) => st().updateNote(owner, note.id, { done: e.target.checked })} />
      <div className="note-body">
        <AutoText
          value={note.text}
          label={`Note : ${name}`}
          done={note.done}
          onChange={(v) => st().updateNote(owner, note.id, { text: v })}
          // Une note vidée est retirée.
          onBlur={() => {
            if (!note.text.trim()) st().removeNote(owner, note.id);
          }}
        />
        {date && (
          <time className="note-date" dateTime={new Date(note.createdAt!).toISOString()}>
            {date}
          </time>
        )}
      </div>
      <button type="button" className="ibtn small note-del" aria-label={`Retirer la note : ${name}`} title="Retirer la note" onClick={() => st().removeNote(owner, note.id)}>
        <IconClose />
      </button>
    </li>
  );
}

/** Champ « + Note » : ↩ ajoute la note et garde le champ prêt pour la suivante. */
export function NoteAdd({ owner, label, placeholder = '+ Note' }: { owner: NoteOwner; label: string; placeholder?: string }) {
  const [text, setText] = useState('');
  const add = () => {
    if (useApp.getState().addNote(owner, text)) setText('');
  };
  return (
    <input
      className="note-add"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={add}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          add();
        } else if (e.key === 'Escape') {
          setText('');
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** Liste des notes d'une séquence ou d'un plan ; `onlyOpen` cache celles qui sont faites. */
export function NotesList({ owner, notes, addLabel, onlyOpen = false, add = true }: { owner: NoteOwner; notes: Note[]; addLabel: string; onlyOpen?: boolean; add?: boolean }) {
  const shown = onlyOpen ? notes.filter((n) => !n.done) : notes;
  return (
    <div className="notes">
      {shown.length > 0 && (
        <ul className="note-list">
          {shown.map((n) => (
            <NoteRow key={n.id} owner={owner} note={n} />
          ))}
        </ul>
      )}
      {add && <NoteAdd owner={owner} label={addLabel} />}
    </div>
  );
}
