/**
 * Réflecteurs : matière (preset à valeur publiée, ou valeur mesurée), taille, lumière reçue
 * et renvoyée. Les presets et leurs sources sont dans model/reflectorPresets.ts.
 */
import { Explain } from '../ui/Explain';
import { produce } from 'immer';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { FRAME_SIZES, type FloorActor, type FloorLight, type FloorPlan, type FloorReflector } from '../model/floor';
import { updateElement } from '../model/floorOps';
import { bounceAt, formatStop, lightName, stopFromLux } from '../model/light';
import { newId } from '../model/defaults';
import { formatNumber } from '../model/text';
import type { ReflectorMaterial } from '../model/types';
import { DecimalField } from '../ui/DecimalField';
import { lx, m } from './LightPanels';
import { materialForPreset, pct, PRESET_GROUPS, presetById, presetRange, presetValue, REFLECTOR_PRESETS } from '../model/reflectorPresets';

const NEW = '__nouvelle';

/** Comment mesurer le taux de réflexion sur le plateau ou à l'essai matériel. */
export function MeasureGuide({ type }: { type: ReflectorMaterial['type'] }) {
  return type === 'mirror' ? (
    <p className="note" style={{ margin: 0, fontSize: 11.5, lineHeight: '16px' }}>
      Mesure : posemètre incident dans le rayon renvoyé, calotte vers le miroir (lecture B) ; puis miroir retiré, posemètre face au projecteur à la même distance totale
      (projecteur → miroir → posemètre) (lecture A). Taux = B ÷ A.
    </p>
  ) : (
    <p className="note" style={{ margin: 0, fontSize: 11.5, lineHeight: '16px' }}>
      Mesure : projecteur bien en face de la toile. Posemètre incident au centre de la toile, calotte vers le projecteur (lecture A) ; puis calotte vers la toile, à une
      dizaine de centimètres, sans lui faire d’ombre (lecture B). Taux = B ÷ A (ex. 400 lx ÷ 500 lx = 80 %).
    </p>
  );
}

/** Nom, type et taux de réflexion d'une matière : saisis une fois, partagés par tous ses réflecteurs. */
export function MaterialFields({ material, autoFocus }: { material: ReflectorMaterial; autoFocus?: boolean }) {
  const upd = (fn: (x: ReflectorMaterial) => void, key: string) =>
    useApp.getState().updateDoc((d) => {
      const x = d.settings.reflectors.find((y) => y.id === material.id);
      if (x) fn(x);
    }, `mat:${material.id}:${key}`);
  const preset = presetById(material.presetId);
  if (preset)
    return (
      <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
          <b style={{ minWidth: 0 }}>{material.name || preset.name}</b>
          <span style={{ whiteSpace: 'nowrap', marginLeft: 'auto', paddingLeft: 8 }}>
            ≈ {pct(material.reflectance ?? presetValue(preset))} <span className="note">({presetRange(preset)}{preset.type === 'mirror' ? ', miroir' : ''})</span>
          </span>
        </div>
        <Explain id={`preset-${preset.id}`} label="Source de la valeur">
          {preset.source}.
        </Explain>
        <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => upd((x) => void (x.presetId = null), 'custom')}>
          Remplacer par une valeur mesurée…
        </button>
      </>
    );
  return (
    <>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 1 }}>
          Matière
          <input autoFocus={autoFocus} aria-label="Nom de la matière" placeholder="ex. Poly, Ultrabounce 12×12, Miroir" value={material.name} onChange={(e) => upd((x) => void (x.name = e.target.value), 'n')} />
        </label>
        <label className="field small">
          Type
          <select aria-label="Type de réflecteur" value={material.type} onChange={(e) => upd((x) => void (x.type = e.target.value as ReflectorMaterial['type']), 't')}>
            <option value="diffuse">Diffus (toile, poly)</option>
            <option value="mirror">Miroir</option>
          </select>
        </label>
        <div className="field small">
          Réflexion
          <DecimalField
            label="Taux de réflexion mesuré en pour cent"
            unit="%"
            width={56}
            min={1}
            max={100}
            value={material.reflectance === null ? null : Math.round(material.reflectance * 1000) / 10}
            onChange={(v) => upd((x) => void (x.reflectance = v === null ? null : v / 100), 'r')}
          />
        </div>
      </div>
      {material.reflectance === null && (
        <Explain id={`measure-${material.type}`} label="Comment mesurer le taux">
          <MeasureGuide type={material.type} />
        </Explain>
      )}
    </>
  );
}

/** Choix d'une matière : celles du projet, puis les presets par famille, puis une valeur mesurée. */
export function MaterialOptions({ mats }: { mats: ReflectorMaterial[] }) {
  const used = new Set(mats.map((m) => m.presetId).filter(Boolean));
  return (
    <>
      {mats.length > 0 && (
        <optgroup label="Matières du projet">
          {mats.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name || 'Sans nom'}
              {x.reflectance !== null ? ` · ${formatNumber(Math.round(x.reflectance * 100))} %` : ' · taux à saisir'}
            </option>
          ))}
        </optgroup>
      )}
      {PRESET_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {REFLECTOR_PRESETS.filter((p) => p.group === g && !used.has(p.id)).map((p) => (
            <option key={p.id} value={`${PRESET}${p.id}`}>
              {p.name} · {presetRange(p)}
            </option>
          ))}
        </optgroup>
      ))}
      <option value={NEW}>+ Matière à valeur mesurée…</option>
    </>
  );
}

export const PRESET = 'preset:';

function usesOf(doc: ReturnType<typeof selectDoc>, id: string): number {
  return doc.floorPlans.reduce((n, fp) => n + fp.elements.filter((e) => e.kind === 'reflector' && e.materialId === id).length, 0);
}

export function ReflectorInspector({ fp, el }: { fp: FloorPlan; el: FloorReflector }) {
  const doc = useApp(selectDoc);
  const mats = doc.settings.reflectors;
  const material = mats.find((x) => x.id === el.materialId) ?? null;
  const apply = (fn: (d: ReturnType<typeof selectDoc>) => ReturnType<typeof selectDoc>, msg?: string, key?: string) => {
    const st = useApp.getState();
    st.applyDoc(fn(selectDoc(st)), msg, key);
  };
  const upd = (fn: (x: FloorReflector) => void, key: string) => apply((d) => updateElement(d, fp.id, el.id, (x) => void (x.kind === 'reflector' && fn(x))), undefined, `${key}-${el.id}`);
  const create = () => {
    const id = newId('rm');
    apply(
      (d) =>
        produce(updateElement(d, fp.id, el.id, (x) => void (x.kind === 'reflector' && (x.materialId = id))), (x) => {
          x.settings.reflectors.push({ id, name: '', type: 'diffuse', reflectance: null, presetId: null });
        }),
      'Nouvelle matière : nommez-la et saisissez le taux mesuré',
    );
  };
  const lights = fp.elements.filter((x): x is FloorLight => x.kind === 'light');
  const actors = fp.elements.filter((x): x is FloorActor => x.kind === 'actor');
  const preset = FRAME_SIZES.find((f) => f.m === el.widthM && f.m === el.heightM);
  const uses = material ? usesOf(doc, material.id) : 0;
  const e = doc.settings.exposure;
  const reads = fp.scale ? lights.map((l) => ({ l, b: actors.map((a) => ({ a, r: bounceAt(doc, fp, l, el, a.at) })), r0: actors.length ? null : bounceAt(doc, fp, l, el, el.at) })) : [];
  return (
    <>
      <label className="field">
        Réflecteur
        <select
          aria-label="Matière du réflecteur"
          value={el.materialId ?? ''}
          onChange={(ev) => {
            const v = ev.target.value;
            if (v === NEW) create();
            else if (v.startsWith(PRESET))
              apply((d) => {
                const r = materialForPreset(d, v.slice(PRESET.length), () => newId('rm'));
                return updateElement(r.doc, fp.id, el.id, (x) => void (x.kind === 'reflector' && (x.materialId = r.id)));
              });
            else upd((x) => void (x.materialId = v || null), 'mat');
          }}
        >
          <option value="">Choisir une matière…</option>
          <MaterialOptions mats={mats} />
        </select>
      </label>
      {material && (
        <div className="fixture-data" key={material.id} aria-label="Données de la matière">
          <MaterialFields material={material} autoFocus={!material.name} />
          {uses > 1 && <p className="note" style={{ margin: 0, fontSize: 11 }}>Matière utilisée par {uses} réflecteurs du projet : une modification s’applique à tous.</p>}
        </div>
      )}
      <div className="field">
        Taille
        <div className="seg" role="group" aria-label="Cadre">
          {FRAME_SIZES.map((f) => (
            <button key={f.label} type="button" aria-pressed={preset === f} onClick={() => upd((x) => ((x.widthM = f.m), (x.heightM = f.m)), 'size')}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <DecimalField label="Largeur du réflecteur en mètres" unit="m ×" width={52} min={0.1} max={100} required value={el.widthM} onChange={(v) => v !== null && upd((x) => void (x.widthM = v), 'w')} />
          <DecimalField label="Hauteur du réflecteur en mètres" unit="m" width={52} min={0.1} max={100} required value={el.heightM} onChange={(v) => v !== null && upd((x) => void (x.heightM = v), 'h')} />
        </div>
      </div>
      <label className="field">
        Légende
        <input value={el.label} placeholder={material?.name || 'ex. Poly, bounce face'} onChange={(ev) => upd((x) => void (x.label = ev.target.value), 'lab')} />
      </label>
      {!fp.scale && <p className="note" style={{ margin: 0 }}>Mettez le plan à l’échelle (E) pour calculer la lumière renvoyée.</p>}
      {fp.scale && lights.length > 0 && (
        <div className="light-readings" aria-label="Lumière du réflecteur">
          {reads.map(({ l, b, r0 }) => {
            const first = b[0]?.r ?? r0;
            if (!first) return null;
            return (
              <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div className="reading">
                  <span>Reçoit de {lightName(doc, l)}</span>
                  <b>{first.onReflector !== null ? lx(first.onReflector) : first.why === 'back' ? 'toile de dos' : 'hors faisceau'}</b>
                </div>
                {first.onReflector !== null &&
                  b.map(({ a, r }) =>
                    r ? (
                      <div key={a.id} className="reading" style={{ paddingLeft: 10 }}>
                        <span>
                          → {a.name} à {m(r.distanceM)}
                        </span>
                        <b>{r.lux !== null ? `${r.material?.type === 'mirror' && !r.gels.diffused ? '' : '≈ '}${lx(r.lux)} · ${formatStop(stopFromLux(r.lux, e))}` : r.why === 'material' ? 'taux à mesurer' : r.why === 'miss' ? 'hors du rayon renvoyé' : 'derrière'}</b>
                      </div>
                    ) : null,
                  )}
              </div>
            );
          })}
        </div>
      )}
      {material?.type === 'diffuse' && (
        <Explain id="refl-calc">
          Surface diffuse : E = taux × lumière reçue × r² ÷ (r² + D²) × cos(angle vers le personnage), r = rayon de la partie éclairée, D = distance. Réflecteur supposé vertical, à hauteur du personnage.
        </Explain>
      )}
    </>
  );
}
