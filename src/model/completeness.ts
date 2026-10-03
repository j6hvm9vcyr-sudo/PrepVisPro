import type { Plan, ProjectSettings, RequiredField } from './types';

export const REQUIRED_LABEL: Record<RequiredField, string> = {
  action: 'action',
  size: 'valeur',
  axis: 'axe',
  angle: 'angle',
  focal: 'focale',
  movement: 'mouvement',
  grip: 'machinerie',
};

/** Liste lisible de ce qui manque à un plan, selon les champs obligatoires du projet. */
export function missingFields(plan: Plan, settings: ProjectSettings): string[] {
  const req = settings.required;
  const out: string[] = [];
  if (req.action && !plan.action.trim()) out.push(REQUIRED_LABEL.action);
  const multi = plan.cameras.length > 1;
  plan.cameras.forEach((c) => {
    const label = settings.cameras.find((k) => k.id === c.cameraId)?.label ?? '?';
    const pre = multi ? `Cam ${label} : ` : '';
    const add = (f: RequiredField) => out.push(pre + REQUIRED_LABEL[f]);
    if (req.size && !c.start.size) add('size');
    if (req.axis && !c.start.axis) add('axis');
    if (req.angle && !c.start.angle && c.start.tiltDeg === null) add('angle');
    if (req.focal && c.start.focalMm === null) add('focal');
    if (req.movement && c.movements.length === 0) add('movement');
    if (req.grip && c.grip.length === 0) add('grip');
  });
  return out;
}
