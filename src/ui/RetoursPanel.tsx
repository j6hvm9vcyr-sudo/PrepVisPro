/**
 * Panneau Retours (0.21), à droite du Découpage : les retours renvoyés depuis le découpage
 * interactif, fichier par fichier. Chacun devient une note datée, est repris dans le tableau
 * (proposition de valeur, validée à la main), ou est laissé de côté.
 */
import { useEffect, useMemo } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { createPlanItem, ignoreItem, importRetoursFile, importWaiting, isToCreate, noteAll, noteItem, scanRetours, takeProposal, useRetours } from '../state/retours';
import { usePublishFolder } from '../state/publish';
import { computeNumbers } from '../model/numbering';
import { FEEDBACK_LABEL, fieldValue, isCreated, itemOwner, pendingCount } from '../model/feedback';
import { revisionColor } from '../model/revisions';
import type { Feedback, FeedbackItem, ProjectDoc } from '../model/types';
import { PanelHead } from './Chrome';
import { Info } from './Info';
import { useRetoursPanel } from './panels';
import { focusGrid } from './focus';

function when(t: number): string {
  return new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Valeur actuelle du réglage proposé (pour voir si le plan a changé depuis la publication). */
function currentValue(doc: ProjectDoc, item: FeedbackItem): string | null {
  if (!item.proposal || !item.planId) return null;
  return fieldValue(doc, item.planId, item.proposal.setupId, item.proposal.field) ?? fieldValue(doc, item.planId, null, item.proposal.field);
}

/** « publication 2 » ; rien pour des retours qui ne viennent pas d'une publication. */
function pubText(f: Feedback): string {
  return f.publication === null ? '' : `publication ${f.publication} · `;
}

/** Nombre à afficher sur le bouton Retours : retours à traiter et retours trouvés pas encore rangés. */
export function useRetoursCount(): number {
  const doc = useApp(selectDoc);
  const waiting = useRetours((s) => s.waiting);
  return pendingCount(doc) + waiting.reduce((n, f) => n + f.items.length, 0);
}

export function RetoursPanel() {
  const doc = useApp(selectDoc);
  const folder = usePublishFolder();
  const waiting = useRetours((s) => s.waiting);
  const numbers = useMemo(() => computeNumbers(doc), [doc]);
  const pending = pendingCount(doc);
  useEffect(() => {
    void scanRetours();
  }, [folder, doc.id]);
  const list = [...doc.feedback].sort((a, b) => b.sentAt - a.sentAt);
  return (
    <aside className="side-panel retours-panel" aria-label="Retours">
      <PanelHead
        label="Retours"
        count={pending || undefined}
        info={
          <Info title="Retours">
            <span>Le découpage interactif publié laisse chacun annoter les plans (validé, à revoir, un mot, une valeur proposée) et enregistrer ses retours dans un fichier, à déposer dans « Retours » du dossier de diffusion ou à envoyer par mail.</span>
            <span>Chaque retour devient une note datée, ou une proposition reprise dans le tableau : la case s’ouvre avec la valeur proposée, à valider (↩) ou annuler (esc).</span>
          </Info>
        }
      />
      <div className="side-body">
        {waiting.length > 0 && (
          <div className="ret-waiting" role="status">
            <strong>
              {waiting.length} fichier{waiting.length > 1 ? 's' : ''} de retours reçu{waiting.length > 1 ? 's' : ''}
            </strong>
            <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => useApp.getState().setShare('retours')}>
              Ranger avec le projet…
            </button>
          </div>
        )}
        {list.length === 0 && waiting.length === 0 && (
          <div className="empty-line">
            Aucun retour pour l’instant ·{' '}
            <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => useApp.getState().setShare('retours')}>
              Retours reçus…
            </button>
          </div>
        )}
        {list.map((f) => (
          <FeedbackCard key={f.id} doc={doc} fb={f} code={(id) => numbers.get(id)?.code ?? null} />
        ))}
      </div>
      {pending > 0 && (
        <div className="ret-foot">
          <button type="button" className="btn" onClick={noteAll}>
            Tout ranger en notes ({pending})
          </button>
        </div>
      )}
    </aside>
  );
}

/**
 * Partager › Retours reçus (0.24) : les fichiers déposés dans « Retours » du dossier de diffusion ou
 * reçus par mail entrent dans le projet ici ; on les traite ensuite dans le panneau Retours du Découpage.
 */
export function RetoursPane({ onDone }: { onDone: () => void }) {
  const doc = useApp(selectDoc);
  const folder = usePublishFolder();
  const waiting = useRetours((s) => s.waiting);
  const errors = useRetours((s) => s.errors);
  const pending = pendingCount(doc);
  useEffect(() => {
    void scanRetours();
  }, [folder, doc.id]);
  const files = [...doc.feedback].sort((a, b) => b.sentAt - a.sentAt);
  const process = () => {
    onDone();
    if (useApp.getState().view !== 'table' && useApp.getState().view !== 'cards') useApp.getState().setView('table');
    useRetoursPanel.getState().set(true);
  };
  return (
    <section className="share-pane retours" role="tabpanel" aria-label="Retours reçus">
      <div className="export-head">
        <h3>Retours reçus</h3>
        <Info title="Retours reçus">
          <span>Le découpage interactif publié laisse chacun annoter les plans et enregistrer ses retours dans un fichier, à déposer dans « Retours » du dossier de diffusion ou à envoyer par mail.</span>
          <span>Les fichiers trouvés dans « Retours » sont proposés ici ; un fichier reçu par mail s’importe. Les retours se traitent ensuite dans le panneau Retours du Découpage.</span>
        </Info>
      </div>
      {waiting.length > 0 && (
        <div className="ret-waiting" role="status">
          <strong>
            {waiting.length} fichier{waiting.length > 1 ? 's' : ''} de retours dans « Retours »
          </strong>
          {waiting.map((f) => (
            <span key={f.id} className="note">
              {f.role ? `${f.author} · ${f.role}` : f.author} · {pubText(f)}
              {f.items.length} retour{f.items.length > 1 ? 's' : ''}
            </span>
          ))}
          <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={importWaiting}>
            Ranger avec le projet
          </button>
        </div>
      )}
      {errors.map((e) => (
        <div key={e.name} className="note warn-text">
          {e.name} : {e.error}
        </div>
      ))}
      <div className="row">
        {folder && (
          <button type="button" className="btn" onClick={() => void scanRetours()}>
            Chercher dans le dossier de diffusion
          </button>
        )}
        <button type="button" className="btn" onClick={() => void importRetoursFile()}>
          Importer un fichier…
        </button>
      </div>
      <section className="sec" aria-label="Retours du projet">
        <div className="sec-h">Dans le projet</div>
        {files.length === 0 ? (
          <span className="note">Aucun retour pour l’instant</span>
        ) : (
          files.map((f) => {
            const open = f.items.filter((i) => i.state === 'new').length;
            return (
              <div key={f.id} className="ret-file">
                {f.publication !== null && <span className="ret-rev" style={{ background: revisionColor(f.publication).hex }} aria-hidden />}
                <strong>{f.role ? `${f.author} · ${f.role}` : f.author}</strong>
                <span className="note">
                  {pubText(f)}
                  {when(f.sentAt)}
                </span>
                <span className="spacer" />
                <span className={open ? 'warn-text' : 'note'}>{open ? `${open} à traiter` : 'tout est traité'}</span>
              </div>
            );
          })
        )}
      </section>
      <div className="share-actions">
        <span className="spacer" />
        <button type="button" className="btn primary" disabled={!files.length} onClick={process}>
          Traiter dans le Découpage{pending ? ` (${pending})` : ''}
        </button>
      </div>
    </section>
  );
}

function FeedbackCard({ doc, fb, code }: { doc: ProjectDoc; fb: Feedback; code: (planId: string) => string | null }) {
  const open = fb.items.filter((i) => i.state === 'new');
  const done = fb.items.length - open.length;
  const color = fb.publication !== null ? revisionColor(fb.publication) : null;
  return (
    <section className="ret-card" aria-label={`Retours de ${fb.author}`}>
      <div className="ret-who">
        <span className="ret-av" aria-hidden>
          {fb.author.slice(0, 1).toUpperCase()}
        </span>
        <div className="ret-whotext">
          <strong>{fb.role ? `${fb.author} · ${fb.role}` : fb.author}</strong>
          <span className="note">
            {color && <span className="ret-rev" style={{ background: color.hex }} aria-hidden />} {pubText(fb)}
            {when(fb.sentAt)}
          </span>
        </div>
      </div>
      {open.map((i) => (
        <ItemRow key={i.id} doc={doc} fb={fb} item={i} code={code} />
      ))}
      {done > 0 && (
        <div className="note">
          {done} traité{done > 1 ? 's' : ''}
          {open.length === 0 ? ' · tout est traité' : ''}
        </div>
      )}
    </section>
  );
}

function ItemRow({ doc, fb, item, code }: { doc: ProjectDoc; fb: Feedback; item: FeedbackItem; code: (planId: string) => string | null }) {
  const st = useApp.getState;
  const owner = itemOwner(doc, item);
  const now = item.planId ? code(item.planId) : null;
  // Plan proposé à la création, pas encore créé : il n'est pas « retiré ».
  const toCreate = !!item.planId && !now && (item.create ? !isCreated(doc, item) : isToCreate(doc, item.planId));
  const planGone = !!item.planId && !now && !toCreate;
  const cur = currentValue(doc, item);
  const changed = item.proposal && cur !== null && cur !== item.proposal.before;
  return (
    <div className="ret-item">
      <div className="ret-h">
        {item.planId && now ? (
          <button
            type="button"
            className="linkbtn mono ret-code"
            aria-label={`Aller au plan ${now}`}
            onClick={() => {
              st().goToPlan(item.planId!);
              focusGrid();
            }}
          >
            {now}
          </button>
        ) : (
          <span className="mono ret-code">{item.code}</span>
        )}
        {now && now !== item.code && <span className="note">({fb.publication === null ? 'proposé' : 'publié'} {item.code})</span>}
        {item.create && <span className="tag-s new">nouveau plan</span>}
        {!item.create && toCreate && <span className="tag-s">plan à créer</span>}
        {planGone && <span className="tag-s">plan retiré</span>}
        {item.verdict === 'ok' && <span className="tag-s ok">✓ validé</span>}
        {item.verdict === 'revoir' && <span className="tag-s warn">à revoir</span>}
      </div>
      {item.text && <q className="ret-text">{item.text}</q>}
      {item.proposal && (
        <div className="ret-diff">
          <span className="note">{FEEDBACK_LABEL[item.proposal.field]}</span>
          <s className="mono">{item.proposal.before || '—'}</s>→<b className="mono">{item.proposal.text}</b>
          {changed && <span className="note warn-text">aujourd’hui : {cur || '—'}</span>}
        </div>
      )}
      {item.quote && (
        <blockquote className="ret-quote" title="Passage de la note d’où vient ce retour">
          {item.quote}
        </blockquote>
      )}
      <div className="row">
        {item.create && toCreate && (
          <button type="button" className="btn small primary" onClick={() => createPlanItem(fb.id, item.id)}>
            Créer le plan
          </button>
        )}
        {item.proposal && !planGone && (
          <button type="button" className={`btn small${toCreate ? '' : ' primary'}`} disabled={toCreate} onClick={() => takeProposal(fb.id, item.id)} title={toCreate ? 'Créez d’abord le plan' : 'La case s’ouvre avec la valeur proposée : ↩ pour valider'}>
            Reprendre
          </button>
        )}
        {owner && (
          <button type="button" className="btn small" onClick={() => noteItem(fb.id, item.id)}>
            En note
          </button>
        )}
        <button type="button" className="btn small" onClick={() => ignoreItem(fb.id, item.id)}>
          Ignorer
        </button>
      </div>
    </div>
  );
}
