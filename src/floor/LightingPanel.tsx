/**
 * Onglet Lumière du plan au sol : tout ce qui éclaire, au même endroit.
 * Soleil du décor, projecteurs (puissance de ce plan et liste du projet), réflecteurs
 * (matières du projet) et exposition de référence pour les diaphs.
 */
import { Fold } from '../ui/Fold';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { FloorPlan } from '../model/floor';
import { SunSection } from './SunPanel';
import { PowerSummary } from './LightPanels';
import { plural } from '../model/text';
import { ExposureFields, FixtureCatalog, ReflectorCatalog } from './LightingCatalog';

export function LightingPanel({ fp }: { fp: FloorPlan }) {
  const doc = useApp(selectDoc);
  const lights = fp.elements.filter((e) => e.kind === 'light').length;
  const refl = fp.elements.filter((e) => e.kind === 'reflector').length;
  return (
    <>
      <Fold id="light-sun" title="Soleil" label="Soleil">
        <SunSection fp={fp} />
      </Fold>
      <Fold id="light-fixtures" title="Projecteurs" label="Projecteurs" count={lights}>
        <p className="note" style={{ margin: 0 }}>
          {lights ? `${plural(lights, 'projecteur placé', 'projecteurs placés')} sur ce plan` : 'Aucun projecteur sur ce plan'} · outil L pour en placer.
        </p>
        <PowerSummary fp={fp} />
        <div className="reading-h">Modèles du projet ({doc.settings.fixtures.length})</div>
        <FixtureCatalog />
      </Fold>
      <Fold id="light-reflectors" title="Réflecteurs" label="Réflecteurs" count={refl}>
        <p className="note" style={{ margin: 0 }}>
          {refl ? `${plural(refl, 'réflecteur placé', 'réflecteurs placés')} sur ce plan` : 'Aucun réflecteur sur ce plan'} · outil B pour en placer.
        </p>
        <div className="reading-h">Matières du projet ({doc.settings.reflectors.length})</div>
        <ReflectorCatalog />
      </Fold>
      <Fold id="light-exposure" title="Exposition de référence" label="Exposition de référence">
        <ExposureFields />
      </Fold>
    </>
  );
}
