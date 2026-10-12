import { useEffect, useId, useRef, useState } from 'react';
import { APP_VERSION } from '../version';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { locatePlan } from '../model/ops';
import { computeNumbers } from '../model/numbering';
import { imageStore } from '../platform/images';
import type { Sequence } from '../model/types';
import { formatCoordinates, parseCoordinates } from '../model/sun';
import { focusGrid, isComposing, useDialogFocus } from './focus';
import { flowBounds, STAMP_SUGGESTIONS } from '../model/stamps';
import { Info } from './Info';

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
      ['Premier / dernier plan', '⌘↑ / ⌘↓'],
      ['Début / fin de ligne', '⌘← / ⌘→'],
      ['Sélectionner plusieurs cellules', '⇧ + flèches, ⇧ + clic'],
      ['Découpage / Plans au sol / Tournage', '⌘1 / ⌘2 / ⌘3'],
      ['Découpage en liste / en fiches', '⌥⌘L'],
      ['Panneaux : Le film / Scénario / Images / Notes', '⌥⌘1 / ⌥⌘2 / ⌥⌘3 / ⌥⌘4'],
      ['Afficher / masquer Détails', '⌘I'],
    ],
  },
  {
    title: 'Saisir',
    items: [
      ['Remplacer le contenu', 'taper'],
      ['Modifier le contenu (toute la liste proposée)', '↩'],
      ['Valider (on reste sur la case ; ↓ pour descendre)', '↩'],
      ['Valider et passer à droite', '⇥'],
      ['Choisir une suggestion', '↑ ↓'],
      ['Annuler la saisie', 'esc'],
      ['Effacer la cellule', '⌫'],
      ['Copier / couper / coller', '⌘C / ⌘X / ⌘V'],
      ['Recopier vers le bas', '⌘D'],
      ['Plusieurs cellules : remplir toutes', 'taper, ou ↩'],
      ['Plusieurs cellules : coller partout', '⌘V'],
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
      ['Minuter la séquence : plan suivant / annuler le dernier appui / pause', 'espace / ⌫ / P'],
    ],
  },
  {
    title: 'Général',
    items: [
      ['Aperçu de l’image', 'espace'],
      ['Annuler / rétablir', '⌘Z / ⇧⌘Z'],
      ['Cette aide', '⌘/ ou ?'],
    ],
  },
  {
    title: 'Projet',
    items: [
      ['Nouveau projet / ouvrir', '⌘N / ⌘O'],
      ['Enregistrer (automatique)', '⌘S'],
      ['Versions : enregistrer, comparer, revenir', '⇧⌘S'],
      ['Partager › Publier sur le drive', '⇧⌘P'],
      ['Partager › Fichier (PDF, Excel, CSV)', '⌘E'],
      ['Importer un scénario', '⇧⌘I'],
      ['Réglages du projet', '⇧⌘,'],
      ['Préférences de Topshot', '⌘,'],
    ],
  },
  {
    title: 'Plans au sol',
    items: [
      ['Sélection, caméra, personnage, texte', 'V C P T'],
      ['Projecteur / réflecteur', 'L / B'],
      ['Échelle / mesure', 'E / M'],
      ['Tourner de 15° (⇧ : sens inverse)', 'R'],
      ['Déplacer finement (⇧ : ×10)', '← ↑ → ↓'],
      ['Dupliquer / supprimer', '⌘D / ⌫'],
      ['Orienter : poignée ronde (⇧ par 15°)', 'glisser'],
      ['Se déplacer / zoomer', '2 doigts / pincer'],
      ['Tout afficher / zoomer', '0 / + −'],
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
          <span className="note" style={{ marginLeft: 8 }}>Topshot {APP_VERSION}</span>
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
  const dlg = useDialogFocus<HTMLDivElement>(!!pending);
  if (!pending) return null;
  const code = computeNumbers(doc).get(pending.planId)?.code ?? '';
  const st = useApp.getState;
  const choose = (k: 'scouting' | 'reference' | null) => {
    st().resolveDrop(k);
    focusGrid();
  };
  const n = pending.files.length + pending.libraryIds.length;
  return (
    <div
      ref={dlg}
      tabIndex={-1}
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

/** Tampon : mention entre deux séquences (TITRE, GÉNÉRIQUE DE FIN…), sans plan ni numéro. */
export function StampDialog() {
  const id = useApp((s) => s.editingStampId);
  const doc = useApp(selectDoc);
  const stamp = doc.stamps.find((t) => t.id === id);
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstField.current?.focus();
    firstField.current?.select();
  }, [id]);
  const dlg = useDialogFocus<HTMLDivElement>(!!id);
  if (!id || !stamp) return null;
  const st = useApp.getState;
  const bounds = flowBounds(doc, stamp.id);
  const next = stamp.beforeSequenceId ? doc.sequences.find((s) => s.id === stamp.beforeSequenceId) : null;
  const close = () => {
    st().setEditingStamp(null);
    focusGrid();
  };
  return (
    <div
      ref={dlg}
      tabIndex={-1}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Tampon"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          if (isComposing(e)) setTimeout(close, 60);
          else close();
        }
      }}
      onClick={close}
    >
      <div className="dialog" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <h3>Tampon</h3>
        <p className="note" style={{ margin: 0 }}>
          Mention placée entre deux séquences du découpage et des exports. Elle ne compte pas dans la numérotation des plans.
        </p>
        <label className="field">
          Texte
          <input ref={firstField} value={stamp.text} placeholder="ex. TITRE" onChange={(e) => st().updateStamp(stamp.id, { text: e.target.value })} />
        </label>
        <div className="stamp-suggest" role="group" aria-label="Mentions courantes">
          {STAMP_SUGGESTIONS.map((t) => (
            <button key={t} type="button" className={`chip-btn ${stamp.text === t ? 'on' : ''}`} aria-pressed={stamp.text === t} onClick={() => st().updateStamp(stamp.id, { text: t })}>
              {t}
            </button>
          ))}
        </div>
        <label className="field">
          Précision (facultatif)
          <input value={stamp.note} placeholder="ex. sur noir, 10 s" onChange={(e) => st().updateStamp(stamp.id, { note: e.target.value })} />
        </label>
        <p className="note" style={{ margin: 0 }}>
          {next ? `Placé avant la séquence ${next.number || '(sans numéro)'}.` : 'Placé en fin de film, après la dernière séquence.'}
        </p>
        <div className="row" style={{ alignItems: 'center' }}>
          <button type="button" className="btn" disabled={bounds.first} onClick={() => st().moveStamp(stamp.id, -1)}>
            ↑ Monter
          </button>
          <button type="button" className="btn" disabled={bounds.last} onClick={() => st().moveStamp(stamp.id, 1)}>
            ↓ Descendre
          </button>
          <button type="button" className="btn danger" onClick={() => st().removeStamp(stamp.id)}>
            Supprimer le tampon
          </button>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={close}>
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}

/** Position GPS du décor : collée depuis Plans, Google Maps ou un GPS ; jamais devinée. */
export function GpsField({ value, onChange, label = 'Coordonnées GPS' }: { value: Sequence['gps']; onChange: (g: Sequence['gps']) => void; label?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  const shown = draft ?? (value ? formatCoordinates(value) : '');
  const parsed = draft === null ? value : parseCoordinates(draft);
  const bad = draft !== null && draft.trim() !== '' && !parsed;
  // Enregistré dès que le texte est une position sûre : ↩ ferme la fiche sans passer par la sortie du champ.
  const edit = (text: string) => {
    setDraft(text);
    if (!text.trim()) onChange(null);
    else {
      const g = parseCoordinates(text);
      if (g) onChange(g);
    }
  };
  return (
    <div className="field">
      <span className="field-h">
        <label htmlFor={id}>{label}</label>
        <Info title="Coordonnées GPS">
          <span>Pour les heures du soleil : collez la position depuis Plans, Google Maps (clic droit sur le lieu, puis clic sur les coordonnées) ou un GPS.</span>
          <span>Formats : « 48.85837, 2.29448 » ou « 48°51′30″N 2°17′40″E ». Rien n’est deviné.</span>
        </Info>
      </span>
      <input
        id={id}
        aria-invalid={bad}
        value={shown}
        placeholder="ex. 48.85837, 2.29448"
        style={bad ? { borderColor: 'var(--danger)' } : undefined}
        onChange={(e) => edit(e.target.value)}
        onBlur={() => setDraft(null)}
      />
      {bad && (
        <span className="note" style={{ fontSize: 11.5, color: 'var(--danger)' }}>
          Format non reconnu : « 48.85837, 2.29448 » ou « 48°51′30″N 2°17′40″E ».
        </span>
      )}
    </div>
  );
}
