/**
 * Réglages › Caméras : format capteur de chaque caméra du projet, et vérification visuelle
 * des angles de champ (dans l'esprit des comparateurs d'optiques).
 */
import { Explain } from './Explain';
import { useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { newProjectCamera } from '../model/defaults';
import { formatNumber } from '../model/text';
import { fieldOfView, formatDeg, parseAspectRatio } from '../model/optics';
import type { ProjectCamera } from '../model/types';
import { DecimalField } from './DecimalField';
import { Picker } from './Picker';
import { addPickedFromKit, kitGroup, SaveToKit } from './KitControls';
import { nextCameraLabel } from '../model/kit';
import { useKit } from '../platform/kit';

const BLANK = '__vierge';

const FF = { w: 36, h: 24 };

export function CamerasTab() {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const { kit } = useKit();
  const [selId, setSelId] = useState(doc.settings.cameras[0]?.id ?? '');
  const cams = doc.settings.cameras;
  const idx = Math.max(0, cams.findIndex((c) => c.id === selId));
  const cam = cams[idx]!;
  const used = doc.sequences.reduce((n, s) => n + s.plans.filter((p) => p.cameras.some((c) => c.cameraId === cam.id)).length, 0);
  const upd = (fn: (c: ProjectCamera) => void, key: string) =>
    st().updateDoc((d) => {
      const c = d.settings.cameras.find((x) => x.id === cam.id);
      if (c) fn(c);
    }, `cam:${cam.id}:${key}`);

  return (
    <div className="camtab">
      <aside className="camtab-list" aria-label="Caméras du projet">
        {cams.map((c) => (
          <button key={c.id} type="button" className={`camtab-item ${c.id === cam.id ? 'on' : ''}`} onClick={() => setSelId(c.id)} aria-pressed={c.id === cam.id}>
            <span className="mono camtab-label">{c.label}</span>
            <span className="camtab-meta">
              <span>{c.body || 'Boîtier à préciser'}</span>
              <small>{c.sensorWidthMm !== null ? `${formatNumber(c.sensorWidthMm)}${c.sensorHeightMm !== null ? ` × ${formatNumber(c.sensorHeightMm)}` : ''} mm` : 'capteur à renseigner'}</small>
            </span>
          </button>
        ))}
        <div style={{ marginTop: 6 }}>
          <Picker
            label="Ajouter une caméra"
            variant="add"
            groups={[kitGroup(kit, doc, 'cameras')]}
            actions={[{ id: BLANK, label: 'Caméra vierge' }]}
            onPick={(id) => {
              if (id === BLANK) {
                const c = newProjectCamera(nextCameraLabel(doc));
                st().updateDoc((d) => void d.settings.cameras.push(c));
                setSelId(c.id);
              } else {
                const got = addPickedFromKit(kit, 'cameras', id);
                if (got) setSelId(got);
              }
            }}
          >
            + Caméra
          </Picker>
        </div>
        <p className="note" style={{ fontSize: 11.5, lineHeight: '16px', marginTop: 'auto' }}>
          Une deuxième caméra n’est utile que pour les plans tournés à plusieurs caméras (⇧⌘C sur un plan).
        </p>
      </aside>

      <div className="camtab-detail" key={cam.id}>
        <div className="row" style={{ gap: 10 }}>
          <label className="field small" style={{ flex: '0 0 70px' }}>
            Nom
            <input aria-label="Nom" value={cam.label} onChange={(e) => upd((c) => void (c.label = e.target.value.trim() || '?'), 'l')} />
          </label>
          <label className="field">
            Boîtier
            <input aria-label="Boîtier" value={cam.body} placeholder="ex. ARRI Alexa 35" onChange={(e) => upd((c) => void (c.body = e.target.value), 'b')} />
          </label>
          <label className="field">
            Mode d’enregistrement
            <input aria-label="Mode" value={cam.mode} placeholder="ex. 4.6K 3:2 Open Gate" onChange={(e) => upd((c) => void (c.mode = e.target.value), 'm')} />
          </label>
        </div>

        <fieldset className="camtab-sensor">
          <legend>Zone active du capteur, dans ce mode</legend>
          <div className="row" style={{ gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '0 0 auto' }}>
              Largeur (horizontale)
              <DecimalField label="Largeur capteur" unit="mm" width={84} min={1} max={80} value={cam.sensorWidthMm} onChange={(v) => upd((c) => void (c.sensorWidthMm = v), 'w')} />
            </div>
            <span className="camtab-x">×</span>
            <div className="field" style={{ flex: '0 0 auto' }}>
              Hauteur (verticale)
              <DecimalField label="Hauteur capteur" unit="mm" width={84} min={1} max={60} value={cam.sensorHeightMm} onChange={(v) => upd((c) => void (c.sensorHeightMm = v), 'h')} />
            </div>
            <div className="field" style={{ flex: '0 0 auto' }}>
              Anamorphose
              <DecimalField label="Anamorphose" unit="×" width={60} min={1} max={2} required value={cam.squeeze} onChange={(v) => upd((c) => void (c.squeeze = v ?? 1), 's')} />
            </div>
          </div>
          <Explain id="sensor" label="Quelles dimensions saisir ?">
            Dimensions de la surface réellement enregistrée dans ce mode (fiche technique du fabricant), pas la taille totale du capteur. Repère : le plein format photo mesure
            36 × 24 mm. Anamorphose : 1 pour une optique sphérique, 2 pour un anamorphique 2x, 1,5, 1,8…
          </Explain>
        </fieldset>

        {cam.sensorWidthMm !== null ? (
          <Comparator cam={cam} ratioText={doc.meta.aspectRatio} />
        ) : (
          <p className="note" style={{ margin: 0 }}>Renseignez la largeur du capteur : le schéma et les angles de champ s’affichent ici.</p>
        )}

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <SaveToKit kind="cameras" item={cam} />
          <button
            type="button"
            className="btn danger"
            disabled={used > 0 || cams.length <= 1}
            title={cams.length <= 1 ? 'Le projet garde au moins une caméra' : used ? `Utilisée par ${used} plan${used > 1 ? 's' : ''} : retirez-la d’abord de ces plans` : ''}
            onClick={() => {
              st().updateDoc((d) => void (d.settings.cameras = d.settings.cameras.filter((c) => c.id !== cam.id)));
              setSelId(cams.find((c) => c.id !== cam.id)?.id ?? '');
            }}
          >
            Retirer la caméra {cam.label}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Schéma à l'échelle (capteur, cadre au ratio du projet, plein format) et angles pour une focale. */
function Comparator({ cam, ratioText }: { cam: ProjectCamera; ratioText: string }) {
  const [focalText, setFocalText] = useState('35');
  const focal = Number(focalText.replace(',', '.'));
  const f = Number.isFinite(focal) && focal > 0 && focal <= 2000 ? focal : null;
  const ratio = parseAspectRatio(ratioText);
  const fov = fieldOfView(cam, f, ratio);
  const frame = fov.frame;
  const eq = frame && f ? (f * FF.w) / frame.widthMm : null;

  // Schéma : 1 mm = k px.
  const W = 300;
  const H = 200;
  const sw = cam.sensorWidthMm;
  const sh = cam.sensorHeightMm;
  const maxW = Math.max(FF.w, sw ?? 0, frame ? frame.widthMm / cam.squeeze : 0);
  const maxH = Math.max(FF.h, sh ?? 0, frame?.heightMm ?? 0);
  const k = Math.min((W - 20) / maxW, (H - 50) / maxH);
  const cx = W / 2;
  const cy = 18 + (H - 50) / 2;
  const rect = (w: number, h: number) => ({ x: cx - (w * k) / 2, y: cy - (h * k) / 2, width: w * k, height: h * k });

  return (
    <section className="camtab-cmp" aria-label="Angles de champ">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schéma du capteur à l’échelle">
        <rect {...rect(FF.w, FF.h)} style={{ fill: 'none', stroke: 'var(--text3)' }} strokeDasharray="4 3" />
        <text x={cx + (FF.w * k) / 2 - 4} y={cy - (FF.h * k) / 2 - 4} textAnchor="end" fontSize={10} style={{ fill: 'var(--text3)' }}>
          Plein format 36 × 24
        </text>
        {sw !== null && sh !== null && <rect {...rect(sw, sh)} style={{ fill: 'var(--accent-soft)', stroke: 'var(--accent)' }} strokeWidth={1.5} />}
        {sw !== null && sh === null && <line x1={cx - (sw * k) / 2} x2={cx + (sw * k) / 2} y1={cy} y2={cy} style={{ stroke: 'var(--accent)' }} strokeWidth={3} />}
        {frame && frame.heightMm !== null && ratio !== null && (
          <rect {...rect(frame.widthMm / cam.squeeze, frame.heightMm)} style={{ fill: 'none', stroke: 'var(--accent)' }} strokeWidth={1.5} strokeDasharray="7 3" />
        )}
        <text x={cx} y={H - 4} textAnchor="middle" fontSize={11} style={{ fill: 'var(--text2)' }}>
          {sw === null
            ? 'Renseignez la largeur du capteur'
            : `Capteur ${formatNumber(sw)}${sh !== null ? ` × ${formatNumber(sh)}` : ''} mm${ratio !== null ? ` · cadre ${ratioText.trim()} en pointillés` : ''}`}
        </text>
      </svg>

      <div className="camtab-calc">
        <label className="field" style={{ flex: '0 0 auto' }}>
          Focale
          <span className="row" style={{ gap: 4, alignItems: 'center' }}>
            <input aria-label="Focale de calcul" inputMode="decimal" value={focalText} onChange={(e) => setFocalText(e.target.value)} style={{ width: 70 }} />
            <span className="note">mm</span>
          </span>
        </label>
        <table className="camtab-angles">
          <tbody>
            <tr>
              <th>Horizontal</th>
              <td className="mono">{formatDeg(fov.horizontal)}</td>
            </tr>
            <tr>
              <th>Vertical</th>
              <td className="mono">{fov.vertical === null && sw !== null ? 'hauteur ?' : formatDeg(fov.vertical)}</td>
            </tr>
            <tr>
              <th>Diagonal</th>
              <td className="mono">{fov.diagonal === null && sw !== null ? 'hauteur ?' : formatDeg(fov.diagonal)}</td>
            </tr>
            <tr>
              <th>Équiv. plein format</th>
              <td className="mono">{eq ? `${formatNumber(Math.round(eq * 10) / 10)} mm` : '—'}</td>
            </tr>
          </tbody>
        </table>
        {frame && (
          <p className="note" style={{ margin: 0 }}>
            Image cadrée : {formatNumber(Math.round(frame.widthMm * 100) / 100)}
            {frame.heightMm !== null ? ` × ${formatNumber(Math.round(frame.heightMm * 100) / 100)}` : ''} mm
            {cam.squeeze !== 1 ? ' (désanamorphosée)' : ''}
            {ratio === null ? ' — sans ratio de projet (Réglages › Projet), toute la largeur est prise en compte' : frame.croppedWidth ? ` — le ratio ${ratioText.trim()} rogne les côtés du capteur` : ` — le ratio ${ratioText.trim()} rogne le haut et le bas`}
            .
          </p>
        )}
      </div>

      <Explain id="cam-calc">
        Angle = 2 × arctan( d ÷ (2 × f) ), avec f la focale et d la dimension de l’image cadrée en mm (largeur pour l’angle horizontal, hauteur pour le
        vertical, diagonale pour le diagonal). La largeur est multipliée par le coefficient d’anamorphose. L’image cadrée est le plus grand rectangle au ratio du projet
        qui tient dans la zone active. Valable pour une optique rectilinéaire mise au point à l’infini : à courte distance, l’angle réel est un peu plus serré. C’est
        l’angle horizontal qui est dessiné sur les plans au sol.
      </Explain>
    </section>
  );
}
