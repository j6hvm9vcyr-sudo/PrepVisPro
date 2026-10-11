/**
 * Panneau Scénario (0.17 ; panneau ⌥⌘2 depuis 0.18) : le texte de la scène du plan sélectionné, à côté du tableau.
 * Pendant qu'on minute une séquence, le minuteur s'y loge, au-dessus de la scène.
 * Chaque plan est relié au passage que reprend son extrait (scriptLink.ts) ; les passages qu'aucun
 * plan ne couvre sont signalés. Sélectionner un passage permet de le relier au plan sélectionné,
 * ou d'en faire un nouveau plan, à sa place dans l'ordre du texte.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectCursor, selectDoc } from '../state/store';
import { computeNumbers } from '../model/numbering';
import { addPlanForPassage, linkScene, sceneSegments } from '../model/scriptLink';
import { Info } from './Info';
import { PanelHead } from './Chrome';
import { startTiming, togglePanel } from './panels';
import { TimerBlock } from './Timer';
import { sequenceTitle, stripColors } from './strip';
import { focusGrid } from './focus';
import { startScriptImport } from '../import/flow';

/** Début et fin d'une sélection, comptés dans le texte du conteneur. */
function offsetsIn(container: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!container.contains(r.startContainer) || !container.contains(r.endContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(r.startContainer, r.startOffset);
  const start = pre.toString().length;
  const end = start + r.toString().length;
  return end > start ? { start, end } : null;
}

export function ScenePanel() {
  const doc = useApp(selectDoc);
  const cursor = useApp(selectCursor);
  const timingId = useApp((s) => s.timingSeqId);
  const timed = doc.sequences.find((s) => s.id === timingId) ?? null;
  const seq = timed ?? doc.sequences.find((s) => s.plans.some((p) => p.id === cursor?.planId)) ?? doc.sequences[0];
  const numbers = useMemo(() => computeNumbers(doc), [doc]);
  const links = useMemo(() => (seq ? linkScene(seq) : null), [seq]);
  const segments = useMemo(() => (seq && links ? sceneSegments(seq.scriptText, links.links) : []), [seq, links]);
  // Passage sélectionné (il ne vaut que pour sa séquence).
  const [picked, setPick] = useState<{ seqId: string; start: number; end: number } | null>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const st = useApp.getState;
  const here = cursor?.planId ?? null;

  // Le passage du plan sélectionné reste visible.
  useEffect(() => {
    docRef.current?.querySelector('.lk.on')?.scrollIntoView({ block: 'nearest' });
  }, [here, seq?.id]);
  if (!seq || !links)
    return (
      <aside className="side-panel left scene-panel" aria-label="Scénario">
        <PanelHead label="Scénario" onClose={() => togglePanel('scenario')} />
      </aside>
    );
  const pick = picked && picked.seqId === seq.id ? picked : null;
  const select = () => {
    const o = docRef.current ? offsetsIn(docRef.current) : null;
    setPick(o ? { seqId: seq.id, ...o } : null);
  };
  const text = seq.scriptText;
  const uncovered = segments.filter((s) => s.uncovered).length;
  const code = (id: string) => numbers.get(id)?.code ?? '?';
  const herePlan = seq.plans.find((p) => p.id === here) ?? null;
  const colors = stripColors(seq);

  const go = (planIds: string[]) => {
    // Plusieurs plans sur le même passage : chaque clic passe au suivant.
    const i = here ? planIds.indexOf(here) : -1;
    st().goToPlan(planIds[(i + 1) % planIds.length]!);
    focusGrid();
  };
  const linkToHere = () => {
    if (!pick || !herePlan) return;
    st().setPlanText(herePlan.id, 'scriptExcerpt', text.slice(pick.start, pick.end).trim());
    st().setMessage(`Passage relié au plan ${code(herePlan.id)}`);
    window.getSelection()?.removeAllRanges();
    setPick(null);
    focusGrid();
  };
  const newPlan = () => {
    if (!pick) return;
    const r = addPlanForPassage(selectDoc(st()), seq.id, pick.start, pick.end);
    if (!r) return;
    // Comme pour ⌘↩ : on dit combien de plans ont changé de numéro.
    const after = computeNumbers(r.doc);
    let moved = 0;
    numbers.forEach((v, k) => {
      if (after.get(k)?.code !== v.code) moved++;
    });
    st().applyDoc(r.doc, `Plan ${after.get(r.planId)?.code ?? ''} créé pour ce passage${moved ? ` · ${moved} plan${moved > 1 ? 's' : ''} renuméroté${moved > 1 ? 's' : ''}` : ''}`);
    const p = r.doc.sequences.find((s) => s.id === seq.id)!.plans.find((x) => x.id === r.planId)!;
    st().setCursor({ planId: p.id, setupId: p.cameras[0]!.id, col: 'action' });
    window.getSelection()?.removeAllRanges();
    setPick(null);
    focusGrid();
    // L'action du nouveau plan se tape tout de suite.
    st().startEdit('');
  };

  return (
    <aside className="side-panel left scene-panel" aria-label="Scénario">
      <PanelHead
        label="Scénario"
        info={
          <Info title="Scénario">
            <span>La scène du plan sélectionné. Chaque plan est relié au passage que reprend son extrait (Détails › Scénario) : un clic sur un passage sélectionne son plan.</span>
            <span>Sélectionnez un passage pour le relier au plan sélectionné, ou en faire un nouveau plan, placé dans l’ordre du texte.</span>
            <span>Un extrait est relié s’il se retrouve tel quel dans la scène (les retours à la ligne comptent comme des espaces). Non couvert : le texte qu’aucun extrait ne reprend, sauf les noms de personnage seuls sur leur ligne.</span>
          </Info>
        }
        onClose={() => togglePanel('scenario')}
      >
        {!timed && seq.plans.length > 0 && (
          <button type="button" className="linkbtn" title="Minuter à la lecture : espace à chaque changement de plan" onClick={() => startTiming(seq.id)}>
            Minuter
          </button>
        )}
      </PanelHead>
      {timed && <TimerBlock seq={timed} />}
      <section className="scene-pane" aria-label="Texte de la scène">
        <div className="scene-head">
          <span className="strip" style={{ background: colors.fill, borderColor: colors.edge }} aria-hidden />
          <span className="mono scene-num">SÉQ. {seq.number || '?'}</span>
          <span className="scene-ttl">{sequenceTitle(seq)}</span>
        </div>
        {text.trim() && (
          <div className="scene-state">
            {uncovered ? (
              <span className="scene-warn">
                {uncovered} passage{uncovered > 1 ? 's' : ''} non couvert{uncovered > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="scene-ok">Toute la scène est couverte</span>
            )}
            {links.notFound.length > 0 && (
              <span className="scene-warn">
                Extrait absent de la scène :{' '}
                {links.notFound.map((id) => (
                  <button key={id} type="button" className="linkbtn mono" onClick={() => go([id])}>
                    {code(id)}
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
        {!text.trim() && timed && seq.plans.some((p) => p.scriptExcerpt.trim()) ? (
          // Sans texte de scène importé : les extraits du scénario de chaque plan, dans l'ordre, pour lire.
          <ol className="scene-doc tm-excerpts" aria-label="Extraits du scénario des plans">
            {seq.plans
              .filter((p) => !p.repriseOf)
              .map((p) => (
                <li key={p.id} className={p.id === here ? 'on' : ''}>
                  <b className="mono">{code(p.id)}</b> {p.scriptExcerpt.trim() || '—'}
                </li>
              ))}
          </ol>
        ) : !text.trim() ? (
          <div className="scene-empty">
            <span>Pas de texte pour cette scène.</span>
            <button type="button" className="btn" onClick={() => void startScriptImport()}>
              Importer un scénario…
            </button>
          </div>
        ) : (
          <div
            ref={docRef}
            className="scene-doc"
            aria-label={`Scène ${seq.number}`}
            onMouseUp={select}
            onKeyUp={select}
          >
            {segments.map((s) => {
              const part = text.slice(s.start, s.end);
              if (s.planIds.length)
                return (
                  <span
                    key={s.start}
                    className={`lk ${here && s.planIds.includes(here) ? 'on' : ''}`}
                    data-plans={s.planIds.map(code).join(' ')}
                    title={`Plan${s.planIds.length > 1 ? 's' : ''} ${s.planIds.map(code).join(', ')}`}
                    onClick={() => {
                      if (window.getSelection()?.isCollapsed !== false) go(s.planIds);
                    }}
                  >
                    {part}
                  </span>
                );
              return s.uncovered ? (
                <span key={s.start} className="unc" title="Passage non couvert par un plan">
                  {part}
                </span>
              ) : (
                <span key={s.start}>{part}</span>
              );
            })}
          </div>
        )}
        {pick && (
          <div className="scene-pick" role="group" aria-label="Passage sélectionné">
            <span className="pick-txt">« {text.slice(pick.start, pick.end).trim().slice(0, 60)}{pick.end - pick.start > 60 ? '…' : ''} »</span>
            {herePlan && (
              <button type="button" className="btn" onMouseDown={(e) => e.preventDefault()} onClick={linkToHere}>
                Relier au plan {code(herePlan.id)}
              </button>
            )}
            <button type="button" className="btn primary" onMouseDown={(e) => e.preventDefault()} onClick={newPlan}>
              Nouveau plan
            </button>
          </div>
        )}
      </section>
    </aside>
  );
}
