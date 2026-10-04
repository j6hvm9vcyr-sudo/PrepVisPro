/**
 * Icônes sur le plan au sol : palette de la bibliothèque personnelle et pose d'une icône.
 * Une icône posée est copiée dans le projet (images/), qui reste complet sans la bibliothèque.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { addElements } from '../model/floorOps';
import { newId } from '../model/defaults';
import type { Id } from '../model/types';
import type { Point } from '../model/floor';
import { imageStore } from '../platform/images';
import { iconBackend, useIcons, type IconItem } from '../platform/iconLibrary';
import { norm } from '../model/text';
import { useFloor } from './floorStore';

/** Icône en cours de glisser-déposer depuis la palette. */
export let draggedIcon: IconItem | null = null;

/** Taille par défaut d'une icône posée, en pixels à l'écran. */
const ICON_SIZE = 56;

/** Copies déjà faites dans le projet ouvert : une icône posée dix fois n'est copiée qu'une fois. */
const copies = new Map<string, string>();

async function copyIntoProject(item: IconItem): Promise<string> {
  const key = `${imageStore.projectDir ?? 'memoire'}|${item.id}`;
  const known = copies.get(key);
  if (known && imageStore.url(known)) return known;
  const bytes = await iconBackend().read(item.id);
  const [stored] = await imageStore.importFiles([new File([bytes as BlobPart], `${item.name}.png`, { type: 'image/png' })]);
  if (!stored) throw new Error('copie de l’icône dans le projet impossible');
  copies.set(key, stored.file);
  return stored.file;
}

export async function placeIcon(floorPlanId: Id, item: IconItem, at: Point): Promise<void> {
  const st = useApp.getState();
  try {
    const file = await copyIntoProject(item);
    const el = { id: newId('fe'), kind: 'icon' as const, at, rotation: 0, icon: file, label: '', size: ICON_SIZE };
    const doc = selectDoc(useApp.getState());
    if (!doc.floorPlans.some((f) => f.id === floorPlanId)) return;
    useApp.getState().applyDoc(addElements(doc, floorPlanId, [el]), `${item.name} posé`);
    useFloor.getState().set({ selection: [el.id], tool: 'select' });
  } catch (e) {
    st.setMessage(`Icône non posée : ${e instanceof Error ? e.message : String(e)}`, 'warn');
  }
}

export function IconPalette() {
  const { items, loaded, progress, error } = useIcons();
  const placing = useFloor((s) => s.placingIcon);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  useEffect(() => {
    if (!loaded) void useIcons.getState().load();
  }, [loaded]);

  const groups = useMemo(() => {
    const n = norm(q.trim());
    const m = new Map<string, IconItem[]>();
    for (const it of items) {
      if (n && !norm(it.name).includes(n) && !norm(it.category).includes(n)) continue;
      const list = m.get(it.category) ?? [];
      list.push(it);
      m.set(it.category, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [items, q]);

  const doImport = async () => {
    const r = await useIcons.getState().importFolder();
    if (!r) return;
    if (r.failed.length) console.warn('Icônes illisibles :', r.failed.join(' · '));
    const st = useApp.getState();
    if (r.added === 0) st.setMessage('Aucune image (PNG, JPEG, WebP) trouvée dans ce dossier.', 'warn');
    else st.setMessage(`${r.added} icône${r.added > 1 ? 's' : ''} dans la bibliothèque${r.failed.length ? ` · ${r.failed.length} image${r.failed.length > 1 ? 's' : ''} illisible${r.failed.length > 1 ? 's' : ''}` : ''}`, r.failed.length ? 'warn' : 'info');
  };

  return (
    <div className="sec icon-palette" aria-label="Icônes">
      {items.length > 0 && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="linkbtn" onClick={() => setManaging((v) => !v)}>
            {managing ? 'Terminé' : 'Gérer la bibliothèque'}
          </button>
        </div>
      )}
      {error && <p className="note" style={{ color: 'var(--warn-text)', margin: 0 }}>{error}</p>}
      {progress ? (
        <p className="note" style={{ margin: 0 }} role="status">
          Import des icônes… {progress}
        </p>
      ) : items.length === 0 ? (
        <>
          <p className="note" style={{ margin: 0 }}>
            Importez votre dossier d’icônes (un sous-dossier par catégorie). Il est gardé sur cet ordinateur et sert à tous vos projets.
          </p>
          <button type="button" className="btn" onClick={() => void doImport()}>
            Importer un dossier d’icônes…
          </button>
        </>
      ) : (
        <>
          <input className="field-input" type="search" placeholder="Rechercher (fresnel, dolly…)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une icône" />
          <div className="icon-groups">
            {groups.length === 0 && <p className="note" style={{ margin: 0 }}>Aucune icône ne correspond.</p>}
            {groups.map(([cat, list]) => {
              const expanded = q.trim() !== '' || open === cat;
              return (
                <div key={cat} className="icon-group">
                  <button type="button" className="icon-group-h" aria-expanded={expanded} onClick={() => setOpen(expanded && !q.trim() ? null : cat)}>
                    <span>{expanded ? '▾' : '▸'}</span> {cat} <span className="count">{list.length}</span>
                  </button>
                  {expanded && (
                    <div className="icon-grid">
                      {list.map((it) => (
                        <IconTile key={it.id} item={it} active={placing?.id === it.id} managing={managing} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {placing && (
            <p className="note" style={{ margin: 0, color: 'var(--accent)', fontWeight: 600 }}>
              Cliquez sur le plan pour poser « {placing.name} » (esc pour annuler).
            </p>
          )}
          {managing && (
            <button type="button" className="btn" onClick={() => void doImport()}>
              Ajouter un dossier d’icônes…
            </button>
          )}
        </>
      )}
    </div>
  );
}

function IconTile({ item, active, managing }: { item: IconItem; active: boolean; managing: boolean }) {
  const url = useIcons((s) => s.url(item));
  return (
    <div className={`icon-tile ${active ? 'on' : ''}`}>
      <button
        type="button"
        title={`${item.name} — glissez-la sur le plan, ou cliquez puis cliquez sur le plan`}
        aria-label={`Poser ${item.name}`}
        aria-pressed={active}
        draggable
        onDragStart={(e) => {
          draggedIcon = item;
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('text/plain', item.name);
        }}
        onDragEnd={() => {
          draggedIcon = null;
        }}
        onClick={() => useFloor.getState().set({ placingIcon: active ? null : item, placing: null, tool: 'select', draft: [] })}
      >
        {url ? <img src={url} alt="" draggable={false} /> : <span className="note">?</span>}
        <span className="icon-name">{item.name}</span>
      </button>
      {managing && (
        <button type="button" className="icon-remove" aria-label={`Retirer ${item.name} de la bibliothèque`} title="Retirer de la bibliothèque (les plans qui l’utilisent la gardent)" onClick={() => void useIcons.getState().remove([item.id])}>
          ×
        </button>
      )}
    </div>
  );
}
