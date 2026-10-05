/**
 * Réglages › Matériel : le matériel appartient au projet. On peut le reprendre d'un autre projet
 * (ou de l'ancien « Mon matériel » de ce Mac), élément par élément : chaque élément est copié.
 */
import { useEffect, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { addEquipmentMany, EQUIPMENT_KINDS, equipmentLabel, inProject, sourceOfProject, sourceSize, type EquipmentItem, type EquipmentKind, type EquipmentSource } from '../model/equipment';
import { pickOtherProject } from '../state/project';
import { readOldEquipment } from '../platform/kit';
import { plural } from '../model/text';

type Loaded = { label: string; source: EquipmentSource };

export function EquipmentTab() {
  const doc = useApp(selectDoc);
  const own = sourceOfProject(doc);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [old, setOld] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void readOldEquipment().then((r) => {
      if (!live || !r) return;
      if ('error' in r) setError(r.error);
      else setOld({ label: 'l’ancien « Mon matériel » de ce Mac', source: r.source });
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="kit">
      <p className="note" style={{ margin: 0 }}>
        Le matériel est propre à ce projet. Pour réutiliser celui d’un autre film, reprenez-le ici : chaque élément choisi est copié dans ce projet (le modifier ensuite ne
        change pas l’autre projet).
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            setError(null);
            const r = await pickOtherProject();
            if (!r) return;
            if ('error' in r) setError(r.error);
            else setLoaded({ label: `« ${r.name} »`, source: sourceOfProject(r.doc) });
          }}
        >
          Reprendre le matériel d’un autre projet…
        </button>
        {old && (
          <button type="button" className="btn ghost" onClick={() => setLoaded(old)}>
            Ancien « Mon matériel » ({sourceSize(old.source)})
          </button>
        )}
      </div>
      {error && <p className="kit-error">{error}</p>}
      {loaded ? <ImportList key={loaded.label} loaded={loaded} onDone={() => setLoaded(null)} /> : <Summary source={own} />}
    </div>
  );
}

/** Ce que contient le projet. */
function Summary({ source }: { source: EquipmentSource }) {
  return (
    <section className="kit-sec" aria-label="Matériel de ce projet">
      <h4>Dans ce projet</h4>
      {EQUIPMENT_KINDS.map(([kind, title]) => (
        <div key={kind} className="kit-item">
          <span className="kit-name">
            {title}
            <small>{source[kind].length ? source[kind].map((it) => equipmentLabel(kind, it)).join(' · ') : 'aucun'}</small>
          </span>
        </div>
      ))}
    </section>
  );
}

/** Éléments d'une autre source, à cocher puis ajouter d'un coup. */
function ImportList({ loaded, onDone }: { loaded: Loaded; onDone: () => void }) {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const key = (kind: EquipmentKind, it: EquipmentItem) => `${kind}:${it.id}`;
  // Coché d'office : ce qui n'est pas déjà dans le projet.
  const [checked, setChecked] = useState(() => new Set(EQUIPMENT_KINDS.flatMap(([k]) => (loaded.source[k] as EquipmentItem[]).filter((it) => !inProject(selectDoc(st()), k, it)).map((it) => key(k, it)))));
  const picks = EQUIPMENT_KINDS.flatMap(([kind]) => (loaded.source[kind] as EquipmentItem[]).filter((it) => checked.has(key(kind, it)) && !inProject(doc, kind, it)).map((item) => ({ kind, item })));
  return (
    <section className="kit-sec" aria-label="Matériel à reprendre">
      <h4>Depuis {loaded.label}</h4>
      {sourceSize(loaded.source) === 0 && <p className="note kit-empty">Rien à reprendre.</p>}
      {EQUIPMENT_KINDS.filter(([k]) => loaded.source[k].length).map(([kind, title]) => (
        <div key={kind} className="kit-group">
          <div className="sub-h">{title}</div>
          {(loaded.source[kind] as EquipmentItem[]).map((it) => {
            const here = inProject(doc, kind, it);
            const k = key(kind, it);
            return (
              <label key={k} className={`check kit-item ${here ? 'here' : ''}`}>
                <input
                  type="checkbox"
                  disabled={here}
                  checked={here || checked.has(k)}
                  onChange={(e) =>
                    setChecked((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(k);
                      else n.delete(k);
                      return n;
                    })
                  }
                />
                <span className="kit-name">{equipmentLabel(kind, it)}</span>
                {here && <span className="note kit-here">déjà dans ce projet</span>}
              </label>
            );
          })}
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn primary"
          disabled={!picks.length}
          onClick={() => {
            const r = addEquipmentMany(selectDoc(st()), picks);
            st().applyDoc(r.doc, `${plural(r.added, 'élément repris', 'éléments repris')} · ⌘Z pour annuler`);
            onDone();
          }}
        >
          Ajouter à ce projet ({picks.length})
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Fermer
        </button>
      </div>
    </section>
  );
}
