import { useRef, useState, type DragEvent } from 'react';
import { Explain } from './Explain';
import { useApp } from '../state/appStore';
import { selectCursor, selectDoc } from '../state/store';
import { locatePlan } from '../model/ops';
import { computeNumbers } from '../model/numbering';
import { missingFields } from '../model/completeness';
import { coverImage } from '../model/images';
import { displayText } from '../model/entry';
import { fieldOfView, formatDeg, parseAspectRatio } from '../model/optics';
import { floorMismatches, type FloorMismatch } from '../model/floorSuggest';
import { replaceCameraSetup } from '../model/ops';
import { imageStore } from '../platform/images';
import type { CameraSetup, ImageKind, Plan } from '../model/types';
import { PlanLinksSection } from './PlanLinks';
import { Picker } from './Picker';
import { applyPreset, emptySetup, matchingPreset, presetLabel, savePreset } from '../model/shotPresets';

export function Inspector() {
  const doc = useApp(selectDoc);
  const cursor = useApp(selectCursor);
  const loc = cursor ? locatePlan(doc, cursor.planId) : null;
  if (!loc) return <aside className="inspector" aria-label="Détails du plan" />;
  const plan = loc.plan;
  const n = computeNumbers(doc).get(plan.id)!;
  const parent = plan.repriseOf ? computeNumbers(doc).get(plan.repriseOf) : null;
  const missing = missingFields(plan, doc.settings);

  return (
    <aside className="inspector" aria-label="Détails du plan">
      <div className="insp-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="big mono">{n.code}</span>
          <span className="sub">
            plan n° {n.global}
            {parent && n.repriseLetter ? ` · reprise de ${parent.code}` : ''}
          </span>
        </div>
        <div className="state" style={{ color: missing.length ? 'var(--warn-text)' : 'var(--ok)' }}>
          <span className="dot" style={{ background: missing.length ? 'var(--warn)' : 'var(--ok)', width: 7, height: 7 }} />
          {missing.length ? `À compléter : ${missing.join(', ')}` : 'Complet'}
        </div>
      </div>
      <div className="insp-body">
        <label className="sec">
          <span className="sec-h">Action / intention</span>
          <textarea className="area" rows={2} value={plan.action} onChange={(e) => useApp.getState().setPlanText(plan.id, 'action', e.target.value)} />
        </label>

        <ImageSection plan={plan} />

        {loc.seq.scriptText && <SceneText planId={plan.id} text={loc.seq.scriptText} number={loc.seq.number} />}

        <label className="sec">
          <span className="sec-h">Extrait du scénario</span>
          <textarea
            className="area script"
            rows={3}
            value={plan.scriptExcerpt}
            onChange={(e) => useApp.getState().setPlanText(plan.id, 'scriptExcerpt', e.target.value)}
          />
        </label>

        <CameraList plan={plan} />

        <PlanLinksSection planId={plan.id} />

        <label className="sec">
          <span className="sec-h">Divers</span>
          <textarea className="area" rows={2} value={plan.notes} onChange={(e) => useApp.getState().setPlanText(plan.id, 'notes', e.target.value)} />
        </label>
      </div>
    </aside>
  );
}

const KIND_LABEL: Record<ImageKind, string> = { scouting: 'Repérage', reference: 'Référence' };

/** Images du plan : une seule zone ; chaque image est un repérage ou une référence. */
function ImageSection({ plan }: { plan: Plan }) {
  const [over, setOver] = useState(false);
  const [kind, setKind] = useState<ImageKind>('scouting');
  const input = useRef<HTMLInputElement>(null);
  const st = useApp.getState;
  // Repérages d'abord, puis références (ordre d'import conservé dans chaque groupe).
  const items = [...plan.images.filter((i) => i.kind === 'scouting'), ...plan.images.filter((i) => i.kind === 'reference')];
  const cover = coverImage(plan);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void st().addImages(plan.id, kind, Array.from(e.dataTransfer.files));
  };
  return (
    <section
      className={`sec ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      aria-label="Images"
    >
      <div className="sec-h">
        <span>
          Images
          <span className="count">{items.length}</span>
        </span>
        <span className="sec-acts">
          <button type="button" className="linkbtn" onClick={() => st().setLibraryPick({ mode: 'plan', planId: plan.id, kind })} title="Réutiliser une image déjà importée dans le projet">
            Bibliothèque…
          </button>
          <button type="button" className="linkbtn" onClick={() => input.current?.click()} title="Importer depuis le disque">
            Importer…
          </button>
        </span>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void st().addImages(plan.id, kind, Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      <div className="img-kind">
        <span className="note">Ajouter comme</span>
        <span className="seg small" role="radiogroup" aria-label="Type des images ajoutées">
          {(['scouting', 'reference'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="imgs">
          {items.map((img) => {
            const url = imageStore.url(img.file);
            const isCover = cover?.id === img.id;
            return (
              <div className="imgcard" key={img.id} data-kind={img.kind}>
                <button type="button" className={`pic ${isCover ? 'cover' : ''}`} onClick={() => st().openPreview(plan.id, plan.images.indexOf(img))} aria-label={`Agrandir ${img.originalName}`}>
                  {url ? <img src={url} alt="" draggable={false} /> : <span className="note">introuvable</span>}
                  {isCover && <span className="badge">PRINCIPALE</span>}
                </button>
                <span className="acts">
                  <button
                    type="button"
                    className={`kind-tag ${img.kind}`}
                    title={`${KIND_LABEL[img.kind]} : cliquer pour en faire une ${img.kind === 'scouting' ? 'référence' : 'photo de repérage'}`}
                    onClick={() => st().setImageKind(plan.id, img.id, img.kind === 'scouting' ? 'reference' : 'scouting')}
                  >
                    {KIND_LABEL[img.kind]}
                  </button>
                  {!isCover && (
                    <button type="button" onClick={() => st().setCover(plan.id, img.id)} title="Image affichée dans le tableau et les exports">
                      Principale
                    </button>
                  )}
                  <button type="button" className="danger" onClick={() => st().removeImage(plan.id, img.id)}>
                    Retirer
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dropzone">Glissez ici repérages, films, storyboard, photos</div>
      )}
    </section>
  );
}

function CameraList({ plan }: { plan: Plan }) {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const diffs = doc.floorPlans.length ? floorMismatches(doc) : new Map<string, FloorMismatch[]>();
  return (
    <section className="sec" aria-label="Caméras">
      <div className="sec-h">
        <span>Caméras</span>
        <button type="button" className="linkbtn" onClick={() => st().addCamera(plan.id)}>
          + Caméra
        </button>
      </div>
      {plan.cameras.map((c) => {
        const cam = doc.settings.cameras.find((k) => k.id === c.cameraId);
        const w = cam?.sensorWidthMm ?? null;
        const ratio = parseAspectRatio(doc.meta.aspectRatio);
        const a = fieldOfView(cam, c.start.focalMm, ratio).horizontal;
        const b = c.end && c.end.focalMm !== c.start.focalMm ? fieldOfView(cam, c.end.focalMm, ratio).horizontal : null;
        const summary = [displayText('size', c), displayText('axis', c), displayText('focal', c)].filter(Boolean).join(' · ') || '—';
        return (
          <div className="camrow" key={c.id}>
            <div className="top">
              {doc.settings.cameras.length > 1 ? (
                <select
                  className="cam-select mono"
                  aria-label="Caméra du projet"
                  value={c.cameraId}
                  onChange={(e) => st().setSetupCamera(plan.id, c.id, e.target.value)}
                >
                  {doc.settings.cameras.map((k) => (
                    <option key={k.id} value={k.id} disabled={plan.cameras.some((x) => x.id !== c.id && x.cameraId === k.id)}>
                      {k.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="lbl mono">{cam?.label ?? '?'}</span>
              )}
              <span className="sum">{summary}</span>
              {plan.cameras.length > 1 && (
                <button type="button" className="linkbtn danger" onClick={() => st().removeCamera(plan.id, c.id)}>
                  Retirer
                </button>
              )}
            </div>
            <div className="fov">
              <span>{cam?.body ? `${cam.body}${cam.mode ? ` · ${cam.mode}` : ''}` : 'Boîtier non renseigné'}</span>
              <span className="mono" title="Champ horizontal, mise au point à l’infini">
                {w === null ? 'capteur ?' : c.start.focalMm === null ? '—' : b !== null ? `${formatDeg(a)} → ${formatDeg(b)}` : formatDeg(a)}
              </span>
            </div>
            {(diffs.get(c.id) ?? []).map((d) => (
              <div key={d.field} className="floor-note">
                <span>
                  Plan au sol « {d.floorPlan} » : <b>{d.field === 'size' ? 'valeur' : 'axe'} {d.suggested}</b>
                </span>
                <button type="button" className="linkbtn" onClick={() => reportFloor(plan.id, c.id, d)}>
                  Reporter
                </button>
              </div>
            ))}
            <PresetPicker planId={plan.id} setup={c} />
          </div>
        );
      })}
      <Explain id="fov">
        Angle de champ horizontal de l’image cadrée : 2 × arctan(largeur ÷ (2 × focale)), d’après le capteur et le ratio du projet (Réglages › Caméras), mise au point à l’infini.
      </Explain>
    </section>
  );
}

const SAVE_PRESET = '__enregistrer';

/** Plans types : appliquer en un clic des réglages enregistrés, ou enregistrer ceux de cette caméra. */
function PresetPicker({ planId, setup }: { planId: string; setup: CameraSetup }) {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const presets = doc.settings.shotPresets;
  const current = matchingPreset(doc, setup);
  const canSave = !current && !emptySetup(setup);
  if (!presets.length && !canSave) return null;
  return (
    <div className="preset-row">
      <Picker
        label="Plan type"
        variant="add"
        value={current?.id ?? null}
        groups={[{ label: presets.length ? 'Plans types du projet' : undefined, items: presets.map((p) => ({ id: p.id, label: presetLabel(p) })) }]}
        actions={canSave ? [{ id: SAVE_PRESET, label: '+ Enregistrer ce réglage comme plan type' }] : []}
        empty="Aucun plan type"
        onPick={(id) => {
          const d = selectDoc(st());
          if (id === SAVE_PRESET) {
            const r = savePreset(d, setup);
            if (r.added) st().applyDoc(r.doc, 'Plan type enregistré');
            return;
          }
          const p = d.settings.shotPresets.find((x) => x.id === id);
          if (p) st().applyDoc(replaceCameraSetup(d, planId, applyPreset(setup, p)), `Plan type appliqué : ${presetLabel(p)} · ⌘Z pour annuler`);
        }}
      >
        {current ? `Plan type : ${presetLabel(current)}` : 'Plan type…'}
      </Picker>
    </div>
  );
}

/** Texte de la scène importée : on y sélectionne l'extrait qui correspond au plan. */
function SceneText({ planId, text, number }: { planId: string; text: string; number: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(true);
  const use = () => {
    const el = ref.current;
    if (!el) return;
    const sel = el.value.slice(el.selectionStart, el.selectionEnd).trim();
    if (!sel) {
      useApp.getState().setMessage('Sélectionnez d’abord un passage dans le texte de la scène.', 'warn');
      return;
    }
    useApp.getState().setPlanText(planId, 'scriptExcerpt', sel);
    useApp.getState().setMessage('Extrait du plan mis à jour · ⌘Z pour annuler');
  };
  return (
    <section className="sec" aria-label="Scène du scénario">
      <div className="sec-h">
        <button type="button" className="linkbtn" style={{ padding: 0, color: 'var(--text)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 11 }} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '▾' : '▸'} Scène {number} (scénario)
        </button>
        {open && (
          <button type="button" className="linkbtn" onClick={use}>
            Sélection → extrait
          </button>
        )}
      </div>
      {open && <textarea ref={ref} className="scene-text" readOnly rows={7} value={text} aria-label={`Texte de la scène ${number}`} />}
    </section>
  );
}

/** Reporte au découpage la valeur ou l'axe déduit du plan au sol (« Américain » ou « Taille → GP »). */
function reportFloor(planId: string, setupId: string, d: FloorMismatch) {
  const st = useApp.getState();
  const doc = selectDoc(st);
  const setup = doc.sequences.flatMap((s) => s.plans).find((p) => p.id === planId)?.cameras.find((c) => c.id === setupId);
  if (!setup) return;
  const [start, end] = d.suggested.split(' → ');
  const next = structuredClone(setup);
  next.start[d.field] = start!;
  if (end) {
    next.end ??= structuredClone(next.start);
    next.end[d.field] = end;
  } else if (next.end) next.end[d.field] = start!;
  st.applyDoc(replaceCameraSetup(doc, planId, next), `${d.field === 'size' ? 'Valeur' : 'Axe'} reporté${d.field === 'size' ? 'e' : ''} depuis le plan au sol · ⌘Z pour annuler`);
}
