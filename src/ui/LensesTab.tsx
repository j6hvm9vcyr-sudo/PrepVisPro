/** Réglages › Optiques : les séries d'optiques avec lesquelles on tourne ce projet. */
import { useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { newId } from '../model/defaults';
import { formatNumber } from '../model/text';
import { parseFocalList } from '../model/lenses';
import type { LensSeries } from '../model/types';
import { DecimalField } from './DecimalField';
import { Picker } from './Picker';
import { addPickedFromKit, kitGroup, SaveToKit } from './KitControls';
import { useKit } from '../platform/kit';

export function LensesTab() {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const lenses = doc.settings.lenses;
  const { kit } = useKit();
  const upd = (id: string, fn: (l: LensSeries) => void, key: string) =>
    st().updateDoc((d) => {
      const l = d.settings.lenses.find((x) => x.id === id);
      if (l) fn(l);
    }, `lens:${id}:${key}`);
  const add = (kind: LensSeries['kind']) =>
    st().updateDoc((d) => void d.settings.lenses.push({ id: newId('lens'), name: '', kind, focals: [], min: null, max: null }));

  return (
    <div className="lenses">
      <p className="note" style={{ margin: 0 }}>
        Déclarez les optiques du projet : elles sont proposées à la saisie des focales (↑↓), une focale absente est soulignée dans le tableau, et le plan au sol propose
        l’optique la plus proche de la focale idéale.
      </p>
      {lenses.length === 0 && <p className="note" style={{ margin: 0, fontStyle: 'italic' }}>Aucune optique déclarée : toutes les focales sont acceptées sans remarque.</p>}
      {lenses.map((l) => (
        <div key={l.id} className="lens-row">
          <span className="lens-kind">{l.kind === 'primes' ? 'Fixes' : 'Zoom'}</span>
          <input className="field-input" aria-label="Nom de la série" placeholder={l.kind === 'primes' ? 'ex. Zeiss Supreme Prime' : 'ex. Angénieux Optimo'} value={l.name} onChange={(e) => upd(l.id, (x) => void (x.name = e.target.value), 'n')} />
          {l.kind === 'primes' ? <FocalList lens={l} onChange={(f) => upd(l.id, (x) => void (x.focals = f), 'f')} /> : (
            <span className="row" style={{ gap: 6, alignItems: 'center' }}>
              <DecimalField label="Focale minimale du zoom" unit="" width={64} min={1} max={2000} value={l.min} onChange={(v) => upd(l.id, (x) => void (x.min = v), 'min')} />
              <span>–</span>
              <DecimalField label="Focale maximale du zoom" unit="mm" width={64} min={1} max={2000} value={l.max} onChange={(v) => upd(l.id, (x) => void (x.max = v), 'max')} />
            </span>
          )}
          <SaveToKit kind="lenses" item={l} />
          <button type="button" className="linkbtn danger" aria-label={`Retirer ${l.name || 'cette série'}`} onClick={() => st().updateDoc((d) => void (d.settings.lenses = d.settings.lenses.filter((x) => x.id !== l.id)))}>
            Retirer
          </button>
        </div>
      ))}
      <div className="row">
        {kit.lenses.length > 0 && (
          <Picker label="Ajouter depuis mon matériel" variant="add" groups={[kitGroup(kit, doc, 'lenses')]} onPick={(id) => addPickedFromKit(kit, 'lenses', id)}>
            + Depuis mon matériel…
          </Picker>
        )}
        <button type="button" className="btn" onClick={() => add('primes')}>
          + Série de fixes
        </button>
        <button type="button" className="btn" onClick={() => add('zoom')}>
          + Zoom
        </button>
      </div>
    </div>
  );
}

function FocalList({ lens, onChange }: { lens: LensSeries; onChange: (f: number[]) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  return (
    <input
      className="field-input"
      aria-label="Focales de la série"
      aria-invalid={err}
      placeholder="ex. 18 25 35 50 75 100"
      style={err ? { borderColor: 'var(--danger)' } : undefined}
      value={draft ?? lens.focals.map(formatNumber).join(' ')}
      onFocus={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setDraft(null);
        setErr(false);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const f = parseFocalList(e.target.value);
        setErr(f === null);
        if (f) onChange(f);
      }}
      title="Focales en mm, séparées par des espaces"
    />
  );
}
