/**
 * Raccords de l'interface avec « Mon matériel » (model/kit.ts) : enregistrer un élément du
 * projet, le proposer dans les listes de choix, l'ajouter au projet.
 */
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { addFromKit, cannotSave, inProject, kitLabel, kitStatus, saveToKit, type Kit, type KitKind } from '../model/kit';
import { updateKit, useKit } from '../platform/kit';
import type { PickGroup } from './Picker';
import type { Fixture, LensSeries, ProjectCamera, ProjectDoc, ReflectorMaterial } from '../model/types';
import { formatNumber } from '../model/text';

type Item = ProjectCamera | LensSeries | Fixture | ReflectorMaterial;

/** Préfixe des choix « Mon matériel » dans les listes. */
export const KIT_PICK = 'kit:';

export function itemDetail(kind: KitKind, it: Item): string | undefined {
  if (kind === 'cameras') {
    const c = it as ProjectCamera;
    return c.sensorWidthMm !== null ? `${formatNumber(c.sensorWidthMm)}${c.sensorHeightMm !== null ? ` × ${formatNumber(c.sensorHeightMm)}` : ''} mm${c.squeeze !== 1 ? ` · anamorphose ×${formatNumber(c.squeeze)}` : ''}` : 'capteur non renseigné';
  }
  if (kind === 'lenses') {
    const l = it as LensSeries;
    return l.kind === 'primes' ? l.focals.map(formatNumber).join(' ') || 'focales non renseignées' : l.min !== null && l.max !== null ? `${formatNumber(l.min)}–${formatNumber(l.max)} mm` : 'plage non renseignée';
  }
  if (kind === 'fixtures') {
    const f = it as Fixture;
    return `${f.modes.length} mode${f.modes.length > 1 ? 's' : ''}${f.watts !== null ? ` · ${formatNumber(f.watts)} W` : ''}`;
  }
  const r = it as ReflectorMaterial;
  return r.reflectance !== null ? `${formatNumber(Math.round(r.reflectance * 100))} %` : undefined;
}

/** Groupe « Mon matériel » d'une liste de choix (vide s'il n'y a rien d'enregistré). */
export function kitGroup(kit: Kit, doc: ProjectDoc, kind: KitKind): PickGroup {
  return {
    label: 'Mon matériel',
    items: (kit[kind] as Item[]).map((it) => ({ id: `${KIT_PICK}${it.id}`, label: kitLabel(kind, it as never), detail: [itemDetail(kind, it), inProject(doc, kind, it as never) ? 'déjà dans le projet' : ''].filter(Boolean).join(' · ') })),
  };
}

/** Ajoute au projet l'élément « Mon matériel » choisi dans une liste ; renvoie son identifiant dans le projet. */
export function addPickedFromKit(kit: Kit, kind: KitKind, pickId: string, then?: (doc: ProjectDoc, id: string) => ProjectDoc): string | null {
  const item = (kit[kind] as Item[]).find((x) => `${KIT_PICK}${x.id}` === pickId);
  if (!item) return null;
  const st = useApp.getState();
  const r = addFromKit(selectDoc(st), kind, item as never);
  st.applyDoc(then ? then(r.doc, r.id) : r.doc, r.added ? `${kitLabel(kind, item as never)} ajouté depuis Mon matériel` : undefined);
  return r.id;
}

const SAVE_LABEL = { absent: 'Enregistrer dans mon matériel', differs: 'Mettre à jour mon matériel', same: 'Dans mon matériel ✓' } as const;

/** Bouton « Enregistrer dans mon matériel » d'un élément du projet. */
export function SaveToKit({ kind, item }: { kind: KitKind; item: Item }) {
  const { kit, status } = useKit();
  const why = cannotSave(kind, item as never);
  const state = kitStatus(kit, kind, item as never);
  return (
    <button
      type="button"
      className={`linkbtn kit-save ${state}`}
      disabled={!!why || state === 'same' || status !== 'ready'}
      title={why ?? (state === 'same' ? 'Déjà enregistré, à l’identique' : state === 'differs' ? 'Une version différente est enregistrée : la remplacer par celle-ci' : 'Pour l’ajouter en un clic à vos prochains projets')}
      onClick={async () => {
        const r = await updateKit((k) => saveToKit(k, kind, item as never).kit);
        useApp.getState().setMessage(r.ok ? (state === 'differs' ? 'Mon matériel mis à jour' : 'Enregistré dans Mon matériel') : r.error, r.ok ? undefined : 'warn');
      }}
    >
      {SAVE_LABEL[state]}
    </button>
  );
}
