/** Détails du plan : où ce plan apparaît ailleurs (plans au sol, lumière, tournage, jours, images), avec un accès direct. */
import type { ReactNode } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { planLinks } from '../model/links';
import { useFloor } from '../floor/floorStore';
import { useShootingUi } from './ShootingView';
import { useDaysUi } from './DaysView';
import { locatePlan } from '../model/ops';
import type { Id } from '../model/types';

function Link({ children, onClick, warn }: { children: ReactNode; onClick: () => void; warn?: boolean }) {
  return (
    <button type="button" className={`plan-link ${warn ? 'warn' : ''}`} onClick={onClick}>
      {children}
      <span className="go" aria-hidden>
        ›
      </span>
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
  return (
    <section className="sec plan-links" aria-label="Ce plan ailleurs">
      <div className="sec-h">Ce plan ailleurs</div>
      {links.floors.length === 0 ? (
        <Link warn onClick={() => st().setView('floor')}>
          Aucun plan au sol pour la séquence {seq.number || '?'}
        </Link>
      ) : (
        links.floors.map((f) => (
          <div key={f.id} className="plan-link-group">
            {f.cameras.map((c) =>
              c.elementId ? (
                <Link key={c.setupId} onClick={() => toFloor(f.id, { selection: [c.elementId!] })}>
                  Plan au sol « {f.name} » · caméra{multi ? ` ${c.label}` : ''} placée
                </Link>
              ) : (
                <Link key={c.setupId} warn onClick={() => toFloor(f.id, { placing: { planId, setupId: c.setupId } })}>
                  Plan au sol « {f.name} » · caméra{multi ? ` ${c.label}` : ''} à placer
                </Link>
              ),
            )}
            <Link onClick={() => toFloor(f.id, { panel: 'light' })}>
              Lumière : {f.lights ? `${f.lights} projecteur${f.lights > 1 ? 's' : ''}` : 'aucun projecteur'}
              {f.reflectors ? `, ${f.reflectors} réflecteur${f.reflectors > 1 ? 's' : ''}` : ''}
            </Link>
          </div>
        ))
      )}
      <Link
        warn={links.shooting.kind !== 'installation'}
        onClick={() => {
          useShootingUi.getState().set(seq.id);
          st().setView('shooting');
        }}
      >
        {links.shooting.kind === 'installation'
          ? `Tournage : installation ${links.shooting.index}${links.shooting.name ? ` « ${links.shooting.name} »` : ''}, ${links.shooting.order === 1 ? '1er' : `${links.shooting.order}e`} plan tourné`
          : links.shooting.kind === 'loose'
            ? 'Tournage : à ranger dans une installation'
            : 'Tournage : ordre à établir'}
      </Link>
      <Link
        warn={!links.days.length}
        onClick={() => {
          const d = doc.shootingDays.find((x) => x.sequenceIds.includes(seq.id));
          if (d) useDaysUi.getState().set(d.id);
          st().setView('days');
        }}
      >
        {links.days.length ? `Jour${links.days.length > 1 ? 's' : ''} de tournage : ${links.days.join(', ')}` : 'Pas encore dans un jour de tournage'}
      </Link>
      {links.sharedWith.length > 0 && <Link onClick={() => st().setView('library')}>Images partagées avec {links.sharedWith.join(', ')}</Link>}
    </section>
  );
}
