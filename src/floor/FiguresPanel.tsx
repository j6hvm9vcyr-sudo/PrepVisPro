/**
 * Plan au sol › Figures : l'icône (de la bibliothèque importée) qui dessine par défaut les caméras,
 * les personnages et les projecteurs du projet. Chaque figure, et chaque modèle de projecteur, peut
 * avoir la sienne (panneau de la figure, liste des projecteurs).
 */
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { useIcons } from '../platform/iconLibrary';
import { FIGURE_LABEL } from '../model/floorIcons';
import type { FigureKind } from '../model/types';
import { IconChoice } from './IconChoice';

const KINDS: FigureKind[] = ['camera', 'actor', 'light'];

export function FiguresPanel() {
  const doc = useApp(selectDoc);
  const { items } = useIcons();
  const st = useApp.getState;
  return (
    <div className="figures">
      {!items.length && <p className="note" style={{ margin: 0 }}>Aucune icône importée (section Icônes)</p>}
      {KINDS.map((kind) => (
        <IconChoice
          key={kind}
          label={`${FIGURE_LABEL[kind]}s`}
          value={doc.settings.floorIcons[kind]}
          fallback="Symbole standard"
          onChange={(v) => st().updateDoc((d) => void (d.settings.floorIcons[kind] = v), `${FIGURE_LABEL[kind]}s : ${v ? v.name : 'symbole standard'}`)}
        />
      ))}
    </div>
  );
}
