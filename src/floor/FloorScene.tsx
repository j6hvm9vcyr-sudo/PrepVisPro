/**
 * Dessin d'un plan au sol (fond exclu), partagé par l'éditeur et les exports :
 * ce qui est exporté est exactement ce qui est affiché.
 */
import type { ReactNode } from 'react';
import type { ProjectDoc } from '../model/types';
import { fovCone, fovLengthUnits, project, setupFov, type FloorPlan } from '../model/floor';
import { cameraLabel } from '../model/floorOps';
import { locatePlan } from '../model/ops';
import type { computeNumbers } from '../model/numbering';
import { ACTOR_COLORS } from './floorStore';

export const CAM_COLOR = '#2457C5';
export const CAM_END = '#7A5AF8';

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
      {[['cam', CAM_COLOR], ...ACTOR_COLORS.map((c) => [c.slice(1), c])].map(([id, c]) => (
        <marker key={id} id={`arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
        </marker>
      ))}
    </>
  );
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
    if ('path' in el && el.path.length) {
      const pts = [el.at, ...el.path].map((q) => `${q.x},${q.y}`).join(' ');
      const color = el.kind === 'actor' ? el.color : CAM_COLOR;
      paths.push(
        <polyline key={`p-${el.id}`} points={pts} fill="none" stroke={color} strokeWidth={2.2 * k} strokeDasharray={el.kind === 'camera' ? `${8 * k} ${5 * k}` : undefined} markerEnd={`url(#arrow-${el.kind === 'actor' ? el.color.slice(1) : 'cam'})`} opacity={0.9} />,
      );
    }
    if (el.kind === 'camera') {
      const loc = el.planId ? locatePlan(doc, el.planId) : null;
      const setup = loc?.plan.cameras.find((c) => c.id === el.setupId) ?? null;
      const fov = setup ? setupFov(doc, setup) : { start: null, end: null };
      if (el.showFov) {
        const c1 = fovCone(el.at, el.rotation, fov.start, fovLen);
        if (c1) cones.push(<polygon key={`c-${el.id}`} points={`${el.at.x},${el.at.y} ${c1.left.x},${c1.left.y} ${c1.right.x},${c1.right.y}`} fill={CAM_COLOR} fillOpacity={isSel ? 0.2 : 0.12} stroke={CAM_COLOR} strokeOpacity={0.55} strokeWidth={1.2 * k} />);
        const c2 = fovCone(el.at, el.rotation, fov.end, fovLen);
        if (c2) cones.push(<polygon key={`c2-${el.id}`} points={`${el.at.x},${el.at.y} ${c2.left.x},${c2.left.y} ${c2.right.x},${c2.right.y}`} fill="none" stroke={CAM_END} strokeWidth={1.4 * k} strokeDasharray={`${6 * k} ${4 * k}`} />);
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
      bodies.push(
        <g key={el.id} data-el={el.id} transform={`translate(${el.at.x} ${el.at.y}) scale(${k}) rotate(${el.rotation})`} style={{ cursor: 'move' }}>
          {isSel && <circle r={19} fill="none" stroke={el.color} strokeWidth={2} strokeDasharray="4 3" />}
          <circle r={12} fill={el.color} stroke="#fff" strokeWidth={2} />
          <path d="M -5 -9 L 0 -17 L 5 -9 Z" fill="#fff" />
        </g>,
      );
      if (isSel && ui.selection.length === 1) {
        const h = project(el.at, el.rotation, 34 * k);
        bodies.push(<circle key={`h-${el.id}`} data-rotate={el.id} cx={h.x} cy={h.y} r={6 * k} fill="#fff" stroke={el.color} strokeWidth={2 * k} style={{ cursor: 'grab' }} />);
      }
      labels.push(
        <text key={`l-${el.id}`} x={el.at.x} y={el.at.y + 28 * k} fontSize={12 * k} fontWeight={600} textAnchor="middle" fill="#13161B" stroke="#fff" strokeWidth={3 * k} paintOrder="stroke" pointerEvents="none">
          {el.name}
        </text>,
      );
    } else if (el.kind === 'icon') {
      const url = urlFor(el.icon);
      bodies.push(
        <g key={el.id} data-el={el.id} transform={`translate(${el.at.x} ${el.at.y}) scale(${k}) rotate(${el.rotation})`} style={{ cursor: 'move' }}>
          {url && <image href={url} x={-el.size / 2} y={-el.size / 2} width={el.size} height={el.size} preserveAspectRatio="xMidYMid meet" />}
          <rect x={-el.size / 2} y={-el.size / 2} width={el.size} height={el.size} fill="transparent" stroke={isSel ? CAM_COLOR : 'none'} strokeWidth={2} strokeDasharray="4 3" />
        </g>,
      );
      if (el.label) labels.push(<text key={`l-${el.id}`} x={el.at.x} y={el.at.y + (el.size / 2 + 14) * k} fontSize={11 * k} textAnchor="middle" fill="#13161B" stroke="#fff" strokeWidth={3 * k} paintOrder="stroke" pointerEvents="none">{el.label}</text>);
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
    </>
  );
}
