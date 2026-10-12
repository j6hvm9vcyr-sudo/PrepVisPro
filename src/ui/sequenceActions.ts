/** Actions d'une séquence (0.24), les mêmes dans le « ··· » du bandeau et en pied de ses Détails. */
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { Sequence } from '../model/types';
import { flowBounds } from '../model/stamps';
import { startTiming } from './panels';
import type { MenuItems } from './ActionMenu';

export function useSequenceActions(seq: Sequence): { more: MenuItems; all: MenuItems; canDelete: boolean; remove: () => void } {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const bounds = flowBounds(doc, seq.id);
  const canDelete = doc.sequences.length > 1;
  const n = seq.plans.length;
  const remove = () => st().deleteSequence(seq.id);
  const more: MenuItems = [
    { label: 'Minuter la séquence…', run: () => startTiming(seq.id), disabled: !seq.plans.some((p) => !p.repriseOf) },
    null,
    { label: 'Insérer un tampon avant', run: () => st().addStamp('', { before: seq.id }) },
    { label: 'Insérer un tampon après', run: () => st().addStamp('', { after: seq.id }) },
    null,
    { label: 'Monter la séquence', run: () => st().moveSequence(seq.id, -1), disabled: bounds.first },
    { label: 'Descendre la séquence', run: () => st().moveSequence(seq.id, 1), disabled: bounds.last },
  ];
  const all: MenuItems = [...more, null, { label: `Supprimer la séquence (${n} plan${n > 1 ? 's' : ''})`, run: remove, disabled: !canDelete, danger: true }];
  return { more, all, canDelete, remove };
}
