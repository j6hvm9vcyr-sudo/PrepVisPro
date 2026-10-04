/**
 * Dessin d'un plan au sol (fond exclu), partagé par l'éditeur et les exports :
 * ce qui est exporté est exactement ce qui est affiché.
 */
import type { ReactNode } from 'react';
import type { ProjectDoc } from '../model/types';
import { fovCone, fovLengthUnits, project, setupFov, type FloorElement, type FloorPlan } from '../model/floor';
import { cameraLabel } from '../model/floorOps';
import { locatePlan } from '../model/ops';
import { modeData, reflectorName } from '../model/light';
import { gelById } from '../model/gels';
import { planSun } from '../model/sunPlan';
import { SUNRISE_ELEV } from '../model/sun';
import type { Point } from '../model/floor';
import type { computeNumbers } from '../model/numbering';
import { ACTOR_COLORS } from './floorStore';

const CAM_COLOR = '#2457C5';
const CAM_END = '#7A5AF8';
const LIGHT_COLOR = '#D98A1C';
const REFLECTOR_COLOR = '#6B7280';
/** Largeur dessinée d'un réflecteur quand le plan n'est pas à l'échelle (pixels écran). */
const UNSCALED_REFLECTOR_PX = 60;
/** Longueur dessinée du faisceau des projecteurs, rapportée à celle des champs caméra. */
export const LIGHT_BEAM_RATIO = 0.8;

export interface SceneProps {
  doc: ProjectDoc;
  fp: FloorPlan;
  /** Unités du plan par pixel « écran » (taille constante des symboles). */
  k: number;
  numbers: ReturnType<typeof computeNumbers>;
  selection?: string[];
  /** URL d'une image du projet (fond, icônes). */
  urlFor: (file: string) => string | null;
}

export function FloorMarkers() {
  return (
    <>
      {[['cam', CAM_COLOR], ['sun', SUN_COLOR], ['light', LIGHT_COLOR], ...ACTOR_COLORS.map((c) => [c.slice(1), c])].map(([id, c]) => (
        <marker key={id} id={`arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
        </marker>
      ))}
    </>
  );
}

const SUN_COLOR = '#E0A100';

/** Symbole simplifié d'un élément, pour ses positions suivantes. */
function Ghost({ el, urlFor }: { el: FloorElement; urlFor: (file: string) => string | null }) {
  const url = 'icon' in el && el.icon ? urlFor(el.icon) : null;
  const size = 'size' in el ? el.size : 40;
  if (url) return <image href={url} x={-size / 2} y={-size / 2} width={size} height={size} preserveAspectRatio="xMidYMid meet" />;
  if (el.kind === 'actor')
    return (
      <>
        <circle r={12} fill={el.color} stroke="#fff" strokeWidth={2} />
        <path d="M -5 -9 L 0 -17 L 5 -9 Z" fill="#fff" />
      </>
    );
  if (el.kind === 'light')
    return (
      <>
        <rect x={-11} y={-6} width={22} height={18} rx={3} fill={LIGHT_COLOR} stroke="#fff" strokeWidth={1.5} />
        <path d="M -9 -6 L -13 -14 L 13 -14 L 9 -6 Z" fill="#FFE7B0" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
      </>
    );
  return (
    <>
      <rect x={-10} y={-4} width={20} height={16} rx={3} fill={CAM_COLOR} stroke="#fff" strokeWidth={1.5} />
      <path d="M -6 -4 L -9 -14 L 9 -14 L 6 -4 Z" fill={CAM_COLOR} stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
    </>
  );
}

/** Rectangle utile du plan : le fond, sinon l'étendue des éléments. */
function planBox(fp: FloorPlan): { x: number; y: number; w: number; h: number } | null {
  if (fp.background) return { x: 0, y: 0, w: fp.background.width, h: fp.background.height };
  if (!fp.elements.length) return null;
  const xs = fp.elements.map((e) => e.at.x);
  const ys = fp.elements.map((e) => e.at.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Repères du soleil et du nord sur le plan (positions en unités du plan, tailles selon k). */
export function sunMarks(doc: ProjectDoc, fp: FloorPlan, k: number) {
  const box = planBox(fp);
  if (!box || fp.northDeg === null) return null;
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const compass = { x: box.x + box.w - 22 * k, y: box.y + 34 * k };
  const sun = planSun(doc, fp, false);
  if (!sun.ok || sun.planBearing === null) return { compass, sun: null };
  const r = Math.hypot(box.w, box.h) / 2 + 46 * k;
  return { compass, sun: { at: project(c, sun.planBearing, r), center: c, bearing: sun.planBearing, up: sun.pos.elevation > SUNRISE_ELEV, elevation: sun.pos.elevation, time: fp.sunAt!.time, reach: r } };
}

function SunLayer({ doc, fp, k }: { doc: ProjectDoc; fp: FloorPlan; k: number }) {
  const m = sunMarks(doc, fp, k);
  if (!m) return null;
  // Nord : une flèche fine et un « N », sans rose des vents (discret, lisible sur tout fond).
  const n = m.compass;
  const N = fp.northDeg!;
  const tip = project(n, N, 13 * k);
  const tail = project(n, N + 180, 9 * k);
  const headL = project(tip, N + 180 - 28, 6 * k);
  const headR = project(tip, N + 180 + 28, 6 * k);
  const nLabel = project(n, N, 22 * k);
  const ink = '#13161B';
  const arrow = `M${tail.x},${tail.y} L${tip.x},${tip.y} M${headL.x},${headL.y} L${tip.x},${tip.y} L${headR.x},${headR.y}`;
  const out: ReactNode[] = [
    <g key="north" pointerEvents="none" aria-label="Nord">
      <path d={arrow} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={4 * k} strokeLinecap="round" strokeLinejoin="round" />
      <path d={arrow} fill="none" stroke={ink} strokeWidth={1.4 * k} strokeLinecap="round" strokeLinejoin="round" />
      <text x={nLabel.x} y={nLabel.y} fontSize={10 * k} fontWeight={600} letterSpacing={0.5 * k} textAnchor="middle" dominantBaseline="middle" fill={ink} stroke="#fff" strokeWidth={3 * k} paintOrder="stroke">
        N
      </text>
    </g>,
  ];
  const s = m.sun;
  if (s) {
    const color = s.up ? SUN_COLOR : '#8B94A2';
    // Rayons : trois flèches parallèles qui traversent le plan dans le sens de la lumière.
    const rays: Point[] = [-1, 0, 1].map((i) => project(s.at, s.bearing + 90, i * 70 * k));
    out.push(
      <g key="sun" pointerEvents="none" aria-label="Soleil">
        {s.up &&
          rays.map((p0, i) => {
            const p1 = project(p0, s.bearing + 180, s.reach * 0.75);
            return <line key={i} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={color} strokeWidth={2 * k} strokeDasharray={`${10 * k} ${6 * k}`} markerEnd="url(#arrow-sun)" opacity={0.85} />;
          })}
        <circle cx={s.at.x} cy={s.at.y} r={13 * k} fill={color} stroke="#fff" strokeWidth={2 * k} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const p0 = project(s.at, a, 16 * k);
          const p1 = project(s.at, a, 22 * k);
          return <line key={a} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={color} strokeWidth={2 * k} strokeLinecap="round" />;
        })}
        <text x={s.at.x} y={s.at.y + 36 * k} fontSize={11.5 * k} fontWeight={700} textAnchor="middle" fill="#13161B" stroke="#fff" strokeWidth={3 * k} paintOrder="stroke">
          {s.up ? `Soleil ${s.time} · ${Math.round(s.elevation)}°` : `Soleil couché (${s.time})`}
        </text>
      </g>,
    );
  }
  return <>{out}</>;
}

export function FloorScene({ doc, fp, k, numbers, selection = [], urlFor }: SceneProps) {
  const fovLen = fovLengthUnits(fp);
  const ui = { selection };
  const sel = new Set(selection);
  const cones: ReactNode[] = [];
  const paths: ReactNode[] = [];
  const bodies: ReactNode[] = [];
  const labels: ReactNode[] = [];

  for (const el of fp.elements) {
    const isSel = sel.has(el.id);
    if ('positions' in el && el.positions.length) {
      // Positions successives : trajet fléché, et à chaque position un « fantôme » de l'élément,
      // avec son orientation et son numéro (1 = position principale, la dernière = fin).
      const color = el.kind === 'actor' ? el.color : el.kind === 'light' ? LIGHT_COLOR : CAM_COLOR;
      const marker = el.kind === 'actor' ? el.color.slice(1) : el.kind === 'light' ? 'light' : 'cam';
      const pts = [el.at, ...el.positions.map((q) => q.at)].map((q) => `${q.x},${q.y}`).join(' ');
      paths.push(<polyline key={`p-${el.id}`} points={pts} fill="none" stroke={color} strokeWidth={2 * k} strokeDasharray={`${8 * k} ${5 * k}`} markerEnd={`url(#arrow-${marker})`} opacity={0.85} />);
      el.positions.forEach((q, i) => {
        bodies.push(
          <g key={`g-${el.id}-${i}`} data-pos={`${el.id}:${i}`} transform={`translate(${q.at.x} ${q.at.y}) scale(${k}) rotate(${q.rotation})`} style={{ cursor: 'move' }} opacity={0.55}>
            <Ghost el={el} urlFor={urlFor} />
          </g>,
        );
        if (isSel && ui.selection.length === 1) {
          const h = project(q.at, q.rotation, 34 * k);
          bodies.push(<circle key={`gh-${el.id}-${i}`} data-rotate-pos={`${el.id}:${i}`} cx={h.x} cy={h.y} r={5 * k} fill="#fff" stroke={color} strokeWidth={1.6 * k} style={{ cursor: 'grab' }} />);
        }
      });
      [el.at, ...el.positions.map((q) => q.at)].forEach((q, i) => {
        labels.push(
          <g key={`n-${el.id}-${i}`} transform={`translate(${q.x} ${q.y}) scale(${k})`} pointerEvents="none">
            <circle cx={-16} cy={-16} r={8} fill="#fff" stroke={color} strokeWidth={1.6} />
            <text x={-16} y={-12.5} fontSize={10} fontWeight={700} textAnchor="middle" fill={color}>
              {i + 1}
            </text>
          </g>,
        );
      });
    }
    if (el.kind === 'camera') {
      const loc = el.planId ? locatePlan(doc, el.planId) : null;
      const setup = loc?.plan.cameras.find((c) => c.id === el.setupId) ?? null;
      const fov = setup ? setupFov(doc, setup) : { start: null, end: null };
      if (el.showFov) {
        const c1 = fovCone(el.at, el.rotation, fov.start, fovLen);
        if (c1) cones.push(<polygon key={`c-${el.id}`} points={`${el.at.x},${el.at.y} ${c1.left.x},${c1.left.y} ${c1.right.x},${c1.right.y}`} fill={CAM_COLOR} fillOpacity={isSel ? 0.2 : 0.12} stroke={CAM_COLOR} strokeOpacity={0.55} strokeWidth={1.2 * k} />);
        // Fin du plan : à la dernière position (orientation comprise), focale de fin si elle change.
        const endPos = el.positions[el.positions.length - 1];
        const endAt = endPos?.at ?? el.at;
        const c2 = fovCone(endAt, endPos?.rotation ?? el.rotation, fov.end ?? (endPos ? fov.start : null), fovLen);
        if (c2) cones.push(<polygon key={`c2-${el.id}`} points={`${endAt.x},${endAt.y} ${c2.left.x},${c2.left.y} ${c2.right.x},${c2.right.y}`} fill="none" stroke={CAM_END} strokeWidth={1.4 * k} strokeDasharray={`${6 * k} ${4 * k}`} />);
        if (!c1 && setup) {
          // Angle inconnu : seulement l'axe, en pointillé (on ne dessine pas un champ inventé).
          const tip = project(el.at, el.rotation, fovLen * 0.6);
          cones.push(<line key={`ax-${el.id}`} x1={el.at.x} y1={el.at.y} x2={tip.x} y2={tip.y} stroke={CAM_COLOR} strokeWidth={1.4 * k} strokeDasharray={`${4 * k} ${4 * k}`} />);
        }
      }
      const lab = cameraLabel(doc, el.planId, el.setupId, numbers);
      bodies.push(
        <g key={el.id} data-el={el.id} transform={`translate(${el.at.x} ${el.at.y}) scale(${k}) rotate(${el.rotation})`} style={{ cursor: 'move' }}>
          {isSel && <circle r={22} fill="none" stroke={CAM_COLOR} strokeWidth={2} strokeDasharray="4 3" />}
          <rect x={-10} y={-4} width={20} height={16} rx={3} fill={lab.missing ? '#8B94A2' : CAM_COLOR} stroke="#fff" strokeWidth={1.5} />
          <path d="M -6 -4 L -9 -14 L 9 -14 L 6 -4 Z" fill={lab.missing ? '#8B94A2' : CAM_COLOR} stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
        </g>,
      );
      if (isSel && ui.selection.length === 1) {
        const h = project(el.at, el.rotation, 40 * k);
        bodies.push(<circle key={`h-${el.id}`} data-rotate={el.id} cx={h.x} cy={h.y} r={6 * k} fill="#fff" stroke={CAM_COLOR} strokeWidth={2 * k} style={{ cursor: 'grab' }} />);
      }
      labels.push(
        <g key={`l-${el.id}`} transform={`translate(${el.at.x} ${el.at.y}) scale(${k})`} pointerEvents="none">
          <g transform="translate(16 12)">
            <rect x={0} y={0} width={Math.max(lab.code.length, lab.detail.length) * 7.4 + 12} height={33} rx={4} fill={lab.missing ? '#6A7383' : '#13161B'} opacity={0.9} />
            <text x={6} y={14} fontSize={12} fontWeight={700} fill="#fff" fontFamily="IBM Plex Mono, monospace">
              {lab.code}
            </text>
            <text x={6} y={27} fontSize={11} fill="#DDE2EA" fontFamily="IBM Plex Mono, monospace">
              {lab.detail}
            </text>
          </g>
        </g>,
      );
    } else if (el.kind === 'actor') {
      const url = el.icon ? urlFor(el.icon) : null;
      const r = url ? el.size / 2 : 12;
      bodies.push(
        <g key={el.id} data-el={el.id} transform={`translate(${el.at.x} ${el.at.y}) scale(${k}) rotate(${el.rotation})`} style={{ cursor: 'move' }}>
          {isSel && <circle r={r + 7} fill="none" stroke={el.color} strokeWidth={2} strokeDasharray="4 3" />}
          {url ? (
            <>
              <image href={url} x={-r} y={-r} width={el.size} height={el.size} preserveAspectRatio="xMidYMid meet" />
              <rect x={-r - 4} y={-r - 4} width={el.size + 8} height={el.size + 8} fill="none" pointerEvents="all" />
            </>
          ) : (
            <>
              <circle r={12} fill={el.color} stroke="#fff" strokeWidth={2} />
              <path d="M -5 -9 L 0 -17 L 5 -9 Z" fill="#fff" />
            </>
          )}
        </g>,
      );
      if (isSel && ui.selection.length === 1) {
        const h = project(el.at, el.rotation, (r + 22) * k);
        bodies.push(<circle key={`h-${el.id}`} data-rotate={el.id} cx={h.x} cy={h.y} r={6 * k} fill="#fff" stroke={el.color} strokeWidth={2 * k} style={{ cursor: 'grab' }} />);
      }
      labels.push(
        <text key={`l-${el.id}`} x={el.at.x} y={el.at.y + ((el.icon ? el.size / 2 : 12) + 16) * k} fontSize={12 * k} fontWeight={600} textAnchor="middle" fill="#13161B" stroke="#fff" strokeWidth={3 * k} paintOrder="stroke" pointerEvents="none">
          {el.name}
        </text>,
      );
    } else if (el.kind === 'icon') {
      const url = urlFor(el.icon);
      bodies.push(
        <g key={el.id} data-el={el.id} transform={`translate(${el.at.x} ${el.at.y}) scale(${k}) rotate(${el.rotation})`} style={{ cursor: 'move' }}>
          {url && <image href={url} x={-el.size / 2} y={-el.size / 2} width={el.size} height={el.size} preserveAspectRatio="xMidYMid meet" />}
          {/* Zone de prise : toute la case de l'icône, même ses parties transparentes. */}
          <rect x={-el.size / 2 - 4} y={-el.size / 2 - 4} width={el.size + 8} height={el.size + 8} fill="none" pointerEvents="all" stroke={isSel ? CAM_COLOR : 'none'} strokeWidth={2} strokeDasharray="4 3" />
        </g>,
      );
      if (isSel && ui.selection.length === 1) {
        const h = project(el.at, el.rotation, (el.size / 2 + 22) * k);
        bodies.push(<circle key={`h-${el.id}`} data-rotate={el.id} cx={h.x} cy={h.y} r={6 * k} fill="#fff" stroke={CAM_COLOR} strokeWidth={2 * k} style={{ cursor: 'grab' }} />);
      }
      if (el.label) labels.push(<text key={`l-${el.id}`} x={el.at.x} y={el.at.y + (el.size / 2 + 14) * k} fontSize={11 * k} textAnchor="middle" fill="#13161B" stroke="#fff" strokeWidth={3 * k} paintOrder="stroke" pointerEvents="none">{el.label}</text>);
    } else if (el.kind === 'light') {
      const fixture = doc.settings.fixtures.find((f) => f.id === el.fixtureId);
      const mode = modeData(fixture?.modes[el.mode]);
      if (mode) {
        const c = fovCone(el.at, el.rotation, mode.beamDeg, fovLen * LIGHT_BEAM_RATIO);
        if (c) cones.push(<polygon key={`b-${el.id}`} points={`${el.at.x},${el.at.y} ${c.left.x},${c.left.y} ${c.right.x},${c.right.y}`} fill={LIGHT_COLOR} fillOpacity={isSel ? 0.22 : 0.13} stroke={LIGHT_COLOR} strokeOpacity={0.6} strokeWidth={1 * k} strokeDasharray={`${3 * k} ${3 * k}`} />);
      }
      const url = el.icon ? urlFor(el.icon) : null;
      bodies.push(
        <g key={el.id} data-el={el.id} transform={`translate(${el.at.x} ${el.at.y}) scale(${k}) rotate(${el.rotation})`} style={{ cursor: 'move' }}>
          {isSel && <circle r={el.size / 2 + 6} fill="none" stroke={LIGHT_COLOR} strokeWidth={2} strokeDasharray="4 3" />}
          {url ? (
            <image href={url} x={-el.size / 2} y={-el.size / 2} width={el.size} height={el.size} preserveAspectRatio="xMidYMid meet" />
          ) : (
            <>
              {/* Symbole standard : corps du projecteur et lentille vers l'avant. */}
              <rect x={-11} y={-6} width={22} height={18} rx={3} fill={fixture ? LIGHT_COLOR : '#8B94A2'} stroke="#fff" strokeWidth={1.5} />
              <path d="M -9 -6 L -13 -14 L 13 -14 L 9 -6 Z" fill="#FFE7B0" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
            </>
          )}
          <rect x={-el.size / 2 - 4} y={-el.size / 2 - 4} width={el.size + 8} height={el.size + 8} fill="none" pointerEvents="all" />
        </g>,
      );
      if (isSel && ui.selection.length === 1) {
        const h = project(el.at, el.rotation, (el.size / 2 + 22) * k);
        bodies.push(<circle key={`h-${el.id}`} data-rotate={el.id} cx={h.x} cy={h.y} r={6 * k} fill="#fff" stroke={LIGHT_COLOR} strokeWidth={2 * k} style={{ cursor: 'grab' }} />);
      }
      const name = el.label || fixture?.name || 'Projecteur';
      const detail = [fixture ? '' : 'modèle à choisir', fixture?.modes[el.mode]?.label, el.gels.map((g) => gelById(g)?.short).filter(Boolean).join(' + '), el.circuit ? `circ. ${el.circuit}` : '', el.dimmer < 1 ? `${Math.round(el.dimmer * 100)} %` : ''].filter(Boolean).join(' · ');
      labels.push(
        <g key={`l-${el.id}`} transform={`translate(${el.at.x} ${el.at.y}) scale(${k})`} pointerEvents="none">
          <g transform={`translate(${el.size / 2 + 6} 6)`}>
            <rect x={0} y={0} width={Math.max(name.length * 6.6, detail.length * 5.9) + 12} height={detail ? 31 : 18} rx={4} fill="#5A3A06" opacity={0.88} />
            <text x={6} y={13} fontSize={11.5} fontWeight={700} fill="#fff">
              {name}
            </text>
            {detail && (
              <text x={6} y={26} fontSize={10} fill="#FBE3B5">
                {detail}
              </text>
            )}
          </g>
        </g>,
      );
    } else if (el.kind === 'reflector') {
      // Surface vue de dessus, à l'échelle réelle ; le petit trait indique la face réfléchissante.
      const half = fp.scale ? el.widthM / 2 / fp.scale.metersPerUnit : (UNSCALED_REFLECTOR_PX / 2) * k;
      const a = project(el.at, el.rotation - 90, half);
      const b = project(el.at, el.rotation + 90, half);
      const face = project(el.at, el.rotation, 12 * k);
      const material = doc.settings.reflectors.find((m) => m.id === el.materialId);
      const mirror = material?.type === 'mirror';
      const iconUrl = el.icon ? urlFor(el.icon) : null;
      if (iconUrl)
        bodies.push(
          <g key={`i-${el.id}`} transform={`translate(${el.at.x} ${el.at.y}) scale(${k}) rotate(${el.rotation})`} pointerEvents="none">
            <image href={iconUrl} x={-el.size / 2} y={-el.size / 2} width={el.size} height={el.size} preserveAspectRatio="xMidYMid meet" />
          </g>,
        );
      bodies.push(
        <g key={el.id} data-el={el.id} style={{ cursor: 'move' }} opacity={iconUrl ? 0.55 : 1}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isSel ? CAM_COLOR : REFLECTOR_COLOR} strokeWidth={9 * k} strokeLinecap="round" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={mirror ? '#C9D6E8' : '#FFFFFF'} strokeWidth={5 * k} strokeLinecap="round" />
          <line x1={el.at.x} y1={el.at.y} x2={face.x} y2={face.y} stroke={REFLECTOR_COLOR} strokeWidth={2 * k} />
          {/* Zone de prise plus large que le trait. */}
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={18 * k} pointerEvents="stroke" />
        </g>,
      );
      if (isSel && ui.selection.length === 1) {
        const h = project(el.at, el.rotation, 34 * k);
        bodies.push(<circle key={`h-${el.id}`} data-rotate={el.id} cx={h.x} cy={h.y} r={6 * k} fill="#fff" stroke={CAM_COLOR} strokeWidth={2 * k} style={{ cursor: 'grab' }} />);
      }
      const name = reflectorName(doc, el);
      const back = project(el.at, el.rotation + 180, 16 * k);
      labels.push(<text key={`l-${el.id}`} x={back.x} y={back.y} fontSize={11 * k} fontWeight={600} textAnchor="middle" dominantBaseline="middle" fill="#13161B" stroke="#fff" strokeWidth={3 * k} paintOrder="stroke" pointerEvents="none">{name}</text>);
    } else if (el.kind === 'text') {
      bodies.push(
        <text key={el.id} data-el={el.id} x={el.at.x} y={el.at.y} fontSize={el.size * k} fontWeight={600} fill="#13161B" stroke="#fff" strokeWidth={3 * k} paintOrder="stroke" textAnchor="middle" dominantBaseline="middle" style={{ cursor: 'move' }} textDecoration={isSel ? 'underline' : undefined}>
          {el.text || '…'}
        </text>,
      );
    }
  }

  return (
    <>
      <g>{cones}</g>
      <g>{paths}</g>
      <g>{bodies}</g>
      <g>{labels}</g>
      <SunLayer doc={doc} fp={fp} k={k} />
    </>
  );
}
