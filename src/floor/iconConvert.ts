/**
 * Une icône de la bibliothèque posée sur le plan devient un élément qui calcule : projecteur,
 * réflecteur ou personnage. Elle garde son image, sa position, son orientation et sa légende.
 */
import { produce } from 'immer';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { FRAME_SIZES, type FloorElement, type FloorIcon, type FloorPlan } from '../model/floor';
import { materialForPreset } from '../model/reflectorPresets';
import { newId } from '../model/defaults';
import { ACTOR_COLORS } from './floorStore';

export type IconRole = 'light' | 'reflector' | 'actor';

const MESSAGE: Record<IconRole, string> = {
  light: 'Icône transformée en projecteur · ⌘Z pour annuler',
  reflector: 'Icône transformée en réflecteur (poly 4×4, modifiable) · ⌘Z pour annuler',
  actor: 'Icône transformée en personnage · ⌘Z pour annuler',
};

export function convertIcon(fp: FloorPlan, el: FloorIcon, role: IconRole) {
  const st = useApp.getState();
  let doc = selectDoc(st);
  let materialId: string | null = null;
  if (role === 'reflector') {
    const r = doc.settings.reflectors[0] ? { doc, id: doc.settings.reflectors[0].id } : materialForPreset(doc, 'poly', () => newId('rm'));
    doc = r.doc;
    materialId = r.id;
  }
  const next = produce(doc, (x) => {
    const f = x.floorPlans.find((p) => p.id === fp.id);
    const i = f?.elements.findIndex((e) => e.id === el.id) ?? -1;
    if (!f || i < 0) return;
    const base = { id: el.id, at: el.at, rotation: el.rotation, icon: { file: el.icon, name: el.label, turn: 0 as const }, size: el.size };
    let out: FloorElement;
    if (role === 'light') out = { ...base, kind: 'light', fixtureId: x.settings.fixtures[0]?.id ?? null, mode: 0, dimmer: 1, gels: [], lossStops: 0, circuit: '', label: el.label, positions: [] };
    else if (role === 'reflector') out = { ...base, kind: 'reflector', materialId, widthM: FRAME_SIZES[0]!.m, heightM: FRAME_SIZES[0]!.m, label: el.label };
    else {
      const n = f.elements.filter((e) => e.kind === 'actor').length;
      out = { ...base, kind: 'actor', name: el.label || `Personnage ${n + 1}`, color: ACTOR_COLORS[n % ACTOR_COLORS.length]!, positions: [] };
    }
    f.elements[i] = out;
  });
  st.applyDoc(next, MESSAGE[role]);
}
