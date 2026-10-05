/**
 * Choix de l'icône d'une figure (bibliothèque d'icônes importées) et du sens de l'image.
 * Sert pour une figure, pour un modèle de projecteur et pour tout le projet (Figures).
 * L'icône choisie est copiée dans le projet.
 */
import { useEffect } from 'react';
import { useApp } from '../state/appStore';
import { useIcons } from '../platform/iconLibrary';
import { imageStore } from '../platform/images';
import { LOOKS } from '../model/floorIcons';
import type { FigureIcon } from '../model/types';
import { Picker } from '../ui/Picker';
import { copyIntoProject } from './icons';

const RESET = '__defaut';

export function IconChoice({ label, value, onChange, fallback }: { label: string; value: FigureIcon | null; onChange: (v: FigureIcon | null) => void; fallback: string }) {
  const { items, loaded } = useIcons();
  useEffect(() => {
    if (!loaded) void useIcons.getState().load();
  }, [loaded]);
  const categories = [...new Set(items.map((i) => i.category))];
  const groups = categories.map((c) => ({ label: c, items: items.filter((i) => i.category === c).map((i) => ({ id: i.id, label: i.name })) }));
  const url = value ? imageStore.url(value.file) : null;
  return (
    <div className="figure-row">
      <span className="figure-preview" aria-hidden="true">{url && <img src={url} alt="" style={{ transform: `rotate(${value!.turn}deg)` }} />}</span>
      <div className="field" style={{ minWidth: 0 }}>
        {label}
        <Picker
          label={`Icône : ${label.toLowerCase()}`}
          groups={groups}
          actions={value ? [{ id: RESET, label: fallback }] : []}
          empty="Aucune icône importée (section Icônes du plan au sol)"
          value={null}
          onPick={async (id) => {
            if (id === RESET) return onChange(null);
            const item = items.find((i) => i.id === id);
            if (!item) return;
            try {
              onChange({ file: await copyIntoProject(item), name: item.name, turn: value?.turn ?? 0 });
            } catch (e) {
              useApp.getState().setMessage(`Icône non copiée dans le projet : ${e instanceof Error ? e.message : String(e)}`, 'warn');
            }
          }}
        >
          {value ? value.name || 'Icône' : <span className="ph">{fallback}</span>}
        </Picker>
      </div>
      {value && (
        <div className="seg small" role="radiogroup" aria-label={`Sens de l’image : ${label.toLowerCase()}`}>
          {LOOKS.map((l) => (
            <button key={l.turn} type="button" role="radio" aria-checked={value.turn === l.turn} aria-pressed={value.turn === l.turn} title={l.title} onClick={() => onChange({ ...value, turn: l.turn })}>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
