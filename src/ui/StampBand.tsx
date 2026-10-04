import type { Stamp } from '../model/types';
import { useApp } from '../state/appStore';

/** Tampon dans le découpage (tableau, fiches) : une ligne pleine largeur, cliquable pour le modifier. */
export function StampBand({ stamp }: { stamp: Stamp }) {
  const text = stamp.text.trim();
  return (
    <div className="stamp-band" id={`stamp-${stamp.id}`} role="row" aria-label={`Tampon ${text || 'sans texte'}`}>
      <button type="button" tabIndex={-1} title="Modifier le tampon" onClick={() => useApp.getState().setEditingStamp(stamp.id)}>
        <span className={`stamp-text ${text ? '' : 'empty'}`}>{text || 'Tampon sans texte'}</span>
        {stamp.note.trim() && <span className="stamp-note">{stamp.note.trim()}</span>}
      </button>
    </div>
  );
}
