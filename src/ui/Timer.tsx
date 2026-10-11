/**
 * Minuter à la lecture (0.16 ; dans le panneau Scénario depuis 0.18) : on lit la séquence, espace à
 * chaque changement de plan. Le plan en cours est sélectionné dans le tableau et surligné dans la scène.
 * Les reprises sont sautées (elles ont la durée de leur plan). Rien n'est écrit avant
 * « Enregistrer les durées » : on relit d'abord l'avant / l'après, plan par plan.
 * La mesure est gardée hors du panneau : masquer le panneau ou changer de page ne la perd pas.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useApp } from '../state/appStore';
import { anyOverlay, selectDoc } from '../state/store';
import { computeNumbers } from '../model/numbering';
import { formatDuration } from '../model/duration';
import { applyTimings, clock, doneCount, IDLE, lapsMs, plansToTime, press, roundSeconds, togglePause, undoMark, type TimingState } from '../model/timing';
import { isTypingTarget } from './focus';
import { Info } from './Info';
import type { Sequence } from '../model/types';

/** Horloge des mesures (monotone : un changement d'heure du Mac ne fausse rien). */
function realNow(): number {
  return performance.now();
}

/** « 3,4 s » : temps mesuré, au dixième. */
function tenths(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')} s`;
}

/**
 * La mesure en cours. `key` = la séquence et ses plans à minuter, au départ : si les plans changent
 * (ajout, suppression, annulation), la mesure ne vaut plus et repart de zéro.
 */
interface Run {
  key: string;
  t: TimingState;
  skip: string[];
  leaving: boolean;
}
const EMPTY: Run = { key: '', t: IDLE, skip: [], leaving: false };
const useRun = create<Run>()(() => EMPTY);

function runKey(seq: Sequence): string {
  return `${seq.id}:${plansToTime(seq)
    .map((p) => p.id)
    .join(',')}`;
}

/** Mesure valable pour cette séquence telle qu'elle est (sinon : pas commencée). */
function runFor(seq: Sequence, r: Run): Run {
  return r.key === runKey(seq) ? r : { ...EMPTY, key: runKey(seq) };
}

/** Les plans ont changé pendant la mesure : elle a été abandonnée. */
function staleRun(seq: Sequence, r: Run): boolean {
  return r.key.startsWith(`${seq.id}:`) && r.key !== runKey(seq) && r.t.marks.length > 0;
}

export function endTiming() {
  useRun.setState(EMPTY, true);
  useApp.getState().setTiming(null);
}

export function TimerBlock({ seq }: { seq: Sequence }) {
  const doc = useApp(selectDoc);
  const numbers = useMemo(() => computeNumbers(doc), [doc]);
  const stored = useRun();
  const run = runFor(seq, stored);
  const { t, leaving } = run;
  const skip = new Set(run.skip);
  const [now, setNow] = useState(realNow);
  const listRef = useRef<HTMLOListElement>(null);
  const st = useApp.getState;
  const plans = plansToTime(seq);
  const n = plans.length;
  const running = t.runningSince !== null;
  const started = t.marks.length > 0;
  const finished = t.marks.length > n;
  const done = doneCount(t);
  const laps = lapsMs(t);
  const current = !finished && started ? done : -1;
  const elapsedCurrent = current >= 0 ? clock(t, now) - t.marks[t.marks.length - 1]! : 0;
  const stale = staleRun(seq, stored);

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

  const set = (patch: Partial<Run>) => useRun.setState({ ...runFor(seq, useRun.getState()), ...patch });
  const act = (fn: (s: TimingState, at: number) => TimingState) => {
    const at = realNow();
    const next = fn(runFor(seq, useRun.getState()).t, at);
    set({ t: next, leaving: false });
    setNow(at);
    // Le plan en cours est sélectionné : le tableau et la scène le montrent.
    const d = doneCount(next);
    const p = next.marks.length > 0 && next.marks.length <= n ? plans[d] : null;
    if (p) {
      st().goToPlan(p.id);
      // Sur l'action : le tableau, étroit à côté du panneau, garde les numéros en vue.
      const c = st().cursor;
      if (c && c.planId === p.id && c.col !== 'action') st().setCursor({ ...c, col: 'action' });
    }
  };
  const next = () => act((s, at) => press(s, at, n));
  const back = () => act((s, at) => undoMark(s, at, n));
  const pause = () => act((s, at) => togglePause(s, at));
  const restart = () => set({ t: IDLE, skip: [], leaving: false });
  const retained = plans.slice(0, done).filter((p) => !skip.has(p.id));
  const save = () => {
    const durations: Record<string, number> = {};
    plans.slice(0, done).forEach((p, i) => {
      if (!skip.has(p.id)) durations[p.id] = roundSeconds(laps[i]!);
    });
    const k = Object.keys(durations).length;
    if (!k) return;
    st().applyDoc(applyTimings(selectDoc(st()), seq.id, durations), `Séquence ${seq.number} minutée : ${k} plan${k > 1 ? 's' : ''}`);
    endTiming();
  };
  const tryClose = () => {
    if (done > 0 && !leaving) {
      if (running) act((s, at) => togglePause(s, at));
      set({ leaving: true });
      return;
    }
    endTiming();
  };

  // Les touches du minuteur, où que soit le clavier (sauf pendant une saisie ou dans une fenêtre).
  const keys = useRef({ next, back, pause, save, tryClose, started, finished });
  useEffect(() => {
    keys.current = { next, back, pause, save, tryClose, started, finished };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useApp.getState();
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || st.editing || anyOverlay(st) || isTypingTarget(e.target)) return;
      const k = keys.current;
      let fn: (() => void) | null = null;
      if (e.key === ' ' || e.code === 'Space') fn = e.repeat ? () => {} : k.next;
      else if (e.key === 'Backspace' && k.started) fn = k.back;
      else if (e.key.toLowerCase() === 'p' && k.started) fn = k.pause;
      else if (e.key === 'Enter' && k.finished) fn = k.save;
      else if (e.key === 'Escape') fn = k.tryClose;
      if (!fn) return;
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const status = stale
    ? 'Les plans ont changé : mesure abandonnée'
    : !started
      ? `Espace au début du plan ${numbers.get(plans[0]?.id ?? '')?.code ?? ''}`
      : finished
        ? 'Séquence minutée : relisez puis enregistrez'
        : !running
          ? 'En pause'
          : `Plan ${numbers.get(plans[current]!.id)?.code ?? ''}`;

  return (
    <section className="timer-dock" aria-label={`Minuter la séquence ${seq.number}`}>
      <div className="timer-head">
        <strong>Minuter</strong>
        <Info title="Minuter">
          <span>Lisez la séquence à voix haute, au rythme du film. Espace au début du premier plan, puis à chaque changement de plan ; le dernier appui termine le dernier plan.</span>
          <span>⌫ annule le dernier appui (trop tôt) : le plan précédent reprend, sans perdre de temps. P met en pause ; la pause ne compte pas.</span>
          <span>Les reprises ne sont pas minutées : elles ont la durée de leur plan. Rien n’est enregistré avant « Enregistrer les durées » ; durées arrondies à la seconde (1 s au moins).</span>
        </Info>
        <span className="spacer" />
        <button type="button" className="btn small" title="Échap" onMouseDown={(e) => e.preventDefault()} onClick={tryClose}>
          Fermer
        </button>
      </div>
      <div className={`timer-now ${running ? 'run' : ''}`} role="status" aria-live="polite">
        <span className={`tm-status ${stale ? 'warn-text' : ''}`}>{status}</span>
        {current >= 0 && <span className="tm-clock mono">{tenths(elapsedCurrent)}</span>}
      </div>
      <div className="timer-keys">
        <button type="button" className="btn primary" title="Espace" onMouseDown={(e) => e.preventDefault()} onClick={next} disabled={finished || n === 0}>
          {!started ? 'Démarrer' : current === n - 1 ? 'Fin du dernier plan' : 'Plan suivant'}
        </button>
        <button type="button" className="btn" title="⌫" aria-label="Annuler le dernier appui" onMouseDown={(e) => e.preventDefault()} onClick={back} disabled={!started}>
          Annuler l’appui
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
                    onChange={() => set({ skip: skip.has(p.id) ? run.skip.filter((x) => x !== p.id) : [...run.skip, p.id] })}
                  />
                  <b className="mono">{formatDuration(roundSeconds(measured))}</b>
                </label>
              )}
            </li>
          );
        })}
      </ol>
      <div className="timer-foot">
        {leaving ? (
          <>
            <span className="warn-text">
              Fermer sans enregistrer les {done} durée{done > 1 ? 's' : ''} mesurée{done > 1 ? 's' : ''} ?
            </span>
            <span className="spacer" />
            <button type="button" className="btn small" onClick={() => set({ leaving: false })}>
              Continuer
            </button>
            <button type="button" className="btn small danger" onClick={endTiming}>
              Fermer sans enregistrer
            </button>
          </>
        ) : (
          <>
            <button type="button" className="linkbtn" onMouseDown={(e) => e.preventDefault()} onClick={restart} disabled={!started}>
              Recommencer
            </button>
            <span className="note">
              {done}/{n} minuté{done > 1 ? 's' : ''}
            </span>
            <span className="spacer" />
            <button type="button" className="btn primary" onMouseDown={(e) => e.preventDefault()} onClick={save} disabled={!retained.length}>
              Enregistrer les durées{retained.length ? ` (${retained.length})` : ''}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
