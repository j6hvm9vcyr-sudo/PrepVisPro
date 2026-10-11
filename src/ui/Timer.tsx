/**
 * Minuter à la lecture (0.16) : on lit la séquence, espace à chaque changement de plan.
 * Les reprises sont sautées (elles ont la durée de leur plan). Rien n'est écrit avant
 * « Enregistrer les durées » : on relit d'abord l'avant / l'après, plan par plan.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { computeNumbers } from '../model/numbering';
import { formatDuration } from '../model/duration';
import { applyTimings, clock, doneCount, IDLE, lapsMs, plansToTime, press, roundSeconds, togglePause, undoMark, type TimingState } from '../model/timing';
import { sequenceTitle } from './strip';
import { focusGrid, useDialogFocus } from './focus';
import { Info } from './Info';

/** Horloge des mesures (monotone : un changement d'heure du Mac ne fausse rien). */
function realNow(): number {
  return performance.now();
}

/** « 3,4 s » : temps mesuré, au dixième. */
function tenths(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')} s`;
}

export function TimerDialog() {
  const seqId = useApp((s) => s.timingSeqId);
  if (!seqId) return null;
  return <Timer key={seqId} seqId={seqId} />;
}

function Timer({ seqId }: { seqId: string }) {
  const doc = useApp(selectDoc);
  const seq = doc.sequences.find((s) => s.id === seqId);
  const numbers = useMemo(() => computeNumbers(doc), [doc]);
  const [t, setT] = useState<TimingState>(IDLE);
  const [now, setNow] = useState(realNow);
  // Plans décochés à la relecture (gardent leur durée d'avant).
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState(false);
  const dlg = useDialogFocus<HTMLDivElement>(true);
  const listRef = useRef<HTMLOListElement>(null);
  const st = useApp.getState;
  const plans = seq ? plansToTime(seq) : [];
  const n = plans.length;
  const running = t.runningSince !== null;
  const started = t.marks.length > 0;
  const finished = t.marks.length > n;
  const done = doneCount(t);
  const laps = lapsMs(t);
  const current = !finished && started ? done : -1;
  const elapsedCurrent = current >= 0 ? clock(t, now) - t.marks[t.marks.length - 1]! : 0;

  // Le temps qui passe (affichage seulement : les mesures viennent des instants d'appui).
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(realNow()), 100);
    return () => clearInterval(id);
  }, [running]);

  // Le plan en cours reste visible dans la liste.
  useEffect(() => {
    listRef.current?.querySelector('.tm-row.on')?.scrollIntoView({ block: 'nearest' });
  }, [done]);

  if (!seq) return null;

  const close = () => {
    st().setTiming(null);
    focusGrid();
  };
  const act = (fn: (s: TimingState, at: number) => TimingState) => {
    const at = realNow();
    setT((s) => fn(s, at));
    setNow(at);
    setLeaving(false);
    dlg.current?.focus({ preventScroll: true });
  };
  const next = () => act((s, at) => press(s, at, n));
  const back = () => act((s, at) => undoMark(s, at, n));
  const pause = () => act((s, at) => togglePause(s, at));
  const restart = () => {
    setT(IDLE);
    setSkip(new Set());
    setLeaving(false);
    dlg.current?.focus({ preventScroll: true });
  };
  const retained = plans.slice(0, done).filter((p) => !skip.has(p.id));
  const save = () => {
    const durations: Record<string, number> = {};
    plans.slice(0, done).forEach((p, i) => {
      if (!skip.has(p.id)) durations[p.id] = roundSeconds(laps[i]!);
    });
    if (!Object.keys(durations).length) return;
    const k = Object.keys(durations).length;
    st().applyDoc(applyTimings(selectDoc(st()), seq.id, durations), `Séquence ${seq.number} minutée : ${k} plan${k > 1 ? 's' : ''}`);
    close();
  };
  const tryClose = () => {
    if (done > 0 && !leaving) {
      if (running) act((s, at) => togglePause(s, at));
      setLeaving(true);
      return;
    }
    close();
  };

  const status = !started
    ? `Espace au début du plan ${numbers.get(plans[0]?.id ?? '')?.code ?? ''}`
    : finished
      ? 'Séquence minutée : relisez puis enregistrez'
      : !running
        ? 'En pause'
        : `Plan ${numbers.get(plans[current]!.id)?.code ?? ''}`;

  return (
    <div
      ref={dlg}
      tabIndex={-1}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Minuter la séquence ${seq.number}`}
      onKeyDown={(e) => {
        e.stopPropagation();
        if ((e.target as HTMLElement).tagName === 'INPUT' && e.key !== 'Escape') return;
        if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          if (!e.repeat) next();
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          back();
        } else if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          pause();
        } else if (e.key === 'Enter' && finished) {
          e.preventDefault();
          save();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          tryClose();
        }
      }}
    >
      <div className="dialog timer" onClick={(e) => e.stopPropagation()}>
        <div className="timer-head">
          <h3>
            Minuter la séquence {seq.number} <span className="timer-sub">{sequenceTitle(seq)}</span>
          </h3>
          <Info title="Minuter">
            <span>Lisez la séquence à voix haute, au rythme du film. Espace au début du premier plan, puis à chaque changement de plan ; le dernier appui termine le dernier plan.</span>
            <span>⌫ annule le dernier appui (trop tôt) : le plan précédent reprend, sans perdre de temps. P met en pause ; la pause ne compte pas.</span>
            <span>Les reprises ne sont pas minutées : elles ont la durée de leur plan. Rien n’est enregistré avant « Enregistrer les durées » ; durées arrondies à la seconde (1 s au moins).</span>
          </Info>
          <span className="spacer" />
          <button type="button" className="btn" onMouseDown={(e) => e.preventDefault()} onClick={tryClose}>
            Fermer
          </button>
        </div>

        <div className="timer-body">
          <section className="timer-scene" aria-label="Texte de la scène">
            {seq.scriptText.trim() ? (
              <div className="scene-text">{seq.scriptText}</div>
            ) : seq.plans.some((p) => p.scriptExcerpt.trim()) ? (
              // Sans texte de scène importé : les extraits du scénario de chaque plan, dans l'ordre.
              <ol className="scene-text tm-excerpts" aria-label="Extraits du scénario des plans">
                {seq.plans.map((p) => {
                  const i = plans.indexOf(p);
                  return (
                    <li key={p.id} className={i >= 0 && i === current ? 'on' : ''}>
                      <b className="mono">{numbers.get(p.id)?.code}</b> {p.scriptExcerpt.trim() || '—'}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="note">Pas de texte de scène pour cette séquence (Fichier › Importer un scénario).</p>
            )}
          </section>

          <section className="timer-side">
            <div className={`timer-now ${running ? 'run' : ''}`} role="status" aria-live="polite">
              <span className="tm-status">{status}</span>
              {current >= 0 && <span className="tm-clock mono">{tenths(elapsedCurrent)}</span>}
              {current >= 0 && plans[current]!.scriptExcerpt.trim() && <span className="tm-excerpt">{plans[current]!.scriptExcerpt}</span>}
            </div>
            <div className="timer-keys">
              <button type="button" className="btn primary" title="Espace" onMouseDown={(e) => e.preventDefault()} onClick={next} disabled={finished}>
                {!started ? 'Démarrer' : current === n - 1 ? 'Fin du dernier plan' : 'Plan suivant'}
              </button>
              <button type="button" className="btn" title="⌫" onMouseDown={(e) => e.preventDefault()} onClick={back} disabled={!started}>
                Annuler le dernier appui
              </button>
              <button type="button" className="btn" title="P" onMouseDown={(e) => e.preventDefault()} onClick={pause} disabled={!started || finished}>
                {running || !started || finished ? 'Pause' : 'Reprendre'}
              </button>
            </div>
            <ol className="tm-list" ref={listRef} aria-label="Plans de la séquence">
              {seq.plans.map((p) => {
                const code = numbers.get(p.id)?.code ?? '?';
                if (p.repriseOf) {
                  const src = numbers.get(p.repriseOf)?.code ?? '?';
                  return (
                    <li key={p.id} className="tm-row reprise">
                      <span className="mono tm-code">{code}</span>
                      <span className="tm-act">{p.action || '—'}</span>
                      <span className="tm-val" title="Une reprise a la durée de son plan">
                        = {src}
                      </span>
                    </li>
                  );
                }
                const i = plans.indexOf(p);
                const measured = i < done ? laps[i]! : null;
                const on = i === current;
                const kept = measured !== null && !skip.has(p.id);
                return (
                  <li key={p.id} className={`tm-row ${on ? 'on' : ''} ${measured !== null ? 'done' : ''}`}>
                    <span className="mono tm-code">{code}</span>
                    <span className="tm-act">{p.action || '—'}</span>
                    <span className="tm-before mono" title="Durée enregistrée">
                      {p.durationS !== null ? formatDuration(p.durationS) : '—'}
                    </span>
                    <span className="tm-val mono">{measured !== null ? tenths(measured) : on ? tenths(elapsedCurrent) : ''}</span>
                    {measured !== null && (
                      <label className="tm-keep" title="Enregistrer cette durée">
                        <input
                          type="checkbox"
                          checked={kept}
                          aria-label={`Enregistrer ${formatDuration(roundSeconds(measured))} pour le plan ${code}`}
                          onChange={() =>
                            setSkip((s) => {
                              const x = new Set(s);
                              if (x.has(p.id)) x.delete(p.id);
                              else x.add(p.id);
                              return x;
                            })
                          }
                        />
                        <b className="mono">{formatDuration(roundSeconds(measured))}</b>
                      </label>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <div className="timer-foot">
          {leaving ? (
            <>
              <span className="warn-text">Fermer sans enregistrer les {done} durée{done > 1 ? 's' : ''} mesurée{done > 1 ? 's' : ''} ?</span>
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => setLeaving(false)}>
                Continuer
              </button>
              <button type="button" className="btn danger" onClick={close}>
                Fermer sans enregistrer
              </button>
            </>
          ) : (
            <>
              <button type="button" className="linkbtn" onMouseDown={(e) => e.preventDefault()} onClick={restart} disabled={!started}>
                Recommencer
              </button>
              <span className="spacer" />
              <span className="note">
                {done}/{n} plan{n > 1 ? 's' : ''} minuté{done > 1 ? 's' : ''}
              </span>
              <button type="button" className="btn primary" onMouseDown={(e) => e.preventDefault()} onClick={save} disabled={!retained.length}>
                Enregistrer les durées{retained.length ? ` (${retained.length})` : ''}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
