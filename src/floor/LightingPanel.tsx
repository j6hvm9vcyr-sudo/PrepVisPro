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
      <Fold id="light-fixtures" title="Projecteurs" label="Projecteurs" count={doc.settings.fixtures.length}>
        <p className="note" style={{ margin: 0 }}>
          {lights ? `${lights} placé${lights > 1 ? 's' : ''} sur ce plan.` : 'Aucun sur ce plan.'} Outil Projecteur (L) pour en placer ; cliquez-en un pour régler mode, gradateur et gélatines.
        </p>
        <PowerSummary fp={fp} />
        <FixtureCatalog />
      </Fold>
      <Fold id="light-reflectors" title="Réflecteurs" label="Réflecteurs" count={doc.settings.reflectors.length}>
        <p className="note" style={{ margin: 0 }}>
          {refl ? `${refl} placé${refl > 1 ? 's' : ''} sur ce plan.` : 'Aucun sur ce plan.'} Outil Réflecteur (B) pour en placer.
        </p>
        <ReflectorCatalog />
      </Fold>
      <Fold id="light-exposure" title="Exposition de référence" label="Exposition de référence">
        <ExposureFields />
      </Fold>
    </>
  );
}
