/**
 * Publier (0.20, ⇧⌘P) : le dossier de diffusion (sur le drive de l'équipe), les fichiers tenus à jour,
 * ce qui a changé depuis la dernière publication, et le bouton qui réécrit tout.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { chooseFolder, loadLastPublication, presetOf, publish, publishPresets, usePublish, usePublishFolder, type PublishResult } from '../state/publish';
import { baseNameOf, filesToPublish, PUBLISH_FILE_LABEL, publishFileName } from '../model/publish';
import { PUBLISH_FILES, type PublishFile } from '../model/types';
import { compareDocs } from '../model/diff';
import { revisionColor, revisionName } from '../model/revisions';
import { getBackend } from '../platform/backend';
import { useShareBusy } from './shareBusy';
import { Info } from './Info';
import { Picker } from './Picker';

function when(at: number): string {
  return new Date(at).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/** Ce qui a changé depuis la dernière publication (null : rien à comparer). */
export function useChangesSincePublication() {
  const doc = useApp(selectDoc);
  const last = usePublish((s) => s.last);
  const projectId = usePublish((s) => s.projectId);
  useEffect(() => {
    if (projectId !== doc.id) void loadLastPublication();
  }, [projectId, doc.id]);
  return useMemo(() => {
    if (!last?.doc || projectId !== doc.id) return null;
    const d = compareDocs(last.doc, doc);
    return { ...d, any: d.counts.added + d.counts.removed + d.counts.changed + d.other.length > 0 };
  }, [last, doc, projectId]);
}

/** Partager › Publier sur le drive (⇧⌘P). */
export function PublishPane() {
  const doc = useApp(selectDoc);
  const folder = usePublishFolder();
  const busy = usePublish((s) => s.busy);
  const step = usePublish((s) => s.step);
  const last = usePublish((s) => s.last);
  const changes = useChangesSincePublication();
  const [result, setResult] = useState<PublishResult | null>(null);
  useShareBusy(busy);
  const st = useApp.getState;
  const settings = doc.settings.publish;
  const base = baseNameOf(doc);
  const preset = presetOf(doc);
  const files = filesToPublish(doc);
  const next = (last?.n ?? 0) + 1;

  const toggle = (f: PublishFile) => {
    setResult(null);
    st().updateDoc(
      (d) => void (d.settings.publish.files = PUBLISH_FILES.filter((x) => (x === f ? !d.settings.publish.files.includes(f) : d.settings.publish.files.includes(x)))),
      undefined,
      `${PUBLISH_FILE_LABEL[f]} ${settings.files.includes(f) ? 'retiré de' : 'ajouté à'} la publication`,
    );
  };
  const run = async () => {
    setResult(null);
    const r = await publish();
    setResult(r);
    if (r.ok) st().setMessage(`Publication ${r.n} : ${r.files.length} fichier${r.files.length > 1 ? 's' : ''} à jour`);
  };
  const open = async () => {
    if (folder) await (await getBackend()).openFile(folder);
  };

  return (
    <section className="share-pane publish" role="tabpanel" aria-label="Publier">
        <div className="export-head">
          <h3>Publier sur le drive</h3>
          <Info title="Publier">
            <span>Les fichiers choisis sont réécrits dans le dossier de diffusion, toujours sous les mêmes noms : partagez ce dossier (Google Drive, Dropbox, iCloud) une seule fois, le lien mène toujours à la dernière publication.</span>
            <span>« Publication N » et sa date sont écrits dans chaque document. Chaque publication est gardée dans les versions du projet.</span>
          </Info>
        </div>

        <section className="sec" aria-label="Dossier de diffusion">
          <div className="sec-h">Dossier de diffusion</div>
          <div className="row">
            <span className={`pub-folder ${folder ? '' : 'none'}`} title={folder ?? ''}>
              {folder ?? 'Aucun dossier choisi sur ce Mac'}
            </span>
            {folder && (
              <button type="button" className="linkbtn" onClick={() => void open()}>
                Ouvrir
              </button>
            )}
            <button type="button" className="btn" disabled={busy} onClick={() => void chooseFolder().then(() => setResult(null))}>
              {folder ? 'Changer…' : 'Choisir…'}
            </button>
          </div>
        </section>

        <section className="sec" aria-label="Fichiers tenus à jour">
          <div className="sec-h">
            Fichiers tenus à jour
            <Info title="Découpage interactif">
              <span>Un seul fichier .html : il s’ouvre dans n’importe quel navigateur (à télécharger depuis le drive : son aperçu ne le lance pas). Chacun choisit son métier ; les plans ajoutés ou modifiés depuis la publication précédente sont marqués « * », avec l’avant.</span>
              <span>Chacun peut annoter les plans et enregistrer ses retours dans un fichier, à déposer dans « Retours » (créé à côté) ou à envoyer par mail. Les notes du découpage ne sont pas partagées.</span>
            </Info>
          </div>
          {PUBLISH_FILES.map((f) => {
            const on = settings.files.includes(f);
            const noFloor = f === 'floors' && doc.floorPlans.length === 0;
            return (
              <label key={f} className="check pub-file">
                <input type="checkbox" checked={on} disabled={busy} onChange={() => toggle(f)} />
                <span className="pub-name">{publishFileName(base, f)}</span>
                <span className="note">{noFloor ? 'aucun plan au sol pour l’instant' : PUBLISH_FILE_LABEL[f]}</span>
              </label>
            );
          })}
          <div className="pub-model">
            <span className="note">Modèle du découpage</span>
            <Picker
              label="Modèle du découpage publié"
              value={settings.presetId}
              groups={[{ items: publishPresets(doc).map((p) => ({ id: p.id, label: p.name })) }]}
              onPick={(id) => st().updateDoc((d) => void (d.settings.publish.presetId = id), undefined, 'Modèle du découpage publié changé')}
            >
              {preset?.name ?? 'Modèle introuvable : à choisir'}
            </Picker>
          </div>
          {!settings.baseName && <p className="note" style={{ margin: 0 }}>Les noms sont fixés à la première publication : ils ne changent plus, même si le titre change.</p>}
        </section>

        <section className="sec" aria-label="Depuis la dernière publication">
          <div className="sec-h">
            {last ? (
              <>
                <span className="pub-rev" style={{ background: revisionColor(last.n).hex }} aria-hidden />
                {`Depuis la publication ${last.n} (${revisionName(last.n)}, ${when(last.at)})`}
              </>
            ) : (
              'Pas encore publié'
            )}
          </div>
          {last && !last.doc && <p className="note" style={{ margin: 0 }}>La version de la publication {last.n} est illisible : changements inconnus.</p>}
          {changes && !changes.any && <p className="note" style={{ margin: 0 }}>Rien n’a changé.</p>}
          {changes?.any && (
            <ul className="pub-changes">
              {changes.counts.changed > 0 && <li>{changes.counts.changed} plan{changes.counts.changed > 1 ? 's' : ''} modifié{changes.counts.changed > 1 ? 's' : ''}</li>}
              {changes.counts.added > 0 && <li>{changes.counts.added} plan{changes.counts.added > 1 ? 's' : ''} ajouté{changes.counts.added > 1 ? 's' : ''}</li>}
              {changes.counts.removed > 0 && <li>{changes.counts.removed} plan{changes.counts.removed > 1 ? 's' : ''} retiré{changes.counts.removed > 1 ? 's' : ''}</li>}
              {changes.other.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          )}
        </section>

        <div className="pub-foot">
          {result && !result.ok && (
            <div className="welcome-error" role="alert">
              Publication impossible : {result.error}
              {result.written.length > 0 && ` Déjà mis à jour : ${result.written.join(', ')}.`}
            </div>
          )}
          {result?.ok && (
            <div className="pub-done" role="status">
              Publication {result.n} : {result.files.join(', ')} à jour.
              {result.warnings.map((w) => (
                <div key={w} className="warn-text">
                  {w}
                </div>
              ))}
            </div>
          )}
          <span className="spacer" />
          {busy && <span className="note">{step}</span>}
          <button type="button" className="btn primary" disabled={busy || !folder || !files.length} onClick={() => void run()}>
            {busy ? 'Publication…' : `Publier (publication ${next} · ${revisionColor(next).name})`}
          </button>
        </div>
    </section>
  );
}
