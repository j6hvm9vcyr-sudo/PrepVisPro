/**
 * Panneau Notes (0.13 ; panneau ⌥⌘4 à droite depuis 0.18) : toutes les notes du film, séquence par
 * séquence, pour les relire d'un coup. « À faire » cache les notes cochées. Un clic sur un numéro de
 * plan le sélectionne dans le tableau.
 */
import { useMemo, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { computeNumbers } from '../model/numbering';
import { openCount } from '../model/notes';
import { sequenceTitle, stripColors } from './strip';
import { NotesList } from './Notes';
import { Info } from './Info';
import { PanelHead } from './Chrome';
import { isGridView } from './spaces';

export function NotesPanel() {
  const doc = useApp(selectDoc);
  const numbers = useMemo(() => computeNumbers(doc), [doc]);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const st = useApp.getState;
  let open = 0;
  let all = 0;
  for (const s of doc.sequences) {
    open += openCount(s.notes);
    all += s.notes.length;
    for (const p of s.plans) {
      open += openCount(p.notes);
      all += p.notes.length;
    }
  }
  const goTo = (planId: string) => {
    if (!isGridView(st().view) && st().view !== 'cards') st().setView('table');
    st().goToPlan(planId);
  };
  return (
    <aside className="side-panel notes-panel" aria-label="Notes">
      <PanelHead
        label="Notes"
        info={
          <Info title="Notes">
            <span>Notes datées, rattachées à une séquence ou à un plan. Cochées quand c’est fait.</span>
            <span>Notes d’un plan : aussi dans ses détails et dans la colonne Notes du tableau (Colonnes ▾). Les exports les reprennent : Divers (plan) et Commentaires (séquence), ✓ devant celles qui sont faites.</span>
          </Info>
        }
      />
      <div className="nv-head">
        <div className="seg" role="group" aria-label="Notes affichées">
          <button type="button" aria-pressed={onlyOpen} onClick={() => setOnlyOpen(true)}>
            À faire
          </button>
          <button type="button" aria-pressed={!onlyOpen} onClick={() => setOnlyOpen(false)}>
            Toutes
          </button>
        </div>
        <span className="nv-count">
          {open} à faire · {all} en tout
        </span>
      </div>
      <div className="side-body nv-body">
      {doc.sequences.map((s) => {
        const c = stripColors(s);
        const plans = s.plans.filter((p) => (onlyOpen ? openCount(p.notes) > 0 : p.notes.length > 0));
        return (
          <section key={s.id} className="nv-seq" aria-label={`Notes de la séquence ${s.number}`}>
            <h3 className="nv-seq-h">
              <span className="nv-strip" style={{ background: c.fill, borderColor: c.edge }} aria-hidden />
              <span className="mono">SÉQ. {s.number}</span> {sequenceTitle(s)}
            </h3>
            <NotesList owner={{ seqId: s.id }} notes={s.notes} onlyOpen={onlyOpen} addLabel={`Nouvelle note de la séquence ${s.number}`} />
            {plans.map((p) => {
              const code = numbers.get(p.id)?.code ?? '?';
              return (
                <div key={p.id} className="nv-plan">
                  <div className="nv-plan-h">
                    <button type="button" className="linkbtn mono nv-code" aria-label={`Ouvrir le plan ${code}`} title="Ouvrir dans le tableau" onClick={() => goTo(p.id)}>
                      {code}
                    </button>
                    <span className="nv-action">{p.action || '—'}</span>
                  </div>
                  <NotesList owner={{ planId: p.id }} notes={p.notes} onlyOpen={onlyOpen} addLabel={`Nouvelle note du plan ${code}`} />
                </div>
              );
            })}
          </section>
        );
      })}
      </div>
    </aside>
  );
}
