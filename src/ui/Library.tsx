/**
 * Bibliothèque d'images du projet : chaque image n'est importée qu'une fois, puis réutilisée
 * dans les plans (repérage, références) et comme fond de plan au sol.
 */
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useApp } from '../state/appStore';
import { selectCursor, selectDoc, type AppState } from '../state/store';
import { imageStore } from '../platform/images';
import { isUsed, libraryUsage, syncLibrary, type ImageUsage } from '../model/library';
import { computeNumbers } from '../model/numbering';
import type { ImageKind, LibraryImage } from '../model/types';
import { focusGrid, useDialogFocus } from './focus';
import { updateFloorPlan } from '../model/floorOps';
import { backgroundFromLibrary } from '../floor/background';
import { useFloor } from '../floor/floorStore';

type Filter = 'all' | 'used' | 'unused';

function Thumb({ file, alt = '' }: { file: string; alt?: string }) {
  const url = imageStore.url(file);
  return url ? <img src={url} alt={alt} draggable={false} /> : <span className="note">introuvable</span>;
}

function usageLabel(u: ImageUsage | undefined): string {
  if (!u || !isUsed(u)) return 'Pas encore utilisée';
  // Un plan par mention : « 2/1 (rep. + réf.) ».
  const byPlan = new Map<string, { code: string; kinds: Set<ImageKind> }>();
  for (const p of u.plans) {
    const e = byPlan.get(p.planId) ?? { code: p.code, kinds: new Set<ImageKind>() };
    e.kinds.add(p.kind);
    byPlan.set(p.planId, e);
  }
  const kinds = (k: Set<ImageKind>) => [k.has('scouting') ? 'rep.' : '', k.has('reference') ? 'réf.' : ''].filter(Boolean).join(' + ');
  const parts = [...[...byPlan.values()].map((p) => `${p.code} (${kinds(p.kinds)})`), ...u.floorPlans.map((f) => `fond « ${f.name} »`)];
  return parts.join(' · ');
}

/** Zone qui accepte des images déposées depuis le Finder. */
function useDrop(onFiles: (f: File[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      },
    },
  };
}

function ImportButton({ label = 'Importer des images…', primary = false }: { label?: string; primary?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={`btn ${primary ? 'primary' : ''}`} onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void useApp.getState().importToLibrary(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </>
  );
}

export function LibraryView() {
  const raw = useApp(selectDoc);
  const doc = useMemo(() => syncLibrary(raw), [raw]);
  const cursor = useApp(selectCursor);
  const usage = useMemo(() => libraryUsage(doc), [doc]);
  const [filter, setFilter] = useState<Filter>('all');
  const [zoom, setZoom] = useState<LibraryImage | null>(null);
  const st = useApp.getState;
  const code = cursor ? computeNumbers(doc).get(cursor.planId)?.code : undefined;
  const drop = useDrop((f) => void st().importToLibrary(f));
  const shown = doc.library.filter((l) => (filter === 'all' ? true : filter === 'used' ? isUsed(usage.get(l.file)) : !isUsed(usage.get(l.file))));
  const unused = doc.library.filter((l) => !isUsed(usage.get(l.file))).length;

  return (
    <div className={`library ${drop.over ? 'over' : ''}`} {...drop.props} aria-label="Bibliothèque d’images" role="region">
      <div className="library-head">
        <div>
          <h2>Images du projet</h2>
          <p className="note">
            Importées une seule fois, réutilisables dans tous les plans et comme fond de plan au sol. Une même image importée deux fois n’est jamais dupliquée.
          </p>
        </div>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Filtre">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            Toutes ({doc.library.length})
          </button>
          <button type="button" aria-pressed={filter === 'used'} onClick={() => setFilter('used')}>
            Utilisées
          </button>
          <button type="button" aria-pressed={filter === 'unused'} onClick={() => setFilter('unused')}>
            Non utilisées ({unused})
          </button>
        </div>
        <ImportButton primary />
      </div>
      {doc.library.length === 0 ? (
        <div className="library-empty">
          <p>Aucune image pour l’instant.</p>
          <p className="note">Glissez ici des photos de repérage, des références de films, un moodboard, ou utilisez « Importer des images… ».</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="library-empty">
          <p className="note">Aucune image dans ce filtre.</p>
        </div>
      ) : (
        <ul className="library-grid">
          {shown.map((l) => {
            const u = usage.get(l.file);
            const used = isUsed(u);
            return (
              <li key={l.id} className="libcard">
                <button type="button" className="pic" onClick={() => setZoom(l)} aria-label={`Agrandir ${l.originalName || 'l’image'}`}>
                  <Thumb file={l.file} />
                </button>
                <div className="libcard-body">
                  <span className="name" title={l.originalName}>
                    {l.originalName || 'Image'}
                  </span>
                  <input className="caption" aria-label="Légende" placeholder="Légende (film, auteur, intention…)" value={l.caption} onChange={(e) => st().setLibraryCaption(l.id, e.target.value)} />
                  <span className={`usage ${used ? '' : 'none'}`} title={usageLabel(u)}>
                    {usageLabel(u)}
                  </span>
                  <span className="acts">
                    {cursor && code && (
                      <>
                        <button type="button" disabled={!!u?.plans.some((p) => p.planId === cursor.planId && p.kind === 'scouting')} onClick={() => st().addFromLibrary(cursor.planId, [l.id], 'scouting')} title={`Ajouter au plan ${code} en repérage`}>
                          + {code} repérage
                        </button>
                        <button type="button" disabled={!!u?.plans.some((p) => p.planId === cursor.planId && p.kind === 'reference')} onClick={() => st().addFromLibrary(cursor.planId, [l.id], 'reference')} title={`Ajouter au plan ${code} en référence`}>
                          + {code} référence
                        </button>
                      </>
                    )}
                    <span className="spacer" />
                    <button
                      type="button"
                      className="danger"
                      disabled={used}
                      title={used ? 'Utilisée : retirez-la d’abord des plans et plans au sol' : 'Retirer de la bibliothèque'}
                      onClick={() => st().removeLibraryImage(l.id)}
                    >
                      Retirer
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {cursor && code && doc.library.length > 0 && (
        <p className="note library-foot">
          Les boutons « + {code} » ajoutent l’image au plan sélectionné dans le découpage ({code}). Pour un autre plan, sélectionnez-le d’abord (⌘1) ou utilisez « Bibliothèque… » dans
          ses détails.
        </p>
      )}
      {drop.over && <div className="library-drop">Déposez pour ajouter à la bibliothèque</div>}
      {zoom && (
        <div className="overlay dark" role="dialog" aria-modal="true" aria-label="Aperçu de l’image" onClick={() => setZoom(null)} onKeyDown={(e) => (e.key === 'Escape' || e.key === ' ') && setZoom(null)} tabIndex={-1}>
          <Thumb file={zoom.file} alt={zoom.originalName} />
          <div className="preview-cap">
            <span>{zoom.caption || zoom.originalName}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Choix dans la bibliothèque : images à ajouter à un plan, ou fond d'un plan au sol. */
export function LibraryPicker() {
  const pick = useApp((s) => s.libraryPick);
  if (!pick) return null;
  return <PickerDialog key={JSON.stringify(pick)} pick={pick} />;
}

function PickerDialog({ pick }: { pick: NonNullable<AppState['libraryPick']> }) {
  const raw = useApp(selectDoc);
  const doc = useMemo(() => syncLibrary(raw), [raw]);
  const usage = useMemo(() => libraryUsage(doc), [doc]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [kind, setKind] = useState<ImageKind>(pick.mode === 'plan' ? pick.kind : 'scouting');
  const [busy, setBusy] = useState(false);
  const dlg = useDialogFocus<HTMLDivElement>(true);
  const drop = useDrop((f) => void useApp.getState().importToLibrary(f));
  const st = useApp.getState;
  const single = pick.mode === 'background';
  const close = () => {
    st().setLibraryPick(null);
    if (pick.mode === 'plan') focusGrid();
  };
  const planCode = pick.mode === 'plan' ? computeNumbers(doc).get(pick.planId)?.code : null;
  const fp = pick.mode === 'background' ? doc.floorPlans.find((f) => f.id === pick.floorPlanId) : null;
  const already = (file: string) => (pick.mode === 'plan' ? !!usage.get(file)?.plans.some((p) => p.planId === pick.planId && p.kind === kind) : fp?.background?.file === file);
  const toggle = (id: string) => setChosen((c) => (single ? [id] : c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const apply = async () => {
    if (!chosen.length) return;
    if (pick.mode === 'plan') {
      st().addFromLibrary(pick.planId, chosen, kind);
      close();
      return;
    }
    const l = doc.library.find((x) => x.id === chosen[0]);
    if (!l || !fp) return;
    setBusy(true);
    try {
      const bg = await backgroundFromLibrary(l.file, l.originalName);
      const s = st();
      s.applyDoc(updateFloorPlan(selectDoc(s), fp.id, (x) => void (x.background = bg)), fp.scale ? 'Fond remplacé — vérifiez l’échelle (E)' : 'Fond choisi — mettez-le à l’échelle (E)');
      const vps = { ...useFloor.getState().viewports };
      delete vps[fp.id];
      useFloor.getState().set({ viewports: vps, tool: fp.scale ? 'select' : 'scale', draft: [] });
      close();
    } catch (e) {
      st().setMessage(`Fond impossible : ${e instanceof Error ? e.message : String(e)}`, 'warn');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      ref={dlg}
      tabIndex={-1}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Bibliothèque d’images"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
      }}
      onClick={close}
    >
      <div className={`dialog libpick ${drop.over ? 'over' : ''}`} style={{ width: 760 }} onClick={(e) => e.stopPropagation()} {...drop.props}>
        <div className="row" style={{ alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{pick.mode === 'plan' ? `Images pour le plan ${planCode ?? ''}` : `Fond du plan au sol « ${fp?.name || 'Plan au sol'} »`}</h3>
          <span className="spacer" />
          <ImportButton label="Importer…" />
        </div>
        {pick.mode === 'plan' && (
          <div className="seg" role="radiogroup" aria-label="Ranger en" style={{ alignSelf: 'flex-start' }}>
            <button type="button" role="radio" aria-checked={kind === 'scouting'} aria-pressed={kind === 'scouting'} onClick={() => setKind('scouting')}>
              Repérage
            </button>
            <button type="button" role="radio" aria-checked={kind === 'reference'} aria-pressed={kind === 'reference'} onClick={() => setKind('reference')}>
              Référence
            </button>
          </div>
        )}
        {doc.library.length === 0 ? (
          <div className="dropzone" style={{ padding: 40 }}>
            La bibliothèque est vide : glissez des images ici ou utilisez « Importer… ».
          </div>
        ) : (
          <ul className="libpick-grid" role="listbox" aria-multiselectable={!single} aria-label="Images de la bibliothèque">
            {doc.library.map((l) => {
              const on = chosen.includes(l.id);
              const dis = already(l.file);
              return (
                <li key={l.id} role="option" aria-selected={on} aria-disabled={dis}>
                  <button type="button" className={`pic ${on ? 'on' : ''}`} disabled={dis} onClick={() => toggle(l.id)} onDoubleClick={() => (toggle(l.id), single && void apply())} title={dis ? 'Déjà utilisée ici' : l.caption || l.originalName}>
                    <Thumb file={l.file} alt={l.originalName} />
                    {dis && <span className="badge">DÉJÀ LÀ</span>}
                    {on && <span className="check">✓</span>}
                  </button>
                  <span className="name">{l.caption || l.originalName || 'Image'}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="row" style={{ alignItems: 'center' }}>
          <span className="note">{single ? 'Une image (photo, vue satellite). Pour un plan PDF, utilisez « Importer un fond… ».' : 'Cliquez pour choisir une ou plusieurs images.'}</span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={close}>
            Annuler
          </button>
          <button type="button" className="btn primary" disabled={!chosen.length || busy} onClick={() => void apply()}>
            {pick.mode === 'plan' ? (chosen.length > 1 ? `Ajouter ${chosen.length} images` : 'Ajouter') : busy ? 'Chargement…' : 'Utiliser comme fond'}
          </button>
        </div>
      </div>
    </div>
  );
}
