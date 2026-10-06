/** Panneau de droite du plan au sol : la sélection ; sans sélection, ce que montre l'onglet (Plan au sol, Lumière, Soleil). */
import { useMemo, useRef, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { cameraLabel, deleteElements, deleteFloorPlan, unplacedSetups, updateElement, updateFloorPlan } from '../model/floorOps';
import { computeNumbers } from '../model/numbering';
import type { FloorActor, FloorCamera, FloorElement, FloorLight, FloorPlan } from '../model/floor';
import { ACTOR_COLORS, useFloor } from './floorStore';
import { importBackground } from './background';
import { addToLibrary, knownHashes } from '../model/library';
import { useLateFocus } from '../ui/focus';
import { DecimalField } from '../ui/DecimalField';
import { IconPalette } from './icons';
import { FramingSuggestion } from './Suggest';
import { ActorLight, LightInspector } from './LightPanels';
import { convertIcon } from './iconConvert';
import { ReflectorInspector } from './ReflectorPanel';
import { LightingPanel } from './LightingPanel';
import { SunSection } from './SunPanel';
import { Fold } from '../ui/Fold';
import { Picker } from '../ui/Picker';
import { FiguresPanel } from './FiguresPanel';
import { IconChoice } from './IconChoice';
import { figureIcon } from '../model/floorIcons';
import type { FloorReflector } from '../model/floor';
import { useIcons } from '../platform/iconLibrary';
import { planSun, sunForCamera } from '../model/sunPlan';
import { Info } from '../ui/Info';
import { displayText } from '../model/entry';
import { fieldOfView, formatDeg, parseAspectRatio } from '../model/optics';

/** Import du fond (plan d'architecte PDF ou image, vue satellite). */
function BackgroundButton({ fp }: { fp: FloorPlan }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const st = useApp.getState();
      const { bg, stored } = await importBackground(f, knownHashes(selectDoc(st)));
      const withLib = addToLibrary(selectDoc(useApp.getState()), [stored]).doc;
      st.applyDoc(updateFloorPlan(withLib, fp.id, (x) => void (x.background = bg)), fp.scale ? 'Fond remplacé — vérifiez l’échelle (E)' : 'Fond importé — mettez-le à l’échelle (E)');
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
    <>
      <button type="button" className={`btn ${fp.background ? '' : 'primary'}`} onClick={() => file.current?.click()} disabled={busy} title="Plan d’architecte (PDF ou image) ou vue satellite">
        {busy ? 'Import…' : fp.background ? 'Changer le fond…' : 'Importer un fond…'}
      </button>
      <input ref={file} type="file" accept="image/*,application/pdf,.pdf" className="sr-only" tabIndex={-1} onChange={(e) => (void onFile(e.target.files?.[0]), (e.target.value = ''))} />
      <button type="button" className="btn" disabled={busy} title="Choisir le fond parmi les images du projet" onClick={() => useApp.getState().setLibraryPick({ mode: 'background', floorPlanId: fp.id })}>
        Bibliothèque…
      </button>
    </>
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

const NONE = '__aucun';

export function FloorInspector({ fp }: { fp: FloorPlan }) {
  const doc = useApp(selectDoc);
  const iconCount = useIcons((s) => s.items.length);
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
  const linked = el?.kind === 'camera' ? setupOptions.find((o) => o.planId === el.planId && o.setupId === el.setupId) : undefined;

  const tab = selected.length === 0 ? ui.panel : 'plan';
  const title = el ? { camera: 'Caméra', actor: 'Personnage', icon: 'Icône', text: 'Texte', light: 'Projecteur', reflector: 'Réflecteur' }[el.kind] : selected.length > 1 ? `${selected.length} éléments` : tab === 'light' ? 'Lumière' : tab === 'sun' ? 'Soleil' : fp.name || 'Plan au sol';
  return (
    <aside className="side-panel inspector floor-insp" aria-label="Détails du plan au sol">
      <div className="side-head">
        <strong>{title}</strong>
        {el?.kind === 'camera' && linked && <span className="mono accent">{linked.label.code}</span>}
      </div>
      <div className="side-body floor-body">
        {tab === 'light' ? (
          <LightingPanel fp={fp} />
        ) : tab === 'sun' ? (
          <section className="sec" aria-label="Soleil">
            <SunSection fp={fp} />
          </section>
        ) : el ? (
          <section className="sec">
            {el.kind === 'camera' && (
              <>
                {el.planId && <FramingCard planId={el.planId} setupId={el.setupId} />}
                <div className="field">
                  Plan du découpage
                  <Picker
                    label="Plan du découpage"
                    value={el.planId ? `${el.planId}|${el.setupId}` : NONE}
                    onPick={(v) => {
                      const [planId, setupId] = v === NONE ? [null, null] : v.split('|');
                      upd((x) => {
                        if (x.kind === 'camera') {
                          x.planId = planId ?? null;
                          x.setupId = setupId ?? null;
                        }
                      }, 'link');
                    }}
                    groups={[{ items: setupOptions.map((o) => ({ id: `${o.planId}|${o.setupId}`, label: o.label.code, detail: o.label.detail })) }]}
                    actions={[{ id: NONE, label: 'Non reliée' }]}
                  >
                    {linked ? `${linked.label.code} · ${linked.label.detail}` : <span className="ph">Non reliée</span>}
                  </Picker>
                </div>
                <label className="check">
                  <input type="checkbox" checked={el.showFov} onChange={(e) => upd((x) => void (x.kind === 'camera' && (x.showFov = e.target.checked)), 'fov')} />
                  Afficher le champ
                </label>
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
              <div className="field">
                Utiliser comme
                <div className="row" role="group" aria-label="Utiliser l’icône comme" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="btn" onClick={() => convertIcon(fp, el, 'light')} title="Faisceau, éclairement et puissance">
                    Projecteur
                  </button>
                  <button type="button" className="btn" onClick={() => convertIcon(fp, el, 'reflector')} title="Lumière renvoyée sur les personnages">
                    Réflecteur
                  </button>
                  <button type="button" className="btn" onClick={() => convertIcon(fp, el, 'actor')} title="Lumière reçue, cadrage, positions">
                    Personnage
                  </button>
                </div>
              </div>
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
            {(el.kind === 'camera' || el.kind === 'actor' || el.kind === 'light' || el.kind === 'reflector') && <FigureIconField fp={fp} el={el} />}
            {el.kind !== 'text' && (
              <div className="field">
                Orientation
                <DecimalField label="Orientation en degrés" unit="°" width={80} required min={-360} max={360} value={Math.round(el.rotation)} onChange={(v) => v !== null && upd((x) => void (x.rotation = ((v % 360) + 360) % 360), 'rot')} />
              </div>
            )}
            {(el.kind === 'camera' || el.kind === 'actor' || el.kind === 'light') && <PositionsField fp={fp} el={el} />}
            <button type="button" className="linkbtn danger" style={{ alignSelf: 'flex-start' }} title="⌫ sur le plan" onClick={() => (apply((d) => deleteElements(d, fp.id, [el.id]), 'Élément supprimé'), useFloor.getState().set({ selection: [] }))}>
              Supprimer
            </button>
          </section>
        ) : selected.length > 1 ? (
          <section className="sec">
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
          <Fold id="fp-props" title="Plan au sol">
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
            <div className="field">
              Fond (plan d’architecte, vue satellite)
              <div className="row" style={{ gap: 6 }}>
                <BackgroundButton fp={fp} />
              </div>
            </div>
            <div className="field">
              Exporter ce plan
              <div className="row" style={{ gap: 6 }}>
                <FloorExportButtons fp={fp} />
              </div>
            </div>
            <button type="button" className="linkbtn danger" style={{ alignSelf: 'flex-start' }} onClick={() => (apply((d) => deleteFloorPlan(d, fp.id), 'Plan au sol supprimé'), useFloor.getState().set({ currentId: null }))}>
              Supprimer ce plan au sol
            </button>
          </Fold>
        )}
        {tab === 'plan' && (
          <>
        {/* Avec une sélection, seulement ce qui la concerne : caméras à placer après une caméra, icônes après une icône. */}
        {selected.every((x) => x.kind === 'camera') && (
        <Fold id="to-place" title="Caméras à placer" count={unplaced.length}>
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
        </Fold>
        )}
        {selected.length === 0 && (
        <Fold
          id="figures"
          title="Figures"
          info={
            <Info title="Figures">
              <span>Icônes par défaut pour tout le projet. Une figure peut avoir la sienne (sélectionnez-la), un projecteur celle de son modèle (onglet Lumière).</span>
              <span>Le sens : celui vers lequel regarde l’image (objectif, visage, faisceau).</span>
            </Info>
          }
          label="Figures du plan"
        >
          <FiguresPanel />
        </Fold>
        )}
        {selected.every((x) => x.kind === 'icon') && (
        <Fold id="icons" title="Icônes" label="Bibliothèque d’icônes" count={iconCount || undefined}>
          <IconPalette />
        </Fold>
        )}
          </>
        )}
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

/**
 * Positions d'un élément qui se déplace : 1 = position principale (calculs, champ de début),
 * puis 2, 3… ; la dernière est la position de fin (champ de fin de la caméra).
 */
function PositionsField({ fp, el }: { fp: FloorPlan; el: FloorCamera | FloorActor | FloorLight }) {
  const tool = useFloor((s) => s.tool);
  const pathFor = useFloor((s) => s.pathFor);
  const adding = tool === 'path' && pathFor === el.id;
  const st = useApp.getState;
  const upd = (fn: (x: FloorCamera | FloorActor | FloorLight) => void, key?: string) =>
    st().applyDoc(updateElement(selectDoc(st()), fp.id, el.id, (x) => void ('positions' in x && fn(x as FloorCamera | FloorActor | FloorLight))), undefined, key ? `${key}-${el.id}` : undefined);
  const n = el.positions.length;
  return (
    <div className="field" aria-label="Positions">
      Positions
      {n > 0 && (
        <div className="positions">
          <div className="pos-row">
            <span className="pos-n">1</span>
            <span className="note">début (position principale)</span>
          </div>
          {el.positions.map((q, i) => (
            <div key={i} className="pos-row">
              <span className="pos-n">{i + 2}</span>
              <span className="note">{i === n - 1 ? 'fin' : 'intermédiaire'}</span>
              <span className="spacer" />
              <DecimalField
                label={`Orientation à la position ${i + 2} en degrés`}
                unit="°"
                width={56}
                required
                min={-360}
                max={360}
                value={Math.round(q.rotation)}
                onChange={(v) => v !== null && upd((x) => void (x.positions[i]!.rotation = ((v % 360) + 360) % 360), `posrot${i}`)}
              />
              <button type="button" className="icon-btn danger" aria-label={`Retirer la position ${i + 2}`} onClick={() => upd((x) => void x.positions.splice(i, 1))}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className={`btn ${adding ? 'on' : ''}`} onClick={() => useFloor.getState().set(adding ? { tool: 'select', pathFor: null } : { tool: 'path', pathFor: el.id })}>
          {adding ? 'Terminer (↩)' : n ? '+ Positions suivantes' : '+ Positions (déplacement)'}
        </button>
        {n > 0 && (
          <button type="button" className="btn ghost" onClick={() => upd((x) => void (x.positions = []))}>
            Tout retirer
          </button>
        )}
      </div>
      {adding && <span className="note">Cliquez sur le plan pour chaque nouvelle position ; ↩ pour terminer.</span>}
      {el.kind === 'light' && n > 0 && <span className="note">Éclairement et puissance calculés à la position 1.</span>}
    </div>
  );
}

/** Icône propre à cette figure ; sans elle, celle de son modèle (projecteur), du projet, ou le symbole standard. */
function FigureIconField({ fp, el }: { fp: FloorPlan; el: FloorCamera | FloorActor | FloorLight | FloorReflector }) {
  const doc = useApp(selectDoc);
  const inherited = figureIcon(doc, { ...el, icon: null });
  const from = el.kind === 'light' && inherited && doc.settings.fixtures.find((f) => f.id === el.fixtureId)?.icon === inherited ? 'celle du modèle' : 'celle du projet';
  const sizes = [['S', 40], ['M', 56], ['L', 84]] as const;
  const shown = el.icon ?? inherited;
  return (
    <>
      <IconChoice
        label="Icône de cette figure"
        value={el.icon}
        fallback={inherited ? `Comme les autres (${from} : ${inherited.name || 'icône'})` : el.kind === 'reflector' ? 'Trait du réflecteur' : 'Symbole standard'}
        onChange={(v) => useApp.getState().applyDoc(updateElement(selectDoc(useApp.getState()), fp.id, el.id, (x) => void ('icon' in x && x.kind !== 'icon' && (x.icon = v))))}
      />
      {shown && el.kind !== 'camera' && (
        <div className="field">
          Taille de l’icône
          <div className="seg small" role="group" aria-label="Taille de l’icône de la figure">
            {sizes.map(([l, v]) => (
              <button key={v} type="button" aria-pressed={el.size === v} onClick={() => useApp.getState().applyDoc(updateElement(selectDoc(useApp.getState()), fp.id, el.id, (x) => void ('size' in x && (x.size = v))))}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Cadre de la caméra, lu dans le découpage (rien n'est recopié) ; « Modifier » y mène. */
function FramingCard({ planId, setupId }: { planId: string; setupId: string | null }) {
  const doc = useApp(selectDoc);
  const plan = doc.sequences.flatMap((s) => s.plans).find((p) => p.id === planId);
  const setup = plan?.cameras.find((c) => c.id === setupId) ?? plan?.cameras[0];
  if (!plan || !setup) return null;
  const cam = doc.settings.cameras.find((k) => k.id === setup.cameraId);
  const fov = cam?.sensorWidthMm && setup.start.focalMm !== null ? formatDeg(fieldOfView(cam, setup.start.focalMm, parseAspectRatio(doc.meta.aspectRatio)).horizontal) : '—';
  const rows: [string, string][] = [
    ['Valeur', displayText('size', setup) || '—'],
    ['Axe', displayText('axis', setup) || '—'],
    ['Focale', displayText('focal', setup) || '—'],
    ['Champ', fov],
  ];
  return (
    <section className="icard" aria-label="Cadre">
      <div className="icard-h">
        <span>Cadre</span>
        <Info title="Cadre">
          <span>Lu dans le découpage : le changer ici le change partout.</span>
          <span>Champ : horizontal, d’après le capteur et le ratio du projet.</span>
        </Info>
        <span className="spacer" />
        <button
          type="button"
          className="linkbtn"
          onClick={() => {
            const st = useApp.getState();
            st.setView('table');
            st.goToPlan(planId);
          }}
        >
          Modifier
        </button>
      </div>
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={k === 'Focale' || k === 'Champ' ? 'mono' : ''}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
