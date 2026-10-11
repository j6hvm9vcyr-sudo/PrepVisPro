/**
 * Bibliothèque d'images du projet : chaque image n'est importée qu'une fois, puis réutilisée
 * dans les plans (repérage, références) et comme fond de plan au sol.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { create } from 'zustand';
import { createPortal } from 'react-dom';
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
import { addFolder, childFolders, deleteFolder, folderLabel, imageCount, isInside, moveFolder, moveImages, renameFolder, type FolderResult } from '../model/imageFolders';
import { Picker, type PickItem } from './Picker';
import { Info } from './Info';
import { IconClose } from './Icons';
import { setLayout, setPanel } from './panels';
import { usePrefs } from '../state/prefs';
import { defaultLayout, IMAGES_MAX_HEIGHT, IMAGES_MIN_HEIGHT } from '../model/prefs';

type Filter = 'all' | 'used' | 'unused';

/** Ce qu'on regarde : toutes les images, celles qui ne sont dans aucun dossier (null), ou un dossier. */
type Place = 'all' | null | string;
/** Dossier ouvert et dossier en cours de nommage (le temps de la session). */
export const useLibFolder = create<{ place: Place; naming: string | null }>(() => ({ place: 'all', naming: null }));

/** Glisser une image de la bibliothèque (vers un dossier, ou sur un plan du tableau). */
export const DRAG_IMAGE = 'application/x-topshot-image';
const DRAG_FOLDER = 'application/x-topshot-folder';

function applyFolder(r: FolderResult, message?: string): boolean {
  const st = useApp.getState();
  if (!r.ok) {
    st.setMessage(r.error, 'warn');
    return false;
  }
  if (r.doc !== selectDoc(st)) st.applyDoc(r.doc, message);
  return true;
}

/** Choix d'un dossier (ranger une image, déplacer un dossier, filtrer). */
function folderItems(doc: ReturnType<typeof selectDoc>, rootLabel: string, exclude?: string): PickItem[] {
  const out: PickItem[] = [{ id: '__root', label: rootLabel }];
  const walk = (parent: string | null, depth: number) => {
    for (const f of childFolders(doc, parent)) {
      if (exclude && (f.id === exclude || isInside(doc, f.id, exclude))) continue;
      out.push({ id: f.id, label: `${'  '.repeat(depth)}${f.name}`, detail: depth ? folderLabel(doc, f.parentId) : undefined });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Nom libre pour un nouveau dossier (« Nouveau dossier », « Nouveau dossier 2 »…). */
function freeName(doc: ReturnType<typeof selectDoc>, parentId: string | null): string {
  const taken = new Set(childFolders(doc, parentId).map((f) => f.name.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = n === 1 ? 'Nouveau dossier' : `Nouveau dossier ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

function NameInput({ id, initial }: { id: string; initial: string }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  const done = (ok: boolean) => {
    if (useLibFolder.getState().naming !== id) return;
    if (ok && !applyFolder(renameFolder(selectDoc(useApp.getState()), id, v))) {
      ref.current?.focus();
      return;
    }
    useLibFolder.setState({ naming: null });
  };
  return (
    <input
      ref={ref}
      autoFocus
      className="folder-name"
      aria-label="Nom du dossier"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
      }}
    />
  );
}

/** Une rangée de l'arborescence : ouvre le dossier ; on y dépose des images ou un dossier. */
function FolderRow({ place, label, count, depth, draggableId }: { place: Place; label: string; count: number; depth: number; draggableId?: string }) {
  const current = useLibFolder((s) => s.place);
  const naming = useLibFolder((s) => s.naming);
  const [over, setOver] = useState(false);
  const target = place === 'all' ? undefined : place;
  const accepts = (e: DragEvent) => target !== undefined && (e.dataTransfer.types.includes(DRAG_IMAGE) || e.dataTransfer.types.includes(DRAG_FOLDER));
  if (draggableId && naming === draggableId)
    return (
      <div className="folder-row naming" style={{ paddingLeft: 8 + depth * 14 }}>
        <NameInput id={draggableId} initial={label} />
      </div>
    );
  return (
    <button
      type="button"
      className={`folder-row ${current === place ? 'on' : ''} ${over ? 'drop' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      aria-pressed={current === place}
      aria-label={draggableId ? `Dossier ${label}` : label}
      draggable={!!draggableId}
      onDragStart={(e) => {
        if (!draggableId) return;
        e.dataTransfer.setData(DRAG_FOLDER, draggableId);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (target === undefined) return;
        e.preventDefault();
        e.stopPropagation();
        const doc = selectDoc(useApp.getState());
        const img = e.dataTransfer.getData(DRAG_IMAGE);
        const dir = e.dataTransfer.getData(DRAG_FOLDER);
        if (img) applyFolder(moveImages(doc, [img], target), `Image rangée dans « ${folderLabel(doc, target)} »`);
        else if (dir && dir !== target) applyFolder(moveFolder(doc, dir, target), 'Dossier déplacé');
      }}
      onClick={() => useLibFolder.setState({ place })}
      onDoubleClick={() => draggableId && useLibFolder.setState({ naming: draggableId })}
      title={draggableId ? 'Double-clic : renommer · glisser : déplacer' : undefined}
    >
      <span className="folder-ico" aria-hidden>
        {place === 'all' ? '▦' : place === null ? '◌' : '▸'}
      </span>
      <span className="folder-lbl">{label}</span>
      <span className="folder-n">{count}</span>
    </button>
  );
}

function FolderTree() {
  const doc = useApp(selectDoc);
  const rows: ReactNode[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of childFolders(doc, parent)) {
      rows.push(<FolderRow key={f.id} place={f.id} label={f.name} count={imageCount(doc, f.id)} depth={depth} draggableId={f.id} />);
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return (
    <nav className="lib-folders" aria-label="Dossiers">
      <FolderRow place="all" label="Toutes les images" count={doc.library.length} depth={0} />
      <FolderRow place={null} label="Non rangées" count={doc.library.filter((l) => l.folderId === null).length} depth={0} />
      {rows}
      <button
        type="button"
        className="linkbtn folder-add"
        onClick={() => {
          const d = selectDoc(useApp.getState());
          const at = useLibFolder.getState().place;
          const parent = at === 'all' ? null : at;
          const r = addFolder(d, freeName(d, parent), parent);
          if (applyFolder(r, 'Dossier créé') && r.ok) useLibFolder.setState({ place: r.id!, naming: r.id! });
        }}
      >
        + Dossier
      </button>
    </nav>
  );
}

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
        // Seulement des fichiers venus du Finder (pas une image ou un dossier qu'on range).
        if (!e.dataTransfer.types.includes('Files')) return;
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

function ImportButton({ label = 'Importer des images…', primary = false, folderId = null }: { label?: string; primary?: boolean; folderId?: string | null }) {
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
          void useApp.getState().importToLibrary(Array.from(e.target.files ?? []), folderId);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** Panneau Images (0.18), en bas du Découpage : hauteur réglable, gardée sur ce Mac. */
export function ImagesDrawer() {
  const saved = usePrefs((s) => s.prefs.layout.imagesHeight);
  const [live, setLive] = useState<number | null>(null);
  const h = live ?? saved;
  const save = (v: number) => setLayout((d) => void (d.layout.imagesHeight = Math.round(clampH(v))));
  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const y0 = e.clientY;
    const start = h;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-row');
    let last = start;
    const move = (ev: PointerEvent) => {
      last = clampH(start + y0 - ev.clientY);
      setLive(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-row');
      setLive(null);
      save(last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <section className="images-drawer glass-panel" style={{ height: h }} aria-label="Panneau Images">
      <span
        className="drawer-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Hauteur du panneau Images"
        tabIndex={0}
        title="Glisser pour changer la hauteur · double-clic : hauteur par défaut"
        onPointerDown={onPointerDown}
        onDoubleClick={() => save(defaultLayout().imagesHeight)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          save(h + (e.key === 'ArrowUp' ? 20 : -20));
        }}
      />
      <LibraryView />
    </section>
  );
}

function clampH(v: number): number {
  return Math.min(IMAGES_MAX_HEIGHT, Math.max(IMAGES_MIN_HEIGHT, v));
}

function LibraryView() {
  const raw = useApp(selectDoc);
  const doc = useMemo(() => syncLibrary(raw), [raw]);
  const cursor = useApp(selectCursor);
  const usage = useMemo(() => libraryUsage(doc), [doc]);
  const [filter, setFilter] = useState<Filter>('all');
  const [zoom, setZoom] = useState<LibraryImage | null>(null);
  const st = useApp.getState;
  const code = cursor ? computeNumbers(doc).get(cursor.planId)?.code : undefined;
  const rawPlace = useLibFolder((s) => s.place);
  // Dossier supprimé (ou annulé) entre-temps : retour à toutes les images.
  const place: Place = rawPlace === 'all' || rawPlace === null || doc.imageFolders.some((f) => f.id === rawPlace) ? rawPlace : 'all';
  const into = place === 'all' ? null : place;
  const drop = useDrop((f) => void st().importToLibrary(f, into));
  const here = doc.library.filter((l) => place === 'all' || l.folderId === place);
  const shown = here.filter((l) => (filter === 'all' ? true : filter === 'used' ? isUsed(usage.get(l.file)) : !isUsed(usage.get(l.file))));
  const unused = here.filter((l) => !isUsed(usage.get(l.file))).length;
  const folder = typeof place === 'string' && place !== 'all' ? doc.imageFolders.find((f) => f.id === place) : undefined;
  const fileTo = (id: string) => (id === '__root' ? null : id);

  return (
    <div className={`library in-drawer ${drop.over ? 'over' : ''}`} {...drop.props} aria-label="Bibliothèque d’images" role="region">
      <FolderTree />
      <div className="lib-main">
      <div className="library-head">
        <div>
          <div className="lib-title">
            <h2>{place === 'all' ? 'Images du projet' : place === null ? 'Non rangées' : folderLabel(doc, place)}</h2>
            <Info title="Images">
              <span>Importées une seule fois, réutilisables dans tous les plans et comme fond de plan au sol. Une même image importée deux fois n’est jamais dupliquée.</span>
              <span>Glissez une image sur un plan du tableau pour l’y ajouter (repérage ou référence), ou sur un dossier pour l’y ranger.</span>
            </Info>
          </div>
          {folder && (
            <div className="folder-acts">
              <button type="button" className="linkbtn" onClick={() => useLibFolder.setState({ naming: folder.id })}>
                Renommer
              </button>
              <Picker
                label="Déplacer le dossier dans"
                variant="add"
                value={folder.parentId ?? '__root'}
                groups={[{ items: folderItems(doc, 'À la racine', folder.id) }]}
                onPick={(id) => applyFolder(moveFolder(selectDoc(st()), folder.id, fileTo(id)), 'Dossier déplacé')}
              >
                Déplacer dans…
              </Picker>
              <button
                type="button"
                className="linkbtn danger"
                title="Les images et les dossiers qu’il contient remontent d’un cran ; aucune image n’est supprimée"
                onClick={() => {
                  if (applyFolder(deleteFolder(selectDoc(st()), folder.id), `Dossier « ${folder.name} » supprimé : son contenu est dans « ${folderLabel(doc, folder.parentId)} »`)) useLibFolder.setState({ place: folder.parentId });
                }}
              >
                Supprimer le dossier
              </button>
            </div>
          )}
        </div>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Filtre">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            Toutes ({here.length})
          </button>
          <button type="button" aria-pressed={filter === 'used'} onClick={() => setFilter('used')}>
            Utilisées
          </button>
          <button type="button" aria-pressed={filter === 'unused'} onClick={() => setFilter('unused')}>
            Non utilisées ({unused})
          </button>
        </div>
        <ImportButton primary folderId={into} />
        <button type="button" className="ibtn small" aria-label="Fermer Images" onClick={() => setPanel('images', false)}>
          <IconClose />
        </button>
      </div>
      {here.length === 0 && place !== 'all' ? (
        <div className="library-empty">
          <p className="note">{place === null ? 'Toutes les images sont rangées dans des dossiers.' : 'Dossier vide : glissez-y des images, ou importez-en ici.'}</p>
        </div>
      ) : doc.library.length === 0 ? (
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
              <li
                key={l.id}
                className="libcard"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_IMAGE, l.id);
                  // Rangée dans un dossier (déplacer) ou ajoutée à un plan (copier).
                  e.dataTransfer.effectAllowed = 'copyMove';
                }}
              >
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
                    <Picker
                      label={`Ranger ${l.originalName || 'l’image'} dans`}
                      variant="add"
                      value={l.folderId ?? '__root'}
                      groups={[{ items: folderItems(doc, 'Non rangée') }]}
                      empty="Aucun dossier"
                      onPick={(id) => applyFolder(moveImages(selectDoc(st()), [l.id], fileTo(id)), `Image rangée dans « ${id === '__root' ? 'Non rangées' : folderLabel(selectDoc(st()), id)} »`)}
                    >
                      {l.folderId ? `▸ ${folderLabel(doc, l.folderId)}` : 'Ranger…'}
                    </Picker>
                    <span className="acts-sep" />
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
      </div>
      {drop.over && <div className="library-drop">{into === null ? 'Déposez pour ajouter à la bibliothèque' : `Déposez pour ajouter à « ${folderLabel(doc, into)} »`}</div>}
      {zoom &&
        // Le panneau en verre deviendrait le repère de l'aperçu : il passe par un portail.
        createPortal(
        <div className="overlay dark" role="dialog" aria-modal="true" aria-label="Aperçu de l’image" onClick={() => setZoom(null)} onKeyDown={(e) => (e.key === 'Escape' || e.key === ' ') && setZoom(null)} tabIndex={-1}>
          <Thumb file={zoom.file} alt={zoom.originalName} />
          <div className="preview-cap">
            <span>{zoom.caption || zoom.originalName}</span>
          </div>
        </div>,
          document.body,
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
  const [place, setPlace] = useState<Place>('all');
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
          {doc.imageFolders.length > 0 && (
            <Picker
              label="Dossier affiché"
              value={place === 'all' ? '__all' : (place ?? '__root')}
              groups={[{ items: [{ id: '__all', label: 'Toutes les images' }, ...folderItems(doc, 'Non rangées')] }]}
              onPick={(id) => setPlace(id === '__all' ? 'all' : id === '__root' ? null : id)}
            >
              {place === 'all' ? 'Toutes les images' : place === null ? 'Non rangées' : folderLabel(doc, place)}
            </Picker>
          )}
          <ImportButton label="Importer…" folderId={place === 'all' ? null : place} />
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
            {doc.library.filter((l) => place === 'all' || l.folderId === place).map((l) => {
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
