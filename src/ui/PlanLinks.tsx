/** Détails du plan, « Lié à » : où ce plan apparaît ailleurs (plans au sol, lumière, tournage, jours, images), avec un accès direct. */
import type { ReactNode } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { planLinks } from '../model/links';
import { useFloor } from '../floor/floorStore';
import { useShootingUi } from './ShootingView';
import { useDaysUi } from './DaysView';
import { locatePlan } from '../model/ops';
import { Info } from './Info';
import type { Id } from '../model/types';

/** Une pastille « Lié à » : texte court, phrase complète au survol et pour l'accessibilité. */
function Chip({ children, full, onClick, warn }: { children: ReactNode; full: string; onClick: () => void; warn?: boolean }) {
  return (
    <button type="button" className="chipl" title={full} aria-label={full} onClick={onClick}>
      <span className={`st ${warn ? 'st-warn' : 'st-ok'}`} aria-hidden />
      {children}
    </button>
  );
}

export function PlanLinksSection({ planId }: { planId: Id }) {
  const doc = useApp(selectDoc);
  const links = planLinks(doc, planId);
  if (!links) return null;
  const st = useApp.getState;
  const seq = locatePlan(doc, planId)!.seq;
  const multi = links.floors[0] ? links.floors[0].cameras.length > 1 : false;
  const toFloor = (floorId: Id, patch: Partial<Parameters<ReturnType<typeof useFloor.getState>['set']>[0]> = {}) => {
    useFloor.getState().set({ currentId: floorId, selection: [], tool: 'select', draft: [], panel: 'plan', ...patch });
    st().setView('floor');
  };
  const multiFloor = links.floors.length > 1;
  const shoot = links.shooting;
  const shootFull =
    shoot.kind === 'installation'
      ? `Tournage : installation ${shoot.index}${shoot.name ? ` « ${shoot.name} »` : ''}, ${shoot.order === 1 ? '1er' : `${shoot.order}e`} plan tourné`
      : shoot.kind === 'loose'
        ? 'Tournage : à ranger dans une installation'
        : 'Tournage : ordre à établir';
  return (
    <section className="icard-plain plan-links" aria-label="Lié à">
      <div className="icard-h">
        <span>Lié à</span>
        <Info title="Lié à">
          <span>Où ce plan apparaît ailleurs : plan au sol, lumière, installation, jours, images partagées.</span>
          <span>Orange : il manque quelque chose. Un clic y mène.</span>
        </Info>
      </div>
      <div className="chips">
        {links.floors.length === 0 ? (
          <Chip warn full={`Aucun plan au sol pour la séquence ${seq.number || '?'}`} onClick={() => st().setView('floor')}>
            Plan au sol
          </Chip>
        ) : (
          links.floors.map((f) => (
            <span key={f.id} className="chip-group">
              {f.cameras.map((c) =>
                c.elementId ? (
                  <Chip key={c.setupId} full={`Plan au sol « ${f.name} » · caméra${multi ? ` ${c.label}` : ''} placée`} onClick={() => toFloor(f.id, { selection: [c.elementId!] })}>
                    {multiFloor ? f.name : 'Plan au sol'}
                    {multi ? ` · ${c.label}` : ''}
                  </Chip>
                ) : (
                  <Chip key={c.setupId} warn full={`Plan au sol « ${f.name} » · caméra${multi ? ` ${c.label}` : ''} à placer`} onClick={() => toFloor(f.id, { placing: { planId, setupId: c.setupId } })}>
                    {multiFloor ? f.name : 'Plan au sol'}
                    {multi ? ` · ${c.label}` : ''}
                  </Chip>
                ),
              )}
              <Chip
                full={`Lumière : ${f.lights ? `${f.lights} projecteur${f.lights > 1 ? 's' : ''}` : 'aucun projecteur'}${f.reflectors ? `, ${f.reflectors} réflecteur${f.reflectors > 1 ? 's' : ''}` : ''}`}
                onClick={() => toFloor(f.id, { panel: 'light' })}
              >
                Lumière
              </Chip>
            </span>
          ))
        )}
        <Chip
          warn={shoot.kind !== 'installation'}
          full={shootFull}
          onClick={() => {
            useShootingUi.getState().set(seq.id);
            st().setView('shooting');
          }}
        >
          {shoot.kind === 'installation' ? `Inst. ${shoot.index}` : 'Installation'}
        </Chip>
        <Chip
          warn={!links.days.length}
          full={links.days.length ? `Jour${links.days.length > 1 ? 's' : ''} de tournage : ${links.days.join(', ')}` : 'Pas encore dans un jour de tournage'}
          onClick={() => {
            const d = doc.shootingDays.find((x) => x.sequenceIds.includes(seq.id));
            if (d) useDaysUi.getState().set(d.id);
            st().setView('days');
          }}
        >
          {links.days.length ? links.days.join(', ') : 'Jour'}
        </Chip>
        {links.sharedWith.length > 0 && (
          <Chip full={`Images partagées avec ${links.sharedWith.join(', ')}`} onClick={() => st().setView('library')}>
            Images · {links.sharedWith.join(', ')}
          </Chip>
        )}
      </div>
    </section>
  );
}
