/**
 * Onglet Lumière du plan au sol : tout ce qui éclaire, au même endroit. Soleil du décor, projecteurs (puissance de ce plan et liste du projet), réflecteurs
 * (matières du projet) et exposition de référence pour les diaphs.
 */
import { Fold } from '../ui/Fold';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { FloorPlan } from '../model/floor';
import { PowerSummary } from './LightPanels';
import { SunSection } from './SunPanel';
import { plural } from '../model/text';
import { ExposureFields, FixtureCatalog, ReflectorCatalog } from './LightingCatalog';

export function LightingPanel({ fp }: { fp: FloorPlan }) {
  const doc = useApp(selectDoc);
  const lights = fp.elements.filter((e) => e.kind === 'light').length;
  const refl = fp.elements.filter((e) => e.kind === 'reflector').length;
  // Ouvertes d'emblée : seulement les sections qui servent sur ce plan (le reste se déplie au clic).
  // Ouvertes d'emblée : seulement les sections qui servent sur ce plan (le reste se déplie au clic).
  const seqs = doc.sequences.filter((s) => fp.sequenceIds.includes(s.id));
  const sunUsed = seqs.some((s) => s.intExt !== 'INT' || s.gps !== null) || fp.northDeg !== null || fp.sunAt !== null;
  const nothing = !sunUsed && !lights && !refl;
  return (
    <>
      <Fold id={`light-sun-${fp.id}`} title="Soleil" label="Soleil" defaultOpen={sunUsed}>
        <SunSection fp={fp} />
      </Fold>
      <Fold id={`light-fixtures-${fp.id}`} title="Projecteurs" label="Projecteurs" count={lights} defaultOpen={lights > 0 || nothing}>
        <p className="note" style={{ margin: 0 }}>
          {lights ? `${plural(lights, 'projecteur placé', 'projecteurs placés')} sur ce plan` : 'Aucun projecteur sur ce plan'} 
        </p>
        <PowerSummary fp={fp} />
        <div className="reading-h">Modèles du projet ({doc.settings.fixtures.length})</div>
        <FixtureCatalog />
      </Fold>
      <Fold id={`light-reflectors-${fp.id}`} title="Réflecteurs" label="Réflecteurs" count={refl} defaultOpen={refl > 0}>
        <p className="note" style={{ margin: 0 }}>
          {refl ? `${plural(refl, 'réflecteur placé', 'réflecteurs placés')} sur ce plan` : 'Aucun réflecteur sur ce plan'} 
        </p>
        <div className="reading-h">Matières du projet ({doc.settings.reflectors.length})</div>
        <ReflectorCatalog />
      </Fold>
      <Fold id="light-exposure" title="Exposition de référence" label="Exposition de référence" defaultOpen={false}>
        <ExposureFields />
      </Fold>
    </>
  );
}
