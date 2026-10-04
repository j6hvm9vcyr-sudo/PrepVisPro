import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { addFloorPlan, cameraLabel, deleteElements, deleteFloorPlan, newFloorPlan, unplacedSetups, updateElement, updateFloorPlan } from '../model/floorOps';
import { computeNumbers } from '../model/numbering';
import { formatNumber } from '../model/text';
import type { FloorElement, FloorPlan } from '../model/floor';
import { ACTOR_COLORS, useFloor, type FloorTool } from './floorStore';
import { FloorCanvas } from './FloorCanvas';
import { importBackground } from './background';
import { stripColors } from '../ui/strip';
import { useLateFocus } from '../ui/focus';
import { DecimalField } from '../ui/DecimalField';
import { IconPalette } from './icons';
import { FramingSuggestion } from './Suggest';
import { ActorLight, iconToLight, LightInspector, PowerSummary } from './LightPanels';
import { ReflectorInspector } from './ReflectorPanel';
import { SunPanel } from './SunPanel';
import { planSun, sunForCamera } from '../model/sunPlan';
import type { FloorCamera } from '../model/floor';

const TOOLS: { id: FloorTool; label: string; key: string }[] = [
  { id: 'select', label: 'Sélection', key: 'V' },
  { id: 'camera', label: 'Caméra', key: 'C' },
  { id: 'actor', label: 'Personnage', key: 'P' },
  { id: 'light', label: 'Projecteur', key: 'L' },
  { id: 'reflector', label: 'Réflecteur', key: 'B' },
  { id: 'text', label: 'Texte', key: 'T' },
  { id: 'measure', label: 'Mesure', key: 'M' },
  { id: 'scale', label: 'Échelle', key: 'E' },
];

export function FloorView() {
  const doc = useApp(selectDoc);
  const ui = useFloor();
  const st = useApp.getState;
  const cursorPlan = useApp((s) => s.cursor?.planId);
  // Plan au sol courant : celui choisi, sinon celui de la séquence du plan sélectionné dans le découpage.
  const current = doc.floorPlans.find((f) => f.id === ui.currentId) ?? null;
  useEffect(() => {
    if (current || !doc.floorPlans.length) return;
    const seq = doc.sequences.find((s) => s.plans.some((p) => p.id === cursorPlan));
    const fp = (seq && doc.floorPlans.find((f) => f.sequenceIds.includes(seq.id))) ?? doc.floorPlans[0]!;
    useFloor.getState().set({ currentId: fp.id, selection: [] });
  }, [current, doc.floorPlans, doc.sequences, cursorPlan]);

  const create = (seqId: string) => {
    const s = doc.sequences.find((x) => x.id === seqId);
    if (!s) return;
    const fp = newFloorPlan(`Séq. ${s.number || '?'} — ${s.location || 'Décor'}`, [s.id]);
    st().applyDoc(addFloorPlan(doc, fp), 'Plan au sol créé');
    useFloor.getState().set({ currentId: fp.id, selection: [], tool: 'select' });
  };

  const seqsWithout = doc.sequences.filter((s) => !doc.floorPlans.some((f) => f.sequenceIds.includes(s.id)));

  return (
    <div className="floor">
      <aside className="floor-list" aria-label="Plans au sol">
        <h2 className="panel-title">Plans au sol</h2>
        {doc.floorPlans.map((f) => {
          const s = doc.sequences.find((x) => f.sequenceIds.includes(x.id));
          const c = s ? stripColors(s) : { fill: 'var(--border)', edge: 'var(--border)' };
          return (
            <button key={f.id} type="button" className={`index-item ${f.id === current?.id ? 'here' : ''}`} onClick={() => useFloor.getState().set({ currentId: f.id, selection: [], tool: 'select', draft: [] })}>
              <span className="strip" style={{ background: c.fill, borderColor: c.edge }} />
              <span className="meta">
                <span style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                <span className="loc">
                  {f.elements.filter((e) => e.kind === 'camera').length} caméra(s){f.scale ? ' · à l’échelle' : ''}
                </span>
              </span>
            </button>
          );
        })}
        {seqsWithout.length > 0 && (
          <div className="floor-new">
            <label className="field">
              Nouveau plan au sol
              <select value="" onChange={(e) => e.target.value && create(e.target.value)} aria-label="Créer un plan au sol pour la séquence">
                <option value="">Pour la séquence…</option>
                {seqsWithout.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.number || '?'} — {s.location || 'Décor à préciser'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </aside>

      <main className="floor-main">
        {current ? (
          <>
            <FloorToolbar fp={current} />
            <FloorCanvas key={current.id} fp={current} />
          </>
        ) : (
          <div className="floor-empty">
            <p>Aucun plan au sol pour l’instant.</p>
            <p className="note">Choisissez une séquence dans « Nouveau plan au sol », importez le plan du décor (PDF d’architecte ou vue satellite), mettez-le à l’échelle, puis placez les caméras du découpage.</p>
          </div>
        )}
      </main>

      {current && <FloorInspector fp={current} />}
    </div>
  );
}

function FloorToolbar({ fp }: { fp: FloorPlan }) {
  const tool = useFloor((s) => s.tool);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const bg = await importBackground(f);
      const st = useApp.getState();
      st.applyDoc(updateFloorPlan(selectDoc(st), fp.id, (x) => void (x.background = bg)), fp.scale ? 'Fond remplacé — vérifiez l’échelle (E)' : 'Fond importé — mettez-le à l’échelle (E)');
      const vps = { ...useFloor.getState().viewports };
      delete vps[fp.id];
      useFloor.getState().set({ viewports: vps, tool: fp.scale ? 'select' : 'scale', draft: [] });
    } catch (e) {
      useApp.getState().setMessage(`Import du fond impossible : ${e instanceof Error ? e.message : String(e)}`, 'warn');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="floor-toolbar">
      <div className="seg" role="group" aria-label="Outils">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tool === t.id} title={`${t.label} (${t.key})`} onClick={() => useFloor.getState().set({ tool: t.id, draft: [], placing: null })}>
            {t.label}
          </button>
        ))}
      </div>
      <span className="spacer" />
      <span className="note" style={{ fontSize: 12 }}>
        {tool === 'scale'
          ? 'Cliquez deux points dont vous connaissez la distance (une porte, un mur coté).'
          : tool === 'measure'
            ? 'Cliquez deux points pour mesurer.'
            : tool === 'path'
              ? 'Cliquez les points du trajet ; ↩ ou double-clic pour finir.'
              : fp.scale
                ? `Échelle : ${formatNumber(fp.scale.meters)} m de référence`
                : 'Pas encore à l’échelle'}
      </span>
      <button type="button" className="btn" onClick={() => file.current?.click()} disabled={busy} title="Plan d’architecte (PDF ou image) ou vue satellite">
        {busy ? 'Import…' : fp.background ? 'Changer le fond…' : 'Importer un fond…'}
      </button>
      <input ref={file} type="file" accept="image/*,application/pdf,.pdf" className="sr-only" tabIndex={-1} onChange={(e) => (void onFile(e.target.files?.[0]), (e.target.value = ''))} />
      <FloorExportButtons fp={fp} />
    </div>
  );
}

function FloorExportButtons({ fp }: { fp: FloorPlan }) {
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null);
  const empty = !fp.background && fp.elements.length === 0;
  const run = async (ext: 'png' | 'pdf') => {
    setBusy(ext);
    const st = useApp.getState();
    const doc = selectDoc(st);
    try {
      const svc = await import('../export/service');
      const built = ext === 'png' ? { bytes: (await svc.floorPng(doc, fp)).bytes, failedFloors: [] as string[] } : await svc.buildFloorPdf(doc, [fp]);
      if (built.failedFloors?.length) throw new Error(built.failedFloors[0]);
      const path = await svc.saveFloorExport(doc, ext, built.bytes, `Plan au sol ${fp.name.replace(/[\\/:*?"<>|]+/g, '-')}`);
      if (path) st.setMessage(`Plan exporté : ${path.split('/').pop()}`);
    } catch (e) {
      st.setMessage(`Export du plan impossible : ${e instanceof Error ? e.message : String(e)}`, 'warn');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="seg" role="group" aria-label="Exporter ce plan">
      <button type="button" disabled={!!busy || empty} onClick={() => void run('png')} title="Exporter ce plan en image PNG">
        {busy === 'png' ? 'Export…' : 'PNG'}
      </button>
      <button type="button" disabled={!!busy || empty} onClick={() => void run('pdf')} title="Exporter ce plan en PDF (avec la légende des caméras)">
        {busy === 'pdf' ? 'Export…' : 'PDF'}
      </button>
    </div>
  );
}

function FloorInspector({ fp }: { fp: FloorPlan }) {
  const doc = useApp(selectDoc);
  const ui = useFloor();
  const numbers = useMemo(() => computeNumbers(doc), [doc]);
  const st = useApp.getState;
  const apply = (fn: (d: ReturnType<typeof selectDoc>) => ReturnType<typeof selectDoc>, msg?: string, key?: string) => st().applyDoc(fn(selectDoc(st())), msg, key);
  const selected = fp.elements.filter((e) => ui.selection.includes(e.id));
  const el = selected.length === 1 ? selected[0]! : null;
  const unplaced = unplacedSetups(doc, fp);
  const upd = (fn: (e: FloorElement) => void, key: string) => el && apply((d) => updateElement(d, fp.id, el.id, fn as never), undefined, `${key}-${el.id}`);

  const setupOptions = doc.sequences
    .filter((s) => fp.sequenceIds.includes(s.id))
    .flatMap((s) => s.plans.flatMap((p) => p.cameras.map((c) => ({ planId: p.id, setupId: c.id, label: cameraLabel(doc, p.id, c.id, numbers) }))));

  return (
    <aside className="inspector" aria-label="Détails du plan au sol">
      <div className="insp-body">
        {el ? (
          <section className="sec">
            <div className="sec-h">{{ camera: 'Caméra', actor: 'Personnage', icon: 'Icône', text: 'Texte', light: 'Projecteur', reflector: 'Réflecteur' }[el.kind]}</div>
            {el.kind === 'camera' && (
              <>
                <label className="field">
                  Plan du découpage
                  <select
                    value={el.planId ? `${el.planId}|${el.setupId}` : ''}
                    onChange={(e) => {
                      const [planId, setupId] = e.target.value ? e.target.value.split('|') : [null, null];
                      upd((x) => {
                        if (x.kind === 'camera') {
                          x.planId = planId ?? null;
                          x.setupId = setupId ?? null;
                        }
                      }, 'link');
                    }}
                  >
                    <option value="">Non reliée</option>
                    {setupOptions.map((o) => (
                      <option key={`${o.planId}|${o.setupId}`} value={`${o.planId}|${o.setupId}`}>
                        {o.label.code} · {o.label.detail}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={el.showFov} onChange={(e) => upd((x) => void (x.kind === 'camera' && (x.showFov = e.target.checked)), 'fov')} />
                  Afficher le champ
                </label>
                <p className="note" style={{ margin: 0 }}>
                  Le champ suit la focale et le format capteur du plan (Réglages › Caméras). Plan évolutif : champ de fin en pointillé violet.
                </p>
                <FramingSuggestion fp={fp} cam={el} />
                <CameraSun fp={fp} cam={el} />
              </>
            )}
            {el.kind === 'actor' && (
              <>
                <label className="field">
                  Nom
                  <input value={el.name} onChange={(e) => upd((x) => void (x.kind === 'actor' && (x.name = e.target.value)), 'name')} />
                </label>
                <div className="row" role="radiogroup" aria-label="Couleur">
                  {ACTOR_COLORS.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={el.color === c} aria-label={`Couleur ${c}`} className="swatch" style={{ background: c, outline: el.color === c ? '2px solid var(--text)' : 'none' }} onClick={() => upd((x) => void (x.kind === 'actor' && (x.color = c)), 'color')} />
                  ))}
                </div>
                <ActorLight fp={fp} actor={el} />
              </>
            )}
            {el.kind === 'light' && <LightInspector fp={fp} el={el} />}
            {el.kind === 'reflector' && <ReflectorInspector fp={fp} el={el} />}
            {el.kind === 'icon' && (
              <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => iconToLight(fp, el)} title="Pour un projecteur : faisceau, éclairement et puissance">
                Utiliser comme projecteur
              </button>
            )}
            {el.kind === 'text' && (
              <label className="field">
                Texte
                <TextField id={el.id} value={el.text} onChange={(v) => upd((x) => void (x.kind === 'text' && (x.text = v)), 'text')} />
              </label>
            )}
            {el.kind === 'icon' && (
              <label className="field">
                Légende
                <input value={el.label} placeholder="ex. 2K, Fresnel 650" onChange={(e) => upd((x) => void (x.kind === 'icon' && (x.label = e.target.value)), 'label')} />
              </label>
            )}
            {el.kind === 'icon' && (
              <div className="field">
                Taille à l’écran
                <div className="seg" role="group" aria-label="Taille de l’icône">
                  {([['Petite', 40], ['Moyenne', 56], ['Grande', 84], ['Très grande', 120]] as const).map(([l, v]) => (
                    <button key={v} type="button" aria-pressed={el.size === v} onClick={() => upd((x) => void (x.kind === 'icon' && (x.size = v)), 'size')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {el.kind !== 'text' && (
              <div className="field">
                Orientation
                <DecimalField label="Orientation en degrés" unit="°" width={80} required min={-360} max={360} value={Math.round(el.rotation)} onChange={(v) => v !== null && upd((x) => void (x.rotation = ((v % 360) + 360) % 360), 'rot')} />
              </div>
            )}
            {(el.kind === 'camera' || el.kind === 'actor') && (
              <div className="row">
                <button type="button" className="btn" onClick={() => useFloor.getState().set({ tool: 'path', pathFor: el.id })}>
                  {el.path.length ? 'Prolonger le trajet' : 'Tracer un déplacement'}
                </button>
                {el.path.length > 0 && (
                  <button type="button" className="btn ghost" onClick={() => upd((x) => void ('path' in x && (x.path = [])), 'clearpath')}>
                    Effacer le trajet
                  </button>
                )}
              </div>
            )}
            <button type="button" className="btn danger" onClick={() => (apply((d) => deleteElements(d, fp.id, [el.id]), 'Élément supprimé · ⌘Z pour annuler'), useFloor.getState().set({ selection: [] }))}>
              Supprimer
            </button>
          </section>
        ) : selected.length > 1 ? (
          <section className="sec">
            <div className="sec-h">{selected.length} éléments</div>
            <p className="note" style={{ margin: 0 }}>Glissez pour les déplacer ensemble · ⌫ pour les supprimer. Les réglages ci-dessous s’appliquent à toute la sélection.</p>
            {selected.some((x) => x.kind === 'icon') && (
              <div className="field">
                Taille des icônes
                <div className="seg" role="group" aria-label="Taille des icônes sélectionnées">
                  {([['Petite', 40], ['Moyenne', 56], ['Grande', 84], ['Très grande', 120]] as const).map(([l, v]) => (
                    <button key={v} type="button" aria-pressed={selected.every((x) => x.kind !== 'icon' || x.size === v)} onClick={() => apply((d) => selected.reduce((acc, x) => (x.kind === 'icon' ? updateElement(acc, fp.id, x.id, (y) => void (y.kind === 'icon' && (y.size = v))) : acc), d), `Taille appliquée à ${selected.filter((x) => x.kind === 'icon').length} icônes`)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selected.some((x) => x.kind === 'camera') && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={selected.every((x) => x.kind !== 'camera' || x.showFov)}
                  onChange={(e) => apply((d) => selected.reduce((acc, x) => (x.kind === 'camera' ? updateElement(acc, fp.id, x.id, (y) => void (y.kind === 'camera' && (y.showFov = e.target.checked))) : acc), d))}
                />
                Afficher le champ des caméras
              </label>
            )}
            <div className="field">
              Même orientation pour tous
              <DecimalField
                label="Orientation commune en degrés"
                unit="°"
                width={80}
                min={-360}
                max={360}
                value={selected.every((x) => x.rotation === selected[0]!.rotation) ? Math.round(selected[0]!.rotation) : null}
                onChange={(v) => v !== null && apply((d) => selected.reduce((acc, x) => updateElement(acc, fp.id, x.id, (y) => void (y.rotation = ((v % 360) + 360) % 360)), d), undefined, `rotall-${selected.map((x) => x.id).join()}`)}
              />
            </div>
          </section>
        ) : (
          <section className="sec">
            <div className="sec-h">Plan au sol</div>
            <label className="field">
              Nom
              <input value={fp.name} onChange={(e) => apply((d) => updateFloorPlan(d, fp.id, (x) => void (x.name = e.target.value)), undefined, `fpname-${fp.id}`)} />
            </label>
            {fp.background && (
              <label className="field">
                Opacité du fond
                <input type="range" min={0.15} max={1} step={0.05} value={fp.background.opacity} onChange={(e) => apply((d) => updateFloorPlan(d, fp.id, (x) => void (x.background && (x.background.opacity = Number(e.target.value)))), undefined, `bgop-${fp.id}`)} />
              </label>
            )}
            {fp.scale && (
              <div className="field">
                Longueur des champs caméra
                <DecimalField label="Longueur des champs caméra en mètres" unit="m" width={80} required min={0.5} max={200} value={fp.fovLengthM} onChange={(v) => v !== null && apply((d) => updateFloorPlan(d, fp.id, (x) => void (x.fovLengthM = v)), undefined, `fovlen-${fp.id}`)} />
              </div>
            )}
            <button type="button" className="btn danger" onClick={() => (apply((d) => deleteFloorPlan(d, fp.id), 'Plan au sol supprimé · ⌘Z pour annuler'), useFloor.getState().set({ currentId: null }))}>
              Supprimer ce plan au sol
            </button>
          </section>
        )}
        {!el && selected.length === 0 && <PowerSummary fp={fp} />}
        {!el && selected.length === 0 && <SunPanel fp={fp} />}

        <section className="sec">
          <div className="sec-h">
            Caméras à placer <span className="count">{unplaced.length}</span>
          </div>
          {unplaced.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>
              Toutes les caméras du découpage sont placées.
            </p>
          ) : (
            <div className="to-place">
              {unplaced.map((u) => {
                const lab = cameraLabel(doc, u.planId, u.setupId, numbers);
                const on = ui.placing?.planId === u.planId && ui.placing?.setupId === u.setupId;
                return (
                  <button key={`${u.planId}|${u.setupId}`} type="button" className={`place-item ${on ? 'on' : ''}`} onClick={() => useFloor.getState().set({ placing: on ? null : u, tool: 'select' })}>
                    <b className="mono">{lab.code}</b>
                    <span className="mono">{lab.detail}</span>
                  </button>
                );
              })}
            </div>
          )}
          {ui.placing && <p className="note" style={{ margin: 0, color: 'var(--accent)', fontWeight: 600 }}>Cliquez sur le plan pour placer la caméra (esc pour annuler).</p>}
        </section>
        <IconPalette />
        <p className="note" style={{ margin: 0 }}>
          Glisser : déplacer · poignée ronde : orienter (⇧ par pas de 15°) · R : tourner · ⌘D : dupliquer · ⌫ : supprimer · deux doigts : se déplacer · pincer : zoomer · 0 : tout afficher.
        </p>
      </div>
    </aside>
  );
}

function TextField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const ref = useLateFocus<HTMLInputElement>(id, true);
  return <input ref={ref} data-floor-text value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Soleil par rapport à l'axe de la caméra, si le soleil est simulé sur ce plan. */
function CameraSun({ fp, cam }: { fp: FloorPlan; cam: FloorCamera }) {
  const doc = useApp(selectDoc);
  const sun = planSun(doc, fp, false);
  if (!sun.ok || sun.planBearing === null) return null;
  const rel = sunForCamera(cam.rotation, sun.planBearing, sun.pos.elevation);
  return (
    <p className="note" style={{ margin: 0 }} aria-label="Soleil pour cette caméra">
      Soleil à {fp.sunAt!.time} : <b>{rel ?? 'couché'}</b>
    </p>
  );
}
