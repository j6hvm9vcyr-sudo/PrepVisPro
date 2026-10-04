import { useEffect, useRef } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { locatePlan } from '../model/ops';
import { computeNumbers } from '../model/numbering';
import { imageStore } from '../platform/images';
import type { DayNight, IntExt } from '../model/types';
import { focusGrid } from './focus';

export function Preview() {
  const preview = useApp((s) => s.preview);
  const doc = useApp(selectDoc);
  if (!preview) return null;
  const loc = locatePlan(doc, preview.planId);
  const img = loc?.plan.images[preview.index];
  if (!loc || !img) return null;
  const url = imageStore.url(img.file);
  const code = computeNumbers(doc).get(loc.plan.id)?.code;
  return (
    <div className="overlay dark" role="dialog" aria-modal="true" aria-label="Aperçu de l’image" onClick={() => useApp.getState().closePreview()}>
      {url ? <img className="preview-img" src={url} alt={img.originalName} /> : <p style={{ color: '#fff' }}>Image introuvable</p>}
      <div className="preview-cap">
        <b className="mono">{code}</b>
        <span>
          {img.kind === 'scouting' ? 'Repérage' : 'Référence'} · {loc.plan.action || 'sans action'}
        </span>
        <span style={{ color: '#b7bfcc' }}>
          {preview.index + 1} / {loc.plan.images.length}
        </span>
      </div>
      <div className="preview-keys">
        <span className="kbd">← →</span>images du plan<span className="kbd">↑ ↓</span>plan précédent / suivant<span className="kbd">espace</span>fermer
      </div>
    </div>
  );
}

const SHORTCUTS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Se déplacer',
    items: [
      ['Cellule voisine', '← ↑ → ↓'],
      ['Cellule suivante / précédente', '⇥ / ⇧⇥'],
      ['Vue Tableau / Fiches', '⌘1 / ⌘2'],
      ['Afficher / masquer Détails', '⌘I'],
    ],
  },
  {
    title: 'Saisir',
    items: [
      ['Remplacer le contenu', 'taper'],
      ['Modifier le contenu', '↩'],
      ['Valider et descendre', '↩'],
      ['Valider et passer à droite', '⇥'],
      ['Choisir une suggestion', '↑ ↓'],
      ['Annuler la saisie', 'esc'],
      ['Effacer la cellule', '⌫'],
      ['Copier / couper / coller', '⌘C / ⌘X / ⌘V'],
    ],
  },
  {
    title: 'Plans',
    items: [
      ['Nouveau plan (reprend les réglages)', '⌘↩'],
      ['Reprise du plan', '⇧⌘↩'],
      ['Monter / descendre le plan', '⌥↑ / ⌥↓'],
      ['Supprimer le plan', '⌘⌫'],
      ['Ajouter une caméra au plan', '⇧⌘C'],
    ],
  },
  {
    title: 'Général',
    items: [
      ['Aperçu de l’image', 'espace'],
      ['Annuler / rétablir', '⌘Z / ⇧⌘Z'],
      ['Cette aide', '?'],
    ],
  },
];

export function Shortcuts() {
  const show = useApp((s) => s.showShortcuts);
  if (!show) return null;
  const close = () => {
    useApp.getState().setShowShortcuts(false);
    focusGrid();
  };
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Raccourcis clavier" onClick={close}>
      <div className="dialog" style={{ width: 660 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Raccourcis clavier</h3>
          <button type="button" className="btn" onClick={close} autoFocus>
            Fermer
          </button>
        </div>
        <div className="shortcuts">
          {SHORTCUTS.map((g) => (
            <div key={g.title}>
              <div className="panel-title" style={{ margin: '0 0 6px' }}>
                {g.title}
              </div>
              {g.items.map(([what, keys]) => (
                <div className="k" key={what}>
                  <span>{what}</span>
                  <span>{keys}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="note" style={{ margin: 0, fontSize: 12 }}>
          Dans une cellule : « &gt; » sépare le début et la fin d’un plan évolutif (« ens &gt; poi », « 75 &gt; 300 », « pl -10 &gt; cp 20 »). Mouvements : « trav lat &gt;
          fixe ». Machinerie : « dolly, rail ». Un terme inconnu n’est jamais deviné : il faut choisir « Créer ». On peut coller un bloc de cellules copié depuis Excel : tout est vérifié avant d’être appliqué.
        </p>
      </div>
    </div>
  );
}

/** Choix Repérage / Référence quand on dépose des images sur une vignette. */
export function DropChoice() {
  const pending = useApp((s) => s.pendingDrop);
  const doc = useApp(selectDoc);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, [pending]);
  if (!pending) return null;
  const code = computeNumbers(doc).get(pending.planId)?.code ?? '';
  const st = useApp.getState;
  const choose = (k: 'scouting' | 'reference' | null) => {
    st().resolveDrop(k);
    focusGrid();
  };
  const n = pending.files.length;
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Type d’image"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'r' || e.key === 'R') choose('scouting');
        else if (e.key === 'f' || e.key === 'F') choose('reference');
        else if (e.key === 'Escape') choose(null);
      }}
    >
      <div className="dialog" style={{ width: 460 }}>
        <h3>
          {n} image{n > 1 ? 's' : ''} pour le plan {code}
        </h3>
        <p style={{ margin: 0, color: 'var(--text2)' }}>Ranger en :</p>
        <div className="choice">
          <button ref={first} type="button" className="btn primary" onClick={() => choose('scouting')}>
            Repérage <span className="kbd">R</span>
          </button>
          <button type="button" className="btn" onClick={() => choose('reference')}>
            Référence <span className="kbd">F</span>
          </button>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={() => choose(null)}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

export function SequenceDialog() {
  const id = useApp((s) => s.editingSequenceId);
  const doc = useApp(selectDoc);
  const seq = doc.sequences.find((s) => s.id === id);
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstField.current?.focus();
    firstField.current?.select();
  }, [id]);
  if (!id || !seq) return null;
  const st = useApp.getState;
  const idx = doc.sequences.indexOf(seq);
  const close = () => {
    st().setEditingSequence(null);
    focusGrid();
  };
  const upd = (key: string, fn: Parameters<ReturnType<typeof st>['updateSequence']>[1]) => st().updateSequence(seq.id, fn, `seq:${seq.id}:${key}`);
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Séquence ${seq.number}`}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT')) close();
      }}
      onClick={close}
    >
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Séquence {seq.number || '(sans numéro)'}</h3>
        <div className="row">
          <label className="field small">
            Numéro
            <input ref={firstField} value={seq.number} onChange={(e) => upd('number', (s) => void (s.number = e.target.value.trim().toUpperCase()))} placeholder="ex. 3A" />
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
          <label className="field">
            Décor
            <input value={seq.location} onChange={(e) => upd('loc', (s) => void (s.location = e.target.value))} placeholder="ex. Chambre d’Axel" />
          </label>
        </div>
        <label className="field">
          Adresse
          <input value={seq.address} onChange={(e) => upd('addr', (s) => void (s.address = e.target.value))} />
        </label>
        <label className="field">
          Commentaires
          <textarea rows={3} value={seq.comments} onChange={(e) => upd('com', (s) => void (s.comments = e.target.value))} />
        </label>
        <div className="row" style={{ alignItems: 'center' }}>
          <button type="button" className="btn" disabled={idx === 0} onClick={() => st().moveSequence(seq.id, -1)}>
            ↑ Monter
          </button>
          <button type="button" className="btn" disabled={idx === doc.sequences.length - 1} onClick={() => st().moveSequence(seq.id, 1)}>
            ↓ Descendre
          </button>
          <button type="button" className="btn danger" disabled={doc.sequences.length <= 1} onClick={() => st().deleteSequence(seq.id)}>
            Supprimer la séquence ({seq.plans.length} plan{seq.plans.length > 1 ? 's' : ''})
          </button>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={close}>
            Terminé
          </button>
        </div>
        <p className="note" style={{ margin: 0 }}>
          Les modifications sont appliquées immédiatement et s’annulent avec ⌘Z.
        </p>
      </div>
    </div>
  );
}
