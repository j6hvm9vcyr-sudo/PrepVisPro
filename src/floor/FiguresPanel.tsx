/**
 * Plan au sol › Figures : l'icône (de la bibliothèque importée) qui dessine toutes les caméras,
 * tous les personnages et tous les projecteurs du projet, et le sens dans lequel elle regarde.
 * Sans choix, le symbole standard. Une figure qui a sa propre icône la garde.
 */
import { useEffect } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { useIcons } from '../platform/iconLibrary';
import { imageStore } from '../platform/images';
import { FIGURE_LABEL, LOOKS } from '../model/floorIcons';
import type { FigureKind } from '../model/types';
import { Picker } from '../ui/Picker';
import { copyIntoProject } from './icons';

const STANDARD = '__standard';
const KINDS: FigureKind[] = ['camera', 'actor', 'light'];

export function FiguresPanel() {
  const doc = useApp(selectDoc);
  const { items, loaded } = useIcons();
  useEffect(() => {
    if (!loaded) void useIcons.getState().load();
  }, [loaded]);
  const st = useApp.getState;
  const categories = [...new Set(items.map((i) => i.category))];
  const groups = categories.map((c) => ({ label: c, items: items.filter((i) => i.category === c).map((i) => ({ id: i.id, label: i.name })) }));

  return (
    <div className="figures">
      {!items.length && <p className="note" style={{ margin: 0 }}>Importez d’abord votre dossier d’icônes (section Icônes, plus bas) : elles pourront dessiner caméras, personnages et projecteurs.</p>}
      {KINDS.map((kind) => {
        const cur = doc.settings.floorIcons[kind];
        const url = cur ? imageStore.url(cur.file) : null;
        return (
          <div key={kind} className="figure-row">
            <span className="figure-preview" aria-hidden="true">{url && <img src={url} alt="" style={{ transform: `rotate(${cur!.turn}deg)` }} />}</span>
            <div className="field" style={{ minWidth: 0 }}>
              {FIGURE_LABEL[kind]}
              <Picker
                label={`Icône des figures ${FIGURE_LABEL[kind].toLowerCase()}`}
                groups={groups}
                actions={[{ id: STANDARD, label: 'Symbole standard' }]}
                empty="Aucune icône importée"
                onPick={async (id) => {
                  if (id === STANDARD) return st().updateDoc((d) => void (d.settings.floorIcons[kind] = null), `${FIGURE_LABEL[kind]} : symbole standard`);
                  const item = items.find((i) => i.id === id);
                  if (!item) return;
                  try {
                    const file = await copyIntoProject(item);
                    st().updateDoc((d) => void (d.settings.floorIcons[kind] = { file, name: item.name, turn: d.settings.floorIcons[kind]?.turn ?? 0 }), `${FIGURE_LABEL[kind]} : ${item.name}`);
                  } catch (e) {
                    st().setMessage(`Icône non copiée dans le projet : ${e instanceof Error ? e.message : String(e)}`, 'warn');
                  }
                }}
              >
                {cur ? cur.name : <span className="ph">Symbole standard</span>}
              </Picker>
            </div>
            {cur && (
              <div className="seg small" role="radiogroup" aria-label={`Sens de l’icône ${FIGURE_LABEL[kind].toLowerCase()}`}>
                {LOOKS.map((l) => (
                  <button key={l.turn} type="button" role="radio" aria-checked={cur.turn === l.turn} aria-pressed={cur.turn === l.turn} title={l.title} onClick={() => st().updateDoc((d) => void (d.settings.floorIcons[kind] && (d.settings.floorIcons[kind]!.turn = l.turn)))}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="note" style={{ margin: 0 }}>Le sens : celui vers lequel regarde l’image (objectif, visage, faisceau). Pour tout le projet ; une figure qui a sa propre icône la garde.</p>
    </div>
  );
}
