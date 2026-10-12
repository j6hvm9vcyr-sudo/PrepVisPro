/**
 * Détails d'une séquence (0.24) : ce qu'ouvrait la fenêtre « Modifier la séquence », à droite comme
 * tout ce qu'on choisit. On la choisit en cliquant son bandeau dans le tableau ; un plan choisi
 * (clic, flèches, saisie) ramène les détails du plan.
 */
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { DayNight, IntExt, Sequence } from '../model/types';
import { norm } from '../model/text';
import { summarizeSequence } from '../model/summary';
import { sequenceDuration, totalLabel } from '../model/duration';
import { NotesList } from './Notes';
import { GpsField } from './Overlays';
import { Info } from './Info';
import { stripColors } from './strip';
import { ActionMenu } from './ActionMenu';
import { useSequenceActions } from './sequenceActions';

export function SequenceDetails({ seq }: { seq: Sequence }) {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const summary = summarizeSequence(seq);
  const colors = stripColors(seq);
  const dur = totalLabel(sequenceDuration(seq));
  const actions = useSequenceActions(seq);
  const upd = (key: string, fn: Parameters<ReturnType<typeof st>['updateSequence']>[1]) => st().updateSequence(seq.id, fn, `seq:${seq.id}:${key}`);
  const sameGps = (x: Sequence) => (x.gps && seq.gps ? x.gps.lat === seq.gps.lat && x.gps.lon === seq.gps.lon : !x.gps && !seq.gps);
  const others = doc.sequences.filter((x) => x.id !== seq.id && norm(seq.location) !== '' && norm(x.location) === norm(seq.location) && (x.address !== seq.address || !sameGps(x)));
  const what = seq.address.trim() && seq.gps ? 'cette adresse et cette position' : seq.gps ? 'cette position GPS' : 'cette adresse';
  const duplicate = seq.number.trim() !== '' && doc.sequences.some((s) => s.id !== seq.id && s.number.trim().toUpperCase() === seq.number.trim().toUpperCase());

  return (
    <aside className="side-panel inspector seq-details" aria-label="Détails de la séquence">
      <div className="side-head insp-head">
        <span className="strip" style={{ background: colors.fill, borderColor: colors.edge, height: 20 }} aria-hidden />
        <span className="big">Séquence {seq.number || '?'}</span>
        <span className="sub">
          {seq.plans.length} plan{seq.plans.length > 1 ? 's' : ''}
          {dur ? ` · ${dur}` : ''}
        </span>
        <span className="spacer" />
      </div>
      <div className="side-body">
        {duplicate && (
          <div className="welcome-error" role="alert">
            Une autre séquence porte déjà le numéro {seq.number} : les numéros de plan seraient identiques. Choisissez un autre numéro (ex. {seq.number}A).
          </div>
        )}
        <section className="icard" aria-label="Séquence">
          <div className="row">
            <label className="field small">
              Numéro
              <input value={seq.number} onChange={(e) => upd('number', (s) => void (s.number = e.target.value.trim().toUpperCase()))} placeholder="ex. 3A" />
            </label>
            <label className="field small">
              INT / EXT
              <select value={seq.intExt} onChange={(e) => upd('ie', (s) => void (s.intExt = e.target.value as IntExt))}>
                <option value="INT">INT</option>
                <option value="EXT">EXT</option>
                <option value="INT/EXT">INT/EXT</option>
              </select>
            </label>
            <label className="field small">
              Effet
              <select value={seq.dayNight} onChange={(e) => upd('dn', (s) => void (s.dayNight = e.target.value as DayNight))}>
                <option value="JOUR">JOUR</option>
                <option value="NUIT">NUIT</option>
              </select>
            </label>
          </div>
          <label className="field">
            Décor
            <input
              list="known-locations"
              value={seq.location}
              placeholder="ex. Chambre d’Axel"
              onChange={(e) => {
                const v = e.target.value;
                // Décor déjà utilisé : son adresse est reprise (jamais saisie deux fois).
                const twin = doc.sequences.find((x) => x.id !== seq.id && (x.address.trim() || x.gps) && norm(x.location) === norm(v) && norm(v) !== '');
                upd('loc', (s) => {
                  s.location = v;
                  if (twin && !s.address.trim()) s.address = twin.address;
                  if (twin && !s.gps && twin.gps) s.gps = { ...twin.gps };
                });
              }}
            />
            <datalist id="known-locations">
              {[...new Set(doc.sequences.filter((x) => x.id !== seq.id && x.location.trim()).map((x) => x.location.trim()))].map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>
          <label className="field">
            Adresse
            <input value={seq.address} onChange={(e) => upd('addr', (s) => void (s.address = e.target.value))} />
          </label>
          <GpsField value={seq.gps} onChange={(g) => upd('gps', (s) => void (s.gps = g))} />
          {others.length > 0 && (seq.address.trim() || seq.gps) && (
            <button
              type="button"
              className="linkbtn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() =>
                st().updateDoc((d) => {
                  for (const x of d.sequences)
                    if (others.some((o) => o.id === x.id)) {
                      if (seq.address.trim()) x.address = seq.address;
                      if (seq.gps) x.gps = { ...seq.gps };
                    }
                }, undefined)
              }
            >
              {others.length > 1 ? `Reporter ${what} aux ${others.length} autres séquences « ${seq.location.trim()} »` : `Reporter ${what} à l’autre séquence « ${seq.location.trim()} »`}
            </button>
          )}
        </section>

        <section className="icard" aria-label="Notes de la séquence">
          <span className="icard-h">Notes</span>
          <NotesList owner={{ seqId: seq.id }} notes={seq.notes} addLabel="Nouvelle note de la séquence" />
        </section>

        <section className="icard" aria-label="Dépouillement image">
          <span className="icard-h">
            Dépouillement image
            <Info title="Dépouillement image">
              <span>Besoins particuliers de la séquence, par département ; repris dans les exports.</span>
              <span>
                D’après les plans : {summary.focals || 'aucune focale'} · {summary.grip || 'aucune machinerie'}.
              </span>
            </Info>
          </span>
          <div className="breakdown-grid">
            {(
              [
                ['camera', 'Caméra'],
                ['grip', 'Machinerie'],
                ['lighting', 'Lumière'],
                ['other', 'Autre'],
              ] as const
            ).map(([k, l]) => (
              <label className="field" key={k}>
                {l}
                <textarea rows={2} value={seq.breakdown[k]} onChange={(e) => upd(`bd-${k}`, (s) => void (s.breakdown[k] = e.target.value))} />
              </label>
            ))}
          </div>
        </section>
      </div>
      <div className="side-foot">
        <ActionMenu label={`Séquence ${seq.number || '?'} : plus d’actions`} items={actions.more} className="btn small">
          ··· Plus
        </ActionMenu>
        <span className="spacer" />
        <button type="button" className="btn small danger" disabled={!actions.canDelete} onClick={actions.remove}>
          Supprimer la séquence
        </button>
      </div>
    </aside>
  );
}
